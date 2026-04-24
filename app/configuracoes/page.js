'use client';
import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import TopNav from '../components/TopNav';
import { supabase } from '../lib/supabase';

export default function ConfiguracoesPage() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [editingKey, setEditingKey] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => { loadConfigs(); }, []);

  async function loadConfigs() {
    const { data } = await supabase.from('configuracoes').select('*').order('chave');
    setConfigs(data || []);
    setLoading(false);
  }

  async function saveConfig(config) {
    setSaving(config.chave);
    const { error } = await supabase.from('configuracoes').update({ valor: config.valor }).eq('id', config.id);
    if (!error) {
      setToast(`"${config.descricao}" salvo com sucesso`);
      setTimeout(() => setToast(null), 3000);
    }
    setSaving(null);
    setEditingKey(null);
  }

  function updateValue(id, newValue) {
    setConfigs(prev => prev.map(c => c.id === id ? { ...c, valor: newValue } : c));
  }

  const configIcons = {
    persona: 'person',
    tom_voz: 'record_voice_over',
    estrutura_analise: 'account_tree',
    formato_ementa: 'description',
    estrutura_decisao: 'gavel',
    proibicoes_vocabulario: 'block',
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="ml-64 flex-1">
        <TopNav />
        <main className="p-12">
          <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-12">
              <h1 className="font-[Newsreader] text-4xl text-primary font-medium mb-2">Configurações</h1>
              <p className="text-on-surface-variant">
                Edite os parâmetros da skill de redação. Estas instruções são usadas pela IA na geração de todas as minutas.
              </p>
            </div>

            {/* Toast */}
            {toast && (
              <div className="fixed top-6 right-6 bg-primary text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2 animate-[fadeIn_0.3s_ease-out]">
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                {toast}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-24">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <div className="space-y-6">
                {configs.map(config => {
                  const icon = configIcons[config.chave] || 'settings';
                  const isEditing = editingKey === config.chave;
                  
                  return (
                    <div key={config.id} className="bg-surface-container-lowest rounded-xl ring-1 ring-outline-variant/10 overflow-hidden">
                      {/* Header */}
                      <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100">
                        <div className="flex items-center gap-4">
                          <span className="material-symbols-outlined text-primary">{icon}</span>
                          <div>
                            <h3 className="font-semibold text-primary text-sm">{config.descricao}</h3>
                            <p className="text-[10px] text-outline uppercase tracking-widest font-bold mt-0.5">{config.chave}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isEditing ? (
                            <>
                              <button onClick={() => setEditingKey(null)}
                                className="px-4 py-1.5 text-xs text-slate-600 border border-slate-200 rounded hover:bg-slate-50 transition-colors"
                              >Cancelar</button>
                              <button onClick={() => saveConfig(config)} disabled={saving === config.chave}
                                className="px-4 py-1.5 text-xs bg-primary text-white rounded font-semibold flex items-center gap-1 disabled:opacity-50"
                              >
                                {saving === config.chave ? (
                                  <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                  <span className="material-symbols-outlined text-xs">save</span>
                                )}
                                Salvar
                              </button>
                            </>
                          ) : (
                            <button onClick={() => setEditingKey(config.chave)}
                              className="px-4 py-1.5 text-xs text-primary border border-primary/20 rounded hover:bg-primary/5 transition-colors flex items-center gap-1"
                            >
                              <span className="material-symbols-outlined text-xs">edit</span>
                              Editar
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {/* Body */}
                      <div className="px-8 py-5">
                        {isEditing ? (
                          <textarea
                            value={config.valor}
                            onChange={(e) => updateValue(config.id, e.target.value)}
                            className="w-full bg-slate-50 p-4 rounded-lg border border-slate-100 focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all text-sm leading-relaxed min-h-[160px] resize-y font-mono"
                            autoFocus
                          />
                        ) : (
                          <div className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap">
                            {config.valor.length > 300 ? config.valor.substring(0, 300) + '...' : config.valor}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* API Keys Section */}
                <div className="bg-surface-container-lowest rounded-xl ring-1 ring-outline-variant/10 overflow-hidden mt-12">
                  <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100">
                    <div className="flex items-center gap-4">
                      <span className="material-symbols-outlined text-on-tertiary-container">key</span>
                      <div>
                        <h3 className="font-semibold text-primary text-sm">Chaves de API</h3>
                        <p className="text-[10px] text-outline uppercase tracking-widest font-bold mt-0.5">Credenciais Externas</p>
                      </div>
                    </div>
                  </div>
                  <div className="px-8 py-5 space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-outline uppercase tracking-wider block mb-2">Google Gemini API Key</label>
                      <div className="flex items-center gap-2">
                        <input type="password" value="••••••••••••" disabled
                          className="flex-1 bg-slate-50 border border-slate-100 rounded px-3 py-2 text-sm text-outline"
                        />
                        <span className="text-[10px] text-on-tertiary-container bg-tertiary-fixed/30 px-2 py-1 rounded font-bold">
                          Editar no .env.local
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-outline uppercase tracking-wider block mb-2">Google Cloud (Base Vetorial)</label>
                      <div className="flex items-center gap-2">
                        <input type="password" value="••••••••••••" disabled
                          className="flex-1 bg-slate-50 border border-slate-100 rounded px-3 py-2 text-sm text-outline"
                        />
                        <span className="text-[10px] text-on-tertiary-container bg-tertiary-fixed/30 px-2 py-1 rounded font-bold">
                          credencial_gcp.json
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Vector DB Info */}
                <div className="bg-surface-container-lowest rounded-xl ring-1 ring-outline-variant/10 overflow-hidden">
                  <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100">
                    <div className="flex items-center gap-4">
                      <span className="material-symbols-outlined text-primary">database</span>
                      <div>
                        <h3 className="font-semibold text-primary text-sm">Base Vetorial — Vertex AI Search</h3>
                        <p className="text-[10px] text-outline uppercase tracking-widest font-bold mt-0.5">Precedentes do Conselheiro</p>
                      </div>
                    </div>
                  </div>
                  <div className="px-8 py-5">
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-[10px] font-bold text-outline uppercase tracking-wider block mb-1">Projeto GCP</span>
                        <span className="text-on-surface font-mono">uptemporada</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-outline uppercase tracking-wider block mb-1">Data Store</span>
                        <span className="text-on-surface font-mono text-xs">tceandressa_1775759460294</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-outline uppercase tracking-wider block mb-1">App ID</span>
                        <span className="text-on-surface font-mono text-xs">tceandressa_1775759242362</span>
                      </div>
                    </div>
                    <p className="text-xs text-on-surface-variant mt-4 italic">
                      A base vetorial é consultada automaticamente durante a geração da minuta para alinhar o estilo e referenciar precedentes do Conselheiro.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
