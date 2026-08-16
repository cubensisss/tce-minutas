/**
 * POST /api/minuta/gerar
 * Gera a minuta usando Gemini Pro com TODO o contexto:
 *  - persona da Conselheira
 *  - resumo + diretrizes
 *  - documentos brutos extraídos do Storage
 *  - precedentes oficiais do TCE-PE e do acervo vetorial (cacheados)
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
import { elapsedMs, updateJobProgress } from '@/lib/jobs/progress';
import { saveMinutaVersion } from '@/lib/minuta/versioning';
import { buildExtractionArtifact, formatArtifactForPrompt, loadExtractionArtifact } from '@/lib/storage/extraction';
import { directiveBlockers, generationContextHash } from '@/lib/conference/checks';
import { contentHash, verifyMinutaReferences } from '@/lib/evidence/verify';
import { getEnv } from '@/lib/env';

const log = loggerFor('api/minuta/gerar');

export const runtime = 'nodejs';
export const maxDuration = 300;

const Body = z.object({
  processo_id: z.string().uuid(),
  job_id: z.string().uuid().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  const { processo_id, job_id } = parsed.data;

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const totalStarted = performance.now();
  const timings: Record<string, number> = {};
  await updateJobProgress(supabase, job_id, {
    phase: 'contexto', message: 'Validando resumo e diretrizes...', progress: 8, timings,
  });

  // 1. Carrega o estado do processo
  const { data: processo, error: pErr } = await supabase
    .from('processos')
    .select('id, numero, unidade_jurisdicionada, resumo_data, diretrizes, minuta, resumo_confirmado_at, diretrizes_confirmadas_at')
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
  if (!processo.resumo_confirmado_at) {
    return NextResponse.json({ error: 'resumo_nao_confirmado' }, { status: 409 });
  }
  const pendingDirectives = directiveBlockers(diretrizesParse.data);
  if (!processo.diretrizes_confirmadas_at || pendingDirectives.length > 0) {
    return NextResponse.json(
      { error: 'diretrizes_nao_confirmadas', details: pendingDirectives },
      { status: 409 },
    );
  }

  // 2. Carrega documentos brutos
  const docsStarted = performance.now();
  await updateJobProgress(supabase, job_id, {
    phase: 'documentos', message: 'Lendo os documentos originais...', progress: 20, timings,
  });
  const { data: docs } = await supabase
    .from('documentos')
    .select('id, kind, storage_path, filename, extracted_text, extraction_storage_path')
    .eq('processo_id', processo_id);

  const documentosBrutos = await Promise.all(
    (docs ?? [])
      .filter((d) => d.kind === 'relatorio' || d.kind === 'defesa')
      .map(async (d) => {
        const artifact = await loadExtractionArtifact(supabase, d);
        if (artifact) return { filename: d.filename, text: formatArtifactForPrompt(artifact) };
        const buf = await downloadDocument(supabase, d.storage_path);
        const ext = await extractFromBuffer(buf, d.filename);
        const fallback = buildExtractionArtifact({
          documentId: d.id,
          filename: d.filename,
          extracted: ext,
          locatorConfidence: 'needs_review',
        });
        return { filename: d.filename, text: formatArtifactForPrompt(fallback) };
      }),
  );
  timings.documentos_ms = elapsedMs(docsStarted);

  // 3. Carrega persona + busca precedentes
  const persona = await loadPersonaConfig(supabase);
  const queryParaSimilares = buildSimilaresQuery(resumoParse.data);
  const searchStarted = performance.now();
  await updateJobProgress(supabase, job_id, {
    phase: 'precedentes', message: 'Buscando e ordenando precedentes...', progress: 42, timings,
  });
  const { results: precedentes } = await getCachedOrFetch(supabase, processo_id, {
    query: queryParaSimilares,
    pageSize: 20,
    // 6 precedentes (era 3) — mais fundamentação e mais números de acórdão
    // reais para o modelo citar. Combinado com mais trechos por documento.
    topN: 6,
  });
  timings.precedentes_ms = elapsedMs(searchStarted);

  // 4. Gera com Gemini Pro
  log.info(
    { processo_id, docs: documentosBrutos.length, precedentes: precedentes.length },
    'gerando minuta',
  );
  const generationStarted = performance.now();
  await updateJobProgress(supabase, job_id, {
    phase: 'redacao', message: 'Redigindo e fundamentando a minuta...', progress: 62, timings,
  });
  const generatedMinutaRaw = await generateJson({
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
      precedentesObrigatorios: persona.precedentesObrigatorios,
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
  const generatedMinuta = MinutaSchema.parse(generatedMinutaRaw);
  const minuta = verifyMinutaReferences(
    generatedMinuta,
    resumoParse.data,
    precedentes,
  );
  timings.redacao_ms = elapsedMs(generationStarted);

  await updateJobProgress(supabase, job_id, {
    phase: 'salvamento', message: 'Validando e salvando o resultado...', progress: 94, timings,
  });

  await saveMinutaVersion(supabase, {
    processoId: processo_id,
    ownerId: user.id,
    minuta: processo.minuta,
    origem: 'geracao',
    descricao: 'Versao anterior preservada antes de regerar a minuta',
  });

  // 5. Persiste a minuta
  const contextHash = generationContextHash(resumoParse.data, diretrizesParse.data);
  const env = getEnv();
  const { error: updErr } = await supabase
    .from('processos')
    .update({
      minuta,
      status: 'minuta',
      minuta_status: 'draft',
      minuta_approved_at: null,
      minuta_approved_hash: null,
      minuta_context_hash: contextHash,
      conferencia_data: {},
      minuta_meta: {
        model: env.GEMINI_PRO_MODEL,
        prompt_version: 'verificavel-v1',
        generated_at: new Date().toISOString(),
        context_hash: contextHash,
        documents_hash: contentHash((docs ?? []).map((doc) => ({
          id: doc.id,
          path: doc.storage_path,
          extraction_path: doc.extraction_storage_path,
        }))),
      },
    })
    .eq('id', processo_id);
  if (updErr) {
    log.error({ err: updErr }, 'falha ao salvar minuta');
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  timings.total_ms = elapsedMs(totalStarted);
  await updateJobProgress(supabase, job_id, {
    phase: 'concluido', message: 'Minuta concluida.', progress: 100, timings,
  }, 'done');

  return NextResponse.json({ ok: true, minuta, timings });
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
