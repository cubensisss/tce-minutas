/**
 * Lê as configurações da Conselheira (persona, tom, proibições, etc) do
 * Supabase. Cai pra defaults em prompts/persona.ts se a tabela estiver
 * vazia — assim o sistema funciona em primeira execução.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_PERSONA,
  DEFAULT_TOM_VOZ,
  DEFAULT_PROIBICOES,
  DEFAULT_ESTRUTURA_PADRAO,
  DEFAULT_LIMITE_LEGAL_ART73,
} from '@/prompts/persona';
import { loggerFor } from '@/lib/logger';
import type { PersonaConfig } from '@/lib/types/persona';

const log = loggerFor('config/persona');

export type { PersonaConfig };

export async function loadPersonaConfig(supabase: SupabaseClient): Promise<PersonaConfig> {
  const { data, error } = await supabase
    .from('configuracoes')
    .select('chave, valor');

  if (error) {
    log.warn({ err: error }, 'erro ao ler configuracoes — usando defaults');
    return defaults();
  }

  const map = new Map<string, string>(
    (data ?? []).map((row) => [row.chave as string, row.valor as string]),
  );

  return {
    persona: map.get('persona') ?? DEFAULT_PERSONA,
    tomVoz: map.get('tom_voz') ?? DEFAULT_TOM_VOZ,
    proibicoes: map.get('proibicoes') ?? DEFAULT_PROIBICOES,
    estruturaPadrao: map.get('estrutura_padrao') ?? DEFAULT_ESTRUTURA_PADRAO,
    precedentesObrigatorios: map.get('precedentes_obrigatorios') ?? '',
    limiteLegalArt73: normalizeLimiteLegal(map.get('limite_legal_art_73')),
  };
}

function defaults(): PersonaConfig {
  return {
    persona: DEFAULT_PERSONA,
    tomVoz: DEFAULT_TOM_VOZ,
    proibicoes: DEFAULT_PROIBICOES,
    estruturaPadrao: DEFAULT_ESTRUTURA_PADRAO,
    precedentesObrigatorios: '',
    limiteLegalArt73: DEFAULT_LIMITE_LEGAL_ART73,
  };
}

/**
 * Aceita "R$ 75.000,00", "75.000", "75000" — devolve só dígitos ("75000").
 * Cai pro default da lei se vier vazio/inválido.
 */
function normalizeLimiteLegal(raw: string | undefined): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length > 0 ? digits : DEFAULT_LIMITE_LEGAL_ART73;
}
