import type { SimilarResult } from '@/lib/types/database';
import { loggerFor } from '@/lib/logger';

const log = loggerFor('tce/jurisprudencia');
const BASE_URL =
  'https://portal.tcepe.tc.br/jurisprudencia/services/jurisprudencia/api/publico/deliberacoes';

type TceDeliberacao = {
  numeroProcessoProcesso?: string;
  numeroDeliberacaoProcesso?: string | number;
  anoDeliberacaoProcesso?: string | number;
  dataJulgamentoProcesso?: string;
  descricaoTipoProcessoProcesso?: string;
  descricaoParecerProcesso?: string | null;
  descricaoItdProcesso?: string | null;
  detalheProcessoNomeUnidadeJurisdicionada?: string | null;
  detalheProcessoNomeServidor?: string | null;
  linkDocumentoDeliberacao?: string | null;
  linkDocumentoITD?: string | null;
};

export type OfficialSearchOptions = {
  pageSize?: number;
  maxPages?: number;
  timeoutMs?: number;
};

export type OfficialSearchReport = {
  query: string;
  results: SimilarResult[];
  totalMatches: number | null;
  pagesFetched: number[];
  truncated: boolean;
  newestJudgment: string | null;
  oldestJudgment: string | null;
};

export async function searchTceJurisprudencia(
  query: string,
  topN: number,
): Promise<SimilarResult[]> {
  const report = await searchTceJurisprudenciaDetailed(query, {
    pageSize: Math.min(Math.max(topN, 1), 50),
    maxPages: 1,
  });
  return report.results.slice(0, topN);
}

/**
 * Consulta a base oficial e, quando há muitas correspondências, distribui as
 * páginas consultadas entre o julgamento mais recente e o mais antigo. Assim
 * a pesquisa não se limita silenciosamente aos primeiros resultados.
 */
export async function searchTceJurisprudenciaDetailed(
  query: string,
  options: OfficialSearchOptions = {},
): Promise<OfficialSearchReport> {
  const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), 50);
  const maxPages = Math.min(Math.max(options.maxPages ?? 2, 1), 10);
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 45_000, 5_000), 60_000);
  const first = await fetchPage(query, 0, pageSize, timeoutMs);
  const totalMatches = parseTotal(first.totalHeader);
  const totalPages = totalMatches === null
    ? (first.rows.length === pageSize ? maxPages : 1)
    : Math.max(1, Math.ceil(totalMatches / pageSize));
  const pageIndexes = distributedPageIndexes(totalPages, maxPages);
  const remainingPages = await Promise.all(
    pageIndexes.slice(1).map((page) => fetchPage(query, page, pageSize, timeoutMs)),
  );
  const pages = [first, ...remainingPages];
  const mapped = pages.flatMap((page) => page.rows.map(mapRow));
  const results = deduplicate(mapped);
  const dates = results
    .map((row) => row.julgamento)
    .filter((value): value is string => !!value)
    .sort();

  log.info({
    query,
    returned: results.length,
    totalMatches,
    pages: pageIndexes,
  }, 'busca oficial aprofundada concluida');

  return {
    query,
    results,
    totalMatches,
    pagesFetched: pageIndexes,
    truncated: totalMatches === null
      ? first.rows.length === pageSize
      : results.length < totalMatches,
    newestJudgment: dates.at(-1) ?? null,
    oldestJudgment: dates[0] ?? null,
  };
}

async function fetchPage(
  query: string,
  page: number,
  pageSize: number,
  timeoutMs: number,
) {
  const params = new URLSearchParams({
    page: String(page),
    size: String(pageSize),
    sort: 'dataJulgamentoProcesso,desc',
    'todasBaseDescricao.equals': normalizeQuery(query),
    'todasBaseExprExata.equals': 'false',
  });

  const started = performance.now();
  const response = await fetch(`${BASE_URL}?${params}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`TCE-PE Jurisprudencia ${response.status}`);

  const rows = (await response.json()) as TceDeliberacao[];
  log.info({ query, page, results: rows.length, ms: Math.round(performance.now() - started) }, 'pagina oficial concluida');

  return {
    rows: Array.isArray(rows) ? rows : [],
    totalHeader: response.headers.get('x-total-count'),
  };
}

function mapRow(row: TceDeliberacao, index: number): SimilarResult {
    const processo = row.numeroProcessoProcesso ?? null;
    const acordao = row.numeroDeliberacaoProcesso
      ? `${row.numeroDeliberacaoProcesso}/${row.anoDeliberacaoProcesso ?? ''}`.replace(/\/$/, '')
      : null;
    const tipo = row.descricaoTipoProcessoProcesso ?? 'Deliberacao';
    return {
      id: `tcepe:${processo ?? 'sem-processo'}:${acordao ?? index}`,
      title: [tipo, processo ? `Processo ${processo}` : null, acordao ? `Acordao ${acordao}` : null]
        .filter(Boolean)
        .join(' - '),
      snippet: cleanHtml(row.descricaoItdProcesso || row.descricaoParecerProcesso || ''),
      link: row.linkDocumentoITD || row.linkDocumentoDeliberacao || null,
      relevance: null,
      source: 'tcepe_oficial',
      processo,
      acordao,
      relator: row.detalheProcessoNomeServidor ?? null,
      julgamento: row.dataJulgamentoProcesso ?? null,
    };
}

function parseTotal(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function distributedPageIndexes(totalPages: number, maxPages: number): number[] {
  if (totalPages <= maxPages) return Array.from({ length: totalPages }, (_, index) => index);
  if (maxPages === 1) return [0];
  const indexes = new Set<number>();
  for (let index = 0; index < maxPages; index++) {
    indexes.add(Math.round((index * (totalPages - 1)) / (maxPages - 1)));
  }
  return [...indexes].sort((left, right) => left - right);
}

function deduplicate(rows: SimilarResult[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.processo ?? ''}|${row.acordao ?? ''}|${row.link ?? row.id}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeQuery(query: string) {
  return query
    .replace(/\s*\|\s*/g, ' *OU ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function cleanHtml(value: string) {
  return value
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    .slice(0, 12_000);
}
