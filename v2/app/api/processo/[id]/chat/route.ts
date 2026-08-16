/**
 * GET    /api/processo/[id]/chat        — retorna histórico do chat
 * POST   /api/processo/[id]/chat        — envia mensagem e devolve resposta
 * DELETE /api/processo/[id]/chat        — limpa o histórico
 *
 * Contexto carregado em CADA chamada (a Conselheira pode pedir o que quiser):
 *   - persona da Conselheira (sem proibições restritivas — modo conversa)
 *   - resumo de triagem completo
 *   - diretrizes definidas
 *   - minuta gerada (ementa, relatório, análise, dispositivo)
 *   - pesquisa ao vivo na jurisprudência quando a pergunta exigir precedentes
 *
 * Nós deliberadamente NÃO incluímos os PDFs brutos (auditoria + defesas)
 * pra manter latência de chat baixa — o resumo agora é detalhado o
 * suficiente. Se a Conselheira pedir trecho literal de um documento, o
 * assistente avisa que precisaria reabrir o relatório/defesa.
 */
import { z } from 'zod';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { generateText } from '@/lib/gemini/client';
import { ResumoSchema } from '@/schemas/resumo';
import { DiretrizesSchema } from '@/schemas/diretrizes';
import { MinutaSchema } from '@/schemas/minuta';
import { ChatHistorySchema, type ChatMessage } from '@/schemas/chat';
import { loadPersonaConfig } from '@/lib/config/persona';
import { loggerFor } from '@/lib/logger';
import {
  formatJurisprudenceResearch,
  OfficialJurisprudenceUnavailableError,
  researchJurisprudence,
  type JurisprudenceResearchQuery,
} from '@/lib/search/jurisprudence-research';

const log = loggerFor('api/processo/chat');

export const runtime = 'nodejs';
export const maxDuration = 240;

type Ctx = { params: Promise<{ id: string }> };

const PostBody = z.object({
  message: z.string().min(1).max(8000),
});

export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: processo, error } = await supabase
    .from('processos')
    .select('chat_messages')
    .eq('id', id)
    .single();
  if (error || !processo) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const history = ChatHistorySchema.safeParse(processo.chat_messages);
  return NextResponse.json({
    messages: history.success ? history.data : [],
  });
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { error } = await supabase
    .from('processos')
    .update({ chat_messages: [] })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, messages: [] });
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const parsed = PostBody.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // 1. Carrega o estado completo do processo
  const { data: processo, error: pErr } = await supabase
    .from('processos')
    .select('id, numero, unidade_jurisdicionada, resumo_data, diretrizes, minuta, chat_messages')
    .eq('id', id)
    .single();
  if (pErr || !processo) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const resumoParse = ResumoSchema.safeParse(processo.resumo_data);
  const diretrizesParse = DiretrizesSchema.safeParse(processo.diretrizes);
  const minutaParse = MinutaSchema.safeParse(processo.minuta);
  const historyParse = ChatHistorySchema.safeParse(processo.chat_messages);

  if (!minutaParse.success) {
    return NextResponse.json(
      { error: 'minuta_ainda_nao_gerada' },
      { status: 400 },
    );
  }

  const history: ChatMessage[] = historyParse.success ? historyParse.data : [];

  // 2. Carrega persona e pesquisa a jurisprudência quando a pergunta exigir.
  const persona = await loadPersonaConfig(supabase);

  let precedentesBlock = '(a pergunta atual não exige nova pesquisa jurisprudencial)';
  if (resumoParse.success && isJurisprudenceQuestion(parsed.data.message)) {
    try {
      const research = await researchJurisprudence({
        queries: buildChatJurisprudenceQueries(parsed.data.message, resumoParse.data),
        resultsLimit: 15,
        requireOfficial: true,
        officialPageSize: 20,
        cabinetPageSize: 20,
        cabinetTopN: 8,
        concurrency: 2,
      });
      precedentesBlock = `${formatJurisprudenceResearch(research.report)}

## Julgados selecionados
${research.results.length > 0
  ? research.results.map((p, i) =>
            `### Julgado ${i + 1}${p.title ? ` — ${p.title}` : ''}
Processo: ${p.processo ?? 'n/a'}
Acórdão: ${p.acordao ?? 'n/a'}
Relator(a): ${p.relator ?? 'n/a'}
Julgamento: ${p.julgamento ?? 'n/a'}
Link: ${p.link ?? 'n/a'}
Consulta(s): ${p.research_queries?.join(', ') ?? 'n/a'}
Trecho: ${(p.snippet ?? '').replace(/<\/?b>/g, '').slice(0, 2_000) || '(sem trecho)'}`,
          )
          .join('\n\n')
  : '(nenhum julgado aderente foi selecionado nas consultas executadas)'}`;
    } catch (err) {
      const unavailable = err instanceof OfficialJurisprudenceUnavailableError;
      log.error({ err }, 'pesquisa jurisprudencial do chat falhou');
      return NextResponse.json({
        error: unavailable ? 'jurisprudencia_oficial_indisponivel' : 'pesquisa_jurisprudencial_falhou',
        message: 'Não respondi à questão jurisprudencial porque a consulta obrigatória à base oficial não pôde ser concluída.',
      }, { status: 503 });
    }
  }

  // 3. Monta o system prompt: persona + contexto factual do processo
  const system = `${persona.persona}

# MODO CONVERSA — TIRA-DÚVIDAS DA CONSELHEIRA
Você está conversando com a Conselheira-Relatora APÓS a geração da
minuta de voto. Ela quer tirar dúvidas, explorar o mérito, testar
hipóteses, comparar com a jurisprudência. Responda de forma direta,
técnica e completa.

Diferente da geração da minuta, aqui você PODE:
- Opinar fundamentadamente sobre o mérito (sempre indicando "no meu
  juízo técnico", "salvo melhor entendimento") — a Conselheira está
  pensando em voz alta, não pedindo decisão.
- Sugerir caminhos alternativos, agravantes/atenuantes que talvez não
  tenham sido considerados.
- Apontar fragilidades na defesa OU na auditoria.
- Sugerir verificações adicionais (ex: "vale conferir se houve
  publicação no DOE em tal data").

REGRAS QUE PERMANECEM:
- ZERO invenção de jurisprudência, processos, conselheiros, datas,
  valores ou nomes que não estejam no contexto abaixo.
- Quando a pergunta envolver jurisprudência, a base oficial é pesquisada de
  novo usando a pergunta atual. Nunca diga que seria necessário consultar a
  base se o relatório abaixo informa que ela já foi consultada.
- NUNCA afirme "entendimento consolidado" ou "jurisprudência pacífica" sem
  apoio consistente em múltiplos julgados identificados. Se a pesquisa foi
  amostral, descreva precisamente o que foi localizado.
- Cite SEMPRE a fonte: "no resumo de triagem", "nas diretrizes", "na
  minuta gerada (seção X)", "no precedente Y abaixo", ou "art. Z da
  Lei 12.600/2004".
- Se a Conselheira pedir um trecho LITERAL de um documento (relatório
  de auditoria ou defesa) e o trecho não estiver no resumo/minuta
  abaixo, diga: "Esse trecho exato não está no contexto carregado —
  posso descrever pela narrativa do resumo, mas não citar literalmente
  sem reabrir o documento original."
- Linguagem técnica, períodos curtos, sem prolixidade. Máx ~8
  parágrafos por resposta — se a pergunta for ampla, peça pra ela
  delimitar.

# CONTEXTO DO PROCESSO

## Identificação
Número: ${processo.numero}
Unidade jurisdicionada: ${processo.unidade_jurisdicionada}

## Resumo de triagem (JSON)
${resumoParse.success ? JSON.stringify(resumoParse.data, null, 2) : '(resumo ainda não gerado)'}

## Diretrizes da Conselheira (JSON)
${diretrizesParse.success ? JSON.stringify(diretrizesParse.data, null, 2) : '(diretrizes ainda não definidas)'}

## Minuta gerada

### Ementa
${minutaParse.data.ementa}

### Relatório
${minutaParse.data.relatorio}

### Análise (voto)
${minutaParse.data.analise_completa}

### Dispositivo
${minutaParse.data.decisao_voto}

${minutaParse.data.sugestao_pendente ? `### Pontos pendentes\n${minutaParse.data.sugestao_pendente}\n` : ''}

