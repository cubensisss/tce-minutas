/**
 * POST /api/similares/relacao
 *
 * Para um resultado vindo do Vertex AI Search, gera uma frase curta (1-2)
 * explicando como ele se relaciona com o processo em análise. Usa só o
 * snippet/título do similar + o resumo do processo — não baixa o PDF.
 *
 * Roda em Gemini Flash, é barato e rápido (~3s).
 *
 * Body: { processo_id, similar }
 *   similar: { title, snippet }
 * Resp: { relacao: string }
 */
import { z } from 'zod';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { generateText } from '@/lib/gemini/client';
import { ResumoSchema } from '@/schemas/resumo';
import { loggerFor } from '@/lib/logger';

const log = loggerFor('api/similares/relacao');

export const runtime = 'nodejs';
export const maxDuration = 30;

const Body = z.object({
  processo_id: z.string().uuid(),
  similar: z.object({
    title: z.string().nullable().optional(),
    snippet: z.string().nullable().optional(),
  }),
});

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: processo } = await supabase
    .from('processos')
    .select('resumo_data')
    .eq('id', parsed.data.processo_id)
    .single();

  const resumo = ResumoSchema.safeParse(processo?.resumo_data);
  if (!resumo.success) {
    return NextResponse.json({ error: 'sem_resumo_para_processo' }, { status: 400 });
  }

  const cleanSnippet = (parsed.data.similar.snippet ?? '')
    .replace(/<\/?b>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);

  const achadosResumo = resumo.data.achados
    .map((a, i) => `${i + 1}. ${a.titulo} — ${a.descricao.slice(0, 200)}`)
    .join('\n');

  const system = `Você é um assistente jurídico do TCE-PE. Sua tarefa é
explicar em 1-2 frases curtas (máx 60 palavras, em português formal) como
um precedente jurisprudencial se relaciona com o processo em análise.
Foque na similaridade temática (mesmas matérias, mesmas teses, mesmos
dispositivos legais). Se a relação for fraca, diga isso. Não invente
fatos. Não use bullets. Apenas texto corrido.`;

  const userPrompt = `# PROCESSO EM ANÁLISE
Unidade: ${resumo.data.processo.unidade_jurisdicionada}
Achados:
${achadosResumo}

# PRECEDENTE ENCONTRADO
Título: ${parsed.data.similar.title ?? '(sem título)'}
Trecho: ${cleanSnippet || '(sem trecho disponível)'}

# TAREFA
Em 1-2 frases, explique a relação deste precedente com o processo em análise.`;

  try {
    const relacao = await generateText({
      model: 'flash',
      system,
      prompt: userPrompt,
      temperature: 0.3,
      timeoutMs: 25_000,
      retries: 1,
    });
    return NextResponse.json({ relacao: relacao.trim() });
  } catch (err) {
    log.error({ err }, 'falha ao gerar relação');
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'gemini_error' },
      { status: 500 },
    );
  }
}
