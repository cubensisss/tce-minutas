/**
 * PUT /api/diretrizes
 * Salva (cria ou atualiza) as diretrizes da Conselheira para um processo.
 * Não envolve IA — é só persistência da decisão humana.
 *
 * Body: { processo_id, diretrizes (DiretrizesSchema) }
 */
import { z } from 'zod';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { DiretrizesSchema } from '@/schemas/diretrizes';
import { loggerFor } from '@/lib/logger';
import { directiveBlockers } from '@/lib/conference/checks';

const log = loggerFor('api/diretrizes');

export const runtime = 'nodejs';

const Body = z.object({
  processo_id: z.string().uuid(),
  diretrizes: DiretrizesSchema,
});

export async function PUT(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = await createServerClient();
  const blockers = directiveBlockers(parsed.data.diretrizes);
  if (blockers.length > 0) {
    return NextResponse.json(
      { error: 'diretrizes_incompletas', details: blockers },
      { status: 409 },
    );
  }
  const { error } = await supabase
    .from('processos')
    .update({
      diretrizes: parsed.data.diretrizes,
      status: 'diretrizes',
      diretrizes_confirmadas_at: new Date().toISOString(),
      minuta_status: 'stale',
      minuta_approved_at: null,
      minuta_approved_hash: null,
      conferencia_data: {},
    })
    .eq('id', parsed.data.processo_id);

  if (error) {
    log.error({ err: error }, 'falha ao salvar diretrizes');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
