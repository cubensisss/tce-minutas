/**
 * GET /api/minuta/docx?processo_id=...
 * Retorna o DOCX gerado a partir da minuta salva. Streaming não — geração
 * é rápida (<2s), preferimos retornar o arquivo pronto.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { generateMinutaDocx } from '@/lib/docx/generate';
import { MinutaSchema } from '@/schemas/minuta';
import { loggerFor } from '@/lib/logger';
import { ResumoSchema } from '@/schemas/resumo';
import { DiretrizesSchema } from '@/schemas/diretrizes';
import { generationContextHash } from '@/lib/conference/checks';
import { isApprovedForDownload } from '@/lib/minuta/approval';
import { hasCompletedJurisprudenceResearch } from '@/lib/search/jurisprudence-research';

const log = loggerFor('api/minuta/docx');

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const processoId = request.nextUrl.searchParams.get('processo_id');
  if (!processoId) return NextResponse.json({ error: 'missing_processo_id' }, { status: 400 });

  const supabase = await createServerClient();
  const { data: processo, error } = await supabase
    .from('processos')
    .select('numero, unidade_jurisdicionada, exercicio, interessados, relator, minuta, resumo_data, diretrizes, minuta_status, minuta_approved_hash, minuta_context_hash, minuta_meta')
    .eq('id', processoId)
    .single();

  if (error || !processo) {
    return NextResponse.json({ error: 'processo_nao_encontrado' }, { status: 404 });
  }

  const minutaParse = MinutaSchema.safeParse(processo.minuta);
  if (!minutaParse.success) {
    return NextResponse.json({ error: 'minuta_invalida' }, { status: 400 });
  }
  const resumoParse = ResumoSchema.safeParse(processo.resumo_data);
  const diretrizesParse = DiretrizesSchema.safeParse(processo.diretrizes);
  const currentContextHash = resumoParse.success && diretrizesParse.success
    ? generationContextHash(resumoParse.data, diretrizesParse.data)
    : null;
  if (!hasCompletedJurisprudenceResearch(
    (processo.minuta_meta as { jurisprudence?: unknown } | null)?.jurisprudence,
  )) {
    return NextResponse.json({
      error: 'jurisprudencia_nao_pesquisada',
      message: 'Regenere a minuta para concluir a pesquisa obrigatória na jurisprudência do TCE-PE.',
    }, { status: 409 });
  }
  if (!isApprovedForDownload({
    status: processo.minuta_status,
    approvedHash: processo.minuta_approved_hash,
    minuta: minutaParse.data,
    storedContextHash: processo.minuta_context_hash,
    currentContextHash,
  })) {
    return NextResponse.json(
      { error: 'minuta_nao_aprovada', message: 'Conclua a conferência final antes de baixar o DOCX.' },
      { status: 409 },
    );
  }

  try {
    const buffer = await generateMinutaDocx({
      processo,
      minuta: minutaParse.data,
    });

    // Converte o Buffer em ArrayBuffer "pure" para o Next 16/Turbopack —
    // passar Buffer ou Uint8Array com .buffer compartilhado às vezes
    // dispara "worker thread exited" durante a serialização da resposta.
    const ab = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(ab).set(buffer);

    const filename = `minuta_${(processo.numero ?? 'sem_numero').replace(/\W+/g, '_')}.docx`;

    return new NextResponse(ab, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.byteLength),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    log.error({ err }, 'falha ao gerar docx');
    return NextResponse.json(
      { error: 'docx_generation_failed', message: (err as Error).message },
      { status: 500 },
    );
  }
}
