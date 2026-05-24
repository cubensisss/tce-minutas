/**
 * Wrapper sobre o Discovery Engine (Vertex AI Search).
 *
 * Inspeção feita no script inspect-vertex.mjs revelou que o data store
 * tceandressa NÃO expõe nenhum campo de data (publicacao/julgamento). Por
 * isso ordenamos por relevance (default do Vertex) e retornamos top-N.
 * Quando o pattern de URL ficar claro, essa função pode passar a tentar
 * extrair data do `link` e re-ordenar.
 */
import { getAccessToken } from './auth';
import { getEnv } from '@/lib/env';
import { loggerFor } from '@/lib/logger';
import type { SimilarResult } from '@/lib/types/database';

const log = loggerFor('vertex/search');

type DiscoveryEngineResult = {
  document?: {
    id?: string;
    name?: string;
    derivedStructData?: {
      title?: string;
      link?: string;
      snippets?: Array<{ snippet?: string; snippet_status?: string }>;
      extractive_segments?: Array<{ content?: string }>;
      extractive_answers?: Array<{ content?: string }>;
    };
  };
  modelScores?: Record<string, { values?: number[] }>;
};

type DiscoveryEngineResponse = {
  results?: DiscoveryEngineResult[];
  totalSize?: number;
  attributionToken?: string;
};

export type SearchOptions = {
  query: string;
  pageSize?: number;
  /** Quantos resultados retornar após filtragem/ordenação. */
  topN?: number;
};

export async function searchSimilarProcesses(opts: SearchOptions): Promise<SimilarResult[]> {
  const env = getEnv();
  const { query, pageSize = 10, topN = 3 } = opts;

  const token = await getAccessToken();

  const url =
    `https://discoveryengine.googleapis.com/v1/projects/${env.GCP_PROJECT_ID}` +
    `/locations/${env.GCP_LOCATION}/collections/default_collection` +
    `/engines/${env.VERTEX_APP_ID}/servingConfigs/default_search:search`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Goog-User-Project': env.GCP_PROJECT_ID,
    },
    body: JSON.stringify({
      query,
      pageSize,
      contentSearchSpec: {
        snippetSpec: { returnSnippet: true },
        extractiveContentSpec: {
          // Trazemos MAIS trechos por documento — é deles que o modelo
          // tira a fundamentação e os números de acórdão para citar.
          // Antes era 1+1 (trecho curto demais para sustentar a análise).
          maxExtractiveAnswerCount: 3,
          maxExtractiveSegmentCount: 3,
        },
      },
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    log.error({ status: res.status, body: txt.slice(0, 500), query }, 'Vertex Search falhou');
    throw new Error(`Vertex Search ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = (await res.json()) as DiscoveryEngineResponse;
  const items = data.results ?? [];

  // Vertex retorna resultados ordenados por relevância. Pegamos os topN.
  const mapped: SimilarResult[] = items.slice(0, topN).map((r, idx) => {
    const dsd = r.document?.derivedStructData;

    // Concatena TODOS os trechos extrativos do documento (answers +
    // segments), não só o primeiro — é aqui que mora a fundamentação e
    // os números de acórdão. Deduplica e junta com separador legível.
    const pieces = [
      ...(dsd?.extractive_answers ?? []).map((a) => a.content),
      ...(dsd?.extractive_segments ?? []).map((s) => s.content),
      ...(dsd?.snippets ?? []).map((s) => s.snippet),
    ].filter((x): x is string => typeof x === 'string' && x.trim().length > 0);

    const seen = new Set<string>();
    const uniquePieces = pieces.filter((p) => {
      const key = p.trim().slice(0, 80);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const snippet = uniquePieces.length > 0 ? uniquePieces.join('\n\n[...]\n\n') : null;

    return {
      id: r.document?.id ?? `result_${idx}`,
      title: dsd?.title ?? null,
      snippet,
      link: dsd?.link ?? null,
      // Score real do Vertex não vem por padrão; aproximamos com posição inversa.
      relevance: 1 - idx / Math.max(items.length, 1),
    };
  });

  log.info({ query, returned: mapped.length, total: data.totalSize }, 'similares encontrados');
  return mapped;
}

/** Hash determinístico da query pra usar como chave de cache. */
export function hashQuery(query: string): string {
  // Hash leve não-criptográfico — basta evitar colisão entre queries diferentes.
  let h = 5381;
  const s = query.trim().toLowerCase();
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(16);
}
