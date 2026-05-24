-- ============================================================================
-- v2 extensions — adicionadas no MESMO Supabase do v1 sem breaking change.
--
-- Estratégia: novas tabelas + colunas nullable nas antigas. v1 continua rodando
-- normal; v2 progressivamente passa a popular owner_id e os caches.
--
-- Aplicar via Supabase CLI:
--   supabase db push
-- ou colar no SQL Editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. owner_id nullable em tabelas existentes (preparação pra RLS)
-- ----------------------------------------------------------------------------
alter table if exists public.processos
  add column if not exists owner_id uuid references auth.users(id) on delete set null;

alter table if exists public.configuracoes
  add column if not exists owner_id uuid references auth.users(id) on delete set null;

create index if not exists processos_owner_id_idx on public.processos(owner_id);

-- ----------------------------------------------------------------------------
-- 2. jobs — fila de tarefas longas (geração de minuta, vetorial, etc)
-- ----------------------------------------------------------------------------
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid references public.processos(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete cascade,
  kind text not null check (kind in ('resumo', 'minuta', 'similares', 'docx')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'error')),
  payload jsonb,
  result jsonb,
  error text,
  attempts int not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_processo_id_idx on public.jobs(processo_id);
create index if not exists jobs_status_kind_idx on public.jobs(status, kind);
create index if not exists jobs_owner_id_idx on public.jobs(owner_id);

-- ----------------------------------------------------------------------------
-- 3. similares_cache — resultados de busca vetorial cacheados
--    (evita gastar quota Vertex em buscas repetidas)
-- ----------------------------------------------------------------------------
create table if not exists public.similares_cache (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid references public.processos(id) on delete cascade,
  query_hash text not null,
  query_text text not null,
  results jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

create unique index if not exists similares_cache_processo_query_idx
  on public.similares_cache(processo_id, query_hash);

create index if not exists similares_cache_expires_idx on public.similares_cache(expires_at);

-- ----------------------------------------------------------------------------
-- 4. trigger updated_at em jobs
-- ----------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.tg_set_updated_at();
