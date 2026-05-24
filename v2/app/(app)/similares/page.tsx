'use client';

import { useState } from 'react';
import type { SimilarResult } from '@/lib/types/database';

export default function SimilaresGlobalPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SimilarResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const url = new URL('/api/similares', window.location.origin);
      url.searchParams.set('q', query);
      url.searchParams.set('top', '5');
      const res = await fetch(url);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'falha');
      setResults(j.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'erro');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-display font-semibold text-primary">Similares</h1>
        <p className="text-on-surface-variant mt-1">
          Busca livre na base vetorial de jurisprudência (TCE Andressa).
        </p>
      </header>

      <div className="card flex gap-2 items-end">
        <div className="flex-1">
          <label className="label">Termos da busca</label>
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="ex: subsídio irregular folha de pagamento"
            autoFocus
          />
        </div>
        <button onClick={search} className="btn-primary" disabled={loading || !query.trim()}>
          <span className="material-symbols-outlined text-base">search</span>
          Buscar
        </button>
      </div>

      {loading && (
        <div className="card flex items-center gap-3">
          <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
          <p className="text-on-surface-variant">Buscando...</p>
        </div>
      )}

      {error && (
        <div className="card border-error/30 bg-error-container/30">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {!loading && results && results.length === 0 && (
        <div className="card text-on-surface-variant">Nenhum resultado encontrado.</div>
      )}

      {!loading && results && results.length > 0 && (
        <div className="space-y-3">
          {results.map((r, i) => (
            <article key={r.id} className="card space-y-2">
              <header className="flex items-start justify-between gap-4">
                <h3 className="font-display text-lg">
                  <span className="text-primary">#{i + 1}</span> {r.title ?? '(sem título)'}
                </h3>
                {r.relevance != null && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary-container text-on-primary-container">
                    {(r.relevance * 100).toFixed(0)}%
                  </span>
                )}
              </header>
              {r.snippet && <p className="text-sm whitespace-pre-line">{r.snippet}</p>}
              {r.link && (
                <a
                  href={r.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <span className="material-symbols-outlined text-base">open_in_new</span>
                  Abrir
                </a>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
