/**
 * GET /api/processo/[id] — retorna o estado completo do processo
 * PATCH /api/processo/[id] — atualiza metadados ou estado
 * DELETE /api/processo/[id] — apaga (cascata via FK)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: processo, error } = await supabase
    .from('processos')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !processo) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const { data: documentos } = await supabase
    .from('documentos')
    .select('id, kind, filename, size_bytes, content_type, created_at')
    .eq('processo_id', id)
    .order('created_at', { ascending: true });
  return NextResponse.json({ processo, documentos: documentos ?? [] });
}

const PatchSchema = z.object({
  numero: z.string().optional(),
  unidade_jurisdicionada: z.string().optional(),
  exercicio: z.string().nullable().optional(),
  interessados: z.string().nullable().optional(),
  relator: z.string().nullable().optional(),
  status: z
    .enum(['novo', 'triagem', 'resumo', 'diretrizes', 'minuta', 'revisao'])
    .optional(),
});

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const parsed = PatchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  const supabase = await createServerClient();
  const { error } = await supabase
    .from('processos')
    .update(parsed.data)
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { error } = await supabase.from('processos').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
