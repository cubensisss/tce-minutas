'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import StepIndicator from '@/components/StepIndicator';
import ProcessoChat from '@/components/ProcessoChat';
import { MinutaSchema, type Minuta } from '@/schemas/minuta';
import JobProgress from '@/components/JobProgress';

type Props = { params: Promise<{ id: string }> };

export default function MinutaPage({ params }: Props) {
  const { id } = use(params);
  const [minuta, setMinuta] = useState<Minuta | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/processo/${id}`);
        const json = await res.json();
        const existing = MinutaSchema.safeParse(json.processo?.minuta);
        if (existing.success) {
          if (!cancelled) {
            setMinuta(existing.data);
            setLoading(false);
          }
          return;
        }
        // Sem minuta — gera agora
        if (!cancelled) {
          setLoading(false);
          await generate();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const jobRes = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processo_id: id, kind: 'minuta' }),
      });
      const jobJson = await jobRes.json();
      const currentJobId: string | null = jobRes.ok ? jobJson.id : null;
      setJobId(currentJobId);
      const res = await fetch('/api/minuta/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processo_id: id, job_id: currentJobId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'falha ao gerar minuta');
      setMinuta(j.minuta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'erro');
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <StepIndicator currentStep={4} />
        <div className="card text-on-surface-variant">Carregando...</div>
      </div>
    );
  }

  if (generating || (!minuta && !error)) {
    return (
      <div className="space-y-6">
        <StepIndicator currentStep={4} />
        <div className="card">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
            <p className="text-on-surface-variant">
              Elaborando a minuta de voto. Isso pode levar 60–180 segundos.
            </p>
          </div>
          <p className="text-xs text-on-surface-variant mt-3">
            O Gemini Pro está consultando os documentos, as diretrizes e precedentes de todo o TCE-PE, além do acervo do gabinete.
          </p>
          <JobProgress jobId={jobId} />
        </div>
      </div>
    );
  }

  if (error || !minuta) {
    return (
      <div className="space-y-6">
        <StepIndicator currentStep={4} />
        <div className="card border-error/30 bg-error-container/30">
          <h2 className="text-lg font-medium mb-2">Erro ao gerar minuta</h2>
          <p className="text-sm text-on-surface-variant mb-4">{error}</p>
          <button onClick={generate} className="btn-primary">Tentar novamente</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StepIndicator currentStep={4} />

      <header className="page-header">
        <div>
          <p className="eyebrow">Redação assistida</p>
          <h1 className="page-title">Minuta</h1>
          <p className="page-subtitle">Revise o texto e suas fontes. O DOCX será liberado na conferência final.</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <Link href={`/processo/${id}/similares`} className="btn-ghost">
            <span className="material-symbols-outlined text-base">travel_explore</span>
            Similares
          </Link>
          <Link href={`/processo/${id}/revisao`} className="btn-ghost">
            <span className="material-symbols-outlined text-base">edit_note</span>
            Revisão
          </Link>
          <button onClick={generate} className="btn-ghost" disabled={generating}>
            <span className="material-symbols-outlined text-base">refresh</span>
            Regerar
          </button>
          <Link href={`/processo/${id}/conferencia`} className="btn-primary">
            Conferência final
            <span className="material-symbols-outlined text-base">arrow_forward</span>
          </Link>
        </div>
      </header>

      {jobId && (
        <section className="card">
          <h2 className="text-sm font-medium">Desempenho da ultima geracao</h2>
          <JobProgress jobId={jobId} />
        </section>
      )}

      {error && (
        <div className="card border-error/40 bg-error-container/40 space-y-1">
          <h3 className="font-medium flex items-center gap-2 text-on-surface">
            <span className="material-symbols-outlined text-base">error</span>
            Erro ao baixar o DOCX
          </h3>
          <p className="text-sm text-on-surface-variant">{error}</p>
        </div>
      )}

      {minuta.sugestao_pendente && (
        <div className="card border-warning/40 bg-warning-container/30 space-y-2">
          <h3 className="font-medium flex items-center gap-2">
            <span className="material-symbols-outlined text-base">flag</span>
            Pontos de revisão
          </h3>
          <p className="text-sm whitespace-pre-line">{minuta.sugestao_pendente}</p>
        </div>
      )}

      <section className="card notice-warning">
        <h2 className="font-semibold flex items-center gap-2">
          <span className="material-symbols-outlined text-base">lock</span>
          Documento oficial ainda bloqueado
        </h2>
        <p className="text-sm mt-1">
          Edite a minuta, confira as referências e aprove a versão final antes de baixar o DOCX.
        </p>
      </section>

      <Section title="Ementa">{minuta.ementa}</Section>
      <Section title="Relatório">{minuta.relatorio}</Section>
      <Section title="Análise (voto)">{minuta.analise_completa}</Section>
      <Section title="Dispositivo">{minuta.decisao_voto}</Section>

      <section className="card">
        <h2 className="font-display text-xl text-primary mb-1">Fontes da minuta</h2>
        <p className="text-sm text-on-surface-variant mb-4">
          Estes marcadores aparecem somente no aplicativo e não serão incluídos no DOCX.
        </p>
        {minuta.referencias.length === 0 ? (
          <p className="text-sm text-error">Nenhuma referência foi associada à minuta.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {minuta.referencias.map((reference) => (
              <article className="source-card" key={reference.id}>
                <div className="flex justify-between gap-3">
                  <strong className="text-sm">{sectionLabel(reference.section)}</strong>
                  <span className={`status-chip ${reference.verification === 'invalid' ? 'status-error' : 'status-warning'}`}>
                    {reference.verification === 'invalid' ? 'Inválida' : 'A conferir'}
                  </span>
                </div>
                <p className="text-sm mt-2">{reference.excerpt}</p>
                {reference.precedent?.link && (
                  <a className="text-xs text-primary underline mt-2 block" href={reference.precedent.link} target="_blank" rel="noreferrer">
                    Abrir precedente oficial
                  </a>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Chat para tirar dúvidas e analisar o mérito com o assistente.
          Carrega o histórico do processo (persiste entre sessões). */}
      <ProcessoChat processoId={id} />
    </div>
  );
}

function sectionLabel(section: Minuta['referencias'][number]['section']) {
  return {
    ementa: 'Ementa',
    relatorio: 'Relatório',
    analise_completa: 'Análise',
    decisao_voto: 'Dispositivo',
  }[section];
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <section className="card">
      <h2 className="font-display text-xl text-primary mb-3">{title}</h2>
      <div className="prose prose-sm max-w-none text-on-surface whitespace-pre-line">
        {children}
      </div>
    </section>
  );
}
