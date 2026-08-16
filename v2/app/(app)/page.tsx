import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { DeleteProcessButton } from './_components/DeleteProcessButton';

export const dynamic = 'force-dynamic';

type Processo = {
  id: string;
  numero: string;
  unidade_jurisdicionada: string | null;
  status: string | null;
  created_at: string;
  updated_at: string | null;
};

type Props = { searchParams: Promise<{ q?: string }> };

export default async function DashboardPage({ searchParams }: Props) {
  const supabase = await createServerClient();
  const { q = '' } = await searchParams;
  const { data: processos, error } = await supabase
    .from('processos')
    .select('id, numero, unidade_jurisdicionada, status, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return (
      <div className="card notice-error">
        <h1 className="text-xl font-display mb-2">Erro ao carregar processos</h1>
        <p className="text-sm text-on-surface-variant">{error.message}</p>
      </div>
    );
  }

  const query = q.trim().toLocaleLowerCase('pt-BR');
  const filtered = (processos as Processo[] | null)?.filter((processo) => !query ||
    processo.numero.toLocaleLowerCase('pt-BR').includes(query) ||
    (processo.unidade_jurisdicionada ?? '').toLocaleLowerCase('pt-BR').includes(query),
  ) ?? [];

  return (
    <div className="space-y-8">
      <header className="page-header">
        <div>
          <p className="eyebrow">Atelier Judicial</p>
          <h1 className="page-title">Painel</h1>
          <p className="page-subtitle">
            {processos?.length ?? 0} {processos?.length === 1 ? 'processo' : 'processos'} em andamento
          </p>
        </div>
        <Link href="/novo" className="btn-primary">
          <span className="material-symbols-outlined text-base">add</span>
          Novo processo
        </Link>
      </header>

      <form className="card flex flex-col sm:flex-row gap-3" role="search">
        <label className="sr-only" htmlFor="process-search">Buscar processo</label>
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline" aria-hidden="true">search</span>
          <input id="process-search" name="q" defaultValue={q} className="input pl-11" placeholder="Buscar por número ou unidade" />
        </div>
        <button className="btn-ghost border border-outline-variant" type="submit">Buscar</button>
      </form>

      {(!processos || processos.length === 0) ? (
        <EmptyState />
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <h2 className="font-display text-xl">Nenhum resultado encontrado</h2>
          <p className="text-sm text-on-surface-variant mt-1">Tente outro número ou nome de unidade.</p>
          <Link href="/" className="btn-ghost mt-4">Limpar busca</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((processo) => <ProcessoCard key={processo.id} processo={processo} />)}
        </div>
      )}
    </div>
  );
}

function ProcessoCard({ processo }: { processo: Processo }) {
  const destination = continuePath(processo.id, processo.status);
  const updated = processo.updated_at ?? processo.created_at;
  return (
    <article className="card hover:shadow-[var(--shadow-elev-2)] transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs uppercase tracking-wide text-on-surface-variant">Processo</span>
        <div className="flex items-center gap-2">
          <StatusBadge status={processo.status} />
          <DeleteProcessButton id={processo.id} />
        </div>
      </div>
      <h3 className="font-display text-xl text-primary mb-2">{processo.numero}</h3>
      <p className="text-sm text-on-surface-variant line-clamp-2 min-h-10">
        {processo.unidade_jurisdicionada ?? '— Unidade não informada —'}
      </p>
      <div className="mt-5 pt-4 border-t border-outline-variant flex items-center justify-between gap-3">
        <p className="text-xs text-on-surface-variant">Atualizado {new Date(updated).toLocaleDateString('pt-BR')}</p>
        <Link href={destination} className="text-sm font-semibold text-primary inline-flex items-center gap-1">
          Continuar <span className="material-symbols-outlined text-base">arrow_forward</span>
        </Link>
      </div>
    </article>
  );
}

function continuePath(id: string, status: string | null) {
  const paths: Record<string, string> = {
    novo: 'resumo', triagem: 'resumo', resumo: 'resumo', diretrizes: 'diretrizes',
    minuta: 'minuta', revisao: 'revisao', conferencia: 'conferencia',
  };
  return `/processo/${id}/${paths[status ?? 'novo'] ?? 'resumo'}`;
}

function StatusBadge({ status }: { status: string | null }) {
  const map: Record<string, { label: string; classes: string }> = {
    novo: { label: 'Novo', classes: 'bg-surface-variant text-on-surface-variant' },
    triagem: { label: 'Documentos', classes: 'bg-primary-container text-on-primary-container' },
    resumo: { label: 'Resumo', classes: 'bg-primary-container text-on-primary-container' },
    diretrizes: { label: 'Diretrizes', classes: 'bg-tertiary-container text-on-surface' },
    minuta: { label: 'Minuta', classes: 'bg-warning-container text-on-surface' },
    revisao: { label: 'Revisão', classes: 'bg-success-container text-on-surface' },
    conferencia: { label: 'Conferência', classes: 'bg-success-container text-success' },
  };
  const selected = map[status ?? 'novo'] ?? map.novo!;
  return <span className={`status-chip ${selected.classes}`}>{selected.label}</span>;
}

function EmptyState() {
  return (
    <div className="card text-center py-16">
      <span className="material-symbols-outlined text-6xl text-outline-variant mb-4 block">gavel</span>
      <h2 className="text-xl font-display mb-2">Nenhum processo ainda</h2>
      <p className="text-on-surface-variant mb-6">Comece criando o primeiro processo do atelier.</p>
      <Link href="/novo" className="btn-primary">
        <span className="material-symbols-outlined text-base">add</span>
        Novo processo
      </Link>
    </div>
  );
}
