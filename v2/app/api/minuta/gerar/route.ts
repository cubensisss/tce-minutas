/**
 * POST /api/minuta/gerar
 * Gera a minuta usando Gemini Pro com TODO o contexto:
 *  - persona da Conselheira
 *  - resumo + diretrizes
 *  - documentos brutos extraídos do Storage
 *  - pesquisa obrigatória e ao vivo na jurisprudência oficial do TCE-PE
 *  - acervo vetorial do gabinete como fonte complementar
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
import { DiretrizesSchema, diretrizesForGeneration } from '@/schemas/diretrizes';
import { buildMinutaSystemPrompt, buildMinutaUserPrompt } from '@/prompts/minuta';
import { loadPersonaConfig } from '@/lib/config/persona';
import { loggerFor } from '@/lib/logger';
import { elapsedMs, updateJobProgress } from '@/lib/jobs/progress';
import { saveMinutaVersion } from '@/lib/minuta/versioning';
import { buildExtractionArtifact, formatArtifactForPrompt, loadExtractionArtifact } from '@/lib/storage/extraction';
import { directiveBlockers, generationContextHash, inactiveSanctionConflicts } from '@/lib/conference/checks';
import { contentHash, verifyMinutaReferences } from '@/lib/evidence/verify';
import { getEnv } from '@/lib/env';
import {
  buildMinutaJurisprudenceQueries,
  formatJurisprudenceResearch,
  OfficialJurisprudenceUnavailableError,
  researchJurisprudence,
} from '@/lib/search/jurisprudence-research';

const log = loggerFor('api/minuta/gerar');

export const runtime = 'nodejs';
export const maxDuration = 300;

const Body = z.object({
  processo_id: z.string().uuid(),
  job_id: z.string().uuid().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const recoveryRequest = request.clone();
  try {
    return await generateMinuta(request);
  } catch (err) {
    const failure = describeGenerationFailure(err);
    log.error({ err, code: failure.code }, 'falha nao tratada ao gerar minuta');

    try {
      const recoveryBody = Body.safeParse(await recoveryRequest.json().catch(() => ({})));
      if (recoveryBody.success && recoveryBody.data.job_id) {
        const recoveryClient = await createServerClient();
        await updateJobProgress(recoveryClient, recoveryBody.data.job_id, {
          phase: 'erro',
          message: failure.message,
          progress: 95,
        }, 'error');
      }
    } catch (jobErr) {
      log.warn({ err: jobErr }, 'nao foi possivel registrar a falha no job da minuta');
    }

    return NextResponse.json(
      { error: failure.code, message: failure.message },
      { status: failure.status },
    );
  }
}

async function generateMinuta(request: NextRequest) {
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
  const generationDiretrizes = diretrizesForGeneration(diretrizesParse.data);
  const pendingDirectives = directiveBlockers(generationDiretrizes);
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

  // 3. Carrega persona + pesquisa obrigatória na jurisprudência
  const persona = await loadPersonaConfig(supabase);
  const searchStarted = performance.now();
  await updateJobProgress(supabase, job_id, {
    phase: 'precedentes', message: 'Pesquisando a jurisprudência oficial por achado...', progress: 42, timings,
  });
  let jurisprudenceResearch;
  try {
    jurisprudenceResearch = await withTimeout(researchJurisprudence({
      queries: buildMinutaJurisprudenceQueries(resumoParse.data),
      resultsLimit: Math.min(Math.max(resumoParse.data.achados.length * 2 + 6, 16), 30),
      requireOfficial: true,
      officialPageSize: 20,
      cabinetPageSize: 20,
      cabinetTopN: 8,
      concurrency: 3,
    }), 90_000, 'tempo_limite_pesquisa_jurisprudencial');
  } catch (err) {
    const unavailable = err instanceof OfficialJurisprudenceUnavailableError;
    log.error({ err, processo_id }, 'pesquisa jurisprudencial obrigatoria falhou');
    await updateJobProgress(supabase, job_id, {
      phase: 'precedentes',
      message: unavailable
        ? 'A base oficial do TCE-PE está indisponível. A minuta não foi gerada.'
        : 'A pesquisa jurisprudencial falhou. A minuta não foi gerada.',
      progress: 42,
      timings,
    }, 'error');
    return NextResponse.json({
      error: unavailable ? 'jurisprudencia_oficial_indisponivel' : 'pesquisa_jurisprudencial_falhou',
      message: 'A geração foi interrompida porque a pesquisa obrigatória na jurisprudência não pôde ser concluída.',
    }, { status: 503 });
  }
  const precedentes = jurisprudenceResearch.results;
  timings.precedentes_ms = elapsedMs(searchStarted);

  // 4. Gera com Gemini Pro
  log.info(
    {
      processo_id,
      docs: documentosBrutos.length,
      precedentes: precedentes.length,
      jurisprudencia: jurisprudenceResearch.report,
    },
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
      diretrizes: generationDiretrizes,
      documentosBrutos,
      precedentes,
      jurisprudenceResearch: formatJurisprudenceResearch(jurisprudenceResearch.report),
    }),
    schema: MinutaSchema,
    temperature: 0.3,
    maxOutputTokens: 32_768,
    timeoutMs: 120_000,
    retries: 0,
    structuredAttempts: 1,
  });
  const generatedMinuta = MinutaSchema.parse(generatedMinutaRaw);
  const minuta = verifyMinutaReferences(
    generatedMinuta,
    resumoParse.data,
    precedentes,
  );
  const sanctionConflicts = inactiveSanctionConflicts(generationDiretrizes, minuta);
  if (sanctionConflicts.length > 0) {
    log.error({ processo_id, sanctionConflicts }, 'minuta divergiu das sancoes confirmadas');
    await updateJobProgress(supabase, job_id, {
      phase: 'erro',
      message: 'A redação da IA contrariou uma sanção desmarcada e foi descartada com segurança.',
      progress: 90,
      timings,
    }, 'error');
    return NextResponse.json({
      error: 'minuta_divergente_diretrizes',
      message: 'A IA tentou incluir uma sanção desmarcada. A minuta não foi salva; tente gerar novamente.',
      details: sanctionConflicts,
    }, { status: 422 });
  }
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
  const contextHash = generationContextHash(resumoParse.data, generationDiretrizes);
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
        prompt_version: 'jurisprudencia-obrigatoria-v2',
        generated_at: new Date().toISOString(),
        context_hash: contextHash,
        documents_hash: contentHash((docs ?? []).map((doc) => ({
          id: doc.id,
          path: doc.storage_path,
          extraction_path: doc.extraction_storage_path,
        }))),
        jurisprudence: jurisprudenceResearch.report,
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

  return NextResponse.json({
    ok: true,
    minuta,
    timings,
    jurisprudence_report: jurisprudenceResearch.report,
  });
}

function describeGenerationFailure(err: unknown): {
  code: string;
  message: string;
  status: number;
} {
  const rawMessage = err instanceof Error ? err.message : String(err ?? '');
  const normalized = rawMessage.toLowerCase();

  if (/timeout|timed out|aborted|tempo_limite/.test(normalized)) {
    return {
      code: 'tempo_limite_geracao',
      message: 'A geração excedeu o tempo disponível. Tente novamente; a pesquisa jurisprudencial será reiniciada.',
      status: 504,
    };
  }

  if (
    err instanceof SyntaxError
    || normalized.includes('json')
    || normalized.includes('schema')
    || normalized.includes('zod')
  ) {
    return {
      code: 'resposta_ia_invalida',
      message: 'A IA devolveu uma resposta incompleta ou fora do formato esperado. Tente gerar novamente.',
      status: 502,
    };
  }

  const safeDetail = rawMessage
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/(?:api[_-]?key|token|authorization)\s*[:=]\s*\S+/gi, '[credencial omitida]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);

  return {
    code: 'falha_interna_geracao',
    message: safeDetail
      ? `A geração falhou no servidor: ${safeDetail}`
      : 'A geração falhou no servidor sem informar detalhes. Tente novamente.',
    status: 500,
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, code: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(code)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
