'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Mode = 'login' | 'forgot';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const initialError = searchParams.get('error');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    setErrorMsg(null);

    const supabase = createClient();
    const redirect = searchParams.get('redirect') ?? '/';
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setStatus('error');
      setErrorMsg(traduzErro(error.message));
      return;
    }

    router.replace(redirect);
    router.refresh();
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    setErrorMsg(null);

    const supabase = createClient();
    // O redirect aponta pro callback com next=set-password, que após
    // exchangeCodeForSession joga o usuário em /set-password.
    const redirectTo =
      `${window.location.origin}/auth/callback?next=set-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });

    if (error) {
      setStatus('error');
      setErrorMsg(traduzErro(error.message));
      return;
    }
    setStatus('sent');
  }

  return (
    <div className="card w-full max-w-md">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-display font-semibold text-primary mb-2">
          Atelier Judicial
        </h1>
        <p className="text-on-surface-variant text-sm">
          Sistema de elaboração de minutas — TCE-PE
        </p>
      </div>

      {initialError === 'unauthorized' && (
        <div className="mb-6 p-4 rounded-xl bg-error-container text-on-surface text-sm">
          Esta conta não tem acesso ao sistema.
        </div>
      )}

      {status === 'sent' ? (
        <div className="text-center py-8">
          <span className="material-symbols-outlined text-5xl text-success mb-3 block">
            mark_email_read
          </span>
          <h2 className="text-lg font-medium mb-2">Link enviado</h2>
          <p className="text-on-surface-variant text-sm">
            Enviamos um link de redefinição para <strong>{email}</strong>.
            Clique nele e você cairá numa tela pra definir a nova senha.
          </p>
          <button
            onClick={() => {
              setStatus('idle');
              setMode('login');
            }}
            className="btn-ghost mt-6"
          >
            Voltar ao login
          </button>
        </div>
      ) : mode === 'forgot' ? (
        <form onSubmit={handleForgot} className="space-y-5">
          <p className="text-sm text-on-surface-variant">
            Informe seu e-mail e enviaremos um link pra você definir uma nova senha.
          </p>
          <div>
            <label htmlFor="email" className="label">E-mail</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="seu@email.com"
              disabled={status === 'submitting'}
            />
          </div>

          {errorMsg && (
            <div className="p-3 rounded-lg bg-error-container text-sm text-on-surface">
              {errorMsg}
            </div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={status === 'submitting'}>
            {status === 'submitting' ? 'Enviando...' : 'Enviar link de redefinição'}
          </button>
          <button
            type="button"
            onClick={() => { setMode('login'); setErrorMsg(null); }}
            className="btn-ghost w-full"
          >
            Voltar ao login
          </button>
        </form>
      ) : (
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label htmlFor="email" className="label">E-mail</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="seu@email.com"
              disabled={status === 'submitting'}
            />
          </div>

          <div>
            <label htmlFor="password" className="label">Senha</label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
              disabled={status === 'submitting'}
            />
          </div>

          {errorMsg && (
            <div className="p-3 rounded-lg bg-error-container text-sm text-on-surface">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={status === 'submitting'}
          >
            {status === 'submitting' ? 'Entrando...' : 'Entrar'}
          </button>

          <button
            type="button"
            onClick={() => { setMode('forgot'); setErrorMsg(null); }}
            className="text-xs text-primary hover:underline w-full text-center mt-3"
          >
            Esqueci minha senha
          </button>
        </form>
      )}
    </div>
  );
}

function traduzErro(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'E-mail ainda não confirmado. Confira sua caixa de entrada.';
  if (m.includes('too many requests')) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  if (m.includes('for security purposes')) return 'Aguarde alguns segundos antes de tentar de novo.';
  return msg;
}
