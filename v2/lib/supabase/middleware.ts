/**
 * Helper usado pelo middleware.ts do Next para refrescar a sessão Supabase
 * em cada request e bloquear acesso a rotas autenticadas.
 *
 * Single-user: além de exigir sessão válida, comparamos o e-mail com
 * ALLOWED_USER_EMAIL — qualquer outra conta cai no login.
 */
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getEnv, isEmailAllowed } from '@/lib/env';

const PUBLIC_PATHS = ['/login', '/auth/callback', '/api/health'];

export async function updateSession(request: NextRequest) {
  const env = getEnv();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANTE: getUser() força refresh do token se necessário.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'));

  // Sem usuário → manda pro login
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', path);
    return NextResponse.redirect(url);
  }

  // Usuário com e-mail fora da whitelist → derruba sessão
  if (user && !isEmailAllowed(user.email)) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('error', 'unauthorized');
    return NextResponse.redirect(url);
  }

  // Usuário logado tentando acessar /login → manda pro dashboard
  if (user && path === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return response;
}
