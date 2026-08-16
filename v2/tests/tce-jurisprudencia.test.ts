import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchTceJurisprudenciaDetailed } from '@/lib/tce/jurisprudencia';

afterEach(() => vi.unstubAllGlobals());

describe('pesquisa oficial de jurisprudência', () => {
  it('consulta páginas distribuídas e registra o total informado pelo TCE-PE', async () => {
    const pages: number[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const page = Number(url.searchParams.get('page'));
      const size = Number(url.searchParams.get('size'));
      pages.push(page);
      const rows = Array.from({ length: size }, (_, index) => ({
        numeroProcessoProcesso: `${page}-${index}`,
        numeroDeliberacaoProcesso: `${page}${index}`,
        anoDeliberacaoProcesso: 2026,
        dataJulgamentoProcesso: `2026-01-${String(index + 1).padStart(2, '0')}`,
        descricaoTipoProcessoProcesso: 'Auditoria',
        descricaoItdProcesso: `Trecho da página ${page}`,
        linkDocumentoITD: `https://portal.tcepe.tc.br/julgado/${page}/${index}`,
      }));
      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: { 'x-total-count': '100', 'content-type': 'application/json' },
      });
    }));

    const report = await searchTceJurisprudenciaDetailed('contratação pública', {
      pageSize: 10,
      maxPages: 3,
    });

    expect(pages).toEqual([0, 5, 9]);
    expect(report.totalMatches).toBe(100);
    expect(report.pagesFetched).toEqual([0, 5, 9]);
    expect(report.results).toHaveLength(30);
    expect(report.truncated).toBe(true);
  });
});
