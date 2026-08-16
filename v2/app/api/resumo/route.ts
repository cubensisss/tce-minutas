/**
 * POST /api/resumo
 * Gera o resumo de triagem de um processo. Lê os documentos do Storage,
 * extrai texto, manda pro Gemini Flash e salva o resultado em
 * processos.resumo_data + processos.achados.
 *
 * Body: { processo_id: string }
 */
import { z } from 'zod';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { downloadDocument } from '@/lib/storage/upload';
import { extractFromBuffer, type ExtractedDocument } from '@/lib/pdf/extract';
import { ocrPdfWithGemini } from '@/lib/pdf/ocr';
import { generateJson } from '@/lib/gemini/client';
import { ResumoSchema } from '@/schemas/resumo';
import { buildResumoSystemPrompt, buildResumoUserPrompt } from '@/prompts/resumo';
import { loggerFor } from '@/lib/logger';
import { elapsedMs, updateJobProgress } from '@/lib/jobs/progress';
import {
  buildExtractionArtifact,
  formatArtifactForPrompt,
  saveExtractionArtifact,
  type ExtractionArtifact,
} from '@/lib/storage/extraction';
import { verifyResumoEvidence } from '@/lib/evidence/verify';

const log = loggerFor('api/resumo');

export const runtime = 'nodejs';
// OCR de PDFs escaneados via Gemini Flash pode tomar 60-120s para
// relatórios grandes; subimos o teto para acomodar fallback + Flash final.
export const maxDuration = 300;

