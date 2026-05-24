/**
 * POST /api/diretrizes/sugerir
 *
 * Gera uma sugestão alternativa de multa/débito/medida para UM achado
 * específico. É uma nota lateral, não vinculante — a Conselheira pode
 * aceitar, ignorar ou ajustar.
 *
 * Roda em Gemini Pro (raciocínio profundo) com:
 *   - persona completa (com Lei 12.600/04 art. 73 e suas faixas)
 *   - resumo do processo (achados, defesas)
 *   - top precedentes do Vertex (cache do processo) — quando aderentes
 *
 * Cada sugestão DEVE vir com pelo menos uma fonte: legislação (artigo +
 * inciso + parágrafo) ou precedente (com citação literal do trecho do
 * documento retornado pelo Vertex). Sem fonte, retorna null.
 *
 * Body: { processo_id, achado_numero }
 * Resp: { sugestao: SugestaoIa }
 */
import { z } from 'zod';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { generateJson } from '@/lib/gemini/client';
import { ResumoSchema } from '@/schemas/resumo';
import { SugestaoIaSchema } from '@/schemas/diretrizes';
import { loadPersonaConfig } from '@/lib/config/persona';
import { buildLimiteLegalBlock, formatLimiteLegal } from '@/prompts/persona';
import { getCachedOrFetch } from '@/lib/vertex/cache';
import { loggerFor } from '@/lib/logger';

const log = loggerFor('api/diretrizes/sugerir');

export const runtime = 'nodejs';
export const maxDuration = 180;

