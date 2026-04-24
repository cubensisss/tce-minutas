'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Sidebar from '../../../components/Sidebar';
import TopNav from '../../../components/TopNav';
import StepIndicator from '../../../components/StepIndicator';
import { supabase } from '../../../lib/supabase';

export default function ResumoPage() {
  const { id } = useParams();
  const router = useRouter();
  const [processo, setProcesso] = useState(null);
  const [achados, setAchados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [selectedAchado, setSelectedAchado] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ alegacao_defesa: '', apontamento_auditoria: '', titulo: '' });

  useEffect(() => { loadData(); }, [id]);

  useEffect(() => {
    // Auto-trigger if no findings exist after loading and no error happened
    if (!loading && achados.length === 0 && !generating && !error && processo) {
      generateResumo();
    }
  }, [loading, achados.length, generating, error, processo]);

  async function loadData() {
    const { data: proc } = await supabase.from('processos').select('*').eq('id', id).single();
    const { data: ach } = await supabase.from('achados').select('*').eq('processo_id', id).order('ordem');
    setProcesso(proc);
    setAchados(ach || []);
    if (ach && ach.length > 0) setSelectedAchado(ach[0]);
    setLoading(false);
  }

  async function generateResumo() {
    setGenerating(true);
    try {
      const res = await fetch('/api/resumo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processoId: id }),
      });
      if (res.ok) {
        await loadData();
        await supabase.from('processos').update({ status: 'resumo' }).eq('id', id);
        setError(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || 'Erro desconhecido');
        console.error('Erro ao gerar resumo:', errData.error);
      }
    } catch (err) {
      setError(err.message);
      console.error('Falha na requisição de resumo:', err);
    }
    setGenerating(false);
  }

  function startEdit() {
    if (!selectedAchado) return;
    setEditForm({
      titulo: selectedAchado.titulo,
      alegacao_defesa: selectedAchado.alegacao_defesa,
      apontamento_auditoria: selectedAchado.apontamento_auditoria
    });
    setEditing(true);
  }

  async function saveEdit() {
    if (!selectedAchado) return;
    const { error } = await supabase.from('achados')
      .update(editForm)
      .eq('id', selectedAchado.id);
    
    if (!error) {
      setEditing(false);
      await loadData();
    } else {
      alert('Erro ao salvar alteração: ' + error.message);
    }
  }

  const severityConfig = {
    grave: { label: 'GRAVE', color: 'text-error', border: 'border-error' },
    dano_erario: { label: 'DANO AO ERÁRIO', color: 'text-on-tertiary-container', border: 'border-on-tertiary-container' },
    formal: { label: 'FORMAL', color: 'text-outline', border: 'border-outline' },
    sanado: { label: 'SANADO', color: 'text-green-700', border: 'border-green-700' },
  };

  if (loading) return (
    <div className="flex min-h-screen">
      <Sidebar processoId={id} />
      <div className="ml-64 flex-1"><TopNav />
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-surface-bright">
      <Sidebar processoId={id} processoNumero={processo?.numero} />
      <div className="ml-64 flex-1">
        <TopNav />
        <main className="p-12 pb-40">
          <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="mb-8 flex justify-between items-end">
              <div>
                <h1 className="font-[Newsreader] text-4xl text-primary font-medium mb-2">Resumo da Análise</h1>
                <p className="text-on-surface-variant">Confronto entre achados da auditoria e defesa extraídos pela IA.</p>
              </div>
              {achados.length > 0 && (
                <button onClick={generateResumo} disabled={generating}
                  className="px-4 py-2 text-xs border border-primary/30 text-primary rounded-lg hover:bg-primary/5 transition-all flex items-center gap-2"
                >
                  <span className={`material-symbols-outlined text-sm ${generating ? 'animate-spin' : ''}`}>sync</span>
                  {generating ? 'Regerando...' : 'Regerar com IA'}
                </button>
              )}
            </div>
            <StepIndicator currentStep={2} />

            {achados.length === 0 ? (
              <div className="text-center py-24 bg-surface-container-lowest rounded-xl ring-1 ring-outline-variant/10 shadow-sm border border-outline-variant/10">
                {error ? (
                  <>
                    <span className="material-symbols-outlined text-6xl text-error/40 mb-4 block">error</span>
                    <h3 className="font-[Newsreader] text-2xl text-on-surface font-medium mb-3">Ops! Algo deu errado</h3>
                    <p className="text-sm text-error max-w-md mx-auto mb-8 bg-error/5 p-4 rounded-lg">
                      {error}
                    </p>
                    <button onClick={() => { setError(null); generateResumo(); }}
                      className="px-8 py-3 bg-primary text-white rounded-lg font-bold shadow-lg shadow-primary/20 flex items-center gap-2 mx-auto"
                    >
                      <span className="material-symbols-outlined text-lg">refresh</span> Tentar Novamente
                    </button>
                  </>
                ) : (
                  <>
                    <div className="relative mb-8 flex justify-center">
                      <span className="material-symbols-outlined text-6xl text-primary animate-pulse">auto_awesome</span>
                      <div className="absolute top-0 w-16 h-16 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
                    </div>
                    <h3 className="font-[Newsreader] text-2xl text-primary font-medium mb-3">Análise em Andamento...</h3>
                    <p className="text-sm text-on-surface-variant max-w-md mx-auto leading-relaxed">
                      O sistema está analisando os documentos da triagem automaticamente para identificar achados e alegações da defesa. Por favor, aguarde.
                    </p>
                    <div className="mt-8 flex justify-center gap-2">
                      <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                      <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" style={{animationDelay: '200ms'}}></div>
                      <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" style={{animationDelay: '400ms'}}></div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                {/* Side by side */}
                <div className="grid grid-cols-12 gap-8 items-start">
                  {/* Left: Achados */}
                  <div className="col-span-12 lg:col-span-5 space-y-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-[Newsreader] text-xl text-primary">Achados da Auditoria</h3>
                    </div>
                    {achados.map((a) => {
                      const sev = severityConfig[a.severidade] || severityConfig.formal;
                      const isSelected = selectedAchado?.id === a.id;
                      return (
                        <div key={a.id}
                          onClick={() => { setSelectedAchado(a); setEditing(false); }}
                          className={`bg-surface-container-lowest p-6 rounded-xl border-l-4 ${sev.border} cursor-pointer transition-all ${
                            isSelected ? 'ring-2 ring-primary/30 shadow-md translate-x-1' : 'hover:bg-surface-container-high opacity-70'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className={`text-[11px] font-bold uppercase tracking-wider ${sev.color}`}>{sev.label}</span>
                            <span className="text-[11px] text-outline">#{a.numero}</span>
                          </div>
                          <h4 className="font-[Inter] text-base font-semibold text-on-surface mb-2 leading-tight">{a.titulo}</h4>
                        </div>
                      );
                    })}
                  </div>

                  {/* Bridge */}
                  <div className="hidden lg:flex col-span-1 h-full items-center justify-center pt-24">
                    <div className="flex flex-col gap-12 items-center opacity-30">
                      <span className="material-symbols-outlined text-primary scale-150">auto_awesome</span>
                      <div className="h-32 w-px bg-gradient-to-b from-primary to-transparent"></div>
                    </div>
                  </div>

                  {/* Right: Detail & Edit */}
                  <div className="col-span-12 lg:col-span-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-[Newsreader] text-xl text-primary">Detalhamento</h3>
                      {selectedAchado && !editing && (
                        <button onClick={startEdit} className="text-[11px] font-bold text-primary flex items-center gap-1 hover:underline">
                          <span className="material-symbols-outlined text-xs">edit</span> EDITAR TEXTOS
                        </button>
                      )}
                    </div>

                    {selectedAchado ? (
                      <div className="bg-surface-container-lowest rounded-2xl p-8 ring-1 ring-outline-variant/10 shadow-sm">
                        {editing ? (
                          <div className="space-y-6">
                            <div>
                              <label className="text-[10px] uppercase font-bold text-outline mb-2 block">Título do Achado</label>
                              <input type="text" value={editForm.titulo} onChange={(e) => setEditForm({...editForm, titulo: e.target.value})}
                                className="w-full bg-surface-bright border border-outline-variant rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] uppercase font-bold text-outline mb-2 block">Alegação da Defesa</label>
                              <textarea value={editForm.alegacao_defesa} onChange={(e) => setEditForm({...editForm, alegacao_defesa: e.target.value})}
                                className="w-full h-40 bg-surface-bright border border-outline-variant rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] uppercase font-bold text-outline mb-2 block">Apontamento da Auditoria</label>
                              <textarea value={editForm.apontamento_auditoria} onChange={(e) => setEditForm({...editForm, apontamento_auditoria: e.target.value})}
                                className="w-full h-40 bg-surface-bright border border-outline-variant rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary outline-none"
                              />
                            </div>
                            <div className="flex gap-3 justify-end pt-4">
                              <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm font-medium hover:bg-surface-container-high rounded-lg transition-all">Cancelar</button>
                              <button onClick={saveEdit} className="px-6 py-2 bg-primary text-white text-sm font-bold rounded-lg shadow-lg shadow-primary/20">Salvar Alterações</button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-8">
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-widest text-primary/60 mb-3 block">Alegação da Defesa</span>
                              <p className="text-[15px] text-on-surface-variant leading-relaxed">"{selectedAchado.alegacao_defesa || 'Sem informação.'}"</p>
                            </div>
                            <div className="pt-8 border-t border-outline-variant/20">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-primary/60 mb-3 block">Apontamento da Auditoria</span>
                              <p className="text-[15px] text-on-surface leading-relaxed">"{selectedAchado.apontamento_auditoria || 'Sem informação.'}"</p>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-outline italic">Selecione um achado para ver o detalhamento.</p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="fixed bottom-0 left-64 right-0 p-8 flex justify-end items-center bg-white/80 backdrop-blur-md border-t border-outline-variant/10 z-20">
                  <button onClick={() => router.push(`/processo/${id}/diretrizes`)}
                    className="px-12 py-3 bg-primary text-white text-sm font-bold rounded-full shadow-xl shadow-primary/30 flex items-center gap-3 hover:scale-[1.05] active:scale-[0.95] transition-all"
                  >
                    Confirmar Análise e Seguir
                    <span className="material-symbols-outlined text-lg">arrow_forward</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
