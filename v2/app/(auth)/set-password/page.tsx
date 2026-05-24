'use client';

/**
 * Página acessível por qualquer usuário logado pra definir/redefinir a senha.
 * É pra onde o callback redireciona quando o usuário vem de um link de
 * recovery, e também pode ser linkada manualmente pelo painel.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function SetPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setEmail(data.user.email ?? null);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (password.length < 8) {
      setErrorMsg('A senha precisa ter ao menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setErrorMsg('As senhas não coincidem.');
      return;
    }

    setStatus('submitting');
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setStatus('error');
      setErrorMsg(error.message);
      return;
    }
    setStatus('done');
    setTimeout(() => {
      router.replace('/');
      router.refresh();
    }, 1200);
  }

  return (
    <div className="card w-full max-w-md">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-display font-semibold text-primary mb-2">
          Definir senha
        </h1>
        {email && (
          <p className="text-on-surface-variant text-sm">
            Conectado como <strong>{email}</strong>
          </p>
        )}
      </div>

      {status === 'done' ? (
        <div className="text-center py-8">
          <span className="material-symbols-outlined text-5xl text-success mb-3 block">
            check_circle
          </span>
          <h2 className="text-lg font-medium mb-2">Senha definida</h2>
          <p className="text-on-surface-variant text-sm">
            Redirecionando...
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="password" className="label">Nova senha</label>
            <input
              id="password"
              type="password"
              required
              autoComplete="new-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="no mínimo 8 caracteres"
              disabled={status === 'submitting'}
            />
          </div>

          <div>
            <label htmlFor="confirm" className="label">Confirmar senha</label>
            <input
              id="confirm"
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="input"
              placeholder="digite de novo"
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
            {status === 'submitting' ? 'Salvando...' : 'Salvar senha'}
          </button>
        </form>
      )}
    </div>
  );
}
