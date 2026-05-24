import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Processo = {
  id: string;
  numero: string;
  unidade_jurisdicionada: string | null;
  status: string | null;
  created_at: string;
};

export default async function DashboardPage() {
  const supabase = await createServerClient();

  const { data: processos, error } = await supabase
    .from('processos')
    .select('id, numero, unidade_jurisdicionada, status, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return (
      <div className="card border-error/30 bg-error-container/30">
        <h1 className="text-xl font-display mb-2">Erro ao carregar processos</h1>
        <pre className="text-sm text-on-surface-variant whitespace-pre-wrap">{error.message}</pre>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-4xl font-display font-semibold text-primary">Painel</h1>
          <p className="text-on-surface-variant mt-1">
            {processos?.length ?? 0} {processos?.length === 1 ? 'processo' : 'processos'} em andamento
          </p>
        </div>
        <Link href="/novo" className="btn-primary">
          <span className="material-symbols-outlined text-base">add</span>
          Novo processo
        </Link>
      </header>

      {(!processos || processos.length === 0) ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(processos as Processo[]).map((p) => (
            <ProcessoCard key={p.id} processo={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProcessoCard({ processo }: { processo: Processo }) {
  return (
    <Link href={`/processo/${processo.id}/resumo`} className="card hover:shadow-[var(--shadow-elev-2)] transition-shadow block">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs uppercase tracking-wide text-on-surface-variant">Processo</span>
        <StatusBadge status={processo.status} />
      </div>
      <h3 className="font-display text-xl text-primary mb-2">{processo.numero}</h3>
      <p className="text-sm text-on-surface-variant line-clamp-2">
        {processo.unidade_jurisdicionada ?? '— Unidade não informada —'}
      </p>
      <p className="text-xs text-on-surface-variant mt-4">
        {new Date(processo.created_at).toLocaleDateString('pt-BR')}
      </p>
    </Link>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const map: Record<string, { label: string; classes: string }> = {
    novo: { label: 'Novo', classes: 'bg-surface-variant text-on-surface-variant' },
    triagem: { label: 'Triagem', classes: 'bg-primary-container text-on-primary-container' },
    resumo: { label: 'Resumo', classes: 'bg-primary-container text-on-primary-container' },
    diretrizes: { label: 'Diretrizes', classes: 'bg-tertiary-container text-on-surface' },
    minuta: { label: 'Minuta', classes: 'bg-warning-container text-on-surface' },
    revisao: { label: 'Revisão', classes: 'bg-success-container text-on-surface' },
  };
  const s = map[status ?? 'novo'] ?? map.novo!;
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-full ${s.classes}`}>
      {s.label}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="card text-center py-16">
      <span className="material-symbols-outlined text-6xl text-outline-variant mb-4 block">
        gavel
      </span>
      <h2 className="text-xl font-display mb-2">Nenhum processo ainda</h2>
      <p className="text-on-surface-variant mb-6">
        Comece criando o primeiro processo do atelier.
      </p>
      <Link href="/novo" className="btn-primary">
        <span className="material-symbols-outlined text-base">add</span>
        Novo processo
      </Link>
    </div>
  );
}
