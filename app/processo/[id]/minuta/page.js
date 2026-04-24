'use client';
import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Sidebar from '../../../components/Sidebar';
import TopNav from '../../../components/TopNav';
import { supabase } from '../../../lib/supabase';
import ReactMarkdown from 'react-markdown';

export default function MinutaPage() {
  const { id } = useParams();
  const [processo, setProcesso] = useState(null);
  const [minuta, setMinuta] = useState(null);
  const [achados, setAchados] = useState([]);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [activeSection, setActiveSection] = useState('ementa');
  const [chatWidth, setChatWidth] = useState(380);
  const [applying, setApplying] = useState(false);
  const [pendingSugestao, setPendingSugestao] = useState(null); // { secao, texto }
  const [exporting, setExporting] = useState(false);
  const [editingSection, setEditingSection] = useState(null); // 'ementa' | 'analise_completa' | 'decisao_voto'
  const [editContent, setEditContent] = useState('');
  const chatEndRef = useRef(null);

  useEffect(() => { loadData(); loadMessages(); }, [id]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function loadData() {
    const { data: proc } = await supabase.from('processos').select('*').eq('id', id).maybeSingle();
    
    const { data: minList, error: minErr } = await supabase
      .from('minutas')
      .select('*')
      .eq('processo_id', id)
      .order('versao', { ascending: false })
      .limit(1);
    
    const { data: ach } = await supabase.from('achados').select('*').eq('processo_id', id).order('ordem');
    
    setProcesso(proc);
    setMinuta(minList && minList.length > 0 ? minList[0] : null);
    setAchados(ach || []);
  }

  async function loadMessages() {
    const { data } = await supabase.from('chat_mensagens').select('*').eq('processo_id', id).order('created_at');
    setMessages(data || []);
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!chatInput.trim()) return;
    setSending(true);

    // Save user message
    await supabase.from('chat_mensagens').insert([{ processo_id: id, role: 'user', conteudo: chatInput }]);

    // Call AI
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ processoId: id, message: chatInput }),
    });
    const data = await res.json();

    // Save AI response
    if (data.response) {
      await supabase.from('chat_mensagens').insert([{ processo_id: id, role: 'assistant', conteudo: data.response }]);
    }

    // Handle suggestion from AI
    if (data.sugestao) {
      if (data.sugestao.pronto_para_aplicar) {
        // AI detected user confirmed — auto-apply
        await applyMinuta(data.sugestao.secao, data.sugestao.texto);
      } else {
        // Hold the suggestion for manual approval
        setPendingSugestao(data.sugestao);
      }
    }

    setChatInput('');
    await loadMessages();
    setSending(false);
  }

  async function applyMinuta(secao, texto) {
    setApplying(true);
    const res = await fetch('/api/minuta/aplicar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ processoId: id, secao, texto }),
    });
    if (res.ok) {
      setPendingSugestao(null);
      await loadData();
    } else {
      const err = await res.json().catch(() => ({}));
      alert('Erro ao aplicar: ' + (err.error || 'Desconhecido'));
    }
    setApplying(false);
  }

  async function exportDocx() {
    setExporting(true);
    try {
      // Usamos um link direto com GET para que o browser trate o download nativamente.
      // Isso resolve problemas de navegadores que ignoram o nome do arquivo em blobs.
      window.location.assign(`/api/minuta/exportar?id=${id}`);
      
      // Pequeno timeout apenas para o estado visual de "carregando"
      setTimeout(() => setExporting(false), 2000);
    } catch (err) {
      alert('Erro ao exportar: ' + err.message);
      setExporting(false);
    }
  }

  function scrollToSection(sectionId) {
    setActiveSection(sectionId);
    const element = document.getElementById(`section-${sectionId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async function startEdit(secao, content) {
    setEditingSection(secao);
    setEditContent(content);
  }

  async function saveEdit() {
    if (!editingSection) return;
    setApplying(true);
    const res = await fetch('/api/minuta/aplicar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ processoId: id, secao: editingSection, texto: editContent }),
    });
    if (res.ok) {
      setEditingSection(null);
      await loadData();
    } else {
      const err = await res.json().catch(() => ({}));
      alert('Erro ao salvar: ' + (err.error || 'Desconhecido'));
    }
    setApplying(false);
  }

  const outlineSections = [
    { key: 'ementa', label: 'Ementa', num: '01' },
    { key: 'relatorio', label: 'Relatório', num: '02' },
    { key: 'analise_completa', label: 'Fundamentação (Voto)', num: '03' },
    { key: 'decisao_voto', label: 'Dispositivo (Decisão)', num: '04' },
  ];

  // Simple markdown to HTML converter that handles headings and paragraphs correctly
  function renderMarkdown(text) {
    if (!text) return '';
    
    // Process sections separated by double newlines
    const blocks = text.split(/\n\n+/);
    
    return blocks.map(block => {
      block = block.trim();
      if (!block) return '';

      // Headings
      if (block.startsWith('### ')) {
        return `<h3 class="text-xl font-bold italic mb-4 border-b border-primary/20 pb-2 mt-8">${block.substring(4)}</h3>`;
      }
      if (block.startsWith('#### ')) {
        return `<h4 class="text-base font-semibold italic text-on-surface-variant mt-6 mb-2">${block.substring(5)}</h4>`;
      }

      // Inline formatting
      const sanitized = block
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/"([^"]+)"/g, '<em class="text-on-surface-variant">"$1"</em>');

      return `<p class="text-justify mb-4">${sanitized}</p>`;
    }).join('');
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar processoId={id} processoNumero={processo?.numero} />
      <div className="ml-64 flex-1 flex flex-col h-screen overflow-hidden">
        <TopNav />
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Outline */}
          <div className="w-64 border-r border-outline-variant/20 p-6 overflow-y-auto flex-shrink-0">
            <h3 className="font-[Newsreader] text-lg mb-6">Sumário da Minuta</h3>
            <ul className="space-y-4">
              {outlineSections.map((s) => (
                <li key={s.key}
                  onClick={() => scrollToSection(s.key)}
                  className={`flex items-center gap-3 cursor-pointer transition-colors ${
                    activeSection === s.key ? '' : 'text-on-surface-variant hover:text-primary'
                  }`}
                >
                  <span className={`w-6 h-6 rounded-full text-[10px] flex items-center justify-center font-bold ${
                    activeSection === s.key ? 'bg-primary text-white' : 'border border-outline font-medium'
                  }`}>{s.num}</span>
                  <span className={`text-sm ${activeSection === s.key ? 'font-semibold text-primary' : ''}`}>{s.label}</span>
                </li>
              ))}
            </ul>
            <div className="mt-12">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-4">Progresso do Voto</p>
              <div className="w-full bg-surface-container-high h-1 rounded-full overflow-hidden">
                <div className="bg-primary h-full w-full"></div>
              </div>
              <p className="text-[11px] mt-2 text-primary font-semibold">
                {minuta ? '100% Completo • Revisão Final' : 'Aguardando geração...'}
              </p>
            </div>
          </div>

          {/* Center: Editor */}
          <div className="flex-1 flex flex-col overflow-hidden bg-surface-container-low">
            {/* Toolbar */}
            <div className="glass-header border-b border-outline-variant/10 px-8 py-3 flex justify-between items-center z-10 flex-shrink-0">
              <div className="flex items-center gap-1">
                <button className="p-2 hover:bg-surface-container-high rounded transition-colors"><span className="material-symbols-outlined text-lg">format_bold</span></button>
                <button className="p-2 hover:bg-surface-container-high rounded transition-colors"><span className="material-symbols-outlined text-lg">format_italic</span></button>
                <button className="p-2 hover:bg-surface-container-high rounded transition-colors"><span className="material-symbols-outlined text-lg">format_underlined</span></button>
                <div className="w-px h-6 bg-outline-variant/30 mx-2"></div>
                <button className="p-2 hover:bg-surface-container-high rounded transition-colors"><span className="material-symbols-outlined text-lg">format_align_justify</span></button>
              </div>
              <div className="flex items-center gap-3">
                <button className="text-sm font-medium px-4 py-2 hover:bg-surface-container-high transition-colors">Salvar Rascunho</button>
                <button onClick={exportDocx} disabled={exporting}
                  className="text-sm font-semibold bg-primary text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50"
                >
                  {exporting ? 'Gerando...' : 'Exportar DOCX'} <span className="material-symbols-outlined text-sm">description</span>
                </button>
              </div>
            </div>

             {/* Document */}
            <div className="flex-1 overflow-y-auto p-12 flex flex-col items-center bg-surface-container-low pb-60">
              <article className="w-full max-w-4xl bg-white shadow-[0_30px_60px_rgba(0,0,0,0.12)] p-24 font-[Newsreader] text-lg leading-relaxed text-on-surface mb-32 relative z-0">
                {minuta ? (
                  <>
                    <div className="text-center mb-12">
                      <h1 className="text-2xl font-bold uppercase mb-2">Tribunal de Contas do Estado de Pernambuco</h1>
                      <p className="font-[Inter] italic text-sm mb-8">Gabinete do Conselheiro Relator</p>
                    </div>
                    <div className="mb-12 border-b border-primary/10 pb-8">
                      <h2 className="text-xl font-bold uppercase mb-4 text-center">IDENTIFICAÇÃO DO PROCESSO</h2>
                      <p className="font-bold text-sm mb-1">PROCESSO TCE-PE N° {processo?.numero}</p>
                      <p className="font-bold text-sm mb-1">RELATOR: CONSELHEIRO {processo?.relator?.toUpperCase() || 'RODRIGO NOVAES'}</p>
                      <p className="font-bold text-sm mb-1">MODALIDADE - TIPO: Auditoria Especial - Conformidade - {processo?.exercicio || '2022 e 2023'}</p>
                      <p className="font-bold text-sm mb-1">UNIDADE(S) JURISDICIONADA(S): {processo?.unidade_jurisdicionada}</p>
                      <div className="font-bold text-sm mt-4">
                        <p>INTERESSADOS:</p>
                        <p className="font-normal mt-2 whitespace-pre-line">{processo?.interessados}</p>
                      </div>
                    </div>
                               {/* Ementa Section */}
                    <div id="section-ementa" className="mb-12 group relative scroll-mt-20">
                      <div className="flex justify-between items-center mb-4 border-b border-primary/20 pb-2">
                        <h2 className="text-xl font-bold uppercase">EMENTA</h2>
                        {editingSection === 'ementa' ? (
                          <div className="flex gap-2">
                            <button onClick={saveEdit} className="text-xs bg-primary text-white px-2 py-1 rounded">Salvar</button>
                            <button onClick={() => setEditingSection(null)} className="text-xs bg-surface-container-high px-2 py-1 rounded">Cancelar</button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit('ementa', minuta.ementa)} className="opacity-0 group-hover:opacity-100 text-xs text-primary flex items-center gap-1 transition-opacity">
                            <span className="material-symbols-outlined text-xs">edit</span> Editar
                          </button>
                        )}
                      </div>
                      {editingSection === 'ementa' ? (
                        <textarea 
                          value={editContent} 
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full h-[500px] p-8 font-mono text-sm border-2 border-primary/30 rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all shadow-inner bg-surface-bright"
                        />
                      ) : (
                        <div className="italic" dangerouslySetInnerHTML={{ __html: renderMarkdown(minuta.ementa) }} />
                      )}
                    </div>

                    {/* Descrição do Objeto Section */}
                    <div id="section-objeto" className="mb-12 group relative scroll-mt-20">
                      <div className="flex justify-between items-center mb-4 border-b border-primary/20 pb-2">
                        <h2 className="text-xl font-bold uppercase">DESCRIÇÃO DO OBJETO</h2>
                      </div>
                      <div className="text-justify mb-4" dangerouslySetInnerHTML={{ __html: renderMarkdown(processo?.descricao_objeto || '') }} />
                    </div>

                    {/* Relatório Section */}
                    <div id="section-relatorio" className="mb-12 group relative scroll-mt-20">
                      <div className="flex justify-between items-center mb-4 border-b border-primary/20 pb-2">
                        <h2 className="text-xl font-bold uppercase">RELATÓRIO</h2>
                        {editingSection === 'relatorio' ? (
                          <div className="flex gap-2">
                            <button onClick={saveEdit} className="text-xs bg-primary text-white px-2 py-1 rounded">Salvar</button>
                            <button onClick={() => setEditingSection(null)} className="text-xs bg-surface-container-high px-2 py-1 rounded">Cancelar</button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit('relatorio', minuta.relatorio || '')} className="opacity-0 group-hover:opacity-100 text-xs text-primary flex items-center gap-1 transition-opacity">
                            <span className="material-symbols-outlined text-xs">edit</span> Editar Relatório
                          </button>
                        )}
                      </div>
                      {editingSection === 'relatorio' ? (
                        <textarea 
                          value={editContent} 
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full h-[600px] p-8 font-mono text-sm border-2 border-primary/30 rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all shadow-inner bg-surface-bright"
                        />
                      ) : (
                        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(minuta.relatorio || 'O relatório ainda não foi gerado.') }} />
                      )}
                    </div>

                    {/* Voto Section */}
                    <div id="section-analise_completa" className="mb-12 group relative scroll-mt-20">
                      <div className="flex-1 flex justify-between items-center mb-4 border-b border-primary/20 pb-2">
                        <h2 className="text-xl font-bold uppercase">VOTO</h2>
                        {editingSection === 'analise_completa' ? (
                          <div className="flex gap-2">
                            <button onClick={saveEdit} className="text-xs bg-primary text-white px-3 py-1.5 rounded-lg shadow-md hover:bg-primary/90 transition-all">Salvar</button>
                            <button onClick={() => setEditingSection(null)} className="text-xs bg-surface-container-high px-3 py-1.5 rounded-lg hover:bg-surface-container-highest transition-all">Cancelar</button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit('analise_completa', minuta.analise_completa)} className="opacity-0 group-hover:opacity-100 text-xs text-primary flex items-center gap-1 transition-all bg-primary/5 hover:bg-primary/10 px-2 py-1 rounded">
                            <span className="material-symbols-outlined text-xs">edit</span> Editar Voto
                          </button>
                        )}
                      </div>
                      {editingSection === 'analise_completa' ? (
                        <textarea 
                          value={editContent} 
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full h-[600px] p-8 font-mono text-sm border-2 border-primary/30 rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all shadow-inner bg-surface-bright"
                        />
                      ) : (
                        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(minuta.analise_completa) }} />
                      )}
                    </div>

                    {/* Decisão Section */}
                    <div id="section-decisao_voto" className="mb-12 group relative scroll-mt-20">
                      <div className="flex justify-between items-center mb-4 border-b border-primary/20 pb-2">
                        <h2 className="text-xl font-bold uppercase">DISPOSITIVO E DECISÃO</h2>
                        {editingSection === 'decisao_voto' ? (
                          <div className="flex gap-2">
                            <button onClick={saveEdit} className="text-xs bg-primary text-white px-3 py-1.5 rounded-lg shadow-md hover:bg-primary/90 transition-all">Salvar</button>
                            <button onClick={() => setEditingSection(null)} className="text-xs bg-surface-container-high px-3 py-1.5 rounded-lg hover:bg-surface-container-highest transition-all">Cancelar</button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit('decisao_voto', minuta.decisao_voto)} className="opacity-0 group-hover:opacity-100 text-xs text-primary flex items-center gap-1 transition-all bg-primary/5 hover:bg-primary/10 px-2 py-1 rounded">
                            <span className="material-symbols-outlined text-xs">edit</span> Editar Decisão
                          </button>
                        )}
                      </div>
                      {editingSection === 'decisao_voto' ? (
                        <textarea 
                          value={editContent} 
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full h-[500px] p-8 font-mono text-sm border-2 border-primary/30 rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all shadow-inner bg-surface-bright"
                        />
                      ) : (
                        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(minuta.decisao_voto) }} />
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-center">
                    <div>
                      <span className="material-symbols-outlined text-5xl text-outline-variant/30 mb-4 block">edit_document</span>
                      <p className="text-on-surface-variant">A minuta será exibida aqui após a geração.</p>
                    </div>
                  </div>
                )}
              </article>
            </div>
          </div>

          {/* Right: Chat */}
          <div 
            style={{ width: `${chatWidth}px` }}
            className="border-l border-outline-variant/20 flex flex-col bg-surface-container-lowest flex-shrink-0 relative transition-none"
          >
            {/* Drag Handle */}
            <div 
              className="absolute top-0 bottom-0 left-0 w-2 -ml-1 cursor-col-resize hover:bg-primary/20 hover:backdrop-blur-sm active:bg-primary/40 z-50 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                const startX = e.clientX;
                const startWidth = chatWidth;
                const onMouseMove = (moveEvent) => {
                  const newWidth = Math.max(280, Math.min(800, startWidth + (startX - moveEvent.clientX)));
                  setChatWidth(newWidth);
                };
                const onMouseUp = () => {
                  document.removeEventListener('mousemove', onMouseMove);
                  document.removeEventListener('mouseup', onMouseUp);
                };
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
              }}
            />
            <div className="p-6 border-b border-outline-variant/10 flex-shrink-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
                <h3 className="font-[Newsreader] font-bold text-primary">Assistente de Voto</h3>
              </div>
              <p className="text-[11px] text-on-surface-variant">Inteligência Artificial Judicial</p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <div className="p-4 border border-outline-variant/30 rounded-xl bg-surface-bright">
                  <p className="text-[10px] uppercase font-bold text-primary tracking-widest mb-3">Sugestões</p>
                  <div className="space-y-2">
                    {['Tornar mais formal', 'Aplicar LINDB', 'Resumir Relatório'].map((sug) => (
                      <button key={sug} onClick={() => setChatInput(sug)}
                        className="w-full text-left p-2 text-[11px] hover:bg-surface-container-high rounded border border-transparent hover:border-outline-variant/30 transition-all flex items-center justify-between"
                      >
                        {sug} <span className="material-symbols-outlined text-xs">chevron_right</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className="flex gap-3">
                  <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center ${
                    m.role === 'user' ? 'bg-surface-container-high' : 'bg-primary'
                  }`}>
                    <span className={`material-symbols-outlined text-[14px] ${m.role === 'assistant' ? 'text-white' : ''}`}
                      style={m.role === 'assistant' ? { fontVariationSettings: "'FILL' 1" } : {}}
                    >
                      {m.role === 'user' ? 'person' : 'auto_awesome'}
                    </span>
                  </div>
                  <div className={`p-3 rounded-lg rounded-tl-none text-xs leading-relaxed ${
                    m.role === 'user' ? 'bg-surface-container-low text-on-surface' : 'bg-primary/5 text-on-surface'
                  }`}>
                    <ReactMarkdown
                      components={{
                        p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                        strong: ({node, ...props}) => <strong className="font-bold text-on-surface" {...props} />,
                        ul: ({node, ...props}) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
                        ol: ({node, ...props}) => <ol className="list-decimal pl-4 mb-2 space-y-1" {...props} />,
                        li: ({node, ...props}) => <li className="" {...props} />
                      }}
                    >
                      {m.conteudo}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={sendMessage} className="p-4 bg-surface-container-low border-t border-outline-variant/10 flex-shrink-0">
              <div className="relative">
                <textarea value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                  className="w-full bg-white border border-outline-variant rounded-xl p-3 pr-10 text-xs focus:ring-1 focus:ring-primary focus:border-primary resize-none h-20"
                  placeholder="Solicitar ajuste (ex: Tornar mais formal)..."
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e); }}}
                />
                <button type="submit" disabled={sending} className="absolute bottom-3 right-3 text-primary disabled:opacity-50">
                  <span className="material-symbols-outlined">{sending ? 'hourglass_top' : 'send'}</span>
                </button>
              </div>
            </form>

            {/* Pending suggestion banner */}
            {pendingSugestao && (
              <div className="p-4 border-t-2 border-primary/30 bg-primary/5 flex-shrink-0">
                <div className="flex items-start gap-2 mb-3">
                  <span className="material-symbols-outlined text-primary text-sm mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>pending_actions</span>
                  <div>
                    <p className="text-[11px] font-bold text-primary uppercase tracking-wider">Alteração Pendente</p>
                    <p className="text-[10px] text-on-surface-variant mt-0.5">
                      Seção: <span className="font-semibold">{{
                        ementa: 'Ementa',
                        analise_completa: 'Análise / Voto',
                        decisao_voto: 'Decisão'
                      }[pendingSugestao.secao] || pendingSugestao.secao}</span>
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => applyMinuta(pendingSugestao.secao, pendingSugestao.texto)}
                    disabled={applying}
                    className="flex-1 py-2 bg-primary text-white text-[11px] font-bold rounded-lg flex items-center justify-center gap-1 hover:bg-primary/90 disabled:opacity-50 transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">check_circle</span>
                    {applying ? 'Aplicando...' : 'Aplicar na Minuta'}
                  </button>
                  <button
                    onClick={() => setPendingSugestao(null)}
                    disabled={applying}
                    className="px-3 py-2 border border-outline-variant text-[11px] font-medium rounded-lg hover:bg-surface-container-high transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
