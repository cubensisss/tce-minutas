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

async function listAllFilesRecursively(bucket, path) {
  let allFiles = [];
  const { data, error } = await supabase.storage.from(bucket).list(path);
  
  if (error) {
    console.error(`Erro ao listar ${path}:`, error);
    return allFiles;
  }
  
  for (const item of data || []) {
    const fullPath = path ? `${path}/${item.name}` : item.name;
    // Se id é nulo e não tem metadata, geralmente é uma subpasta (ou se name não tem extensão, mas id null é garantido para pastas reais ou placeholders)
    // No Supabase, pastas retornadas pelo list() tem id = null e created_at = null
    if (item.id === null) {
      const subFiles = await listAllFilesRecursively(bucket, fullPath);
      allFiles = allFiles.concat(subFiles);
      // Opcionalmente podemos tentar deletar a pasta vazia adicionando o placeholder
      allFiles.push(`${fullPath}/.emptyFolderPlaceholder`);
    } else {
      allFiles.push(fullPath);
    }
  }
  
  return allFiles;
}

async function cleanOrphanedStorage() {
  console.log("Iniciando limpeza profunda de arquivos órfãos no Storage...");

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

  // 2. Lista as pastas na raiz do bucket "documentos"
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
    if (item.name !== '.emptyFolderPlaceholder' && !validProcessIds.has(item.name)) {
      console.log(`Órfão detectado: ${item.name}. Buscando conteúdo profundamente...`);

      const allFilesToDelete = await listAllFilesRecursively('documentos', item.name);
      // Adiciona também a própria pasta na raiz (caso seja um emptyFolderPlaceholder)
      allFilesToDelete.push(item.name);
      allFilesToDelete.push(`${item.name}/.emptyFolderPlaceholder`);

      // Deleta em lotes de 100 para não estourar o limite da API
      for (let i = 0; i < allFilesToDelete.length; i += 100) {
        const batch = allFilesToDelete.slice(i, i + 100);
        const { error: deleteError } = await supabase.storage
          .from('documentos')
          .remove(batch);
        
        if (deleteError) {
          console.error(`Erro ao deletar lote da pasta ${item.name}:`, deleteError);
        }
      }
      
      console.log(`Foram submetidos para deleção ${allFilesToDelete.length} arquivos/pastas de ${item.name}.`);
      deletedCount++;
    }
  }

  console.log(`Limpeza concluída! Removidas profundamente ${deletedCount} pastas órfãs.`);
}

cleanOrphanedStorage();
