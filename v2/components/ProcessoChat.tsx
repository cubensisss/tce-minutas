'use client';

/**
 * Painel de chat sobre o processo, embaixo da minuta. Carrega o
 * histórico (GET), permite enviar nova mensagem (POST) e limpar (DELETE).
 *
 * Latência típica: ~3-8s por turno (Gemini Flash + contexto carregado).
 * O input fica desabilitado durante a chamada.
 */
import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/schemas/chat';

type Props = {
  processoId: string;
};

const SUGESTOES = [
  'Liste os principais argumentos da defesa que ainda não foram enfrentados.',
  'A multa proposta está adequada à gravidade? Por quê?',
  'Quais agravantes ou atenuantes da LINDB se aplicam aqui?',
  'Há nexo de causalidade suficiente para responsabilizar todos os indicados?',
  'O que a jurisprudência recente do TCE-PE diz sobre casos similares?',
];

export default function ProcessoChat({ processoId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Carrega histórico ao montar
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/processo/${processoId}/chat`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) {
          setMessages(Array.isArray(j.messages) ? j.messages : []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [processoId]);

  // Auto-scroll quando chega mensagem nova
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, sending]);

  async function send(message?: string) {
    const text = (message ?? input).trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    setInput('');
    // Otimista: adiciona a mensagem do usuário antes da resposta chegar
    const optimistic: ChatMessage = {
      role: 'user',
      content: text,
      ts: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await fetch(`/api/processo/${processoId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'erro ao enviar');
      setMessages(j.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'erro');
      // Reverte a mensagem otimista
      setMessages((prev) => prev.filter((m) => m !== optimistic));
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  async function clear() {
    if (!confirm('Apagar todo o histórico do chat?')) return;
    const res = await fetch(`/api/processo/${processoId}/chat`, { method: 'DELETE' });
    if (res.ok) setMessages([]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    }
  }

  return (
    <section className="card space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl text-primary flex items-center gap-2">
            <span className="material-symbols-outlined text-base">forum</span>
            Conversar sobre o processo
          </h2>
          <p className="text-sm text-on-surface-variant mt-1">
            Tire dúvidas, explore o mérito, peça verificações. O assistente
            tem o resumo, as diretrizes, a minuta e os precedentes na janela
            de contexto.
          </p>
        </div>
        {messages.length > 0 && (
          <button onClick={clear} className="btn-ghost text-sm" title="Limpar histórico">
            <span className="material-symbols-outlined text-base">delete</span>
            Limpar
          </button>
        )}
      </header>

      {loading ? (
        <div className="text-on-surface-variant text-sm">Carregando histórico...</div>
      ) : (
        <>
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-on-surface-variant">Sugestões para começar:</p>
              <div className="flex flex-wrap gap-2">
                {SUGESTOES.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-xs px-3 py-2 rounded-full border border-outline-variant hover:border-primary hover:bg-primary-container/30 transition-colors"
                    disabled={sending}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.length > 0 && (
            <div
              ref={scrollRef}
              className="max-h-[480px] overflow-y-auto space-y-3 pr-2"
            >
              {messages.map((m, i) => (
                <Bubble key={i} message={m} />
              ))}
              {sending && (
                <div className="flex items-center gap-2 text-on-surface-variant text-sm py-2">
                  <span className="material-symbols-outlined animate-spin text-primary text-base">progress_activity</span>
                  Pensando...
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-error-container/40 text-sm">{error}</div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              className="input flex-1 min-h-[64px] resize-y"
              placeholder="Pergunte algo sobre o mérito... (Ctrl/⌘+Enter pra enviar)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={sending}
              rows={2}
            />
            <button
              onClick={() => send()}
              className="btn-primary"
              disabled={sending || input.trim().length === 0}
              title="Enviar (Ctrl/⌘+Enter)"
            >
              {sending ? (
                <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
              ) : (
                <>
                  <span className="material-symbols-outlined text-base">send</span>
                  Enviar
                </>
              )}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm whitespace-pre-line leading-relaxed ${
          isUser
            ? 'bg-primary text-on-primary'
            : 'bg-surface-variant text-on-surface'
        }`}
      >
        {!isUser && (
          <p className="text-xs uppercase tracking-wide opacity-70 mb-1.5 font-medium">
            Assistente
          </p>
        )}
        {message.content}
      </div>
    </div>
  );
}
