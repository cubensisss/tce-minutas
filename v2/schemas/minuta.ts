/**
 * Saída do Gemini Pro para a minuta de voto.
 * Espelha o que o v1 gera (ementa, relatorio, analise, decisao) mas com
 * tipagem estrita e campos obrigatórios garantidos por Zod.
 */
import { z } from 'zod';

export const MinutaSchema = z.object({
  /** Bloco de ementa em caixa alta, parágrafos curtos. */
  ementa: z.string().min(20),
  /** Identificação que entra no cabeçalho do DOCX. */
  descricao_objeto: z.string().nullable().default(null),
  interessados: z.string().nullable().default(null),
  exercicio: z.string().nullable().default(null),
  /**
   * "MODALIDADE - TIPO" do processo (ex: "Auditoria Especial - Conformidade",
   * "Prestação de Contas - Governo", "Tomada de Contas Especial"). Vai no
   * bloco de identificação do DOCX, logo abaixo do RELATOR. Se vier null,
   * o template renderiza vazio.
   */
  modalidade_tipo: z.string().nullable().default(null),
  /** Relatório (descrição cronológica do processo). */
  relatorio: z.string().min(50),
  /** Análise completa — mérito de cada achado, com fundamentação. */
  analise_completa: z.string().min(100),
  /** Conclusão / dispositivo do voto, com CONSIDERANDOs e itens romanos. */
  decisao_voto: z.string().min(50),
  /** Sugestões de ajuste pendentes que a Conselheira pode revisar. */
  sugestao_pendente: z.string().nullable().default(null),
});

export type Minuta = z.infer<typeof MinutaSchema>;
