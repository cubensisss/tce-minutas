'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Sidebar from './components/Sidebar';
import TopNav from './components/TopNav';
import { supabase } from './lib/supabase';

const statusLabels = {
  upload: { label: 'Novo', color: 'bg-primary/10 text-primary' },
  resumo: { label: 'Em Análise', color: 'bg-surface-tint/10 text-surface-tint' },
  diretrizes: { label: 'Aguardando Diretrizes', color: 'bg-on-tertiary-container/10 text-on-tertiary-container' },
  minuta: { label: 'Minuta Gerada', color: 'bg-primary-fixed-dim/20 text-on-primary-fixed-variant' },
  revisao: { label: 'Em Revisão', color: 'bg-on-tertiary-container/10 text-on-tertiary-container' },
  finalizado: { label: 'Finalizado', color: 'bg-green-100 text-green-800' },
};

const stepProgress = {
  upload: 20, resumo: 40, diretrizes: 60, minuta: 80, revisao: 90, finalizado: 100,
};

export default function Dashboard() {
  const router = useRouter();
  const [processos, setProcessos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProcessos();
  }, []);

  async function loadProcessos() {
    const { data, error } = await supabase
      .from('processos')
      .select('*')
      .order('updated_at', { ascending: false });
    if (!error && data) setProcessos(data);
    setLoading(false);
  }

  const [confirmingId, setConfirmingId] = useState(null);

  async function handleDelete(e, id) {
    console.log('[DELETE] Button clicked for processo:', id);
    e.preventDefault();
    e.stopPropagation();
    
    // Two-click pattern: first click = arm, second click = fire
    if (confirmingId !== id) {
      setConfirmingId(id);
      console.log('[DELETE] Armed for deletion. Click again to confirm.');
      // Auto-disarm after 3 seconds
      setTimeout(() => setConfirmingId((prev) => prev === id ? null : prev), 3000);
      return;
    }

    // Second click — actually delete
    setConfirmingId(null);
    try {
      console.log('[DELETE] Calling API...');
      const res = await fetch('/api/processo/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processoId: id }),
      });
      const result = await res.json();
      console.log('[DELETE] API response:', result);
      
      if (result.success) {
        loadProcessos();
      } else {
        alert('Erro ao deletar: ' + (result.error || 'Erro desconhecido'));
      }
    } catch (err) {
      console.error('[DELETE] Fetch error:', err);
      alert('Erro de rede ao deletar: ' + err.message);
    }
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="ml-64 flex-1">
        <TopNav />
        <main className="p-12">
          <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex justify-between items-end mb-12">
              <div>
                <h1 className="font-[Newsreader] text-4xl text-primary font-medium mb-2">Painel de Processos</h1>
                <p className="text-on-surface-variant">Acompanhe o andamento das minutas de voto em elaboração.</p>
              </div>
              <Link href="/novo"
                className="px-8 py-3 bg-primary text-white rounded font-semibold text-sm flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <span className="material-symbols-outlined text-lg">add</span>
                Novo Processo
              </Link>
            </div>

            {/* Grid */}
            {loading ? (
              <div className="flex items-center justify-center py-24">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm text-outline">Carregando processos...</p>
                </div>
              </div>
            ) : processos.length === 0 ? (
              <div className="text-center py-24">
                <span className="material-symbols-outlined text-6xl text-outline-variant/40 mb-4 block">folder_open</span>
                <h3 className="font-[Newsreader] text-xl text-on-surface-variant mb-2">Nenhum processo cadastrado</h3>
                <p className="text-sm text-outline mb-8 max-w-md mx-auto">
                  Comece criando um novo processo para elaborar a minuta de voto automaticamente.
                </p>
                <Link href="/novo"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded font-semibold text-sm"
                >
                  <span className="material-symbols-outlined text-lg">add</span>
                  Criar Primeiro Processo
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {processos.map((p) => {
                  const status = statusLabels[p.status] || statusLabels.upload;
                  const progress = stepProgress[p.status] || 0;
                  return (
                    <div key={p.id} className="bg-surface-container-lowest p-6 rounded-xl ring-1 ring-outline-variant/10 hover:ring-primary/30 hover:shadow-lg transition-all group relative">
                      {/* Invisible Link covering the card */}
                      <Link href={`/processo/${p.id}/resumo`} className="absolute inset-0 z-0" aria-label={`Acessar processo ${p.numero}`} />
                      
                      {/* Header items on top so the button is clickable */}
                      <div className="flex justify-between items-start mb-3 relative z-10 pointer-events-none">
                        <span className="font-[Newsreader] font-bold text-primary text-lg pointer-events-auto">{p.numero}</span>
                        <div className="flex items-center gap-2 pointer-events-auto">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${status.color}`}>
                            {status.label}
                          </span>
                          <button 
                            type="button"
                            onClick={(e) => handleDelete(e, p.id)} 
                            className={`p-2 -mr-1 rounded flex cursor-pointer z-50 items-center gap-1 transition-all ${
                              confirmingId === p.id 
                                ? 'bg-red-600 text-white shadow-md ring-2 ring-red-300 animate-pulse' 
                                : 'text-red-500 hover:text-red-700 hover:bg-red-50 bg-white shadow-sm ring-1 ring-red-100'
                            }`}
                            title={confirmingId === p.id ? 'Clique novamente para confirmar!' : 'Deletar Processo'}
                          >
                            <span className="material-symbols-outlined text-sm">delete_forever</span>
                            {confirmingId === p.id && <span className="text-[10px] font-bold pr-1">Confirmar?</span>}
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-on-surface-variant mb-4">{p.unidade_jurisdicionada}</p>
                      <p className="text-[11px] text-outline mb-1">{p.modalidade}</p>
                      {/* Progress bar */}
                      <div className="mt-4 pt-4 border-t border-slate-100">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[10px] font-semibold text-outline uppercase tracking-wider">Progresso</span>
                          <span className="text-[10px] font-bold text-primary">{progress}%</span>
                        </div>
                        <div className="w-full bg-surface-container-high h-1 rounded-full overflow-hidden">
                          <div className="bg-primary h-full rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                        </div>
                      </div>
                      <div className="mt-3 flex justify-between items-center">
                        <span className="text-[10px] text-outline">
                          {new Date(p.updated_at).toLocaleDateString('pt-BR')}
                        </span>
                        <span className="material-symbols-outlined text-sm text-outline group-hover:text-primary transition-colors">arrow_forward</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
