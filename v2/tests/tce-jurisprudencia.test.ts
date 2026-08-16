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

  it('amplia automaticamente uma consulta tematica que retornou zero', async () => {
    const attempted: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const query = url.searchParams.get('todasBaseDescricao.equals') ?? '';
      attempted.push(query);
      const found = query === 'execucao fisica';
      return new Response(JSON.stringify(found ? [{
        numeroProcessoProcesso: '24100001-0',
        numeroDeliberacaoProcesso: '100',
        anoDeliberacaoProcesso: 2026,
        descricaoTipoProcessoProcesso: 'Auditoria Especial',
        descricaoItdProcesso: 'Medição incompatível com a execução física.',
      }] : []), {
        status: 200,
        headers: { 'x-total-count': found ? '1' : '0', 'content-type': 'application/json' },
      });
    }));

    const report = await searchTceJurisprudenciaDetailed(
      'Medições de serviços em quantidades incompatíveis com a execução física | Lei 14.133/2021',
      { pageSize: 10, maxPages: 2 },
    );

    expect(attempted).toEqual([
      'Medições de serviços em quantidades incompatíveis com a execução física',
      'execucao fisica',
    ]);
    expect(report.effectiveQuery).toBe('execucao fisica');
    expect(report.results).toHaveLength(1);
  });
});
