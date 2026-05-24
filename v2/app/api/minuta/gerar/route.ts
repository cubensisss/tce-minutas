/**
 * POST /api/minuta/gerar
 * Gera a minuta usando Gemini Pro com TODO o contexto:
 *  - persona da Conselheira
 *  - resumo + diretrizes
 *  - documentos brutos extraídos do Storage
 *  - precedentes do Vertex AI Search (top 3 cacheados)
 *
 * Body: { processo_id }
 */
import { z } from 'zod';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { downloadDocument } from '@/lib/storage/upload';
import { extractFromBuffer } from '@/lib/pdf/extract';
import { generateJson } from '@/lib/gemini/client';
import { MinutaSchema } from '@/schemas/minuta';
import { ResumoSchema } from '@/schemas/resumo';
import { DiretrizesSchema } from '@/schemas/diretrizes';
import { buildMinutaSystemPrompt, buildMinutaUserPrompt } from '@/prompts/minuta';
import { loadPersonaConfig } from '@/lib/config/persona';
import { getCachedOrFetch } from '@/lib/vertex/cache';
import { loggerFor } from '@/lib/logger';

const log = loggerFor('api/minuta/gerar');

export const runtime = 'nodejs';
export const maxDuration = 300;

const Body = z.object({ processo_id: z.string().uuid() });

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  const { processo_id } = parsed.data;

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // 1. Carrega o estado do processo
  const { data: processo, error: pErr } = await supabase
    .from('processos')
    .select('id, numero, unidade_jurisdicionada, resumo_data, diretrizes')
    .eq('id', processo_id)
    .single();
  if (pErr || !processo) {
    return NextResponse.json({ error: 'processo_nao_encontrado' }, { status: 404 });
  }

  const resumoParse = ResumoSchema.safeParse(processo.resumo_data);
  const diretrizesParse = DiretrizesSchema.safeParse(processo.diretrizes);
  if (!resumoParse.success || !diretrizesParse.success) {
    return NextResponse.json(
      { error: 'estado_invalido', details: { resumo: resumoParse.success, diretrizes: diretrizesParse.success } },
      { status: 400 },
    );
  }

  // 2. Carrega documentos brutos
  const { data: docs } = await supabase
    .from('documentos')
    .select('kind, storage_path, filename')
    .eq('processo_id', processo_id);

  const documentosBrutos = await Promise.all(
    (docs ?? [])
      .filter((d) => d.kind === 'relatorio' || d.kind === 'defesa')
      .map(async (d) => {
        const buf = await downloadDocument(supabase, d.storage_path);
        const ext = await extractFromBuffer(buf, d.filename);
        return { filename: d.filename, text: ext.text };
      }),
  );

  // 3. Carrega persona + busca precedentes
  const persona = await loadPersonaConfig(supabase);
  const queryParaSimilares = buildSimilaresQuery(resumoParse.data);
  const { results: precedentes } = await getCachedOrFetch(supabase, processo_id, {
    query: queryParaSimilares,
    pageSize: 20,
    // 6 precedentes (era 3) — mais fundamentação e mais números de acórdão
    // reais para o modelo citar. Combinado com mais trechos por documento.
    topN: 6,
  });

  // 4. Gera com Gemini Pro
  log.info(
    { processo_id, docs: documentosBrutos.length, precedentes: precedentes.length },
    'gerando minuta',
  );
  const minuta = await generateJson({
    model: 'pro',
    system: buildMinutaSystemPrompt({
      persona: persona.persona,
      tomVoz: persona.tomVoz,
      proibicoes: persona.proibicoes,
      estruturaPadrao: persona.estruturaPadrao,
      limiteLegalArt73: persona.limiteLegalArt73,
    }),
    prompt: buildMinutaUserPrompt({
      persona: persona.persona,
      tomVoz: persona.tomVoz,
      proibicoes: persona.proibicoes,
      estruturaPadrao: persona.estruturaPadrao,
      limiteLegalArt73: persona.limiteLegalArt73,
      resumo: resumoParse.data,
      diretrizes: diretrizesParse.data,
      documentosBrutos,
      precedentes,
    }),
    schema: MinutaSchema,
    temperature: 0.3,
    timeoutMs: 240_000,
    retries: 1,
  });

  // 5. Persiste a minuta
  const { error: updErr } = await supabase
    .from('processos')
    .update({ minuta, status: 'minuta' })
    .eq('id', processo_id);
  if (updErr) {
    log.error({ err: updErr }, 'falha ao salvar minuta');
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, minuta });
}

/**
 * Constrói a query de busca dos precedentes a partir do resumo.
 * Concatena o título de cada achado — boa cobertura sem ficar muito longo.
 */
function buildSimilaresQuery(resumo: z.infer<typeof ResumoSchema>): string {
  const titulos = resumo.achados.map((a) => a.titulo).filter(Boolean).slice(0, 5);
  const base = titulos.join(' | ');
  return base.length > 0 ? base : resumo.processo.descricao_objeto ?? resumo.processo.numero;
}
