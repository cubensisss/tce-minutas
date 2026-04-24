'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Sidebar from '../../../components/Sidebar';
import TopNav from '../../../components/TopNav';
import StepIndicator from '../../../components/StepIndicator';
import { supabase } from '../../../lib/supabase';

export default function DiretrizesPage() {
  const { id } = useParams();
  const router = useRouter();
  const [processo, setProcesso] = useState(null);
  const [achados, setAchados] = useState([]);
  const [diretrizGeral, setDiretrizGeral] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    const { data: proc } = await supabase.from('processos').select('*').eq('id', id).single();
    const { data: ach } = await supabase.from('achados').select('*').eq('processo_id', id).order('ordem');
    setProcesso(proc);
    setAchados(ach || []);
    setLoading(false);
  }

  function updateAchado(achadoId, field, value) {
    setAchados((prev) => prev.map((a) => a.id === achadoId ? { ...a, [field]: value } : a));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);

    // Save each achado
    for (const a of achados) {
      await supabase.from('achados').update({
        resultado: a.resultado,
        aplicar_multa: a.aplicar_multa,
        valor_debito: a.valor_debito,
        diretriz_usuario: a.diretriz_usuario,
      }).eq('id', a.id);
    }

    // Update status
    await supabase.from('processos').update({ status: 'minuta' }).eq('id', id);

    // Trigger minuta generation
    const resGerar = await fetch('/api/minuta/gerar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ processoId: id, diretrizGeral }),
    });

    if (!resGerar.ok) {
      const text = await resGerar.text();
      let msg = 'Falha na requisição da IA (Timeout ou 500)';
      try {
        const errData = JSON.parse(text);
        msg = errData.error || errData.message || msg;
      } catch(e) {
        msg = text.substring(0, 100);
      }
      alert('Erro ao gerar minuta: ' + msg);
      setSaving(false);
      return; // Do not redirect if failed
    }

    setSaving(false);
    router.push(`/processo/${id}/minuta`);
  }

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
    <div className="flex min-h-screen">
      <Sidebar processoId={id} processoNumero={processo?.numero} />
      <div className="ml-64 flex-1">
        <TopNav />
        <main className="p-12 bg-surface">
          <div className="max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex justify-between items-end mb-8">
              <div className="max-w-2xl">
                <h1 className="font-[Newsreader] text-4xl text-primary mb-2">Diretrizes do Julgamento</h1>
                <p className="text-on-surface-variant">Defina os resultados, sanções e observações para cada achado identificado.</p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold block mb-1">Progresso</span>
                <span className="font-[Newsreader] text-primary">Etapa 3 de 5</span>
              </div>
            </div>

            {/* Stepper */}
            <div className="flex items-center gap-4 mb-16">
              {[1,2,3,4,5].map((s) => (
                <div key={s} className={`h-1 flex-1 ${s <= 3 ? 'bg-primary' : 'bg-surface-container-high'} relative`}>
                  {s === 3 && <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-primary ring-4 ring-surface-tint/20"></div>}
                </div>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-12 pb-32">
              {achados.map((achado, idx) => (
                <section key={achado.id} className="bg-surface-container-lowest p-8 rounded-xl ring-1 ring-outline-variant/10">
                  <div className="flex gap-12 items-start">
                    <div className="flex-shrink-0 w-12 h-12 bg-slate-50 flex items-center justify-center border border-slate-100 font-[Newsreader] font-bold text-xl text-primary">
                      {String(idx + 1).padStart(2, '0')}
                    </div>
                    <div className="flex-1 space-y-8">
                      <header>
                        <h3 className="font-[Newsreader] text-xl text-primary mb-1">{achado.titulo}</h3>
                        <p className="text-[10px] text-slate-500 uppercase font-medium tracking-wider">Achado {achado.numero}</p>
                      </header>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {/* Resultado */}
                        <div className="space-y-4">
                          <label className="block text-sm font-semibold text-primary">Resultado</label>
                          <div className="space-y-2">
                            {[
                              { value: 'irregular', label: 'Irregular' },
                              { value: 'irregular_debito', label: 'Irregular com Débito' },
                              { value: 'regular_ressalvas', label: 'Regular com Ressalvas' },
                              { value: 'regular', label: 'Regular' },
                            ].map((opt) => (
                              <label key={opt.value} className="flex items-center gap-3 p-3 rounded bg-surface border border-transparent hover:border-outline-variant transition-all cursor-pointer">
                                <input type="radio" name={`res-${achado.id}`} value={opt.value}
                                  checked={achado.resultado === opt.value}
                                  onChange={() => updateAchado(achado.id, 'resultado', opt.value)}
                                  className="text-primary focus:ring-primary h-4 w-4"
                                />
                                <span className="text-sm font-medium">{opt.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* Sanções */}
                        <div className="space-y-4">
                          <label className="block text-sm font-semibold text-primary">Medidas Sancionatórias</label>
                          <div className="space-y-4">
                            <label className="flex items-center gap-3 cursor-pointer">
                              <input type="checkbox"
                                checked={achado.aplicar_multa || false}
                                onChange={(e) => updateAchado(achado.id, 'aplicar_multa', e.target.checked)}
                                className="rounded text-primary focus:ring-primary h-5 w-5"
                              />
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">Aplicação de Multa</span>
                                <span className="text-[11px] text-slate-500">Art. 73, LOTCE</span>
                              </div>
                            </label>
                            <div>
                              <label className="text-sm font-medium text-on-surface-variant block mb-1">Valor do Débito (R$)</label>
                              <input type="number" step="0.01"
                                value={achado.valor_debito || ''}
                                onChange={(e) => updateAchado(achado.id, 'valor_debito', parseFloat(e.target.value) || 0)}
                                placeholder="0,00"
                                className="w-full bg-surface border-0 border-b border-slate-200 focus:border-primary focus:ring-0 text-sm py-2 px-0"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Observações */}
                        <div className="space-y-4">
                          <label className="block text-sm font-semibold text-primary">Observações Específicas</label>
                          <textarea
                            value={achado.diretriz_usuario || ''}
                            onChange={(e) => updateAchado(achado.id, 'diretriz_usuario', e.target.value)}
                            placeholder="Fundamentação técnica para este achado..."
                            className="w-full bg-surface border-0 border-b border-slate-200 focus:border-primary focus:ring-0 text-sm h-32 py-2 px-0 resize-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              ))}

              {/* Global Directives */}
              <div className="bg-primary p-1 rounded-xl shadow-lg shadow-primary/10">
                <div className="bg-surface-container-lowest p-8 rounded-lg space-y-6">
                  <div className="flex items-center gap-4 mb-4">
                    <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>gavel</span>
                    <h2 className="font-[Newsreader] text-2xl text-primary">Diretrizes Gerais</h2>
                  </div>
                  <p className="text-sm text-slate-600 max-w-2xl leading-relaxed">
                    Instruções globais para a fundamentação de todos os achados ou do relatório final.
                  </p>
                  <div className="relative">
                    <textarea value={diretrizGeral} onChange={(e) => setDiretrizGeral(e.target.value)}
                      className="w-full min-h-[160px] bg-slate-50 p-6 rounded-lg border border-slate-100 focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all text-sm leading-relaxed"
                      placeholder="Ex: Aplicar a LINDB (Art. 20 a 30) em todos os achados sancionatórios..."
                    />
                    <div className="absolute bottom-4 right-4 flex gap-2">
                      <span className="bg-white px-2 py-1 rounded text-[10px] border border-slate-200 text-slate-400 font-bold">LINDB</span>
                      <span className="bg-white px-2 py-1 rounded text-[10px] border border-slate-200 text-slate-400 font-bold">JURISPRUDÊNCIA</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-between items-center pt-8 border-t border-slate-200">
                <button type="button" onClick={() => router.push(`/processo/${id}/resumo`)}
                  className="px-8 py-3 rounded border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50 transition-colors text-sm"
                >Voltar para Análise</button>
                <div className="flex gap-4">
                  <button type="button"
                    className="px-8 py-3 rounded border border-primary text-primary font-semibold hover:bg-primary/5 transition-colors text-sm"
                  >Salvar Rascunho</button>
                  <button type="submit" disabled={saving}
                    className="px-12 py-3 rounded bg-primary text-white font-bold text-lg shadow-xl shadow-primary/20 flex items-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    {saving ? 'Gerando...' : 'Gerar Minuta'}
                    <span className="material-symbols-outlined">auto_awesome</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
