/**
 * Estrutura do resumo de triagem gerado pelo Gemini Flash a partir do
 * relatório de auditoria + defesas prévias.
 *
 * Filosofia: o resumo é a "carta de leitura" do processo — precisa
 * detalhar fatos, datas, valores, partes e argumentos da defesa em
 * profundidade suficiente pra conselheira entender o mérito SEM voltar
 * aos PDFs. Antes era enxuto demais; agora pedimos narrativa, dados
 * objetivos e defesas completas.
 */
import { z } from 'zod';

/** Bloco de dados objetivos: número, valores, datas, partes envolvidas. */
export const DadosObjetivosSchema = z.object({
  modalidade: z.string().nullable().default(null).describe(
    'Tipo do processo: Auditoria Especial, Prestação de Contas, Inspeção, etc.',
  ),
  periodo_examinado: z.string().nullable().default(null).describe(
    'Período auditado (ex: "01/01/2024 a 31/12/2024" ou "exercício 2023")',
  ),
  valor_total_envolvido: z.string().nullable().default(null).describe(
    'Valor total do contrato/recurso/dano em R$, quando aplicável',
  ),
  numero_contrato_licitacao: z.string().nullable().default(null).describe(
    'Número do contrato/licitação/processo administrativo, quando houver',
  ),
  partes_contratantes: z.array(z.string()).default([]).describe(
    'Pessoas/empresas envolvidas no objeto auditado',
  ),
  datas_relevantes: z.array(z.string()).default([]).describe(
    'Marcos temporais importantes (autuação, citação, contratos, eventos)',
  ),
});

export const AchadoSchema = z.object({
  numero: z.string().describe('Número do achado (ex: "1.1")'),
  titulo: z.string().describe('Título curto'),
  descricao: z.string().describe(
    'Descrição DETALHADA do achado em 4-8 linhas: o que aconteceu, ' +
    'quando, com quais valores, qual norma foi violada, qual o nexo de ' +
    'causalidade. Não escreva resumo de uma linha — desça em fatos.',
  ),
  fatos_apurados: z.array(z.string()).default([]).describe(
    'Lista DETALHADA de fatos que a auditoria apurou para sustentar o ' +
    'achado: datas, valores, atos administrativos, omissões, etc. ' +
    'Cada item uma frase factual.',
  ),
  responsaveis: z.array(z.string()).default([]),
  fundamentacao_legal: z.array(z.string()).default([]),
  defesa_resumo: z.string().nullable().default(null).describe(
    'Síntese curta da defesa (1-3 linhas) — usada em cards compactos.',
  ),
  defesa_completa: z.string().nullable().default(null).describe(
    'Defesa em profundidade (5-10 linhas): tese central, fatos invocados, ' +
    'documentos juntados, precedentes citados, pedidos. Não omitir argumentos.',
  ),
  gravidade: z.enum(['leve', 'media', 'grave']).default('media'),
});

export const ResumoSchema = z.object({
  processo: z.object({
    numero: z.string(),
    unidade_jurisdicionada: z.string(),
    exercicio: z.string().nullable().default(null),
    interessados: z.array(z.string()).default([]),
    descricao_objeto: z.string().nullable().default(null),
  }),
  dados_objetivos: DadosObjetivosSchema.default({
    modalidade: null,
    periodo_examinado: null,
    valor_total_envolvido: null,
    numero_contrato_licitacao: null,
    partes_contratantes: [],
    datas_relevantes: [],
  }),
  /**
   * Narrativa cronológica do processo em prosa (8-15 linhas):
   * autuação → designação da equipe → escopo → relatório → notificações →
   * defesas → eventos relevantes. Em linguagem técnica, com datas, nomes
   * próprios e valores. Esse campo dá a "fotografia geral" antes dos achados.
   */
  narrativa_fatos: z.string().nullable().default(null),
  achados: z.array(AchadoSchema).min(1),
  observacoes_triagem: z.string().nullable().default(null),
});

export type DadosObjetivos = z.infer<typeof DadosObjetivosSchema>;
export type Resumo = z.infer<typeof ResumoSchema>;
export type Achado = z.infer<typeof AchadoSchema>;
