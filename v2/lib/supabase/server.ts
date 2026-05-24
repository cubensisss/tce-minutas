/**
 * Supabase clients para uso no servidor (route handlers, server components).
 *
 * - createServerClient(): respeita a sessão do usuário via cookies. Usa anon key.
 * - createServiceClient(): bypassa RLS. Usar apenas para tarefas de manutenção
 *   (migrações de dados, jobs internos). Nunca em rotas que respondem ao cliente
 *   sem checagem prévia de auth.
 */
import { createServerClient as createSSRServerClient } from '@supabase/ssr';
import { createClient as createSbClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getEnv } from '@/lib/env';

export async function createServerClient() {
  const env = getEnv();
  const cookieStore = await cookies();

  return createSSRServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components não podem setar cookies — middleware cuida disso
        }
      },
    },
  });
}

export function createServiceClient() {
  const env = getEnv();
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY ausente — não é possível criar service client');
  }
  return createSbClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
