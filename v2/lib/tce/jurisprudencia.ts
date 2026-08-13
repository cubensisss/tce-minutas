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

export async function searchTceJurisprudencia(
  query: string,
  topN: number,
): Promise<SimilarResult[]> {
  const params = new URLSearchParams({
    page: '0',
    size: String(Math.min(Math.max(topN, 1), 10)),
    sort: 'dataJulgamentoProcesso,desc',
    'todasBaseDescricao.equals': normalizeQuery(query),
    'todasBaseExprExata.equals': 'false',
  });

  const started = performance.now();
  const response = await fetch(`${BASE_URL}?${params}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`TCE-PE Jurisprudencia ${response.status}`);

  const rows = (await response.json()) as TceDeliberacao[];
  log.info({ query, results: rows.length, ms: Math.round(performance.now() - started) }, 'busca oficial concluida');

  return rows.map((row, index) => {
    const processo = row.numeroProcessoProcesso ?? null;
    const acordao = row.numeroDeliberacaoProcesso
      ? `${row.numeroDeliberacaoProcesso}/${row.anoDeliberacaoProcesso ?? ''}`.replace(/\/$/, '')
      : null;
    const tipo = row.descricaoTipoProcessoProcesso ?? 'Deliberacao';
    return {
      id: `tcepe:${processo ?? acordao ?? index}`,
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
