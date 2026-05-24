/**
 * Cache de buscas no Vertex AI por processo. TTL controlado pela coluna
 * expires_at (default 7 dias). Evita gastar quota e acelera a aba de
 * similares quando o usuário só atualiza a página.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { hashQuery, searchSimilarProcesses, type SearchOptions } from './search';
import type { SimilarResult } from '@/lib/types/database';
import { loggerFor } from '@/lib/logger';

const log = loggerFor('vertex/cache');

export async function getCachedOrFetch(
  supabase: SupabaseClient,
  processoId: string,
  opts: SearchOptions,
): Promise<{ results: SimilarResult[]; cached: boolean }> {
  const queryHash = hashQuery(opts.query);

  const { data: existing, error } = await supabase
    .from('similares_cache')
    .select('results, expires_at')
    .eq('processo_id', processoId)
    .eq('query_hash', queryHash)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) log.warn({ err: error }, 'leitura de cache falhou — refazendo busca');

  if (existing && Array.isArray(existing.results)) {
    log.debug({ processoId, queryHash }, 'cache HIT');
    return { results: existing.results as SimilarResult[], cached: true };
  }

  const results = await searchSimilarProcesses(opts);

  // Upsert (única chave: processo_id + query_hash)
  const { error: upsertErr } = await supabase
    .from('similares_cache')
    .upsert(
      {
        processo_id: processoId,
        query_hash: queryHash,
        query_text: opts.query,
        results,
      },
      { onConflict: 'processo_id,query_hash' },
    );

  if (upsertErr) log.warn({ err: upsertErr }, 'falha ao salvar cache');

  return { results, cached: false };
}

export async function invalidateCache(supabase: SupabaseClient, processoId: string) {
  const { error } = await supabase
    .from('similares_cache')
    .delete()
    .eq('processo_id', processoId);
  if (error) log.warn({ err: error, processoId }, 'falha ao invalidar cache');
}
