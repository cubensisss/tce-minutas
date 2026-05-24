'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import StepIndicator from '@/components/StepIndicator';
import type { SimilarResult } from '@/lib/types/database';

type Props = { params: Promise<{ id: string }> };

/** Extras locais por similar — não vão pro backend, só pra UX desta página. */
type SimilarExtras = {
  relacao?: string | null;
  relacaoLoading?: boolean;
  relacaoError?: string | null;
  resumo?: string | null;
  resumoLoading?: boolean;
  resumoError?: string | null;
  paginas?: number | null;
};

export default function SimilaresProcessoPage({ params }: Props) {
  const { id } = use(params);
  const [results, setResults] = useState<SimilarResult[] | null>(null);
  const [extras, setExtras] = useState<Record<string, SimilarExtras>>({});
  const [cached, setCached] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetchResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function fetchResults(customQuery?: string) {
    setLoading(true);
    setError(null);
    setExtras({});
    const url = new URL('/api/similares', window.location.origin);
    url.searchParams.set('processo_id', id);
    if (customQuery) url.searchParams.set('q', customQuery);
    url.searchParams.set('top', '3');
    try {
      const res = await fetch(url);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'falha');
      setResults(j.results);
      setCached(j.cached);

      // Para cada resultado, dispara em paralelo o cálculo da relação
      (j.results as SimilarResult[]).forEach((r) => fetchRelacao(r));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'erro');
    } finally {
      setLoading(false);
    }
  }

  function patchExtras(simId: string, patch: Partial<SimilarExtras>) {
    setExtras((prev) => ({ ...prev, [simId]: { ...prev[simId], ...patch } }));
  }

  async function fetchRelacao(r: SimilarResult) {
    patchExtras(r.id, { relacaoLoading: true, relacaoError: null });
    try {
      const res = await fetch('/api/similares/relacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          processo_id: id,
          similar: { title: r.title, snippet: r.snippet },
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'falha ao gerar relação');
      patchExtras(r.id, { relacao: j.relacao, relacaoLoading: false });
    } catch (err) {
      patchExtras(r.id, {
        relacaoError: err instanceof Error ? err.message : 'erro',
        relacaoLoading: false,
      });
    }
  }

  async function fetchResumo(r: SimilarResult) {
    if (!r.link || !r.link.startsWith('gs://')) {
      patchExtras(r.id, { resumoError: 'documento sem link gs:// disponível' });
      return;
    }
    patchExtras(r.id, { resumoLoading: true, resumoError: null });
    try {
      const res = await fetch('/api/similares/resumir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gs_url: r.link, title: r.title }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? j.error ?? 'falha ao gerar resumo');
      patchExtras(r.id, {
        resumo: j.resumo,
        paginas: j.paginas,
        resumoLoading: false,
      });
    } catch (err) {
      patchExtras(r.id, {
        resumoError: err instanceof Error ? err.message : 'erro',
        resumoLoading: false,
      });
    }
  }

  return (
    <div className="space-y-6">
      <StepIndicator currentStep={4} />

      <header>
        <h1 className="text-3xl font-display font-semibold text-primary">
          Processos similares
        </h1>
        <p className="text-on-surface-variant mt-1">
          Top 3 resultados da base TCE-Andressa por relevância.
          {cached && <span className="ml-2 text-xs px-2 py-0.5 bg-surface-variant rounded-full">cache</span>}
        </p>
      </header>

      <div className="card flex gap-2 items-end">
        <div className="flex-1">
          <label className="label">Refinar busca (opcional)</label>
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchResults(query)}
            placeholder="Termos adicionais — ex: contratação direta, art. 75 Lei 14.133"
          />
        </div>
        <button onClick={() => fetchResults(query || undefined)} className="btn-primary">
          <span className="material-symbols-outlined text-base">search</span>
          Buscar
        </button>
      </div>

      {loading && (
        <div className="card flex items-center gap-3">
          <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
          <p className="text-on-surface-variant">Buscando precedentes...</p>
        </div>
      )}

      {error && (
        <div className="card border-error/30 bg-error-container/30">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && results && results.length === 0 && (
        <div className="card text-on-surface-variant">
          Nenhum precedente encontrado para os termos atuais.
        </div>
      )}

      {!loading && results && results.length > 0 && (
        <div className="space-y-3">
          {results.map((r, i) => {
            const ex = extras[r.id] ?? {};
            return (
              <article key={r.id} className="card space-y-3">
                <header className="flex items-start justify-between gap-4">
                  <h3 className="font-display text-lg">
                    <span className="text-primary">#{i + 1}</span>{' '}
                    {r.title ?? '(sem título)'}
                  </h3>
                  {r.relevance != null && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary-container text-on-primary-container">
                      relevância {(r.relevance * 100).toFixed(0)}%
                    </span>
                  )}
                </header>

                {r.snippet && (
                  <p
                    className="text-sm whitespace-pre-line"
                    dangerouslySetInnerHTML={{ __html: r.snippet }}
                  />
                )}

                {/* Bloco: Relação com o processo em análise */}
                <div className="rounded-md border border-secondary/30 bg-secondary-container/30 p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary text-base">hub</span>
                    <span className="text-xs font-medium uppercase tracking-wider text-on-secondary-container">
                      Relação com o processo em análise
                    </span>
                  </div>
                  {ex.relacaoLoading ? (
                    <p className="text-xs italic text-on-surface-variant">Analisando relação...</p>
                  ) : ex.relacao ? (
                    <p className="text-sm">{ex.relacao}</p>
                  ) : ex.relacaoError ? (
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-error">{ex.relacaoError}</p>
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        onClick={() => fetchRelacao(r)}
                      >
                        Tentar novamente
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs italic text-on-surface-variant">Aguardando análise...</p>
                  )}
                </div>

                {/* Bloco: Resumo do ITD (sob demanda) */}
                <div className="rounded-md border border-outline-variant p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-base">summarize</span>
                      <span className="text-xs font-medium uppercase tracking-wider text-on-surface-variant">
                        Resumo do ITD
                      </span>
                      {ex.paginas != null && (
                        <span className="text-[11px] text-on-surface-variant">({ex.paginas} pág.)</span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn-ghost text-xs"
                      onClick={() => fetchResumo(r)}
                      disabled={ex.resumoLoading || !r.link?.startsWith('gs://')}
                    >
                      {ex.resumoLoading ? (
                        <>
                          <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                          Gerando...
                        </>
                      ) : ex.resumo ? (
                        <>
                          <span className="material-symbols-outlined text-base">refresh</span>
                          Refazer resumo
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-base">auto_awesome</span>
                          Gerar resumo
                        </>
                      )}
                    </button>
                  </div>
                  {ex.resumoLoading && !ex.resumo ? (
                    <p className="text-xs italic text-on-surface-variant">
                      Baixando PDF, extraindo texto e resumindo... pode levar até 1 minuto.
                    </p>
                  ) : ex.resumo ? (
                    <div className="text-sm whitespace-pre-line leading-relaxed">{ex.resumo}</div>
                  ) : ex.resumoError ? (
                    <p className="text-xs text-error">{ex.resumoError}</p>
                  ) : (
                    <p className="text-xs italic text-on-surface-variant">
                      Clique em &quot;Gerar resumo&quot; para baixar o PDF e produzir um resumo estruturado.
                    </p>
                  )}
                </div>

                {r.link && (
                  <a
                    href={r.link.startsWith('gs://')
                      ? `/api/similares/abrir?gs=${encodeURIComponent(r.link)}`
                      : r.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <span className="material-symbols-outlined text-base">open_in_new</span>
                    Abrir documento
                  </a>
                )}
              </article>
            );
          })}
        </div>
      )}

      <div className="pt-4">
        <Link href={`/processo/${id}/minuta`} className="btn-ghost">
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Voltar à minuta
        </Link>
      </div>
    </div>
  );
}