const Body = z.object({
  processo_id: z.string().uuid(),
  achado_numero: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const { processo_id, achado_numero } = parsed.data;

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: processo, error } = await supabase
    .from('processos')
    .select('resumo_data')
    .eq('id', processo_id)
    .single();
  if (error || !processo) {
    return NextResponse.json({ error: 'processo_nao_encontrado' }, { status: 404 });
  }

  const resumoParse = ResumoSchema.safeParse(processo.resumo_data);
  if (!resumoParse.success) {
    return NextResponse.json({ error: 'resumo_invalido' }, { status: 400 });
  }

  const achado = resumoParse.data.achados.find((a) => a.numero === achado_numero);
  if (!achado) {
    return NextResponse.json({ error: 'achado_nao_encontrado' }, { status: 404 });
  }

  const persona = await loadPersonaConfig(supabase);

  // Busca precedentes do Vertex (cache do processo). Se falhar, segue sem.
  let precedentesBlock = '(sem precedentes recuperados)';
  try {
    const query = `${achado.titulo} | ${achado.descricao.slice(0, 200)}`;
    const { results } = await getCachedOrFetch(supabase, processo_id, {
      query,
      pageSize: 10,
      topN: 3,
    });
    if (results.length > 0) {
      precedentesBlock = results
        .map(
          (p, i) =>
            `### Precedente ${i + 1}${p.title ? ` — ${p.title}` : ''}
Trecho: ${(p.snippet ?? '').replace(/<\/?b>/g, '').slice(0, 500) || '(sem trecho)'}
Link: ${p.link ?? 'n/a'}`,
        )
        .join('\n\n');
    }
  } catch (err) {
    log.warn({ err }, 'falha ao buscar precedentes — segue sem');
  }

  const limiteFormatado = formatLimiteLegal(persona.limiteLegalArt73);
  const system = `${persona.persona}

${buildLimiteLegalBlock(persona.limiteLegalArt73)}

# REGRAS DESTA SUGESTÃO (CRÍTICO)
- Você está propondo uma medida sancionatória ALTERNATIVA para revisão da
  Conselheira. Não é decisão final — é só sugestão para ela validar.
- Use SOMENTE artigos da Lei 12.600/2004, LINDB, Lei 8.666/93,
  Lei 14.133/2021 e Lei 10.028/2000.

REGRAS DE DOSIMETRIA (INVIOLÁVEIS):
- Multa: APENAS percentuais previstos no art. 73 da Lei 12.600/2004,
  calculados sobre o LIMITE LEGAL VIGENTE de ${limiteFormatado}. Indique
  inciso e %. PROIBIDO inventar fórmulas como "X% do sobrepreço", "X% do
  contrato". Ex correto: "Multa de 30% do limite do art. 73
  (${limiteFormatado.replace(/[^\d,.]/g, '')} × 30%), com fundamento no
  art. 73, III".
- Débito: valor EXATO do dano apurado (art. 62 da Lei 12.600/2004),
  atualizado e com juros, em solidariedade quando houver concurso.
- Medida: distinguir recomendação (orientação pedagógica) de
  determinação (obrigação com prazo) e ciência (a quem comunicar).

REGRAS DE FONTE (OBRIGATÓRIAS):
- Para CADA campo preenchido (multa/debito/medida), você DEVE indicar
  pelo menos UMA fonte em "fontes" justificando-o.
- Tipo "legislacao": citação completa do artigo + inciso/parágrafo
  (ex: "art. 73, III, da Lei Estadual nº 12.600/2004"). O campo "trecho"
  pode ser o texto literal do dispositivo.
- Tipo "precedente": SOMENTE se o precedente estiver na seção
  PRECEDENTES JURISPRUDENCIAIS abaixo. NUNCA inventar processo,
  número, conselheiro ou data. Em "citacao" use o título exatamente
  como veio; em "trecho" copie literalmente o snippet.
- NUNCA use "votos anteriores do relator" como fonte SEM que esteja
  literalmente nos PRECEDENTES abaixo.
- Se não houver fonte legítima, retorne aquele campo como null.

# FORMATO (JSON estrito)
{
  "multa": "string|null — proposta de multa (ou null)",
  "debito": "string|null — proposta de débito (ou null)",
  "medida": "string|null — recomendação ou determinação (ou null)",
  "justificativa": "string|null — por que esta proposta, em 1-2 frases",
  "fontes": [
    {
      "tipo": "legislacao" | "precedente",
      "citacao": "string — citação completa",
      "trecho": "string|null — texto literal do dispositivo ou snippet"
    }
  ]
}`;

  const userPrompt = `# ACHADO PARA O QUAL VOCÊ DEVE PROPOR
Número: ${achado.numero}
Título: ${achado.titulo}
Gravidade: ${achado.gravidade}
Descrição: ${achado.descricao}
Responsáveis: ${achado.responsaveis.join(', ') || '(não identificado)'}
Fundamentação legal apontada pela auditoria: ${achado.fundamentacao_legal.join(', ') || '(nenhuma)'}
Defesa apresentada: ${achado.defesa_resumo ?? '(sem defesa específica)'}

# CONTEXTO DO PROCESSO
Unidade: ${resumoParse.data.processo.unidade_jurisdicionada}
Exercício: ${resumoParse.data.processo.exercicio ?? 'n/a'}
Objeto: ${resumoParse.data.processo.descricao_objeto ?? 'n/a'}

# PRECEDENTES JURISPRUDENCIAIS DO TCE-PE
(Use APENAS estes — não invente outros)

${precedentesBlock}

# TAREFA
Proponha multa/débito/medida adequados a este achado. Para cada campo,
indique sua FONTE em "fontes" — sem fonte legítima, retorne null no campo.
Retorne APENAS o JSON definido no system prompt.`;

  try {
    const sugestao = await generateJson({
      model: 'pro',
      system,
      prompt: userPrompt,
      schema: SugestaoIaSchema,
      temperature: 0.3,
      timeoutMs: 150_000,
      retries: 1,
    });
    return NextResponse.json({ sugestao });
  } catch (err) {
    log.error({ err, processo_id, achado_numero }, 'falha ao gerar sugestao');
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'gemini_error' },
      { status: 500 },
    );
  }
}
