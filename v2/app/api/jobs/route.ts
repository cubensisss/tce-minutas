import { z } from 'zod';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const CreateBody = z.object({
  processo_id: z.string().uuid(),
  kind: z.enum(['resumo', 'minuta', 'similares', 'docx']),
});

export async function POST(request: NextRequest) {
  const parsed = CreateBody.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('jobs')
    .insert({
      processo_id: parsed.data.processo_id,
      owner_id: user.id,
      kind: parsed.data.kind,
      status: 'queued',
      payload: { phase: 'fila', message: 'Preparando a operacao...', progress: 2 },
    })
    .select('id')
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'job_failed' }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('jobs')
    .select('id, status, payload, error, started_at, finished_at')
    .eq('id', id)
    .single();
  if (error || !data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ job: data });
}
