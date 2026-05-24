/**
 * Diretrizes que a Conselheira define ANTES da geração da minuta.
 *
 * Padrão v1 simplificado: para CADA achado, escolha o resultado e marque
 * (opcionalmente) multa, débito e/ou medida com seus respectivos valores
 * livres. O resultado é DEFINITIVO — a IA respeita literalmente. Já em
 * multa/débito/medida, a IA pode escrever uma "sugestao_ia" como nota
 * paralela com proposta alternativa para revisão rápida pela Conselheira.
 */
import { z } from 'zod';

export const ResultadoAchadoEnum = z.enum([
  'irregular',
  'regular_com_ressalvas',
  'regular',
]);

export const MultaSchema = z.object({
  aplicar: z.boolean().default(false),
  valor: z.string().default(''), // texto livre (ex: "R$ 5.000,00" ou "10% do limite art. 73")
});

export const DebitoSchema = z.object({
  imputar: z.boolean().default(false),
  valor: z.string().default(''), // texto livre
});

export const MedidaSchema = z.object({
  aplicar: z.boolean().default(false),
  texto: z.string().default(''), // recomendação / determinação / ciência
});

/**
 * Sugestão alternativa gerada pela IA. Não é vinculante — a Conselheira
 * decide. Mostrada como nota lateral na UI.
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
});

export const SugestaoIaSchema = z.object({
  multa: z.string().nullable().default(null),
  debito: z.string().nullable().default(null),
  medida: z.string().nullable().default(null),
  justificativa: z.string().nullable().default(null),
  fontes: z.array(FonteSchema).default([]),
});

export const DiretrizAchadoSchema = z.object({
  achado_numero: z.string(),
  /**
   * Resultado: se null, a Conselheira deixou em aberto e a IA tem livre
   * arbítrio para julgar com base na evidência (auditoria + defesa + lei).
   */
  resultado: ResultadoAchadoEnum.nullable().default(null),
  multa: MultaSchema.default({ aplicar: false, valor: '' }),
  debito: DebitoSchema.default({ imputar: false, valor: '' }),
  medida: MedidaSchema.default({ aplicar: false, texto: '' }),
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
