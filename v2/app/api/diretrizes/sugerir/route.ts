/**
 * POST /api/diretrizes/sugerir
 *
 * Gera uma proposta completa de julgamento para UM achado específico.
 * A IA preenche resultado, consequências e fundamentação; a proposta só se
 * torna diretriz após concordância humana expressa.
 *
 * Roda em Gemini Pro (raciocínio profundo) com:
 *   - persona completa (com Lei 12.600/04 art. 73 e suas faixas)
 *   - resumo do processo (achados, defesas)
 *   - precedentes oficiais do TCE-PE e do acervo vetorial do gabinete
 *
 * Cada proposta DEVE vir acompanhada das fontes jurídicas efetivamente usadas.
 *
 * Body: { processo_id, achado_numero }
 * Resp: { sugestao: SugestaoIa }
 */
import { z } from 'zod';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { generateJson } from '@/lib/gemini/client';
import { ResumoSchema } from '@/schemas/resumo';
import {
  PropostaJulgamentoIaSchema,
  type PropostaJulgamentoIa,
} from '@/schemas/diretrizes';
import { loadPersonaConfig } from '@/lib/config/persona';
import { buildLimiteLegalBlock, formatLimiteLegal } from '@/prompts/persona';
import { getCachedOrFetch } from '@/lib/vertex/cache';
import { loggerFor } from '@/lib/logger';
import type { SimilarResult } from '@/lib/types/database';

const log = loggerFor('api/diretrizes/sugerir');

export const runtime = 'nodejs';
export const maxDuration = 180;

const Body = z.object({
  processo_id: z.string().uuid(),
  achado_numero: z.string().min(1),
});

const OFFICIAL_LEGAL_URLS = {
  leiOrganica: 'https://www.tcepe.tc.br/internet/docs/tce/Lei-Organica-atualizada_2015.pdf',
  lindb: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del4657compilado.htm',
  lei8666: 'https://www.planalto.gov.br/ccivil_03/leis/l8666cons.htm',
  lei14133: 'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm',
  lei10028: 'https://www.planalto.gov.br/ccivil_03/leis/l10028.htm',
} as const;

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function officialLegalUrl(citation: string): string | null {
  const value = normalize(citation);
  if (
    value.includes('12.600')
    || value.includes('lei organica')
    || value.includes('art. 73')
    || value.includes('art. 62')
  ) return OFFICIAL_LEGAL_URLS.leiOrganica;
  if (value.includes('lindb') || value.includes('4.657')) return OFFICIAL_LEGAL_URLS.lindb;
  if (value.includes('8.666')) return OFFICIAL_LEGAL_URLS.lei8666;
  if (value.includes('14.133')) return OFFICIAL_LEGAL_URLS.lei14133;
  if (value.includes('10.028')) return OFFICIAL_LEGAL_URLS.lei10028;
  return null;
}

function sameLink(left: string | null, right: string | null) {
  if (!left || !right) return false;
  return left.trim().replace(/\/$/, '').toLowerCase()
    === right.trim().replace(/\/$/, '').toLowerCase();
}

