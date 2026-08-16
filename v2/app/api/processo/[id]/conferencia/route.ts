import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { ResumoSchema, type Resumo } from '@/schemas/resumo';
import { DiretrizesSchema, type Diretrizes } from '@/schemas/diretrizes';
import { MinutaSchema, type Minuta } from '@/schemas/minuta';
import { buildConferenceReport, generationContextHash } from '@/lib/conference/checks';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('confirm_references'),
    evidence_ids: z.array(z.string()).default([]),
    minute_reference_ids: z.array(z.string()).default([]),
  }),
  z.object({ action: z.literal('approve') }),
]);

type ProcessState = {
  resumo_data: unknown;
  diretrizes: unknown;
  minuta: unknown;
  resumo_confirmado_at: string | null;
  diretrizes_confirmadas_at: string | null;
  minuta_status: string | null;
  minuta_context_hash: string | null;
  minuta_approved_at: string | null;
  minuta_approved_hash: string | null;
};

async function loadState(id: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  const { data, error } = await supabase.from('processos').select(
    'resumo_data, diretrizes, minuta, resumo_confirmado_at, diretrizes_confirmadas_at, minuta_status, minuta_context_hash, minuta_approved_at, minuta_approved_hash',
  ).eq('id', id).single();
  if (error || !data) return { error: NextResponse.json({ error: 'not_found' }, { status: 404 }) };
  const resumo = ResumoSchema.safeParse(data.resumo_data);
  const diretrizes = DiretrizesSchema.safeParse(data.diretrizes);
  const minuta = MinutaSchema.safeParse(data.minuta);
  if (!resumo.success || !diretrizes.success || !minuta.success) {
    return { error: NextResponse.json({ error: 'estado_invalido' }, { status: 409 }) };
  }
  return { supabase, state: data as ProcessState, resumo: resumo.data, diretrizes: diretrizes.data, minuta: minuta.data };
}

function reportFor(state: ProcessState, resumo: Resumo, diretrizes: Diretrizes, minuta: Minuta) {
  return buildConferenceReport({
    resumo,
    diretrizes,
    minuta,
    resumoConfirmedAt: state.resumo_confirmado_at,
    diretrizesConfirmedAt: state.diretrizes_confirmadas_at,
    minutaStatus: state.minuta_status,
    storedContextHash: state.minuta_context_hash,
    currentContextHash: generationContextHash(resumo, diretrizes),
  });
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const loaded = await loadState(id);
  if ('error' in loaded) return loaded.error;
  const report = reportFor(loaded.state, loaded.resumo, loaded.diretrizes, loaded.minuta);
  const approved = loaded.state.minuta_status === 'approved' &&
    loaded.state.minuta_approved_hash === report.content_hash;
  return NextResponse.json({
    report,
    resumo: loaded.resumo,
    minuta: loaded.minuta,
    approved,
    approved_at: approved ? loaded.state.minuta_approved_at : null,
  });
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  const loaded = await loadState(id);
  if ('error' in loaded) return loaded.error;

  if (parsed.data.action === 'confirm_references') {
    const evidenceIds = new Set(parsed.data.evidence_ids);
    const minuteIds = new Set(parsed.data.minute_reference_ids);
    const resumo: Resumo = {
      ...loaded.resumo,
      evidencias: loaded.resumo.evidencias.map((item) => ({
        ...item,
        confirmed_by_user: item.verification === 'invalid'
          ? item.confirmed_by_user
          : evidenceIds.has(item.id),
      })),
    };
    const minuta: Minuta = {
      ...loaded.minuta,
      referencias: loaded.minuta.referencias.map((item) => ({
        ...item,
        confirmed_by_user: item.verification !== 'invalid' && minuteIds.has(item.id),
      })),
    };
    const report = reportFor(loaded.state, resumo, loaded.diretrizes, minuta);
    const { error } = await loaded.supabase.from('processos').update({
      resumo_data: resumo,
      minuta,
      conferencia_data: report,
      minuta_status: 'draft',
      minuta_approved_at: null,
      minuta_approved_hash: null,
    }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, report, resumo, minuta });
  }

  const report = reportFor(loaded.state, loaded.resumo, loaded.diretrizes, loaded.minuta);
  if (!report.ready) {
    return NextResponse.json({ error: 'conferencia_incompleta', report }, { status: 409 });
  }
  const { error } = await loaded.supabase.from('processos').update({
    status: 'conferencia',
    minuta_status: 'approved',
    minuta_approved_at: new Date().toISOString(),
    minuta_approved_hash: report.content_hash,
    conferencia_data: report,
  }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, report, approved: true });
}
