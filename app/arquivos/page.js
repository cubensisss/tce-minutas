'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Sidebar from '../components/Sidebar';
import TopNav from '../components/TopNav';
import { supabase } from '../lib/supabase';

export default function ArquivosPage() {
  const [processos, setProcessos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('todos');

  useEffect(() => { loadProcessos(); }, []);

  async function loadProcessos() {
    const { data } = await supabase
      .from('processos')
      .select('*, minutas(versao)')
      .order('updated_at', { ascending: false });
    setProcessos(data || []);
    setLoading(false);
  }

  const filtered = filter === 'todos'
    ? processos
    : processos.filter(p => p.status === filter);

  const statusLabel = {
    upload: 'Upload',
    resumo: 'Resumo',
    diretrizes: 'Diretrizes',
    minuta: 'Minuta',
    revisao: 'Revisão',
    finalizado: 'Finalizado',
  };

  const statusColor = {
    upload: 'bg-slate-100 text-slate-600',
    resumo: 'bg-blue-50 text-blue-700',
    diretrizes: 'bg-amber-50 text-amber-700',
    minuta: 'bg-indigo-50 text-indigo-700',
    revisao: 'bg-purple-50 text-purple-700',
    finalizado: 'bg-emerald-50 text-emerald-700',
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="ml-64 flex-1">
        <TopNav />
        <main className="p-12">
          <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex justify-between items-end mb-10">
              <div>
                <h1 className="font-[Newsreader] text-4xl text-primary font-medium mb-2">Arquivos</h1>
                <p className="text-on-surface-variant">Histórico completo de processos e minutas geradas.</p>
              </div>
              <div className="flex gap-2">
                {['todos', 'revisao', 'finalizado'].map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-4 py-1.5 text-xs rounded-full font-semibold transition-all ${
                      filter === f ? 'bg-primary text-white' : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
                    }`}
                  >
                    {f === 'todos' ? 'Todos' : statusLabel[f]}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-24">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-24">
                <span className="material-symbols-outlined text-6xl text-outline-variant/30 mb-4 block">folder_off</span>
                <p className="font-[Newsreader] text-xl text-on-surface-variant">Nenhum processo encontrado</p>
              </div>
            ) : (
              <div className="bg-surface-container-lowest rounded-xl ring-1 ring-outline-variant/10 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-4 px-6 text-[10px] uppercase tracking-widest text-outline font-bold">Processo</th>
                      <th className="text-left py-4 px-6 text-[10px] uppercase tracking-widest text-outline font-bold">UJ</th>
                      <th className="text-left py-4 px-6 text-[10px] uppercase tracking-widest text-outline font-bold">Exercício</th>
                      <th className="text-left py-4 px-6 text-[10px] uppercase tracking-widest text-outline font-bold">Status</th>
                      <th className="text-left py-4 px-6 text-[10px] uppercase tracking-widest text-outline font-bold">Versões</th>
                      <th className="text-left py-4 px-6 text-[10px] uppercase tracking-widest text-outline font-bold">Atualizado</th>
                      <th className="text-right py-4 px-6"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(p => (
                      <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 px-6 font-semibold text-primary">{p.numero}</td>
                        <td className="py-4 px-6 text-on-surface-variant">{p.unidade_jurisdicionada}</td>
                        <td className="py-4 px-6 text-on-surface-variant">{p.exercicio || '—'}</td>
                        <td className="py-4 px-6">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusColor[p.status] || 'bg-slate-100 text-slate-600'}`}>
                            {statusLabel[p.status] || p.status}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-on-surface-variant">
                          {p.minutas?.length || 0} {p.minutas?.length === 1 ? 'versão' : 'versões'}
                        </td>
                        <td className="py-4 px-6 text-outline text-xs">
                          {p.updated_at ? new Date(p.updated_at).toLocaleDateString('pt-BR') : '—'}
                        </td>
                        <td className="py-4 px-6 text-right">
                          <Link href={`/processo/${p.id}/minuta`}
                            className="text-primary hover:underline font-medium flex items-center gap-1 justify-end"
                          >
                            Abrir <span className="material-symbols-outlined text-sm">chevron_right</span>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
