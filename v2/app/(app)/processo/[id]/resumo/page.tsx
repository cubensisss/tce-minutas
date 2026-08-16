'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import StepIndicator from '@/components/StepIndicator';
import { ResumoSchema, type Resumo } from '@/schemas/resumo';
import JobProgress from '@/components/JobProgress';

type Props = { params: Promise<{ id: string }> };

export default function ResumoPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Resumo | null>(null);
  const [editing, setEditing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);

  // Auto-trigger se não existir resumo ainda
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/processo/${id}`).catch(() => null);
        const json = res?.ok ? await res.json() : null;
        const existing = ResumoSchema.safeParse(json?.processo?.resumo_data);
        if (existing.success) {
          if (!cancelled) {
            setResumo(existing.data);
            setDraft(existing.data);
            setConfirmedAt(json.processo?.resumo_confirmado_at ?? null);
            setLoading(false);
          }
          return;
        }
        // Não tem resumo — gera agora
        const jobRes = await fetch('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ processo_id: id, kind: 'resumo' }),
        });
        const jobJson = await jobRes.json();
        const currentJobId: string | null = jobRes.ok ? jobJson.id : null;
        if (!cancelled) setJobId(currentJobId);
        const gen = await fetch('/api/resumo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ processo_id: id, job_id: currentJobId }),
        });
        const genJson = await gen.json();
        if (!gen.ok) throw new Error(genJson.error ?? 'falha ao gerar resumo');
        if (!cancelled) {
          setResumo(genJson.resumo);
          setDraft(genJson.resumo);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'erro');
          setLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  async function saveResumo(confirm: boolean) {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/processo/${id}/resumo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumo: draft, confirm }),
      });
      const json = await response.json();
      if (!response.ok) {
        const detail = json.details ? ` ${JSON.stringify(json.details)}` : '';
        throw new Error(`${json.error ?? 'falha ao salvar'}${detail}`);
      }
      setResumo(json.resumo);
      setDraft(json.resumo);
      setConfirmedAt(confirm ? new Date().toISOString() : null);
      setEditing(false);
      setPreviewing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  function updateAchado(index: number, patch: Partial<Resumo['achados'][number]>) {
    setDraft((current) => current && ({
      ...current,
      achados: current.achados.map((achado, itemIndex) =>
        itemIndex === index ? { ...achado, ...patch } : achado),
    }));
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <StepIndicator currentStep={2} />
        <div className="card">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
            <p className="text-on-surface-variant">
              Lendo documentos e gerando resumo de triagem...
            </p>
          </div>
          <p className="text-xs text-on-surface-variant mt-3">
            Isso pode levar até 90 segundos para processos grandes.
          </p>
          <JobProgress jobId={jobId} />
        </div>
      </div>
    );
  }

  if (error && !resumo) {
    return (
      <div className="space-y-6">
        <StepIndicator currentStep={2} />
        <div className="card border-error/30 bg-error-container/30">
          <h2 className="text-lg font-medium mb-2">Erro ao gerar resumo</h2>
          <p className="text-sm text-on-surface-variant mb-4">{error}</p>
          <button onClick={() => location.reload()} className="btn-primary">
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!resumo) return null;

  return (
    <div className="space-y-6">
      <StepIndicator currentStep={2} />

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-display font-semibold text-primary">Resumo de triagem</h1>
          <p className="text-on-surface-variant mt-1">
            Processo {resumo.processo.numero} — {resumo.processo.unidade_jurisdicionada}
          </p>
        </div>
        <div className="flex gap-2">
          {confirmedAt && <span className="status-chip status-success">Resumo confirmado</span>}
          <button type="button" className="btn-ghost" onClick={() => { setEditing(true); setPreviewing(false); }}>
            <span className="material-symbols-outlined text-base">edit</span>
            Editar resumo
          </button>
        </div>
      </header>

      {error && (
        <div className="card notice-error" role="alert">
          <h2 className="font-semibold">Pendência ao confirmar o resumo</h2>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      {editing && draft && (
        <ResumoEditor
          draft={draft}
          original={resumo}
          previewing={previewing}
          saving={saving}
          onDraft={setDraft}
          onAchado={updateAchado}
          onPreview={() => setPreviewing(true)}
          onCancel={() => { setDraft(resumo); setEditing(false); setPreviewing(false); }}
          onSave={() => saveResumo(true)}
        />
      )}

      {jobId && (
        <section className="card">
          <h2 className="text-sm font-medium">Desempenho da triagem</h2>
          <JobProgress jobId={jobId} />
        </section>
      )}

      <section className="card space-y-4">
        <h2 className="font-display text-xl text-primary">Identificação</h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div><dt className="text-on-surface-variant">Número</dt><dd className="font-medium">{resumo.processo.numero}</dd></div>
          <div><dt className="text-on-surface-variant">Exercício</dt><dd className="font-medium">{resumo.processo.exercicio ?? '—'}</dd></div>
          <div className="md:col-span-2"><dt className="text-on-surface-variant">Unidade jurisdicionada</dt><dd className="font-medium">{resumo.processo.unidade_jurisdicionada}</dd></div>
          <div className="md:col-span-2"><dt className="text-on-surface-variant">Interessados</dt><dd>{resumo.processo.interessados.join(', ') || '—'}</dd></div>
          <div className="md:col-span-2"><dt className="text-on-surface-variant">Objeto</dt><dd>{resumo.processo.descricao_objeto ?? '—'}</dd></div>
        </dl>
      </section>

      {resumo.dados_objetivos &&
        Object.values(resumo.dados_objetivos).some(
          (v) => v && (Array.isArray(v) ? v.length > 0 : true),
        ) && (
          <section className="card space-y-4">
            <h2 className="font-display text-xl text-primary">Dados objetivos</h2>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {resumo.dados_objetivos.modalidade && (
                <div>
                  <dt className="text-on-surface-variant">Modalidade</dt>
                  <dd className="font-medium">{resumo.dados_objetivos.modalidade}</dd>
                </div>
              )}
              {resumo.dados_objetivos.periodo_examinado && (
                <div>
                  <dt className="text-on-surface-variant">Período examinado</dt>
                  <dd className="font-medium">{resumo.dados_objetivos.periodo_examinado}</dd>
                </div>
              )}
              {resumo.dados_objetivos.valor_total_envolvido && (
                <div>
                  <dt className="text-on-surface-variant">Valor envolvido</dt>
                  <dd className="font-medium">{resumo.dados_objetivos.valor_total_envolvido}</dd>
                </div>
              )}
              {resumo.dados_objetivos.numero_contrato_licitacao && (
                <div>
                  <dt className="text-on-surface-variant">Contrato/Licitação</dt>
                  <dd className="font-medium">{resumo.dados_objetivos.numero_contrato_licitacao}</dd>
                </div>
              )}
              {resumo.dados_objetivos.partes_contratantes.length > 0 && (
                <div className="md:col-span-2">
                  <dt className="text-on-surface-variant">Partes contratantes</dt>
                  <dd>{resumo.dados_objetivos.partes_contratantes.join(' · ')}</dd>
                </div>
              )}
              {resumo.dados_objetivos.datas_relevantes.length > 0 && (
                <div className="md:col-span-2">
                  <dt className="text-on-surface-variant mb-1">Datas relevantes</dt>
                  <dd>
                    <ul className="list-disc list-inside space-y-0.5">
                      {resumo.dados_objetivos.datas_relevantes.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
              )}
            </dl>
          </section>
        )}

      {resumo.narrativa_fatos && (
        <section className="card space-y-3">
          <h2 className="font-display text-xl text-primary">Narrativa dos fatos</h2>
          <p className="text-sm text-on-surface whitespace-pre-line leading-relaxed">
            {resumo.narrativa_fatos}
          </p>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-xl text-primary">Achados ({resumo.achados.length})</h2>
        {resumo.achados.map((a) => (
          <article key={a.numero} className="card space-y-3">
            <header className="flex items-start justify-between gap-4">
              <h3 className="font-display text-lg text-on-surface">
                <span className="text-primary">{a.numero}</span> — {a.titulo}
              </h3>
              <GravidadeBadge gravidade={a.gravidade} />
            </header>
            <p className="text-sm text-on-surface whitespace-pre-line leading-relaxed">
              {a.descricao}
            </p>
            {a.fatos_apurados.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs uppercase tracking-wide text-on-surface-variant font-medium">
                  Fatos apurados
                </p>
                <ul className="list-disc list-outside ml-5 space-y-1 text-sm text-on-surface">
                  {a.fatos_apurados.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="text-xs text-on-surface-variant space-y-1">
              {a.responsaveis.length > 0 && (
                <p><strong>Responsáveis:</strong> {a.responsaveis.join(', ')}</p>
              )}
              {a.fundamentacao_legal.length > 0 && (
                <p><strong>Fundamentação:</strong> {a.fundamentacao_legal.join('; ')}</p>
              )}
            </div>
            {(a.defesa_completa || a.defesa_resumo) && (
              <div className="mt-1 p-3 rounded-lg bg-surface-variant text-sm space-y-2">
                <p className="text-xs uppercase text-on-surface-variant font-medium">Defesa</p>
                <p className="whitespace-pre-line leading-relaxed">
                  {a.defesa_completa ?? a.defesa_resumo}
                </p>
              </div>
            )}
          </article>
        ))}
      </section>

      {resumo.observacoes_triagem && (
        <section className="card space-y-3 border-warning/40 bg-warning-container/20">
          <h2 className="font-display text-xl text-primary">Observações da triagem</h2>
          <p className="text-sm text-on-surface whitespace-pre-line leading-relaxed">
            {resumo.observacoes_triagem}
          </p>
        </section>
      )}

      <div className="flex justify-between pt-4">
        <Link href="/" className="btn-ghost">
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Painel
        </Link>
        <button
          onClick={() => confirmedAt ? router.push(`/processo/${id}/diretrizes`) : saveResumo(true)}
          className="btn-primary"
          disabled={saving}
        >
          {confirmedAt ? 'Definir diretrizes' : 'Confirmar resumo'}
          <span className="material-symbols-outlined text-base">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}

function ResumoEditor({
  draft,
  original,
  previewing,
  saving,
  onDraft,
  onAchado,
  onPreview,
  onCancel,
  onSave,
}: {
  draft: Resumo;
  original: Resumo;
  previewing: boolean;
  saving: boolean;
  onDraft: (value: Resumo) => void;
  onAchado: (index: number, patch: Partial<Resumo['achados'][number]>) => void;
  onPreview: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const lines = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean);
  return (
    <section className="card space-y-5 border-primary/30">
      <div>
        <h2 className="font-display text-xl text-primary">Editar e confirmar resumo</h2>
        <p className="text-sm text-on-surface-variant">A confirmação invalida diretrizes e minutas anteriores.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="label">Número<input className="input mt-2" value={draft.processo.numero} onChange={(e) => onDraft({ ...draft, processo: { ...draft.processo, numero: e.target.value } })} /></label>
        <label className="label">Unidade<input className="input mt-2" value={draft.processo.unidade_jurisdicionada} onChange={(e) => onDraft({ ...draft, processo: { ...draft.processo, unidade_jurisdicionada: e.target.value } })} /></label>
        <label className="label">Exercício<input className="input mt-2" value={draft.processo.exercicio ?? ''} onChange={(e) => onDraft({ ...draft, processo: { ...draft.processo, exercicio: e.target.value || null } })} /></label>
        <label className="label">Interessados<input className="input mt-2" value={draft.processo.interessados.join(', ')} onChange={(e) => onDraft({ ...draft, processo: { ...draft.processo, interessados: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) } })} /></label>
      </div>
      <label className="label">Narrativa dos fatos<textarea className="input mt-2" rows={6} value={draft.narrativa_fatos ?? ''} onChange={(e) => onDraft({ ...draft, narrativa_fatos: e.target.value || null })} /></label>
      {draft.achados.map((achado, index) => (
        <fieldset key={achado.numero} className="rounded-2xl border border-outline-variant p-4 space-y-3">
          <legend className="px-2 font-display text-primary">Achado {achado.numero}</legend>
          <label className="label">Título<input className="input mt-2" value={achado.titulo} onChange={(e) => onAchado(index, { titulo: e.target.value })} /></label>
          <label className="label">Descrição<textarea className="input mt-2" rows={4} value={achado.descricao} onChange={(e) => onAchado(index, { descricao: e.target.value })} /></label>
          <label className="label">Fatos apurados — um por linha<textarea className="input mt-2" rows={5} value={achado.fatos_apurados.join('\n')} onChange={(e) => {
            const fatos = lines(e.target.value);
            onAchado(index, {
              fatos_apurados: fatos,
              fatos_referenciados: fatos.map((text, factIndex) => ({
                text,
                evidence_ids: achado.fatos_referenciados[factIndex]?.evidence_ids ?? [],
              })).filter((item) => item.evidence_ids.length > 0),
            });
          }} /></label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="label">Responsáveis — um por linha<textarea className="input mt-2" rows={3} value={achado.responsaveis.join('\n')} onChange={(e) => onAchado(index, { responsaveis: lines(e.target.value) })} /></label>
            <label className="label">Fundamentação — uma por linha<textarea className="input mt-2" rows={3} value={achado.fundamentacao_legal.join('\n')} onChange={(e) => onAchado(index, { fundamentacao_legal: lines(e.target.value) })} /></label>
          </div>
          <label className="label">Defesa completa<textarea className="input mt-2" rows={4} value={achado.defesa_completa ?? ''} onChange={(e) => onAchado(index, { defesa_completa: e.target.value || null })} /></label>
        </fieldset>
      ))}
      {previewing && (
        <div className="compare-grid">
          <div><h3 className="compare-title">Antes</h3><pre>{JSON.stringify(original, null, 2)}</pre></div>
          <div><h3 className="compare-title">Depois</h3><pre>{JSON.stringify(draft, null, 2)}</pre></div>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancelar</button>
        {!previewing ? (
          <button type="button" className="btn-primary" onClick={onPreview}>Revisar alterações</button>
        ) : (
          <button type="button" className="btn-primary" onClick={onSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar e confirmar'}</button>
        )}
      </div>
    </section>
  );
}

function GravidadeBadge({ gravidade }: { gravidade: 'leve' | 'media' | 'grave' }) {
  const map = {
    leve: 'bg-success-container text-on-surface',
    media: 'bg-warning-container text-on-surface',
    grave: 'bg-error-container text-on-surface',
  } as const;
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-full uppercase tracking-wide ${map[gravidade]}`}>
      {gravidade}
    </span>
  );
}
