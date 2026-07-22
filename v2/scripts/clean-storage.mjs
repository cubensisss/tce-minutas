import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Faltam variáveis de ambiente SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanOrphanedStorage() {
  console.log("Iniciando limpeza de arquivos órfãos no Storage...");

  // 1. Pega todos os IDs válidos de processos
  const { data: processos, error: dbError } = await supabase
    .from('processos')
    .select('id');

  if (dbError) {
    console.error("Erro ao buscar processos:", dbError);
    return;
  }

  const validProcessIds = new Set(processos.map(p => p.id));
  console.log(`Encontrados ${validProcessIds.size} processos válidos no banco de dados.`);

  // 2. Lista os arquivos/pastas na raiz do bucket "documentos"
  const { data: rootItems, error: storageError } = await supabase.storage
    .from('documentos')
    .list();

  if (storageError) {
    console.error("Erro ao listar bucket 'documentos':", storageError);
    return;
  }

  console.log(`Encontrados ${rootItems.length} itens na raiz do bucket.`);

  let deletedCount = 0;

  for (const item of rootItems) {
    // Se não for o .emptyFolderPlaceholder e o nome não estiver nos validProcessIds
    if (item.name !== '.emptyFolderPlaceholder' && !validProcessIds.has(item.name)) {
      console.log(`Órfão detectado: ${item.name}. Buscando conteúdo para deletar...`);

      // Tenta listar o conteúdo da pasta
      const { data: folderItems, error: listError } = await supabase.storage
        .from('documentos')
        .list(item.name);

      if (listError) {
        console.error(`Erro ao listar itens da pasta ${item.name}:`, listError);
        continue;
      }

      if (folderItems && folderItems.length > 0) {
        const filesToDelete = folderItems.map(f => `${item.name}/${f.name}`);
        const { error: deleteError } = await supabase.storage
          .from('documentos')
          .remove(filesToDelete);

        if (deleteError) {
          console.error(`Erro ao deletar arquivos de ${item.name}:`, deleteError);
        } else {
          console.log(`Deletados ${filesToDelete.length} arquivos da pasta ${item.name}.`);
          deletedCount++;
        }
      } else {
        // Se for um arquivo solto ou pasta vazia
        const { error: removeRootError } = await supabase.storage
          .from('documentos')
          .remove([item.name]);
        if (!removeRootError) {
          console.log(`Deletado item raiz: ${item.name}`);
          deletedCount++;
        }
      }
    }
  }

  console.log(`Limpeza concluída! Removidas ${deletedCount} pastas/arquivos órfãos.`);
}

cleanOrphanedStorage();
