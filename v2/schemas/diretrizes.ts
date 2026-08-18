/**
 * Diretrizes propostas pela IA e revisadas pela Conselheira ANTES da minuta.
 *
 * Para CADA achado, a IA propõe resultado, multa, débito e medida com a
 * fundamentação correspondente. Os campos revisados tornam-se definitivos
 * quando a Conselheira salva as diretrizes; não há confirmação adicional.
 */
import { z } from 'zod';

export const ResultadoAchadoEnum = z.enum([
  'irregular',
  'regular_com_ressalvas',
  'regular',
  'expedicao_medidas_saneadoras',
]);

export const MultaSchema = z.object({
  confirmado: z.boolean().default(false),
  aplicar: z.boolean().default(false),
  valor: z.string().default(''), // texto livre (ex: "R$ 5.000,00" ou "10% do limite art. 73")
});

export const DebitoSchema = z.object({
  confirmado: z.boolean().default(false),
  imputar: z.boolean().default(false),
  valor: z.string().default(''), // texto livre
});

export const MedidaSchema = z.object({
  confirmado: z.boolean().default(false),
  aplicar: z.boolean().default(false),
  texto: z.string().default(''), // recomendação / determinação / ciência
});

/**
 * Proposta de julgamento gerada pela IA. Não é vinculante até que os campos
 * sejam revisados e salvos, e permanece visível com a fundamentação na interface.
 *
 * Cada sugestão DEVE vir acompanhada da sua fonte (legislação ou precedente)
 * — sem fonte, a sugestão não é confiável.
 */
export const FonteSchema = z.object({
  /** Tipo da fonte: 'legislacao' ou 'precedente'. */
  tipo: z.enum(['legislacao', 'precedente']),
  /**
   * Citação completa: "art. 73, III, da Lei Estadual nº 12.600/2004" ou
   * "Processo TCE-PE nº 24100009-9 — Cons. Rel. Andressa".
   */
  citacao: z.string(),
  /**
   * Trecho relevante do texto-fonte (1-3 frases) que sustenta a sugestão.
   * Para precedentes, é o snippet vindo do Vertex.
   */
  trecho: z.string().nullable().default(null),
  /** Link oficial para conferência da legislação ou do precedente. */
  link: z.string().url().nullable().default(null),
});

export const SugestaoIaSchema = z.object({
  resultado: ResultadoAchadoEnum.nullable().default(null),
  multa: z.string().nullable().default(null),
  debito: z.string().nullable().default(null),
  medida: z.string().nullable().default(null),
  justificativa: z.string().nullable().default(null),
  fontes: z.array(FonteSchema).default([]),
});

/** Resposta nova da IA: o resultado é obrigatório na proposta de julgamento. */
export const PropostaJulgamentoIaSchema = SugestaoIaSchema.extend({
  resultado: ResultadoAchadoEnum,
  fontes: z.array(FonteSchema).min(1),
});

export const DiretrizAchadoSchema = z.object({
  achado_numero: z.string(),
  /** Campo legado: salvar as diretrizes já representa a revisão humana. */
  confirmado: z.boolean().default(false),
  /** Resultado pendente enquanto null; a geração fica bloqueada. */
  resultado: ResultadoAchadoEnum.nullable().default(null),
  multa: MultaSchema.default({ confirmado: false, aplicar: false, valor: '' }),
  debito: DebitoSchema.default({ confirmado: false, imputar: false, valor: '' }),
  medida: MedidaSchema.default({ confirmado: false, aplicar: false, texto: '' }),
  observacoes: z.string().nullable().default(null),
  sugestao_ia: SugestaoIaSchema.nullable().default(null),
});

export const DiretrizesSchema = z.object({
  achados: z.array(DiretrizAchadoSchema).min(1),
  consideracoes_conselheira: z.string().nullable().default(null),
});

export type Diretrizes = z.infer<typeof DiretrizesSchema>;
export type DiretrizAchado = z.infer<typeof DiretrizAchadoSchema>;
export type SugestaoIa = z.infer<typeof SugestaoIaSchema>;
export type PropostaJulgamentoIa = z.infer<typeof PropostaJulgamentoIaSchema>;

/**
 * Normaliza os campos salvos. Remove textos residuais de consequências
 * desmarcadas e marca os campos legados de confirmação para manter
 * compatibilidade com processos existentes.
 */
export function canonicalizeDiretrizes(diretrizes: Diretrizes): Diretrizes {
  return {
    ...diretrizes,
    achados: diretrizes.achados.map((achado) => ({
      ...achado,
      confirmado: true,
      multa: achado.multa.aplicar
        ? { ...achado.multa, confirmado: true }
        : { ...achado.multa, confirmado: true, valor: '' },
      debito: achado.debito.imputar
        ? { ...achado.debito, confirmado: true }
        : { ...achado.debito, confirmado: true, valor: '' },
      medida: achado.medida.aplicar
        ? { ...achado.medida, confirmado: true }
        : { ...achado.medida, confirmado: true, texto: '' },
    })),
  };
}

/** Contexto vinculante da minuta: somente os campos revisados e salvos. */
export function diretrizesForGeneration(diretrizes: Diretrizes): Diretrizes {
  const canonical = canonicalizeDiretrizes(diretrizes);
  return {
    ...canonical,
    achados: canonical.achados.map((achado) => ({
      ...achado,
      sugestao_ia: null,
    })),
  };
}
