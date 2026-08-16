import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { MinutaSchema } from '@/schemas/minuta';
import { saveMinutaVersion } from '@/lib/minuta/versioning';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };
const Body = z.object({ minuta: MinutaSchema });

export async function PUT(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: processo, error: processError } = await supabase
    .from('processos').select('minuta').eq('id', id).single();
  if (processError || !processo) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  await saveMinutaVersion(supabase, {
    processoId: id,
    ownerId: user.id,
    minuta: processo.minuta,
    origem: 'edicao_manual',
    descricao: 'Versão anterior à edição manual',
  });
  const { error } = await supabase.from('processos').update({
    minuta: parsed.data.minuta,
    status: 'revisao',
    minuta_status: 'draft',
    minuta_approved_at: null,
    minuta_approved_hash: null,
    conferencia_data: {},
  }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, minuta: parsed.data.minuta });
}
