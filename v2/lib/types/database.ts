/**
 * Tipos das tabelas Supabase usadas pelo v2.
 * Não geramos via supabase-cli aqui pra evitar dependência extra na fase 0.
 * Atualizar manualmente conforme as migrações forem aplicadas.
 */

export type Processo = {
  id: string;
  numero: string;
  unidade_jurisdicionada: string | null;
  exercicio: string | null;
  interessados: string | null;
  relator: string | null;
  descricao_objeto: string | null;
  status: 'novo' | 'triagem' | 'resumo' | 'diretrizes' | 'minuta' | 'revisao' | null;
  achados: unknown | null;
  resumo_data: unknown | null;
  diretrizes: unknown | null;
  minuta: unknown | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string | null;
};

export type Configuracao = {
  id: string;
  chave: 'persona' | 'tom_voz' | 'proibicoes' | 'estrutura_padrao' | 'precedentes_obrigatorios';
  valor: string;
  owner_id: string | null;
  updated_at: string;
};

export type JobKind = 'resumo' | 'minuta' | 'similares' | 'docx';
export type JobStatus = 'queued' | 'running' | 'done' | 'error';

export type Job = {
  id: string;
  processo_id: string | null;
  owner_id: string | null;
  kind: JobKind;
  status: JobStatus;
  payload: unknown | null;
  result: unknown | null;
  error: string | null;
  attempts: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SimilaresCache = {
  id: string;
  processo_id: string;
  query_hash: string;
  query_text: string;
  results: SimilarResult[];
  created_at: string;
  expires_at: string;
};

export type SimilarResult = {
  id: string;
  title: string | null;
  snippet: string | null;
  link: string | null;
  /**
   * Score de relevância vindo do Vertex (0-1). v2 ordena por isso já que
   * o data store atual não expõe campo de data.
   */
  relevance: number | null;
};
