/**
 * GET /api/similares?processo_id=...&q=...
 * Busca processos similares no Vertex AI. Se processo_id vier sem `q`,
 * usa o resumo do processo como query. Resultado vem do cache (TTL 7d) ou
 * do Vertex direto.
 *
 * Single endpoint pra duas necessidades: aba global de busca livre e
 * aba "similares" dentro do processo.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { searchSimilarProcesses } from '@/lib/vertex/search';
import { getCachedOrFetch } from '@/lib/vertex/cache';
import { ResumoSchema } from '@/schemas/resumo';
import { loggerFor } from '@/lib/logger';

const log = loggerFor('api/similares');

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const processoId = request.nextUrl.searchParams.get('processo_id');
  const q = request.nextUrl.searchParams.get('q');
  const topN = Number(request.nextUrl.searchParams.get('top') ?? '3');

  // Caso 1: busca livre (sem processo)
  if (!processoId) {
    if (!q) return NextResponse.json({ error: 'missing_query' }, { status: 400 });
    const results = await searchSimilarProcesses({ query: q, topN: Math.min(topN, 10) });
    return NextResponse.json({ results, cached: false });
  }

  // Caso 2: dentro do processo — usa cache + query default a partir do resumo
  let query = q ?? '';
  if (!query) {
    const { data: processo } = await supabase
      .from('processos')
      .select('resumo_data')
      .eq('id', processoId)
      .single();
    const parsed = ResumoSchema.safeParse(processo?.resumo_data);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'sem_resumo_para_processo' },
        { status: 400 },
      );
    }
    query = parsed.data.achados.map((a) => a.titulo).slice(0, 5).join(' | ');
  }

  try {
    const out = await getCachedOrFetch(supabase, processoId, {
      query,
      pageSize: 10,
      topN: Math.min(topN, 10),
    });
    return NextResponse.json(out);
  } catch (err) {
    log.error({ err }, 'falha na busca de similares');
    return NextResponse.json(
      { error: 'vertex_failed', message: (err as Error).message },
      { status: 500 },
    );
  }
}
