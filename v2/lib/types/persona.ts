/**
 * Tipo client-safe — sem importar nada do server-side.
 * Permite que componentes client usem este tipo sem puxar o pino + supabase.
 */
export type PersonaConfig = {
  persona: string;
  tomVoz: string;
  proibicoes: string;
  estruturaPadrao: string;
  precedentesObrigatorios: string;
  /**
   * Limite legal vigente do art. 73 da Lei 12.600/2004 — base de cálculo
   * obrigatória das multas, em reais (apenas dígitos, ex: "50000").
   * O TCE-PE atualiza este valor periodicamente; quando atualizado aqui,
   * todos os prompts (sugestão e minuta) passam a usar o novo valor.
   */
  limiteLegalArt73: string;
};
