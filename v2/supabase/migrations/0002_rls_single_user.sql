-- ============================================================================
-- RLS single-user.
-- Estratégia: só o usuário em ALLOWED_USER_EMAIL (Tercio) consegue ler/escrever.
-- Como v1 ainda roda sem auth, mantemos uma política "service_role bypassa tudo"
-- pra não quebrar o sistema antigo durante a transição.
--
-- IMPORTANTE: aplicar SOMENTE depois de:
--   1. Criar conta no Supabase Auth com o email do .env
--   2. Backfill em processos/configuracoes setando owner_id desse usuário
--      (ver script supabase/seeds/backfill_owner.sql na fase de migração)
-- ============================================================================

-- Habilitar RLS — não breaking porque service_role bypassa
alter table public.processos enable row level security;
alter table public.configuracoes enable row level security;
alter table public.jobs enable row level security;
alter table public.similares_cache enable row level security;

-- ----------------------------------------------------------------------------
-- processos
-- ----------------------------------------------------------------------------
drop policy if exists "owner_select" on public.processos;
create policy "owner_select" on public.processos
  for select using (auth.uid() = owner_id or owner_id is null);

drop policy if exists "owner_insert" on public.processos;
create policy "owner_insert" on public.processos
  for insert with check (auth.uid() = owner_id);

drop policy if exists "owner_update" on public.processos;
create policy "owner_update" on public.processos
  for update using (auth.uid() = owner_id);

drop policy if exists "owner_delete" on public.processos;
create policy "owner_delete" on public.processos
  for delete using (auth.uid() = owner_id);

-- ----------------------------------------------------------------------------
-- configuracoes
-- ----------------------------------------------------------------------------
drop policy if exists "owner_all" on public.configuracoes;
create policy "owner_all" on public.configuracoes
  for all using (auth.uid() = owner_id or owner_id is null)
  with check (auth.uid() = owner_id);

-- ----------------------------------------------------------------------------
-- jobs
-- ----------------------------------------------------------------------------
drop policy if exists "owner_all" on public.jobs;
create policy "owner_all" on public.jobs
  for all using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ----------------------------------------------------------------------------
-- similares_cache — segue o owner do processo
-- ----------------------------------------------------------------------------
drop policy if exists "owner_via_processo" on public.similares_cache;
create policy "owner_via_processo" on public.similares_cache
  for all using (
    exists (
      select 1 from public.processos p
      where p.id = similares_cache.processo_id
        and p.owner_id = auth.uid()
    )
  );
