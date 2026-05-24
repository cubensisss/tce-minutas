-- ============================================================================
-- Backfill — atribui o usuário Tercio (criado no Supabase Auth) como owner
-- de TODOS os processos e configurações do v1.
--
-- Pré-requisitos:
--   1. Aplicar migrações 0001, 0002, 0003.
--   2. Logar pelo menos uma vez no v2 com tercioaraujo1@gmail.com pra criar
--      a linha em auth.users.
--   3. Rodar este script no SQL Editor do Supabase Studio.
--
-- Substitua o e-mail abaixo se necessário.
-- ============================================================================

do $$
declare
  uid uuid;
begin
  select id into uid from auth.users where email = 'tercioaraujo1@gmail.com' limit 1;

  if uid is null then
    raise exception 'Usuário não encontrado em auth.users — faça login no v2 antes de rodar este script.';
  end if;

  update public.processos
     set owner_id = uid
   where owner_id is null;

  update public.configuracoes
     set owner_id = uid
   where owner_id is null;

  raise notice 'Backfill concluído. owner_id setado para %', uid;
end $$;
