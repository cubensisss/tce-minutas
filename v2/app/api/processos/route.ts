/**
 * POST /api/processos
 * Cria um processo a partir de metadados (JSON). Uploads e registro
 * de documentos acontecem direto do navegador para o Storage do Supabase.
 *
 * GET /api/processos
 * Lista processos do usuário autenticado (ordenado por created_at desc).
 */
import { z } from 'zod';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { loggerFor } from '@/lib/logger';

const log = loggerFor('api/processos');

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Aceita metadados vazios — quando o usuário só faz upload dos documentos,
 * a triagem (/api/resumo) extrai número/unidade/etc. do próprio relatório
 * e atualiza o registro. Aqui usamos placeholders ("(extraindo...)") para
 * passar o NOT NULL eventualmente existente no banco.
 */
const NewProcessoSchema = z.object({
  numero: z.string().nullable().optional(),
  unidade_jurisdicionada: z.string().nullable().optional(),
  exercicio: z.string().nullable().optional(),
  interessados: z.string().nullable().optional(),
  relator: z.string().nullable().optional(),
});

const PLACEHOLDER_NUMERO = '(extraindo...)';
const PLACEHOLDER_UNIDADE = '(extraindo...)';
const DEFAULT_RELATOR = 'Andressa Cordeiro';

export async function GET() {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('processos')
    .select('id, numero, unidade_jurisdicionada, status, created_at')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ processos: data });
}

/**
 * Recebe somente metadados (JSON). Os arquivos sobem direto do navegador
 * pro Storage e registram via /api/processos/[id]/documentos.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const meta = NewProcessoSchema.safeParse({
      numero: body.numero || null,
      unidade_jurisdicionada: body.unidade_jurisdicionada || null,
      exercicio: body.exercicio || null,
      interessados: body.interessados || null,
      relator: body.relator || null,
    });

    if (!meta.success) {
      return NextResponse.json(
        { error: 'invalid_input', details: meta.error.flatten() },
        { status: 400 },
      );
    }

    // Preenchimento defensivo: campos NOT NULL do banco recebem placeholder
    // que será sobrescrito pela triagem depois que extrair do relatório.
    const insertPayload = {
      numero: meta.data.numero?.trim() || PLACEHOLDER_NUMERO,
      unidade_jurisdicionada:
        meta.data.unidade_jurisdicionada?.trim() || PLACEHOLDER_UNIDADE,
      exercicio: meta.data.exercicio || null,
      interessados: meta.data.interessados || null,
      relator: meta.data.relator?.trim() || DEFAULT_RELATOR,
      owner_id: user.id,
      status: 'triagem' as const,
    };

    const { data: processo, error } = await supabase
      .from('processos')
      .insert(insertPayload)
      .select('id')
      .single();

    if (error || !processo) {
      log.error({ err: error }, 'falha ao criar processo');
      return NextResponse.json({ error: error?.message ?? 'insert_failed' }, { status: 500 });
    }

    return NextResponse.json({ id: processo.id }, { status: 201 });
  } catch (err) {
    log.error({ err }, 'erro inesperado em POST /api/processos');
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'erro_inesperado' },
      { status: 500 },
    );
  }
}
