/**
 * POST /api/minuta/ajustar
 * Recebe a minuta atual + o pedido de ajuste em linguagem natural e
 * pede ao Gemini Flash pra reescrever a parte indicada (ementa, relatorio,
 * analise_completa ou decisao_voto). Não regera a minuta inteira.
 *
 * Body: { processo_id, secao, instrucao }
 */
import { z } from 'zod';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { generateText } from '@/lib/gemini/client';
import { MinutaSchema, type Minuta } from '@/schemas/minuta';
import { loadPersonaConfig } from '@/lib/config/persona';
import { loggerFor } from '@/lib/logger';

const log = loggerFor('api/minuta/ajustar');

export const runtime = 'nodejs';
export const maxDuration = 120;

const Body = z.object({
  processo_id: z.string().uuid(),
  secao: z.enum(['ementa', 'relatorio', 'analise_completa', 'decisao_voto']),
  instrucao: z.string().min(3),
});

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  const supabase = await createServerClient();
  const { data: processo, error } = await supabase
    .from('processos')
    .select('minuta')
    .eq('id', parsed.data.processo_id)
    .single();
  if (error || !processo) {
    return NextResponse.json({ error: 'processo_nao_encontrado' }, { status: 404 });
  }
  const minuta = MinutaSchema.safeParse(processo.minuta);
  if (!minuta.success) return NextResponse.json({ error: 'minuta_invalida' }, { status: 400 });

  const persona = await loadPersonaConfig(supabase);
  const original = minuta.data[parsed.data.secao];

  const novoTexto = await generateText({
    model: 'flash',
    system: `${persona.persona}\n\n${persona.tomVoz}\n\n${persona.proibicoes}`,
    prompt: `Reescreva o trecho abaixo aplicando a instrução da Conselheira.
Preserve o estilo, a estrutura geral e qualquer informação factual.
Retorne SOMENTE o texto reescrito, sem markdown, sem comentários.

# SEÇÃO: ${parsed.data.secao.toUpperCase()}

# TEXTO ATUAL
${original}

# INSTRUÇÃO DA CONSELHEIRA
${parsed.data.instrucao}`,
    temperature: 0.4,
    timeoutMs: 60_000,
  });

  const novaMinuta: Minuta = { ...minuta.data, [parsed.data.secao]: novoTexto.trim() };

  const { error: updErr } = await supabase
    .from('processos')
    .update({ minuta: novaMinuta, status: 'revisao' })
    .eq('id', parsed.data.processo_id);
  if (updErr) {
    log.error({ err: updErr }, 'falha ao salvar minuta ajustada');
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, minuta: novaMinuta });
}
