/**
 * GET  /api/configuracoes — lê todas as configurações da Conselheira
 * PUT  /api/configuracoes — upsert de uma chave: { chave, valor }
 */
import { z } from 'zod';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { loadPersonaConfig } from '@/lib/config/persona';

export const runtime = 'nodejs';

export async function GET() {
  const supabase = await createServerClient();
  const config = await loadPersonaConfig(supabase);
  return NextResponse.json({ config });
}

const PutSchema = z.object({
  chave: z.enum([
    'persona',
    'tom_voz',
    'proibicoes',
    'estrutura_padrao',
    'precedentes_obrigatorios',
    'limite_legal_art_73',
  ]),
  valor: z.string(),
});

export async function PUT(request: NextRequest) {
  const parsed = PutSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('configuracoes')
    .upsert(
      { chave: parsed.data.chave, valor: parsed.data.valor, owner_id: user.id },
      { onConflict: 'chave' },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
