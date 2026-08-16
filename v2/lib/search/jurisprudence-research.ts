import type { Resumo } from '@/schemas/resumo';
import type { SimilarResult } from '@/lib/types/database';
import {
  searchTceJurisprudenciaDetailed,
  type OfficialSearchReport,
} from '@/lib/tce/jurisprudencia';
import { searchSimilarProcesses } from '@/lib/vertex/search';

export type JurisprudenceResearchQuery = {
  label: string;
  query: string;
  maxOfficialPages?: number;
};

export type JurisprudenceQueryReport = {
  label: string;
  query: string;
  officialTotalMatches: number | null;
  officialCandidatesRead: number;
  officialEffectiveQuery: string;
  officialAttemptedQueries: string[];
  officialPagesFetched: number[];
  officialTruncated: boolean;
  oldestJudgment: string | null;
  newestJudgment: string | null;
  cabinetCandidatesRead: number;
};

export type JurisprudenceResearchReport = {
  searchedAt: string;
  officialDatabaseQueried: true;
  queries: JurisprudenceQueryReport[];
  officialCandidatesRead: number;
  cabinetCandidatesRead: number;
  selectedResults: number;
  officialSearchWasExhaustive: boolean;
  selectedSources: JurisprudenceSelectedSource[];
};

export type JurisprudenceSelectedSource = {
  id: string;
  title: string | null;
  link: string | null;
  source: 'tcepe_oficial' | 'vertex_gabinete';
  processo: string | null;
  acordao: string | null;
  relator: string | null;
  julgamento: string | null;
  researchQueries: string[];
};

export type JurisprudenceResearch = {
  results: SimilarResult[];
  report: JurisprudenceResearchReport;
};

export class OfficialJurisprudenceUnavailableError extends Error {
  constructor(public readonly queryLabel: string, cause?: unknown) {
    super(`jurisprudencia_oficial_indisponivel:${queryLabel}`, { cause });
    this.name = 'OfficialJurisprudenceUnavailableError';
  }
}

type ResearchOptions = {
  queries: JurisprudenceResearchQuery[];
  resultsLimit?: number;
  requireOfficial?: boolean;
  officialPageSize?: number;
  cabinetPageSize?: number;
  cabinetTopN?: number;
  concurrency?: number;
};

type Candidate = {
  row: SimilarResult;
  bestScore: number;
  scores: Map<string, number>;
  labels: Set<string>;
};

export function buildMinutaJurisprudenceQueries(resumo: Resumo): JurisprudenceResearchQuery[] {
  const byFinding = resumo.achados.map((achado) => ({
    label: `Achado ${achado.numero}`,
    query: compactQuery([
      achado.titulo,
      ...achado.fundamentacao_legal.slice(0, 3),
      achado.descricao.slice(0, 220),
    ]),
    maxOfficialPages: 1,
  }));
  const general = compactQuery([
    resumo.processo.descricao_objeto ?? '',
    ...resumo.achados.map((achado) => achado.titulo),
  ]);
  const queries = general
    ? [...byFinding, { label: 'Visão geral do processo', query: general, maxOfficialPages: 2 }]
    : byFinding;
  return deduplicateQueries(queries);
}

