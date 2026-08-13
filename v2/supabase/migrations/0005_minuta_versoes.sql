-- Historico recuperavel das minutas. Cada regeneracao, ajuste ou restauracao
-- guarda a versao anterior antes de substituir processos.minuta.
create table if not exists public.minuta_versoes (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.processos(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  origem text not null check (origem in ('geracao', 'ajuste', 'restauracao')),
  descricao text,
  minuta jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists minuta_versoes_processo_created_idx
  on public.minuta_versoes(processo_id, created_at desc);

alter table public.minuta_versoes enable row level security;

drop policy if exists "owner_all" on public.minuta_versoes;
create policy "owner_all" on public.minuta_versoes
  for all using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