const Body = z.object({
  processo_id: z.string().uuid(),
  job_id: z.string().uuid().nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }
    const { processo_id: processoId } = parsed.data;

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const totalStarted = performance.now();
    const timings: Record<string, number> = {};
    const jobId = parsed.data.job_id;
    await updateJobProgress(supabase, jobId, {
      phase: 'documentos', message: 'Localizando os documentos...', progress: 8, timings,
    });

  // 1. Carrega documentos do processo
  const { data: docs, error: docErr } = await supabase
    .from('documentos')
    .select('id, kind, storage_path, filename')
    .eq('processo_id', processoId);
  if (docErr) return NextResponse.json({ error: docErr.message }, { status: 500 });

  const relatorio = (docs ?? []).find((d) => d.kind === 'relatorio');
  if (!relatorio) {
    return NextResponse.json({ error: 'no_relatorio' }, { status: 400 });
  }
  const defesasDocs = (docs ?? []).filter((d) => d.kind === 'defesa');

  // 2. Extrai texto — tenta unpdf (rápido, gratuito), cai pra OCR via
  //    Gemini Flash multimodal se o PDF for escaneado.
  log.info({ processo_id: processoId, defesas: defesasDocs.length }, 'iniciando extração');

  const MIN_CHARS = 200;
  const extractionStarted = performance.now();
  await updateJobProgress(supabase, jobId, {
    phase: 'extracao', message: 'Extraindo texto do relatorio e das defesas...', progress: 22, timings,
  });

  /**
   * Tenta extração textual; se vier vazio, faz OCR via Gemini Flash.
   * Limite ~20MB inline; se o documento for maior, OCR é pulado e
   * o caller decide (relatório → 422, defesa → segue sem ela).
   */
  async function extractWithFallback(
    storagePath: string,
    filename: string,
    mustHaveText: boolean,
  ): Promise<{
    extracted: ExtractedDocument;
    usedOcr: boolean;
    locatorConfidence: 'confirmed' | 'needs_review';
  }> {
    const buf = await downloadDocument(supabase, storagePath);
    const ext = await extractFromBuffer(buf, filename);
    if (ext.text.trim().length >= MIN_CHARS) {
      return { extracted: ext, usedOcr: false, locatorConfidence: 'confirmed' };
    }

    // Texto vazio/insuficiente: tenta OCR só pra PDFs (DOCX vazio é outro
    // problema). Limite inline do Gemini é 20MB; abaixo disso enviamos.
    const isPdf = filename.toLowerCase().endsWith('.pdf');
    const sizeMb = buf.byteLength / (1024 * 1024);
    if (!isPdf || sizeMb > 20) {
      log.warn(
        { filename, sizeMb, chars: ext.text.length },
        'arquivo sem texto e fora do range de OCR',
      );
      if (mustHaveText) {
        throw new Error(
          `Não foi possível extrair texto de "${filename}" e o arquivo está ` +
            `fora do range de OCR (PDF até 20MB). Tamanho: ${sizeMb.toFixed(1)}MB.`,
        );
      }
      return {
        extracted: { ...ext, text: '', pages: [], charCount: 0 },
        usedOcr: false,
        locatorConfidence: 'needs_review',
      };
    }

    log.info({ filename, sizeMb }, 'extração textual vazia — tentando OCR via Gemini');
    try {
      const ocr = await ocrPdfWithGemini(buf, filename);
      if (ocr.text.trim().length < MIN_CHARS) {
        log.warn({ filename, chars: ocr.text.length }, 'OCR retornou texto curto demais');
        if (mustHaveText) {
          throw new Error(
            `OCR via IA produziu texto muito curto para "${filename}" ` +
              `(${ocr.text.length} caracteres). O documento pode estar ilegível ` +
              `ou ser apenas imagens sem texto.`,
          );
        }
        return {
          extracted: {
            filename, text: ocr.text, pages: ocr.pages,
            charCount: ocr.text.length, warnings: ['Paginação de OCR requer conferência humana'],
          },
          usedOcr: true,
          locatorConfidence: ocr.locatorConfidence,
        };
      }
      return {
        extracted: {
          filename, text: ocr.text, pages: ocr.pages,
          charCount: ocr.text.length, warnings: ['Paginação de OCR requer conferência humana'],
        },
        usedOcr: true,
        locatorConfidence: ocr.locatorConfidence,
      };
    } catch (err) {
      log.error({ err, filename }, 'OCR via Gemini falhou');
      if (mustHaveText) {
        throw new Error(
          `OCR via IA falhou para "${filename}": ${(err as Error).message}`,
        );
      }
      return {
        extracted: { ...ext, text: '', pages: [], charCount: 0 },
        usedOcr: false,
        locatorConfidence: 'needs_review',
      };
    }
  }

  let relText: Awaited<ReturnType<typeof extractWithFallback>>;
  try {
    relText = await extractWithFallback(relatorio.storage_path, relatorio.filename, true);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 422 },
    );
  }
  log.info(
    { filename: relatorio.filename, chars: relText.extracted.text.length, usedOcr: relText.usedOcr },
    'relatório pronto',
  );

  const defesasText = await Promise.all(
    defesasDocs.map(async (d) => {
      try {
        const r = await extractWithFallback(d.storage_path, d.filename, false);
        return { id: d.id, filename: d.filename, ...r };
      } catch (err) {
        log.warn({ err, filename: d.filename }, 'falha ao extrair defesa, ignorando');
        return {
          id: d.id,
          filename: d.filename,
          extracted: { filename: d.filename, text: '', pages: [], charCount: 0, warnings: [] },
          usedOcr: false,
          locatorConfidence: 'needs_review' as const,
        };
      }
    }),
  );

  // O texto paginado fica compactado no Storage, poupando a cota do Postgres.
  async function persistExtraction(input: {
    id: string;
    filename: string;
    extracted: ExtractedDocument;
    usedOcr: boolean;
    locatorConfidence: 'confirmed' | 'needs_review';
  }): Promise<ExtractionArtifact> {
    const artifact = buildExtractionArtifact({
      documentId: input.id,
      filename: input.filename,
      extracted: input.extracted,
      locatorConfidence: input.locatorConfidence,
    });
    const path = await saveExtractionArtifact(supabase, processoId, artifact);
    const { error } = await supabase.from('documentos').update({
      extracted_text: null,
      extracted_via: input.usedOcr ? 'gemini_ocr' : 'text_parser',
      extracted_at: new Date().toISOString(),
      extraction_storage_path: path,
      extraction_version: 1,
      page_count: artifact.locators.filter((item) => item.type === 'page').length || null,
      locator_confidence: input.locatorConfidence,
    }).eq('id', input.id);
    if (error) throw new Error(`Falha ao registrar extração: ${error.message}`);
    return artifact;
  }

  const [relArtifact, ...defesaArtifacts] = await Promise.all([
    persistExtraction({ id: relatorio.id, filename: relatorio.filename, ...relText }),
    ...defesasText.map((item) => persistExtraction(item)),
  ]);

  // Filtra defesas vazias antes de mandar pro Gemini — defesa que ficou
  // sem texto mesmo após OCR não derruba o resumo (o relatório basta).
  const defesasValidas = defesasText
    .map((item, index) => ({ item, artifact: defesaArtifacts[index] }))
    .filter(({ item, artifact }) => item.extracted.text.trim().length >= MIN_CHARS && !!artifact)
    .map(({ item, artifact }) => ({
      documentId: item.id,
      filename: item.filename,
      text: formatArtifactForPrompt(artifact!),
    }));

  // 3. Gemini Flash → JSON validado
  timings.extracao_ocr_ms = elapsedMs(extractionStarted);
  const summaryStarted = performance.now();
  await updateJobProgress(supabase, jobId, {
    phase: 'triagem_ia', message: 'Estruturando fatos, achados e defesas...', progress: 62, timings,
  });
  const generatedResumoRaw = await generateJson({
    model: 'flash',
    system: buildResumoSystemPrompt(),
    prompt: buildResumoUserPrompt({
      relatorioAuditoria: formatArtifactForPrompt(relArtifact!),
      relatorioDocumentId: relatorio.id,
      defesas: defesasValidas,
    }),
    schema: ResumoSchema,
    timeoutMs: 240_000,
    // Resumo agora é detalhado (narrativa + dados objetivos + defesa completa)
    // — precisa de orçamento de saída maior pra não cortar achados longos.
    // O Gemini 2.5 Flash pode gastar parte do limite com raciocinio interno.
    // Usar o teto do modelo evita cortar o JSON no meio de um campo textual.
    maxOutputTokens: 65_536,
  });
  const generatedResumo = ResumoSchema.parse(generatedResumoRaw);
  const resumo = verifyResumoEvidence(
    generatedResumo,
    [relArtifact!, ...defesaArtifacts.filter((item): item is ExtractionArtifact => !!item)],
  );

  // 4. Salva no banco — atualiza metadados que vieram do relatório.
  // Como o /novo agora aceita só os arquivos, número/unidade vinham com
  // placeholders ("(extraindo...)"). Sobrescrevemos sempre que a triagem
  // entregar um valor válido.
  timings.triagem_ia_ms = elapsedMs(summaryStarted);
  const numeroExtraido = resumo.processo.numero?.trim();
  const unidadeExtraida = resumo.processo.unidade_jurisdicionada?.trim();

  const update: Record<string, unknown> = {
    resumo_data: resumo,
    achados: resumo.achados,
    status: 'resumo',
    exercicio: resumo.processo.exercicio ?? undefined,
    interessados: (resumo.processo.interessados ?? []).join(', ') || undefined,
    descricao_objeto: resumo.processo.descricao_objeto ?? undefined,
    resumo_confirmado_at: null,
    diretrizes_confirmadas_at: null,
    minuta_status: 'stale',
    minuta_approved_at: null,
    minuta_approved_hash: null,
  };
  if (numeroExtraido) update.numero = numeroExtraido;
  if (unidadeExtraida) update.unidade_jurisdicionada = unidadeExtraida;

  const { error: updErr } = await supabase
    .from('processos')
    .update(update)
    .eq('id', processoId);

  if (updErr) {
    log.error({ err: updErr }, 'falha ao salvar resumo');
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  timings.total_ms = elapsedMs(totalStarted);
  await updateJobProgress(supabase, jobId, {
    phase: 'concluido', message: 'Resumo de triagem concluido.', progress: 100, timings,
  }, 'done');
  return NextResponse.json({ ok: true, resumo, timings });
  } catch (err) {
    log.error({ err }, 'erro não tratado em /api/resumo');
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

