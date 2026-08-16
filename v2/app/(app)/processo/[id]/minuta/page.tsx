'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import StepIndicator from '@/components/StepIndicator';
import ProcessoChat from '@/components/ProcessoChat';
import { MinutaSchema, type Minuta } from '@/schemas/minuta';
import JobProgress from '@/components/JobProgress';
import { apiMessage, readApiResponse } from '@/lib/http/api-response';

type Props = { params: Promise<{ id: string }> };

type JurisprudenceMeta = {
  searchedAt: string;
  officialDatabaseQueried: true;
  officialCandidatesRead: number;
  cabinetCandidatesRead: number;
  selectedResults: number;
  officialSearchWasExhaustive: boolean;
  queries: Array<{
    label?: string;
    officialEffectiveQuery?: string;
    officialCandidatesRead?: number;
  }>;
  selectedSources: JurisprudenceSource[];
};

type JurisprudenceSource = {
  id: string;
  title: string | null;
  link: string | null;
  source: 'tcepe_oficial' | 'vertex_gabinete';
  processo: string | null;
  acordao: string | null;
  relator: string | null;
  julgamento: string | null;
  researchQueries: string[];
};

export default function MinutaPage({ params }: Props) {
  const { id } = use(params);
  const [minuta, setMinuta] = useState<Minuta | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jurisprudenceMeta, setJurisprudenceMeta] = useState<JurisprudenceMeta | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/processo/${id}`);
        const json = await readApiResponse(res);
        if (!res.ok) throw new Error(apiMessage(json, 'Falha ao carregar o processo.'));
        const processo = asRecord(json.processo);
        const minutaMeta = asRecord(processo?.minuta_meta);
        const existing = MinutaSchema.safeParse(processo?.minuta);
        const minutaIsStale = processo?.minuta_status === 'stale';
        if (!cancelled) {
          setJurisprudenceMeta(parseJurisprudenceMeta(minutaMeta?.jurisprudence));
        }
        if (existing.success && !minutaIsStale) {
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
      const jobJson = await readApiResponse(jobRes);
      const currentJobId = jobRes.ok && typeof jobJson.id === 'string' ? jobJson.id : null;
      setJobId(currentJobId);
      const res = await fetch('/api/minuta/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processo_id: id, job_id: currentJobId }),
      });
      const j = await readApiResponse(res);
      if (!res.ok) throw new Error(apiMessage(j, 'Falha ao gerar a minuta.'));
      const generated = MinutaSchema.safeParse(j.minuta);
      if (!generated.success) {
        throw new Error('O servidor concluiu a geração, mas devolveu uma minuta em formato inválido.');
      }
      setMinuta(generated.data);
      setJurisprudenceMeta(parseJurisprudenceMeta(j.jurisprudence_report));
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
              Pesquisando a jurisprudência e elaborando a minuta. Isso pode levar de 2 a 5 minutos.
            </p>
          </div>
          <p className="text-xs text-on-surface-variant mt-3">
            Antes de redigir, o sistema consulta obrigatoriamente a base oficial de julgados do TCE-PE para cada achado, com o acervo do gabinete como fonte complementar.
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

      {jurisprudenceMeta ? (
        <section className="card border-primary/30 bg-primary-container/20">
          <h2 className="font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-base">account_balance</span>
            Pesquisa jurisprudencial realizada
          </h2>
          <p className="text-sm mt-1 text-on-surface-variant">
            A base oficial do TCE-PE foi consultada em{' '}
            {new Date(jurisprudenceMeta.searchedAt).toLocaleString('pt-BR')} por meio de{' '}
            {jurisprudenceMeta.queries.length} consulta(s). Foram lidos{' '}
            {jurisprudenceMeta.officialCandidatesRead} resultado(s) oficiais e{' '}
            {jurisprudenceMeta.cabinetCandidatesRead} do acervo interno indexado;{' '}
            {jurisprudenceMeta.selectedResults} foram selecionados para fundamentar a redação.
          </p>
          {jurisprudenceMeta.officialCandidatesRead === 0 && (
            <div className="notice-warning mt-3 text-sm">
              A consulta oficial não encontrou correspondências para os termos usados. Isso não significa
              que inexista jurisprudência no TCE-PE; apenas que aquelas consultas não retornaram julgados.
              Ao regenerar, o sistema tentará automaticamente expressões temáticas mais amplas.
            </div>
          )}
          <p className="text-xs mt-3 text-on-surface-variant">
            “Acervo interno indexado” é o conjunto de decisões e documentos previamente carregados no
            mecanismo de pesquisa do gabinete. Não são os autos deste processo concreto.
          </p>
          {jurisprudenceMeta.selectedSources.length > 0 && (
            <details className="mt-4 rounded-md border border-outline-variant p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Ver os {jurisprudenceMeta.selectedSources.length} resultados selecionados
              </summary>
              <div className="mt-3 space-y-2">
                {jurisprudenceMeta.selectedSources.map((source) => (
                  <article key={`${source.source}:${source.id}`} className="source-card text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`status-chip ${source.source === 'tcepe_oficial' ? 'status-success' : 'status-warning'}`}>
                        {source.source === 'tcepe_oficial' ? 'TCE-PE oficial' : 'Acervo interno indexado'}
                      </span>
                      <strong>{source.title || source.acordao || source.processo || 'Documento sem título'}</strong>
                    </div>
                    <p className="text-xs mt-1 text-on-surface-variant">
                      {[source.acordao, source.processo, source.relator, source.julgamento]
                        .filter(Boolean).join(' • ') || 'Sem metadados adicionais no índice.'}
                    </p>
                    {source.link && (
                      <a href={source.link} target="_blank" rel="noreferrer" className="text-xs text-primary underline mt-1 inline-block">
                        Abrir documento
                      </a>
                    )}
                  </article>
                ))}
              </div>
            </details>
          )}
          {!jurisprudenceMeta.officialSearchWasExhaustive && (
            <p className="text-xs mt-2 text-on-surface-variant">
              Como algumas consultas tiveram muitas correspondências, foram usadas páginas distribuídas no acervo. A minuta não deve tratar a jurisprudência como consolidada sem múltiplos julgados convergentes.
            </p>
          )}
        </section>
      ) : (
        <section className="card notice-warning">
          <h2 className="font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-base">warning</span>
            Minuta anterior à pesquisa jurisprudencial obrigatória
          </h2>
          <p className="text-sm mt-1">
            Regenere esta minuta para pesquisar a base oficial do TCE-PE e registrar os julgados utilizados.
          </p>
        </section>
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

function parseJurisprudenceMeta(value: unknown): JurisprudenceMeta | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<JurisprudenceMeta>;
  if (
    item.officialDatabaseQueried !== true
    || typeof item.searchedAt !== 'string'
    || typeof item.officialCandidatesRead !== 'number'
    || typeof item.cabinetCandidatesRead !== 'number'
    || typeof item.selectedResults !== 'number'
    || typeof item.officialSearchWasExhaustive !== 'boolean'
    || !Array.isArray(item.queries)
  ) return null;
  const selectedSources = Array.isArray(item.selectedSources)
    ? item.selectedSources.filter(isJurisprudenceSource)
    : [];
  return { ...item, selectedSources } as JurisprudenceMeta;
}

function isJurisprudenceSource(value: unknown): value is JurisprudenceSource {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<JurisprudenceSource>;
  return typeof item.id === 'string'
    && (item.source === 'tcepe_oficial' || item.source === 'vertex_gabinete')
    && (item.title === null || typeof item.title === 'string')
    && (item.link === null || typeof item.link === 'string')
    && Array.isArray(item.researchQueries);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
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
