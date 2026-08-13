import type { SimilarResult } from '@/lib/types/database';
import { searchTceJurisprudencia } from '@/lib/tce/jurisprudencia';
import { searchSimilarProcesses, type SearchOptions } from '@/lib/vertex/search';
import { loggerFor } from '@/lib/logger';

const log = loggerFor('search/hybrid');

/**
 * Combina jurisprudencia oficial de todos os relatores com o acervo vetorial
 * do gabinete. As fontes rodam em paralelo e uma falha nao derruba a outra.
 */
export async function searchHybrid(opts: SearchOptions): Promise<SimilarResult[]> {
  const [official, cabinet] = await Promise.allSettled([
    searchTceJurisprudencia(opts.query, opts.topN ?? 6),
    searchSimilarProcesses({ ...opts, topN: opts.topN ?? 6 }),
  ]);

  const officialRows = official.status === 'fulfilled' ? official.value : [];
  const cabinetRows = cabinet.status === 'fulfilled'
    ? cabinet.value.map((row) => ({ ...row, source: 'vertex_gabinete' as const }))
    : [];

  if (official.status === 'rejected') log.warn({ err: official.reason }, 'fonte oficial indisponivel');
  if (cabinet.status === 'rejected') log.warn({ err: cabinet.reason }, 'vertex do gabinete indisponivel');
  if (officialRows.length === 0 && cabinetRows.length === 0) {
    throw new Error('Nenhuma fonte de jurisprudencia respondeu');
  }

  const merged: SimilarResult[] = [];
  const seen = new Set<string>();
  const max = Math.max(officialRows.length, cabinetRows.length);
  for (let index = 0; index < max; index++) {
    for (const row of [officialRows[index], cabinetRows[index]]) {
      if (!row) continue;
      const key = `${row.processo ?? ''}|${row.acordao ?? ''}|${row.title ?? row.id}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(row);
      if (merged.length >= (opts.topN ?? 6)) return merged;
    }
  }
  return merged;
}