export async function researchJurisprudence(
  options: ResearchOptions,
): Promise<JurisprudenceResearch> {
  const queries = deduplicateQueries(options.queries);
  if (queries.length === 0) throw new Error('consulta_jurisprudencial_ausente');
  const requireOfficial = options.requireOfficial ?? true;
  const officialPageSize = Math.min(Math.max(options.officialPageSize ?? 20, 1), 50);
  const cabinetPageSize = Math.min(Math.max(options.cabinetPageSize ?? 20, 1), 100);
  const cabinetTopN = Math.min(Math.max(options.cabinetTopN ?? 8, 1), cabinetPageSize);

  const rows = await mapWithConcurrency(
    queries,
    Math.min(Math.max(options.concurrency ?? 3, 1), 5),
    async (item) => {
      const [official, cabinet] = await Promise.allSettled([
        searchTceJurisprudenciaDetailed(item.query, {
          pageSize: officialPageSize,
          maxPages: item.maxOfficialPages ?? 1,
        }),
        searchSimilarProcesses({
          query: item.query,
          pageSize: cabinetPageSize,
          topN: cabinetTopN,
        }),
      ]);
      if (official.status === 'rejected' && requireOfficial) {
        throw new OfficialJurisprudenceUnavailableError(item.label, official.reason);
      }
      return {
        item,
        official: official.status === 'fulfilled' ? official.value : emptyOfficialReport(item.query),
        cabinet: cabinet.status === 'fulfilled'
          ? cabinet.value.map((row) => ({ ...row, source: 'vertex_gabinete' as const }))
          : [],
      };
    },
  );

  const candidates = new Map<string, Candidate>();
  for (const entry of rows) {
    for (const row of [...entry.official.results, ...entry.cabinet]) {
      const key = candidateKey(row);
      const score = relevanceScore(row, entry.item.query);
      const current = candidates.get(key);
      if (current) {
        current.bestScore = Math.max(current.bestScore, score);
        current.scores.set(entry.item.label, score);
        current.labels.add(entry.item.label);
      } else {
        candidates.set(key, {
          row,
          bestScore: score,
          scores: new Map([[entry.item.label, score]]),
          labels: new Set([entry.item.label]),
        });
      }
    }
  }

  const limit = Math.min(Math.max(options.resultsLimit ?? 20, queries.length), 30);
  const selected = selectWithQueryCoverage(candidates, queries, limit).map((candidate) => ({
    ...candidate.row,
    research_queries: [...candidate.labels],
  }));
  const queryReports = rows.map(({ item, official, cabinet }) => ({
    label: item.label,
    query: item.query,
    officialTotalMatches: official.totalMatches,
    officialCandidatesRead: official.results.length,
    officialEffectiveQuery: official.effectiveQuery,
    officialAttemptedQueries: official.attemptedQueries,
    officialPagesFetched: official.pagesFetched,
    officialTruncated: official.truncated,
    oldestJudgment: official.oldestJudgment,
    newestJudgment: official.newestJudgment,
    cabinetCandidatesRead: cabinet.length,
  }));

  return {
    results: selected,
    report: {
      searchedAt: new Date().toISOString(),
      officialDatabaseQueried: true,
      queries: queryReports,
      officialCandidatesRead: queryReports.reduce((sum, item) => sum + item.officialCandidatesRead, 0),
      cabinetCandidatesRead: queryReports.reduce((sum, item) => sum + item.cabinetCandidatesRead, 0),
      selectedResults: selected.length,
      officialSearchWasExhaustive: queryReports.every((item) => !item.officialTruncated),
      selectedSources: selected.map((item) => ({
        id: item.id,
        title: item.title,
        link: item.link,
        source: item.source ?? 'vertex_gabinete',
        processo: item.processo ?? null,
        acordao: item.acordao ?? null,
        relator: item.relator ?? null,
        julgamento: item.julgamento ?? null,
        researchQueries: item.research_queries ?? [],
      })),
    },
  };
}

export function formatJurisprudenceResearch(report: JurisprudenceResearchReport) {
  const scope = report.officialSearchWasExhaustive
    ? 'Todas as correspondências das consultas foram examinadas.'
    : 'As consultas percorreram o índice oficial, mas o volume de correspondências exigiu amostragem paginada; não use a expressão “entendimento consolidado” sem apoio consistente nos julgados selecionados.';
  const queries = report.queries.map((item) => {
    const total = item.officialTotalMatches === null ? 'total não informado' : `${item.officialTotalMatches} correspondência(s)`;
    return `- ${item.label}: ${total}; consulta efetiva "${item.officialEffectiveQuery}"; ${item.officialCandidatesRead} resultado(s) oficial(is) lido(s); páginas ${item.officialPagesFetched.join(', ')}; período consultado ${item.oldestJudgment ?? 'n/d'} a ${item.newestJudgment ?? 'n/d'}.`;
  }).join('\n');
  return `Pesquisa obrigatória realizada em ${report.searchedAt}.
Base oficial do TCE-PE consultada: sim.
Resultados oficiais lidos: ${report.officialCandidatesRead}.
Resultados do acervo do gabinete lidos: ${report.cabinetCandidatesRead}.
Precedentes selecionados para o contexto: ${report.selectedResults}.
${scope}

Consultas executadas:
${queries}`;
}

