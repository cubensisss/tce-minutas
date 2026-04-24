'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '../components/Sidebar';
import TopNav from '../components/TopNav';
import { supabase } from '../lib/supabase';

export default function NovoProcesso() {
  const router = useRouter();
  const [form, setForm] = useState({ numero: '', unidade_jurisdicionada: '', exercicio: '', interessados: '', descricao_objeto: '' });
  const [auditFiles, setAuditFiles] = useState([]);
  const [defesaFiles, setDefesaFiles] = useState([]);
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function handleDrop(type) {
    return (e) => {
      e.preventDefault();
      e.currentTarget.classList.remove('ring-primary', 'bg-primary/5');
      const files = Array.from(e.dataTransfer?.files || e.target.files || []);
      if (type === 'auditoria') setAuditFiles((prev) => [...prev, ...files]);
      else setDefesaFiles((prev) => [...prev, ...files]);
    };
  }

  function removeFile(type, index) {
    if (type === 'auditoria') {
      setAuditFiles(prev => prev.filter((_, i) => i !== index));
    } else {
      setDefesaFiles(prev => prev.filter((_, i) => i !== index));
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('ring-primary', 'bg-primary/5');
  }

  function handleDragLeave(e) {
    e.currentTarget.classList.remove('ring-primary', 'bg-primary/5');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.numero || !form.unidade_jurisdicionada) return;
    setLoading(true);

    // 1. Create processo
    const { data: processo, error } = await supabase
      .from('processos')
      .insert([{ ...form, status: 'upload' }])
      .select()
      .single();

    if (error || !processo) {
      alert('Erro ao criar processo: ' + (error?.message || 'Desconhecido'));
      setLoading(false);
      return;
    }

    // 2. Upload files to Supabase Storage
    const allFiles = [
      ...auditFiles.map((f) => ({ file: f, tipo: 'auditoria' })),
      ...defesaFiles.map((f) => ({ file: f, tipo: 'defesa' })),
    ];

    for (const { file, tipo } of allFiles) {
      const path = `${processo.id}/${tipo}/${file.name}`;
      await supabase.storage.from('documentos').upload(path, file);
      await supabase.from('documentos').insert([{
        processo_id: processo.id,
        tipo,
        nome_arquivo: file.name,
        storage_path: path,
      }]);
    }

    // 3. Trigger extraction (will be handled by API route)
    await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ processoId: processo.id }),
    });

    setLoading(false);
    router.push(`/processo/${processo.id}/resumo`);
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="ml-64 flex-1">
        <TopNav />
        <main className="p-12">
          <div className="max-w-5xl mx-auto">
            {/* Header */}
            <div className="mb-12">
              <h1 className="font-[Newsreader] text-4xl text-primary font-medium mb-2">Novo Processo</h1>
              <p className="text-on-surface-variant">Cadastre os dados do processo e faça upload dos documentos para iniciar a análise.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-10">
              {/* Process Info */}
              <section className="bg-surface-container-lowest p-8 rounded-xl ring-1 ring-outline-variant/10">
                <h2 className="font-[Newsreader] text-xl text-primary mb-6">Dados do Processo</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-primary mb-2">Número do Processo *</label>
                    <input type="text" name="numero" value={form.numero} onChange={handleChange} required
                      placeholder="Ex: 24100654-5"
                      className="w-full bg-surface border-0 border-b border-slate-200 focus:border-primary focus:ring-0 text-sm py-2 px-0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-primary mb-2">Unidade Jurisdicionada *</label>
                    <input type="text" name="unidade_jurisdicionada" value={form.unidade_jurisdicionada} onChange={handleChange} required
                      placeholder="Ex: Prefeitura Municipal de Inajá"
                      className="w-full bg-surface border-0 border-b border-slate-200 focus:border-primary focus:ring-0 text-sm py-2 px-0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-primary mb-2">Exercício</label>
                    <input type="text" name="exercicio" value={form.exercicio} onChange={handleChange}
                      placeholder="Ex: 2022 e 2023"
                      className="w-full bg-surface border-0 border-b border-slate-200 focus:border-primary focus:ring-0 text-sm py-2 px-0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-primary mb-2">Interessados</label>
                    <input type="text" name="interessados" value={form.interessados} onChange={handleChange}
                      placeholder="Nomes dos interessados separados por vírgula"
                      className="w-full bg-surface border-0 border-b border-slate-200 focus:border-primary focus:ring-0 text-sm py-2 px-0"
                    />
                  </div>
                </div>
                <div className="mt-6">
                  <label className="block text-sm font-semibold text-primary mb-2">Descrição do Objeto</label>
                  <textarea name="descricao_objeto" value={form.descricao_objeto} onChange={handleChange}
                    placeholder="Objetivo da auditoria..."
                    className="w-full bg-surface border-0 border-b border-slate-200 focus:border-primary focus:ring-0 text-sm py-2 px-0 resize-none h-20"
                  />
                </div>
              </section>

              {/* Document Upload */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Audit Report */}
                <section className="bg-surface-container-lowest p-8 rounded-xl ring-1 ring-outline-variant/10">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="material-symbols-outlined text-primary">description</span>
                    <h2 className="font-[Newsreader] text-xl text-primary">Relatório de Auditoria</h2>
                  </div>
                  <div
                    onDrop={handleDrop('auditoria')}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center transition-all cursor-pointer hover:border-primary/50"
                    onClick={() => document.getElementById('audit-input').click()}
                  >
                    <span className="material-symbols-outlined text-4xl text-outline-variant/40 mb-3 block">cloud_upload</span>
                    <p className="text-sm text-on-surface-variant mb-1">Arraste os PDFs aqui</p>
                    <p className="text-[11px] text-outline">ou clique para selecionar</p>
                    <input id="audit-input" type="file" multiple accept=".pdf,.docx" className="hidden" onChange={handleDrop('auditoria')} />
                  </div>
                  {auditFiles.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {auditFiles.map((f, i) => (
                        <div key={i} className="flex items-center justify-between bg-surface-container-low p-2 px-4 rounded-lg text-sm">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm text-primary">check_circle</span>
                            <span className="text-on-surface">{f.name}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] text-outline">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                            <button
                              type="button"
                              onClick={() => removeFile('auditoria', i)}
                              className="text-error hover:text-red-700 bg-error/10 hover:bg-error/20 rounded-full w-6 h-6 flex items-center justify-center transition-colors"
                              title="Remover arquivo"
                            >
                              <span className="material-symbols-outlined text-[16px]">close</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Defense */}
                <section className="bg-surface-container-lowest p-8 rounded-xl ring-1 ring-outline-variant/10">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="material-symbols-outlined text-primary">shield</span>
                    <h2 className="font-[Newsreader] text-xl text-primary">Defesa Prévia</h2>
                  </div>
                  <div
                    onDrop={handleDrop('defesa')}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center transition-all cursor-pointer hover:border-primary/50"
                    onClick={() => document.getElementById('defesa-input').click()}
                  >
                    <span className="material-symbols-outlined text-4xl text-outline-variant/40 mb-3 block">cloud_upload</span>
                    <p className="text-sm text-on-surface-variant mb-1">Arraste os PDFs aqui</p>
                    <p className="text-[11px] text-outline">ou clique para selecionar</p>
                    <input id="defesa-input" type="file" multiple accept=".pdf,.docx" className="hidden" onChange={handleDrop('defesa')} />
                  </div>
                  {defesaFiles.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {defesaFiles.map((f, i) => (
                        <div key={i} className="flex items-center justify-between bg-surface-container-low p-2 px-4 rounded-lg text-sm">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm text-primary">check_circle</span>
                            <span className="text-on-surface">{f.name}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] text-outline">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                            <button
                              type="button"
                              onClick={() => removeFile('defesa', i)}
                              className="text-error hover:text-red-700 bg-error/10 hover:bg-error/20 rounded-full w-6 h-6 flex items-center justify-center transition-colors"
                              title="Remover arquivo"
                            >
                              <span className="material-symbols-outlined text-[16px]">close</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              {/* Submit */}
              <div className="flex justify-between items-center pt-8 border-t border-slate-200">
                <button type="button" onClick={() => router.push('/')}
                  className="px-8 py-3 rounded border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50 transition-colors text-sm"
                >Cancelar</button>
                <button type="submit" disabled={loading}
                  className="px-12 py-3 rounded bg-primary text-white font-bold text-lg shadow-xl shadow-primary/20 flex items-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Processando...
                    </>
                  ) : (
                    <>
                      Processar Documentos
                      <span className="material-symbols-outlined">auto_awesome</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
