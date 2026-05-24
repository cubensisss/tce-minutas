/**
 * Helpers do Supabase Storage para upload e leitura de documentos
 * (relatórios + defesas) por processo.
 *
 * Usa o MESMO bucket do v1: "documentos". Cada processo guarda arquivos em
 * {processo_id}/{kind}/{filename}.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { loggerFor } from '@/lib/logger';

const log = loggerFor('storage');
const BUCKET = 'documentos';

export type DocumentKind = 'relatorio' | 'defesa' | 'minuta_gerada' | 'anexo';

export type UploadedDocument = {
  path: string;
  kind: DocumentKind;
  filename: string;
  size: number;
  contentType: string;
};

export async function uploadDocument(
  supabase: SupabaseClient,
  processoId: string,
  kind: DocumentKind,
  file: File,
): Promise<UploadedDocument> {
  const safeName = sanitizeFilename(file.name);
  const path = `${processoId}/${kind}/${Date.now()}_${safeName}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      contentType: file.type || guessContentType(safeName),
      upsert: false,
    });

  if (error) {
    log.error({ err: error, path }, 'falha no upload');
    throw new Error(`Storage upload falhou: ${error.message}`);
  }

  return {
    path,
    kind,
    filename: safeName,
    size: file.size,
    contentType: file.type || guessContentType(safeName),
  };
}

export async function downloadDocument(
  supabase: SupabaseClient,
  path: string,
): Promise<ArrayBuffer> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) {
    log.error({ err: error, path }, 'falha no download');
    throw new Error(`Storage download falhou: ${error?.message ?? 'sem dados'}`);
  }
  return await data.arrayBuffer();
}

export async function getSignedUrl(
  supabase: SupabaseClient,
  path: string,
  expiresIn = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data) {
    throw new Error(`Falha ao gerar signed URL: ${error?.message ?? 'sem dados'}`);
  }
  return data.signedUrl;
}

function sanitizeFilename(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 200);
}

function guessContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    default: return 'application/octet-stream';
  }
}