## Precedentes do TCE-PE (fonte oficial e acervo do gabinete)
${precedentesBlock}`;

  // 4. Monta o prompt do turno como conversa: histórico + nova pergunta
  const conversa = [
    ...history.map((m) =>
      m.role === 'user'
        ? `CONSELHEIRA: ${m.content}`
        : `ASSISTENTE: ${m.content}`,
    ),
    `CONSELHEIRA: ${parsed.data.message}`,
    'ASSISTENTE:',
  ].join('\n\n');

  // 5. Chama o Gemini Flash (rápido, custo baixo, contexto cabe)
  let resposta: string;
  try {
    resposta = await generateText({
      model: 'flash',
      system,
      prompt: conversa,
      temperature: 0.5,
      timeoutMs: 90_000,
      maxOutputTokens: 4_000,
    });
  } catch (err) {
    log.error({ err, processo_id: id }, 'falha no chat');
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'gemini_error' },
      { status: 500 },
    );
  }

  // 6. Persiste user + assistant no histórico
  const now = new Date().toISOString();
  const novoHistorico: ChatMessage[] = [
    ...history,
    { role: 'user', content: parsed.data.message, ts: now },
    { role: 'assistant', content: resposta.trim(), ts: new Date().toISOString() },
  ];

  // Truncar histórico se passar de 60 mensagens — manter primeiras 4
  // (contexto inicial) + últimas 50 pra não estourar.
  const historicoFinal =
    novoHistorico.length > 60
      ? [...novoHistorico.slice(0, 4), ...novoHistorico.slice(-50)]
      : novoHistorico;

  const { error: updErr } = await supabase
    .from('processos')
    .update({ chat_messages: historicoFinal })
    .eq('id', id);
  if (updErr) {
    log.error({ err: updErr }, 'falha ao salvar histórico');
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    reply: resposta.trim(),
    messages: historicoFinal,
  });
}

function isJurisprudenceQuestion(message: string) {
  return /jurisprud|precedent|ac[oó]rd[aã]o|julgad|entendimento|consolid|tribunal|tce-?pe|relator|voto anterior/i
    .test(message.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
}

function buildChatJurisprudenceQueries(
  message: string,
  resumo: z.infer<typeof ResumoSchema>,
): JurisprudenceResearchQuery[] {
  const findings = resumo.achados.slice(0, 5);
  const context = [
    ...findings.map((achado) => achado.titulo),
    ...findings.flatMap((achado) => achado.fundamentacao_legal.slice(0, 1)),
  ].filter(Boolean).join(' | ').slice(0, 500);
  return [
    {
      label: 'Pergunta atual',
      query: `${message} | ${findings.map((achado) => achado.titulo).join(' | ')}`.slice(0, 500),
      maxOfficialPages: 2,
    },
    ...(context ? [{ label: 'Contexto dos achados', query: context, maxOfficialPages: 1 }] : []),
  ];
}
