import type { SupabaseClient } from '@supabase/supabase-js';
import { MinutaSchema, type Minuta } from '@/schemas/minuta';

export async function saveMinutaVersion(
  supabase: SupabaseClient,
  input: {
    processoId: string;
    ownerId: string;
    minuta: unknown;
    origem: 'geracao' | 'ajuste' | 'restauracao' | 'edicao_manual';
    descricao?: string | null;
  },
) {
  const parsed = MinutaSchema.safeParse(input.minuta);
  if (!parsed.success) return;
  const { error } = await supabase.from('minuta_versoes').insert({
    processo_id: input.processoId,
    owner_id: input.ownerId,
    origem: input.origem,
    descricao: input.descricao ?? null,
    minuta: parsed.data,
  });
  if (error) throw new Error(`Falha ao preservar a versao anterior: ${error.message}`);
}

export function parseMinuta(value: unknown): Minuta {
  return MinutaSchema.parse(value);
}
