/**
 * Callback de auth. Suporta:
 *  - magic link normal (?code=...) → exchangeCodeForSession → redirect
 *  - recovery / reset de senha (?code=...&type=recovery ou ?next=set-password)
 *    → exchangeCodeForSession → /set-password
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const redirect = searchParams.get('redirect') ?? '/';
  const type = searchParams.get('type');
  const next = searchParams.get('next');

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  // Se for fluxo de recovery, força redefinir a senha antes de qualquer coisa.
  if (type === 'recovery' || next === 'set-password') {
    return NextResponse.redirect(`${origin}/set-password`);
  }

  return NextResponse.redirect(`${origin}${redirect}`);
}
