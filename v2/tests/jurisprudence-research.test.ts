import { beforeEach, describe, expect, it, vi } from 'vitest';

const { officialSearch, cabinetSearch } = vi.hoisted(() => ({
  officialSearch: vi.fn(),
  cabinetSearch: vi.fn(),
}));

vi.mock('@/lib/tce/jurisprudencia', () => ({
  searchTceJurisprudenciaDetailed: officialSearch,
}));

vi.mock('@/lib/vertex/search', () => ({
  searchSimilarProcesses: cabinetSearch,
}));

import {
  hasCompletedJurisprudenceResearch,
  researchJurisprudence,
} from '@/lib/search/jurisprudence-research';

describe('pesquisa jurisprudencial obrigatória', () => {
  beforeEach(() => {
    officialSearch.mockReset();
    cabinetSearch.mockReset();
    cabinetSearch.mockResolvedValue([]);
  });

  it('preserva cobertura de cada consulta na seleção final', async () => {
    officialSearch.mockImplementation(async (query: string) => ({
      query,
      effectiveQuery: query,
      attemptedQueries: [query],
      results: [{
        id: `tce:${query}`,
        title: query,
        snippet: `Fundamentação sobre ${query}`,
        link: `https://portal.tcepe.tc.br/${encodeURIComponent(query)}`,
        relevance: null,
        source: 'tcepe_oficial',
        processo: query,
        acordao: null,
        relator: null,
        julgamento: '2026-01-01',
      }],
      totalMatches: 1,
      pagesFetched: [0],
      truncated: false,
      newestJudgment: '2026-01-01',
      oldestJudgment: '2026-01-01',
    }));

    const research = await researchJurisprudence({
      queries: [
        { label: 'Achado 1', query: 'licitação' },
        { label: 'Achado 2', query: 'débito' },
      ],
      resultsLimit: 2,
      concurrency: 1,
    });

    expect(research.results).toHaveLength(2);
    expect(research.results.flatMap((item) => item.research_queries ?? [])).toEqual(
      expect.arrayContaining(['Achado 1', 'Achado 2']),
    );
    expect(hasCompletedJurisprudenceResearch(research.report)).toBe(true);
    expect(research.report.officialSearchWasExhaustive).toBe(true);
    expect(research.report.selectedSources).toHaveLength(2);
    expect(research.report.selectedSources.every((item) => item.source === 'tcepe_oficial')).toBe(true);
  });

  it('interrompe a pesquisa quando a base oficial falha', async () => {
    officialSearch.mockRejectedValue(new Error('indisponível'));
    await expect(researchJurisprudence({
      queries: [{ label: 'Achado 1', query: 'licitação' }],
      requireOfficial: true,
    })).rejects.toThrow('jurisprudencia_oficial_indisponivel:Achado 1');
  });
});
