import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { ResumoSchema } from '@/schemas/resumo';
import { loadExtractionArtifact, type ExtractionArtifact } from '@/lib/storage/extraction';
import { verifyResumoEvidence } from '@/lib/evidence/verify';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  resumo: ResumoSchema,
  confirm: z.boolean().default(false),
});

export async function PUT(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', details: parsed.error.flatten() }, { status: 400 });
  }
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: docs, error: docsError } = await supabase
    .from('documentos')
    .select('id, filename, extracted_text, extraction_storage_path')
    .eq('processo_id', id);
  if (docsError) return NextResponse.json({ error: docsError.message }, { status: 500 });
  const artifacts = (await Promise.all(
    (docs ?? []).map((doc) => loadExtractionArtifact(supabase, doc)),
  )).filter((item): item is ExtractionArtifact => !!item);
  const resumo = verifyResumoEvidence(parsed.data.resumo, artifacts);

  const update = {
    resumo_data: resumo,
    achados: resumo.achados,
    numero: resumo.processo.numero,
    unidade_jurisdicionada: resumo.processo.unidade_jurisdicionada,
    exercicio: resumo.processo.exercicio,
    interessados: resumo.processo.interessados.join(', ') || null,
    descricao_objeto: resumo.processo.descricao_objeto,
    resumo_confirmado_at: parsed.data.confirm ? new Date().toISOString() : null,
    diretrizes_confirmadas_at: null,
    minuta_status: 'stale',
    minuta_approved_at: null,
    minuta_approved_hash: null,
    conferencia_data: {},
  };
  const { error } = await supabase.from('processos').update(update).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, resumo, confirmed: parsed.data.confirm });
}
