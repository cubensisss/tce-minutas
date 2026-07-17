-- ============================================================================
-- SCRIPT: LIMPEZA AUTOMÁTICA DE PROCESSOS E ARQUIVOS ANTIGOS
-- Este script garante que o usuário terá no máximo os 2 últimos processos
-- salvos. Quando um NOVO processo for criado, ele deleta os mais antigos
-- e também exclui os arquivos vinculados a eles no Storage.
--
-- COLE ESTE ARQUIVO INTEIRO NO SQL EDITOR DO SUPABASE E CLIQUE EM "RUN".
-- ============================================================================

-- 1. Cria a função que executa a limpeza
CREATE OR REPLACE FUNCTION public.clean_old_processes()
RETURNS TRIGGER AS $$
DECLARE
  p_id uuid;
BEGIN
  -- Seleciona os processos que pertencem ao mesmo owner e são mais antigos que os 2 mais recentes
  FOR p_id IN (
    SELECT id 
    FROM public.processos 
    WHERE (owner_id = NEW.owner_id OR NEW.owner_id IS NULL)
      AND id != NEW.id -- por segurança
    ORDER BY created_at DESC 
    OFFSET 1 -- Mantém o recém criado + 1 antigo (Total: 2)
  ) LOOP
    
    -- Deleta todos os arquivos deste processo do Storage (Bucket: documentos)
    -- Isso limpa o S3 fisicamente pois a tabela storage.objects tem triggers de exclusão.
    DELETE FROM storage.objects 
    WHERE bucket_id = 'documentos' 
      AND (name = p_id::text OR name LIKE p_id::text || '/%');
    
    -- Deleta o processo (os registros na tabela public.documentos serão apagados em cascata)
    DELETE FROM public.processos WHERE id = p_id;
    
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Remove a trigger se ela já existir para evitar duplicidade
DROP TRIGGER IF EXISTS trigger_clean_old_processes_on_insert ON public.processos;

-- 3. Cria a trigger que é disparada toda vez que um novo processo for INSERIDO
CREATE TRIGGER trigger_clean_old_processes_on_insert
AFTER INSERT ON public.processos
FOR EACH ROW
EXECUTE FUNCTION public.clean_old_processes();

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================
