'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import StepIndicator from '@/components/StepIndicator';
import ProcessoChat from '@/components/ProcessoChat';
import { MinutaSchema, type Minuta } from '@/schemas/minuta';

type Props = { params: Promise<{ id: string }> };

export default function MinutaPage({ params }: Props) {
  const { id } = use(params);
  const [minuta, setMinuta] = useState<Minuta | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

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
      const res = await fetch('/api/minuta/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processo_id: id }),
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
            O Gemini Pro está consultando os documentos brutos, as diretrizes e os precedentes do TCE-Andressa.
          </p>
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

      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-display font-semibold text-primary">Minuta</h1>
          <p className="text-on-surface-variant mt-1">Revise abaixo. Você pode regerar ou baixar como DOCX.</p>
        </div>
        <div className="flex gap-2">
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
          <a
            href={`/api/minuta/docx?processo_id=${id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary"
          >
            <span className="material-symbols-outlined text-base">download</span>
            Baixar DOCX
          </a>
        </div>
      </header>

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

      <Section title="Ementa">{minuta.ementa}</Section>
      <Section title="Relatório">{minuta.relatorio}</Section>
      <Section title="Análise (voto)">{minuta.analise_completa}</Section>
      <Section title="Dispositivo">{minuta.decisao_voto}</Section>

      {/* Chat para tirar dúvidas e analisar o mérito com o assistente.
          Carrega o histórico do processo (persiste entre sessões). */}
      <ProcessoChat processoId={id} />
    </div>
  );
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
