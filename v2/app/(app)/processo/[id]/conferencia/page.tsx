'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import StepIndicator from '@/components/StepIndicator';
import type { ConferenceGroup, ConferenceReport } from '@/lib/conference/checks';
import type { Resumo } from '@/schemas/resumo';
import type { Minuta } from '@/schemas/minuta';

type Props = { params: Promise<{ id: string }> };
type ConferenceData = {
  report: ConferenceReport;
  resumo: Resumo;
  minuta: Minuta;
  approved: boolean;
  approved_at: string | null;
};

const GROUPS: Array<{ id: ConferenceGroup; label: string; icon: string }> = [
  { id: 'fatos', label: 'Fatos', icon: 'fact_check' },
  { id: 'documentos', label: 'Documentos', icon: 'description' },
  { id: 'precedentes', label: 'Precedentes', icon: 'account_balance' },
  { id: 'diretrizes', label: 'Diretrizes', icon: 'rule' },
  { id: 'dispositivo', label: 'Dispositivo', icon: 'gavel' },
  { id: 'pendencias', label: 'Pendências', icon: 'warning' },
];

export default function ConferenciaPage({ params }: Props) {
  const { id } = use(params);
  const [data, setData] = useState<ConferenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/processo/${id}/conferencia`, { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? 'Não foi possível calcular a conferência.');
      setData(json);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erro ao carregar a conferência.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const confirmableEvidence = useMemo(() =>
    data?.resumo.evidencias.filter((item) => item.verification !== 'invalid').map((item) => item.id) ?? [],
  [data]);
  const confirmableMinuteRefs = useMemo(() =>
    data?.minuta.referencias.filter((item) => item.verification !== 'invalid').map((item) => item.id) ?? [],
  [data]);

  async function post(body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/processo/${id}/conferencia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await response.json();
      if (!response.ok) {
        if (json.report && data) setData({ ...data, report: json.report, approved: false, approved_at: null });
        throw new Error(json.error === 'conferencia_incompleta'
          ? 'Ainda existem bloqueadores que precisam ser resolvidos.'
          : json.error ?? 'Não foi possível salvar a conferência.');
      }
      if (body.action === 'confirm_references') {
        setData((current) => current ? {
          ...current,
          report: json.report,
          resumo: json.resumo,
          minuta: json.minuta,
          approved: false,
          approved_at: null,
        } : current);
      } else {
        setData((current) => current ? {
          ...current,
          report: json.report,
          approved: true,
          approved_at: new Date().toISOString(),
        } : current);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="space-y-6">
      <StepIndicator currentStep={6} />
      <div className="card">Calculando as verificações finais...</div>
    </div>
  );

  if (error && !data) return (
    <div className="space-y-6">
      <StepIndicator currentStep={6} />
      <div className="card notice-error">
        <h1 className="font-display text-2xl text-primary">Conferência indisponível</h1>
        <p className="mt-2 text-sm">{error}</p>
        <button className="btn-primary mt-4" onClick={() => void load()}>Tentar novamente</button>
      </div>
    </div>
  );

  if (!data) return null;

  const allReferencesConfirmed = data.resumo.evidencias.every((item) => item.confirmed_by_user) &&
    data.minuta.referencias.every((item) => item.confirmed_by_user);

  return (
    <div className="space-y-6">
      <StepIndicator currentStep={6} />

      <header className="page-header">
        <div>
          <p className="eyebrow">Etapa final</p>
          <h1 className="page-title">Conferência</h1>
          <p className="page-subtitle">Valide fontes e coerência antes de liberar o documento oficial.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/processo/${id}/revisao`} className="btn-ghost">Voltar à revisão</Link>
          {data.approved ? (
            <a className="btn-primary" href={`/api/minuta/docx?processo_id=${id}`}>
              <span className="material-symbols-outlined text-base">download</span>
              Baixar DOCX aprovado
            </a>
          ) : (
            <button
              className="btn-primary"
              disabled={!data.report.ready || saving}
              onClick={() => void post({ action: 'approve' })}
            >
              <span className="material-symbols-outlined text-base">verified</span>
              Aprovar minuta
            </button>
          )}
        </div>
      </header>

      <section className={`card ${data.approved ? 'notice-success' : data.report.ready ? 'notice-success' : 'notice-warning'}`}>
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-2xl">
            {data.approved ? 'verified' : data.report.ready ? 'task_alt' : 'lock'}
          </span>
          <div>
            <h2 className="font-semibold">
              {data.approved ? 'Minuta aprovada e DOCX liberado' : data.report.ready
                ? 'Todas as verificações foram concluídas'
                : `${data.report.blockers} bloqueador(es) impedem a aprovação`}
            </h2>
            <p className="text-sm mt-1">
              {data.approved && data.approved_at
                ? `Aprovação registrada em ${new Date(data.approved_at).toLocaleString('pt-BR')}.`
                : 'O documento só pode ser baixado após a aprovação humana desta versão.'}
            </p>
          </div>
        </div>
      </section>

      {error && <div className="card notice-error text-sm">{error}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem] gap-6 items-start">
        <div className="space-y-4">
          {GROUPS.map((group) => {
            const checks = data.report.checks.filter((item) => item.group === group.id);
            if (checks.length === 0) return null;
            return (
              <section className="card" key={group.id}>
                <h2 className="font-display text-xl text-primary flex items-center gap-2 mb-4">
                  <span className="material-symbols-outlined text-xl">{group.icon}</span>
                  {group.label}
                </h2>
                <div className="divide-y divide-outline-variant">
                  {checks.map((check) => (
                    <div className="py-3 first:pt-0 last:pb-0 flex gap-3" key={check.id}>
                      <span className={`material-symbols-outlined mt-0.5 ${check.ok ? 'text-success' : 'text-error'}`}>
                        {check.ok ? 'check_circle' : 'cancel'}
                      </span>
                      <div>
                        <h3 className="text-sm font-semibold">{check.label}</h3>
                        <p className="text-sm text-on-surface-variant mt-0.5">{check.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <aside className="card xl:sticky xl:top-6 space-y-4" aria-label="Painel de fontes">
          <div>
            <p className="eyebrow">Painel lateral</p>
            <h2 className="font-display text-xl text-primary">Fontes</h2>
            <p className="text-sm text-on-surface-variant mt-1">
              Confira o trecho e seu localizador antes de confirmar.
            </p>
          </div>

          <ReferenceList resumo={data.resumo} minuta={data.minuta} />

          <button
            className="btn-primary w-full"
            disabled={saving || allReferencesConfirmed ||
              confirmableEvidence.length === 0 || confirmableMinuteRefs.length === 0}
            onClick={() => void post({
              action: 'confirm_references',
              evidence_ids: confirmableEvidence,
              minute_reference_ids: confirmableMinuteRefs,
            })}
          >
            <span className="material-symbols-outlined text-base">fact_check</span>
            {allReferencesConfirmed ? 'Referências confirmadas' : 'Confirmar referências válidas'}
          </button>
          <p className="text-xs text-on-surface-variant">
            Referências inválidas não são confirmadas automaticamente e permanecem como bloqueadoras.
          </p>
        </aside>
      </div>
    </div>
  );
}

function ReferenceList({ resumo, minuta }: { resumo: Resumo; minuta: Minuta }) {
  return (
    <div className="space-y-3 max-h-[32rem] overflow-y-auto pr-1">
      {resumo.evidencias.map((item) => (
        <article className="source-card" key={item.id}>
          <div className="flex items-start justify-between gap-2">
            <strong className="text-xs break-all">{item.filename}</strong>
            <SourceState verified={item.verification !== 'invalid'} confirmed={item.confirmed_by_user} />
          </div>
          <p className="text-xs text-on-surface-variant mt-1">
            {item.locator_type === 'page' ? 'Página' : item.locator_type === 'paragraph' ? 'Parágrafo' : 'Documento'} {item.locator_start}
          </p>
          <blockquote className="text-xs mt-2 border-l-2 border-primary/30 pl-2">“{item.quote}”</blockquote>
        </article>
      ))}
      {minuta.referencias.map((item) => (
        <article className="source-card" key={item.id}>
          <div className="flex items-start justify-between gap-2">
            <strong className="text-xs">{item.source_type === 'precedent' ? 'Precedente' : 'Trecho da minuta'}</strong>
            <SourceState verified={item.verification !== 'invalid'} confirmed={item.confirmed_by_user} />
          </div>
          <p className="text-xs mt-2">{item.excerpt}</p>
          {item.precedent?.link && (
            <a className="text-xs text-primary underline break-all mt-2 block" href={item.precedent.link} target="_blank" rel="noreferrer">
              Abrir fonte oficial
            </a>
          )}
        </article>
      ))}
    </div>
  );
}

function SourceState({ verified, confirmed }: { verified: boolean; confirmed: boolean }) {
  return (
    <span className={`status-chip ${!verified ? 'status-error' : confirmed ? 'status-success' : 'status-warning'}`}>
      {!verified ? 'Inválida' : confirmed ? 'Confirmada' : 'Pendente'}
    </span>
  );
}
