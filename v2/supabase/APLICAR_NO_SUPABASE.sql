-- ============================================================================
-- COLE ESTE ARQUIVO INTEIRO NO SQL EDITOR DO SUPABASE.
--
-- Combina as migrações 0001 + 0003. Roda quantas vezes quiser — é idempotente.
--
-- IMPORTANTE: NÃO inclui 0002 (RLS). Aplique 0002_rls_single_user.sql só
-- DEPOIS que você logar no v2 pela primeira vez e rodar
-- supabase/seeds/backfill_owner.sql.
-- ============================================================================

-- =============== 0001 — extensões ===========================================
-- Atualiza a CHECK constraint de status para incluir os estados do v2
-- (mantém os do v1 pra não invalidar os processos antigos).
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'processos_status_check' and conrelid = 'public.processos'::regclass
  ) then
    alter table public.processos drop constraint processos_status_check;
  end if;
  alter table public.processos
    add constraint processos_status_check
    check (status is null or status in (
      'upload', 'novo', 'triagem', 'resumo', 'diretrizes', 'minuta', 'revisao'
    ));
end $$;

alter table if exists public.processos
  add column if not exists owner_id uuid references auth.users(id) on delete set null;

-- Colunas que o v2 escreve na tabela processos. Idempotente.
alter table if exists public.processos add column if not exists resumo_data jsonb;
alter table if exists public.processos add column if not exists achados jsonb;
alter table if exists public.processos add column if not exists descricao_objeto text;
alter table if exists public.processos add column if not exists diretrizes jsonb;
alter table if exists public.processos add column if not exists minuta jsonb;

alter table if exists public.configuracoes
  add column if not exists owner_id uuid references auth.users(id) on delete set null;

create index if not exists processos_owner_id_idx on public.processos(owner_id);

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

-- =============== 0003 — documentos ==========================================
-- Nota: a tabela "documentos" pode já existir do v1 com schema diferente
-- (colunas: tipo, nome_arquivo). Estratégia: criar se não existir, e
-- adicionar/migrar colunas faltantes nos dois cenários.

create table if not exists public.documentos (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.processos(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

-- Adiciona colunas que o v2 espera (idempotente). Mantém compatibilidade
-- com v1 que tem 'tipo' e 'nome_arquivo'.
alter table public.documentos add column if not exists kind text;
alter table public.documentos add column if not exists filename text;
alter table public.documentos add column if not exists size_bytes bigint;
alter table public.documentos add column if not exists content_type text;

-- Se a tabela vier do v1, backfill kind <- tipo e filename <- nome_arquivo.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='documentos' and column_name='tipo'
  ) then
    update public.documentos
       set kind = case tipo
                    when 'auditoria' then 'relatorio'
                    when 'defesa'    then 'defesa'
                    else 'anexo'
                  end
     where kind is null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='documentos' and column_name='nome_arquivo'
  ) then
    update public.documentos
       set filename = nome_arquivo
     where filename is null;
  end if;
end $$;

create index if not exists documentos_processo_id_idx on public.documentos(processo_id);
create index if not exists documentos_kind_idx on public.documentos(processo_id, kind);

-- =============== Storage policies (bucket "documentos") =====================
-- O bucket "documentos" tem RLS ativado. Estas políticas permitem que o
-- usuário autenticado (qualquer um — single-user system) leia/grave/apague
-- arquivos. Idempotentes via DROP + CREATE.

drop policy if exists documentos_select_authed on storage.objects;
create policy documentos_select_authed on storage.objects
  for select to authenticated
  using (bucket_id = 'documentos');

drop policy if exists documentos_insert_authed on storage.objects;
create policy documentos_insert_authed on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documentos');

drop policy if exists documentos_update_authed on storage.objects;
create policy documentos_update_authed on storage.objects
  for update to authenticated
  using (bucket_id = 'documentos')
  with check (bucket_id = 'documentos');

drop policy if exists documentos_delete_authed on storage.objects;
create policy documentos_delete_authed on storage.objects
  for delete to authenticated
  using (bucket_id = 'documentos');

-- =============== 0004 — chat sobre o processo ==============================
-- Histórico do chat após a geração da minuta (analisar mérito, tirar dúvidas).
-- Coluna jsonb simples na própria tabela processos — sem JOIN.
alter table if exists public.processos
  add column if not exists chat_messages jsonb not null default '[]'::jsonb;

-- =============================================================================
-- FIM. Rode no SQL Editor do Supabase Studio.
-- Resultado esperado: "Success. No rows returned" — significa que aplicou tudo.
-- =============================================================================
