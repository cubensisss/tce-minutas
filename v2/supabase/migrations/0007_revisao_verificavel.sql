-- Estado de confirmacao humana, aprovacao e rastreabilidade da minuta.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'processos_status_check' and conrelid = 'public.processos'::regclass
  ) then
    alter table public.processos drop constraint processos_status_check;
  end if;
  alter table public.processos add constraint processos_status_check
    check (status is null or status in (
      'upload', 'novo', 'triagem', 'resumo', 'diretrizes', 'minuta', 'revisao', 'conferencia'
    ));
end $$;

alter table public.processos add column if not exists resumo_confirmado_at timestamptz;
alter table public.processos add column if not exists diretrizes_confirmadas_at timestamptz;
alter table public.processos add column if not exists minuta_status text not null default 'draft';
alter table public.processos add column if not exists minuta_approved_at timestamptz;
alter table public.processos add column if not exists minuta_approved_hash text;
alter table public.processos add column if not exists minuta_context_hash text;
alter table public.processos add column if not exists minuta_meta jsonb;
alter table public.processos add column if not exists conferencia_data jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'processos_minuta_status_check'
      and conrelid = 'public.processos'::regclass
  ) then
    alter table public.processos
      add constraint processos_minuta_status_check
      check (minuta_status in ('draft', 'stale', 'approved'));
  end if;
end $$;

-- O texto extraido passa a ser guardado como JSON compactado no Storage.
alter table public.documentos add column if not exists extraction_storage_path text;
alter table public.documentos add column if not exists extraction_version integer;
alter table public.documentos add column if not exists page_count integer;
alter table public.documentos add column if not exists locator_confidence text;

-- Edicoes manuais tambem geram versoes recuperaveis.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'minuta_versoes_origem_check'
      and conrelid = 'public.minuta_versoes'::regclass
  ) then
    alter table public.minuta_versoes drop constraint minuta_versoes_origem_check;
  end if;
  alter table public.minuta_versoes
    add constraint minuta_versoes_origem_check
    check (origem in ('geracao', 'ajuste', 'restauracao', 'edicao_manual'));
end $$;
