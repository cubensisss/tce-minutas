-- ============================================================================
-- Tabela documentos — registra arquivos enviados pra cada processo.
-- v1 não tinha — só guardava no Storage com convenção de path. v2 mantém
-- a tabela pra evitar listing recursivo do bucket toda vez que precisamos
-- saber quais arquivos um processo tem.
-- ============================================================================

create table if not exists public.documentos (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.processos(id) on delete cascade,
  kind text not null check (kind in ('relatorio', 'defesa', 'minuta_gerada', 'anexo')),
  storage_path text not null,
  filename text not null,
  size_bytes bigint,
  content_type text,
  created_at timestamptz not null default now()
);

create index if not exists documentos_processo_id_idx on public.documentos(processo_id);
create index if not exists documentos_kind_idx on public.documentos(processo_id, kind);

alter table public.documentos enable row level security;

drop policy if exists "owner_via_processo" on public.documentos;
create policy "owner_via_processo" on public.documentos
  for all using (
    exists (
      select 1 from public.processos p
      where p.id = documentos.processo_id
        and (p.owner_id = auth.uid() or p.owner_id is null)
    )
  );
