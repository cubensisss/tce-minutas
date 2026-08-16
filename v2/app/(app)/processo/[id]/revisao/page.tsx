'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import StepIndicator from '@/components/StepIndicator';
import { MinutaSchema, type Minuta } from '@/schemas/minuta';

type Props = { params: Promise<{ id: string }> };
type Versao = {
  id: string;
  origem: 'geracao' | 'ajuste' | 'restauracao' | 'edicao_manual';
  descricao: string | null;
  created_at: string;
};

type Secao = 'ementa' | 'relatorio' | 'analise_completa' | 'decisao_voto';
const SECOES: Array<{ key: Secao; label: string }> = [
  { key: 'ementa', label: 'Ementa' },
  { key: 'relatorio', label: 'Relatório' },
  { key: 'analise_completa', label: 'Análise (voto)' },
  { key: 'decisao_voto', label: 'Dispositivo' },
];

export default function RevisaoPage({ params }: Props) {
  const { id } = use(params);
  const [minuta, setMinuta] = useState<Minuta | null>(null);
  const [secao, setSecao] = useState<Secao>('analise_completa');
  const [instrucao, setInstrucao] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versoes, setVersoes] = useState<Versao[]>([]);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [manualDraft, setManualDraft] = useState<Minuta | null>(null);
  const [manualEditing, setManualEditing] = useState(false);
  const [manualPreview, setManualPreview] = useState(false);
  const [compareVersion, setCompareVersion] = useState<{ label: string; minuta: Minuta } | null>(null);

  async function loadVersoes() {
    const res = await fetch(`/api/processo/${id}/versoes`, { cache: 'no-store' });
    const json = await res.json();
    if (res.ok) setVersoes(json.versoes ?? []);
  }

  useEffect(() => {
    fetch(`/api/processo/${id}`)
      .then((r) => r.json())
      .then((j) => {
        const parsed = MinutaSchema.safeParse(j.processo?.minuta);
        if (parsed.success) { setMinuta(parsed.data); setManualDraft(parsed.data); }
        else setError('Sem minuta válida — gere a minuta primeiro.');
      });
    loadVersoes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleAjustar(e: React.FormEvent) {
    e.preventDefault();
    if (!instrucao.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/minuta/ajustar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processo_id: id, secao, instrucao }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'falha');
      setMinuta(j.minuta);
      setManualDraft(j.minuta);
      setInstrucao('');
      await loadVersoes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'erro');
    } finally {
      setSubmitting(false);
    }
  }

  async function restaurar(versaoId: string) {
    if (!confirm('Restaurar esta versao? A minuta atual tambem sera preservada no historico.')) return;
    setRestoring(versaoId);
    setError(null);
    try {
      const res = await fetch(`/api/processo/${id}/versoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versao_id: versaoId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'falha ao restaurar');
      setMinuta(json.minuta);
      setManualDraft(json.minuta);
      await loadVersoes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'erro');
    } finally {
      setRestoring(null);
    }
  }

  async function salvarEdicaoManual() {
    if (!manualDraft) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/processo/${id}/minuta`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minuta: manualDraft }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? 'falha ao salvar edição');
      setMinuta(json.minuta);
      setManualDraft(json.minuta);
      setManualEditing(false);
      setManualPreview(false);
      await loadVersoes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'erro');
    } finally {
      setSubmitting(false);
    }
  }

  async function comparar(v: Versao) {
    const response = await fetch(`/api/processo/${id}/versoes?versao_id=${v.id}`, { cache: 'no-store' });
    const json = await response.json();
    const parsed = MinutaSchema.safeParse(json.versao?.minuta);
    if (response.ok && parsed.success) {
      setCompareVersion({ label: new Date(v.created_at).toLocaleString('pt-BR'), minuta: parsed.data });
    }
  }

  if (!minuta) {
    return (
      <div className="space-y-6">
        <StepIndicator currentStep={5} />
        <div className="card text-on-surface-variant">
          {error ?? 'Carregando...'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StepIndicator currentStep={5} />

      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-display font-semibold text-primary">Revisão</h1>
          <p className="text-on-surface-variant mt-1">
            Peça ajustes em linguagem natural. Cada solicitação reescreve uma seção específica.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={() => { setManualDraft(minuta); setManualEditing(true); setManualPreview(false); }}>
            <span className="material-symbols-outlined text-base">edit</span>
            Editar diretamente
          </button>
          <Link href={`/processo/${id}/conferencia`} className="btn-primary">
            Conferência final
            <span className="material-symbols-outlined text-base">fact_check</span>
          </Link>
        </div>
      </header>

      {manualEditing && manualDraft && (
        <section className="card space-y-4 border-primary/30">
          <div>
            <h2 className="font-display text-xl text-primary">Edição manual</h2>
            <p className="text-sm text-on-surface-variant">A versão atual será preservada antes do salvamento.</p>
          </div>
          {SECOES.map((item) => (
            <label key={item.key} className="label">{item.label}
              <textarea
                className="input mt-2 font-sans"
                rows={item.key === 'analise_completa' ? 16 : 8}
                value={manualDraft[item.key]}
                onChange={(e) => setManualDraft({ ...manualDraft, [item.key]: e.target.value })}
              />
            </label>
          ))}
          {manualPreview && (
            <div className="compare-grid">
              <CompareText title="Antes" minuta={minuta} />
              <CompareText title="Depois" minuta={manualDraft} />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => { setManualDraft(minuta); setManualEditing(false); }}>Cancelar</button>
            {!manualPreview ? (
              <button type="button" className="btn-primary" onClick={() => setManualPreview(true)}>Revisar alterações</button>
            ) : (
              <button type="button" className="btn-primary" onClick={salvarEdicaoManual} disabled={submitting}>{submitting ? 'Salvando...' : 'Salvar edição'}</button>
            )}
          </div>
        </section>
      )}

      <form onSubmit={handleAjustar} className="card space-y-3">
        <div>
          <label className="label">Seção a ajustar</label>
          <select
            className="input"
            value={secao}
            onChange={(e) => setSecao(e.target.value as Secao)}
            disabled={submitting}
          >
            {SECOES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Instrução</label>
          <textarea
            rows={3}
            className="input"
            value={instrucao}
            onChange={(e) => setInstrucao(e.target.value)}
            placeholder="Ex: 'Enfatizar a boa-fé do gestor no segundo parágrafo' ou 'Incluir referência ao art. 22 da LINDB'"
            disabled={submitting}
          />
        </div>
        {error && (
          <div className="p-3 rounded-lg bg-error-container text-on-surface text-sm">{error}</div>
        )}
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={submitting || !instrucao.trim()}>
            {submitting ? 'Reescrevendo...' : 'Aplicar ajuste'}
          </button>
        </div>
      </form>

      <section className="card space-y-3">
        <div>
          <h2 className="font-display text-xl text-primary">Historico de versoes</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            Versoes anteriores sao guardadas antes de cada ajuste ou nova geracao.
          </p>
        </div>
        {versoes.length === 0 ? (
          <p className="text-sm text-on-surface-variant">Ainda nao ha versoes anteriores.</p>
        ) : (
          <div className="divide-y divide-outline-variant">
            {versoes.map((v) => (
              <div key={v.id} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">
                    {new Date(v.created_at).toLocaleString('pt-BR')} - {v.origem}
                  </p>
                  {v.descricao && <p className="text-xs text-on-surface-variant mt-1">{v.descricao}</p>}
                </div>
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() => comparar(v)}
                >
                  Comparar
                </button>
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  disabled={restoring === v.id}
                  onClick={() => restaurar(v.id)}
                >
                  {restoring === v.id ? 'Restaurando...' : 'Restaurar'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {compareVersion && (
        <section className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl text-primary">Comparação com {compareVersion.label}</h2>
            <button type="button" className="btn-ghost" onClick={() => setCompareVersion(null)}>Fechar</button>
          </div>
          <div className="compare-grid">
            <CompareText title="Versão anterior" minuta={compareVersion.minuta} />
            <CompareText title="Versão atual" minuta={minuta} />
          </div>
        </section>
      )}

      {SECOES.map((s) => (
        <section key={s.key} className="card">
          <h2 className="font-display text-xl text-primary mb-3">{s.label}</h2>
          <div className="prose prose-sm max-w-none whitespace-pre-line text-on-surface">
            {minuta[s.key]}
          </div>
        </section>
      ))}

      <div className="pt-4">
        <Link href={`/processo/${id}/minuta`} className="btn-ghost">
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Voltar à minuta
        </Link>
      </div>
    </div>
  );
}

function CompareText({ title, minuta }: { title: string; minuta: Minuta }) {
  return (
    <div>
      <h3 className="compare-title">{title}</h3>
      {SECOES.map((section) => (
        <div key={section.key} className="mb-4">
          <strong className="text-xs uppercase tracking-wide text-primary">{section.label}</strong>
          <pre>{minuta[section.key]}</pre>
        </div>
      ))}
    </div>
  );
}
