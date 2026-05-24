-- ============================================================================
-- 0004 — chat sobre o processo (após geração da minuta)
--
-- Guarda o histórico de mensagens trocadas com o assistente quando a
-- Conselheira está analisando o mérito. JSON simples — uma coluna na
-- própria tabela processos pra evitar JOIN. Estrutura de cada item:
--   { "role": "user" | "assistant", "content": "...", "ts": "ISO8601" }
-- ============================================================================

alter table if exists public.processos
  add column if not exists chat_messages jsonb not null default '[]'::jsonb;