function verifiedSources(
  sources: Array<{
    tipo: 'legislacao' | 'precedente';
    citacao: string;
    trecho?: string | null;
    link?: string | null;
  }>,
  precedents: SimilarResult[],
  legalSourcesFromAudit: string[],
) {
  const verified: PropostaJulgamentoIa['fontes'] = [];
  for (const source of sources) {
    if (source.tipo === 'legislacao') {
      const link = officialLegalUrl(source.citacao);
      if (link) {
        verified.push({ ...source, trecho: source.trecho ?? null, link });
        continue;
      }
      const citation = normalize(source.citacao);
      const declaredInAudit = legalSourcesFromAudit.some((item) => {
        const declared = normalize(item);
        if (declared.includes(citation) || citation.includes(declared)) return true;
        const identifiers = citation.match(/\d[\d./-]{2,}/g) ?? [];
        return identifiers.some((identifier) => declared.includes(identifier));
      });
      if (declaredInAudit) {
        verified.push({ ...source, trecho: source.trecho ?? null, link: null });
      }
      continue;
    }

    const precedent = precedents.find((item) => sameLink(item.link, source.link ?? null));
    if (!precedent?.link) continue;
    const identification = [
      precedent.acordao || precedent.title,
      precedent.processo ? `Processo ${precedent.processo}` : null,
      precedent.relator ? `Relator(a): ${precedent.relator}` : null,
    ].filter(Boolean).join(' — ');
    verified.push({
      ...source,
      citacao: identification || source.citacao.trim() || 'Precedente do TCE-PE',
      trecho: (precedent.snippet ?? '').replace(/<\/?b>/g, '').trim() || null,
      link: precedent.link,
    });
  }
  return verified;
}

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

  // Busca híbrida cacheada. Se as duas fontes falharem, segue sem precedentes.
  let precedentesBlock = '(sem precedentes recuperados)';
  let precedentesRecuperados: SimilarResult[] = [];
  try {
    const query = [
      achado.titulo,
      achado.descricao.slice(0, 500),
      achado.fundamentacao_legal.join(' | '),
    ].filter(Boolean).join(' | ');
    const { results } = await getCachedOrFetch(supabase, processo_id, {
      query,
      pageSize: 10,
      topN: 6,
    });
    precedentesRecuperados = results;
    if (results.length > 0) {
      precedentesBlock = results
        .map((p, i) => {
          const metadados = [
            p.processo ? `Processo: ${p.processo}` : null,
            p.acordao ? `Acórdão: ${p.acordao}` : null,
            p.relator ? `Relator(a): ${p.relator}` : null,
            p.julgamento ? `Julgamento: ${p.julgamento}` : null,
            p.source ? `Fonte: ${p.source}` : null,
          ].filter(Boolean).join('\n');
          return `### Precedente ${i + 1}${p.title ? ` — ${p.title}` : ''}
${metadados}
Trecho: ${(p.snippet ?? '').replace(/<\/?b>/g, '').slice(0, 500) || '(sem trecho)'}
Link oficial: ${p.link ?? 'n/a'}`;
        })
        .join('\n\n');
    }
  } catch (err) {
    log.warn({ err }, 'falha ao buscar precedentes — segue sem');
  }

  const limiteFormatado = formatLimiteLegal(persona.limiteLegalArt73);
  const system = `${persona.persona}

${buildLimiteLegalBlock(persona.limiteLegalArt73)}

# REGRAS DESTA PROPOSTA DE JULGAMENTO (CRÍTICO)
- Analise o achado, a defesa, a legislação e a jurisprudência recuperada.
- Proponha OBRIGATORIAMENTE um resultado: irregular,
  regular_com_ressalvas, regular ou expedicao_medidas_saneadoras.
- Use "expedicao_medidas_saneadoras" quando a providência adequada for apenas
  expedir determinações, recomendações e/ou medidas saneadoras, sem aprovar ou
  reprovar contas — especialmente quando não houver responsável individualizado
  pela auditoria ou quando a fiscalização for transversal, em lote ou destinada
  ao monitoramento de setores em vários municípios.
- Ao escolher "expedicao_medidas_saneadoras", preencha obrigatoriamente
  "medida" com providência concreta e use null em "multa" e "debito". Não
  invente responsável nem conclua pela regularidade ou irregularidade das contas.
- A proposta não é decisão final. Ela só produzirá efeito depois que a
  Conselheira revisar os campos e salvar as diretrizes na interface.
- Decida também sobre multa, débito e medida. Use null quando entender que
  determinada sanção ou medida não deve ser aplicada.
- Use artigos da Lei 12.600/2004, LINDB, Lei 8.666/93, Lei 14.133/2021
  e Lei 10.028/2000, além das normas expressamente apontadas pela auditoria
  na fundamentação legal deste achado. Nunca introduza norma não fornecida.

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
- A justificativa do RESULTADO e cada sanção proposta devem estar apoiadas
  nas fontes listadas em "fontes".
- Tipo "legislacao": citação completa do artigo + inciso/parágrafo
  (ex: "art. 73, III, da Lei Estadual nº 12.600/2004"). O campo "trecho"
  pode ser o texto literal do dispositivo.
- Tipo "precedente": SOMENTE se o precedente estiver na seção
  PRECEDENTES JURISPRUDENCIAIS abaixo. NUNCA inventar processo,
  número, conselheiro ou data. Em "citacao", identifique acórdão/processo
  e relator quando disponíveis; em "trecho" copie literalmente o snippet.
- Em fonte de tipo "precedente", copie também o "Link oficial" para
  "link". Para legislação ou precedente sem link, use null.
- NUNCA use "votos anteriores do relator" como fonte SEM que esteja
  literalmente nos PRECEDENTES abaixo.
- Não invente jurisprudência. Se nenhum precedente recuperado for aderente,
  fundamente apenas na legislação e não crie fonte de precedente.

# FONTES OFICIAIS DE LEGISLAÇÃO
- Lei Orgânica do TCE-PE, Lei Estadual nº 12.600/2004:
  https://www.tcepe.tc.br/internet/docs/tce/Lei-Organica-atualizada_2015.pdf
- LINDB, Decreto-Lei nº 4.657/1942:
  https://www.planalto.gov.br/ccivil_03/decreto-lei/del4657compilado.htm
- Lei nº 8.666/1993:
  https://www.planalto.gov.br/ccivil_03/leis/l8666cons.htm
- Lei nº 14.133/2021:
  https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm
- Lei nº 10.028/2000:
  https://www.planalto.gov.br/ccivil_03/leis/l10028.htm

Para legislação, use o link oficial correspondente no campo "link".

# FORMATO (JSON estrito)
{
  "resultado": "irregular|regular_com_ressalvas|regular|expedicao_medidas_saneadoras",
  "multa": "string|null — proposta de multa (ou null)",
  "debito": "string|null — proposta de débito (ou null)",
  "medida": "string|null — recomendação ou determinação (ou null)",
  "justificativa": "string|null — por que esta proposta, em 1-2 frases",
  "fontes": [
    {
      "tipo": "legislacao" | "precedente",
      "citacao": "string — citação completa",
      "trecho": "string|null — texto literal do dispositivo ou snippet",
      "link": "string|null — URL oficial do precedente"
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
Proponha o julgamento completo deste achado. Escolha o resultado, decida
sobre multa, débito e medida e explique a razão. Indique em "fontes" a
legislação e a jurisprudência efetivamente usadas. A jurisprudência pode ser
de qualquer relator do TCE-PE, desde que esteja nos resultados recuperados.
Retorne APENAS o JSON definido no system prompt.`;

  try {
    const sugestaoGerada = await generateJson({
      model: 'pro',
      system,
      prompt: userPrompt,
      schema: PropostaJulgamentoIaSchema,
      temperature: 0.3,
      timeoutMs: 150_000,
      retries: 1,
    });
    const sugestao = {
      ...sugestaoGerada,
      fontes: verifiedSources(
        sugestaoGerada.fontes ?? [],
        precedentesRecuperados,
        achado.fundamentacao_legal,
      ),
    };
    if (sugestao.fontes.length === 0) {
      throw new Error('fontes_juridicas_nao_verificadas');
    }
    return NextResponse.json({ sugestao });
  } catch (err) {
    log.error({ err, processo_id, achado_numero }, 'falha ao gerar sugestao');
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'gemini_error' },
      { status: 500 },
    );
  }
}
