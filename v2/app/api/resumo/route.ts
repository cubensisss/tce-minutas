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
import { extractFromBuffer } from '@/lib/pdf/extract';
import { ocrPdfWithGemini } from '@/lib/pdf/ocr';
import { generateJson } from '@/lib/gemini/client';
import { ResumoSchema } from '@/schemas/resumo';
import { buildResumoSystemPrompt, buildResumoUserPrompt } from '@/prompts/resumo';
import { loggerFor } from '@/lib/logger';

const log = loggerFor('api/resumo');

export const runtime = 'nodejs';
// OCR de PDFs escaneados via Gemini Flash pode tomar 60-120s para
// relatórios grandes; subimos o teto para acomodar fallback + Flash final.
export const maxDuration = 300;

const Body = z.object({ processo_id: z.string().uuid() });

export async function POST(request: NextRequest) {
  try {
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // 1. Carrega documentos do processo
  const { data: docs, error: docErr } = await supabase
    .from('documentos')
    .select('kind, storage_path, filename')
    .eq('processo_id', parsed.data.processo_id);
  if (docErr) return NextResponse.json({ error: docErr.message }, { status: 500 });

  const relatorio = (docs ?? []).find((d) => d.kind === 'relatorio');
  if (!relatorio) {
    return NextResponse.json({ error: 'no_relatorio' }, { status: 400 });
  }
  const defesasDocs = (docs ?? []).filter((d) => d.kind === 'defesa');

  // 2. Extrai texto — tenta unpdf (rápido, gratuito), cai pra OCR via
  //    Gemini Flash multimodal se o PDF for escaneado.
  log.info({ processo_id: parsed.data.processo_id, defesas: defesasDocs.length }, 'iniciando extração');

  const MIN_CHARS = 200;

  /**
   * Tenta extração textual; se vier vazio, faz OCR via Gemini Flash.
   * Limite ~20MB inline; se o documento for maior, OCR é pulado e
   * o caller decide (relatório → 422, defesa → segue sem ela).
   */
  async function extractWithFallback(
    storagePath: string,
    filename: string,
    mustHaveText: boolean,
  ): Promise<{ text: string; usedOcr: boolean }> {
    const buf = await downloadDocument(supabase, storagePath);
    const ext = await extractFromBuffer(buf, filename);
    if (ext.text.trim().length >= MIN_CHARS) {
      return { text: ext.text, usedOcr: false };
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
      return { text: '', usedOcr: false };
    }

    log.info({ filename, sizeMb }, 'extração textual vazia — tentando OCR via Gemini');
    try {
      const ocrText = await ocrPdfWithGemini(buf, filename);
      if (ocrText.trim().length < MIN_CHARS) {
        log.warn({ filename, chars: ocrText.length }, 'OCR retornou texto curto demais');
        if (mustHaveText) {
          throw new Error(
            `OCR via IA produziu texto muito curto para "${filename}" ` +
              `(${ocrText.length} caracteres). O documento pode estar ilegível ` +
              `ou ser apenas imagens sem texto.`,
          );
        }
        return { text: ocrText, usedOcr: true };
      }
      return { text: ocrText, usedOcr: true };
    } catch (err) {
      log.error({ err, filename }, 'OCR via Gemini falhou');
      if (mustHaveText) {
        throw new Error(
          `OCR via IA falhou para "${filename}": ${(err as Error).message}`,
        );
      }
      return { text: '', usedOcr: false };
    }
  }

  let relText: { text: string; usedOcr: boolean };
  try {
    relText = await extractWithFallback(relatorio.storage_path, relatorio.filename, true);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 422 },
    );
  }
  log.info(
    { filename: relatorio.filename, chars: relText.text.length, usedOcr: relText.usedOcr },
    'relatório pronto',
  );

  const defesasText = await Promise.all(
    defesasDocs.map(async (d) => {
      try {
        const r = await extractWithFallback(d.storage_path, d.filename, false);
        return { filename: d.filename, text: r.text, usedOcr: r.usedOcr };
      } catch (err) {
        log.warn({ err, filename: d.filename }, 'falha ao extrair defesa, ignorando');
        return { filename: d.filename, text: '', usedOcr: false };
      }
    }),
  );

  // Filtra defesas vazias antes de mandar pro Gemini — defesa que ficou
  // sem texto mesmo após OCR não derruba o resumo (o relatório basta).
  const defesasValidas = defesasText
    .filter((d) => d.text.trim().length >= MIN_CHARS)
    .map((d) => ({ filename: d.filename, text: d.text }));

  // 3. Gemini Flash → JSON validado
  const resumo = await generateJson({
    model: 'flash',
    system: buildResumoSystemPrompt(),
    prompt: buildResumoUserPrompt({
      relatorioAuditoria: relText.text,
      defesas: defesasValidas,
    }),
    schema: ResumoSchema,
    timeoutMs: 120_000,
    // Resumo agora é detalhado (narrativa + dados objetivos + defesa completa)
    // — precisa de orçamento de saída maior pra não cortar achados longos.
    maxOutputTokens: 16_000,
  });

  // 4. Salva no banco — atualiza metadados que vieram do relatório.
  // Como o /novo agora aceita só os arquivos, número/unidade vinham com
  // placeholders ("(extraindo...)"). Sobrescrevemos sempre que a triagem
  // entregar um valor válido.
  const numeroExtraido = resumo.processo.numero?.trim();
  const unidadeExtraida = resumo.processo.unidade_jurisdicionada?.trim();

  const update: Record<string, unknown> = {
    resumo_data: resumo,
    achados: resumo.achados,
    status: 'resumo',
    exercicio: resumo.processo.exercicio ?? undefined,
    interessados: (resumo.processo.interessados ?? []).join(', ') || undefined,
    descricao_objeto: resumo.processo.descricao_objeto ?? undefined,
  };
  if (numeroExtraido) update.numero = numeroExtraido;
  if (unidadeExtraida) update.unidade_jurisdicionada = unidadeExtraida;

  const { error: updErr } = await supabase
    .from('processos')
    .update(update)
    .eq('id', parsed.data.processo_id);

  if (updErr) {
    log.error({ err: updErr }, 'falha ao salvar resumo');
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, resumo });
  } catch (err) {
    log.error({ err }, 'erro não tratado em /api/resumo');
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

