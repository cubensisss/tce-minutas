import { z } from 'zod';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { MinutaSchema } from '@/schemas/minuta';
import { saveMinutaVersion } from '@/lib/minuta/versioning';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('minuta_versoes')
    .select('id, origem, descricao, created_at')
    .eq('processo_id', id)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ versoes: data ?? [] });
}

const RestoreBody = z.object({ versao_id: z.string().uuid() });

export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const parsed = RestoreBody.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [{ data: processo }, { data: versao }] = await Promise.all([
    supabase.from('processos').select('minuta').eq('id', id).single(),
    supabase
      .from('minuta_versoes')
      .select('minuta')
      .eq('id', parsed.data.versao_id)
      .eq('processo_id', id)
      .single(),
  ]);
  const antiga = MinutaSchema.safeParse(processo?.minuta);
  const restaurada = MinutaSchema.safeParse(versao?.minuta);
  if (!restaurada.success) return NextResponse.json({ error: 'versao_invalida' }, { status: 400 });

  if (antiga.success) {
    await saveMinutaVersion(supabase, {
      processoId: id,
      ownerId: user.id,
      minuta: antiga.data,
      origem: 'restauracao',
      descricao: 'Versao substituida por uma restauracao',
    });
  }

  const { error } = await supabase
    .from('processos')
    .update({ minuta: restaurada.data, status: 'revisao' })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, minuta: restaurada.data });
}