export function hasCompletedJurisprudenceResearch(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const report = value as Partial<JurisprudenceResearchReport>;
  return report.officialDatabaseQueried === true
    && typeof report.searchedAt === 'string'
    && Array.isArray(report.queries)
    && report.queries.length > 0
    && typeof report.officialCandidatesRead === 'number'
    && typeof report.selectedResults === 'number';
}

function emptyOfficialReport(query: string): OfficialSearchReport {
  return {
    query,
    effectiveQuery: query,
    attemptedQueries: [],
    results: [],
    totalMatches: null,
    pagesFetched: [],
    truncated: true,
    oldestJudgment: null,
    newestJudgment: null,
  };
}

function compactQuery(parts: string[]) {
  return parts.map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' | ')
    .slice(0, 500);
}

function deduplicateQueries(queries: JurisprudenceResearchQuery[]) {
  const seen = new Set<string>();
  return queries.filter((item) => {
    const key = normalize(item.query);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function candidateKey(row: SimilarResult) {
  return `${row.processo ?? ''}|${row.acordao ?? ''}|${row.link ?? row.title ?? row.id}`.toLowerCase();
}

function relevanceScore(row: SimilarResult, query: string) {
  const wanted = terms(query);
  const available = new Set(terms([
    row.title,
    row.snippet,
    row.processo,
    row.acordao,
    row.relator,
  ].filter((value): value is string => !!value).join(' ')));
  const overlap = wanted.filter((term) => available.has(term)).length;
  const lexical = overlap / Math.max(Math.min(wanted.length, 12), 1);
  return lexical
    + (row.source === 'tcepe_oficial' ? 0.3 : 0)
    + (row.link ? 0.12 : 0)
    + (row.processo || row.acordao ? 0.08 : 0)
    + (row.snippet ? 0.04 : 0);
}

function selectWithQueryCoverage(
  candidates: Map<string, Candidate>,
  queries: JurisprudenceResearchQuery[],
  limit: number,
) {
  const selected: Candidate[] = [];
  const selectedKeys = new Set<string>();
  for (const query of queries) {
    const best = [...candidates.entries()]
      .filter(([key, candidate]) => !selectedKeys.has(key) && candidate.scores.has(query.label))
      .sort((left, right) => (
        (right[1].scores.get(query.label) ?? 0) - (left[1].scores.get(query.label) ?? 0)
      ))[0];
    if (!best) continue;
    selectedKeys.add(best[0]);
    selected.push(best[1]);
    if (selected.length >= limit) return selected;
  }
  const remaining = [...candidates.entries()]
    .filter(([key]) => !selectedKeys.has(key))
    .sort((left, right) => right[1].bestScore - left[1].bestScore);
  for (const [key, candidate] of remaining) {
    selectedKeys.add(key);
    selected.push(candidate);
    if (selected.length >= limit) break;
  }
  return selected;
}

function terms(value: string) {
  const stopWords = new Set([
    'para', 'como', 'com', 'sem', 'uma', 'que', 'dos', 'das', 'por', 'pela',
    'pelo', 'este', 'esta', 'sobre', 'entre', 'processo', 'achado', 'artigo',
  ]);
  return normalize(value).split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3 && !stopWords.has(term));
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      output[index] = await mapper(values[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return output;
}
