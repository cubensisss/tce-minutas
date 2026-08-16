import { promisify } from 'node:util';
import { gzip, gunzip } from 'node:zlib';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExtractedDocument } from '@/lib/pdf/extract';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const BUCKET = 'documentos';

export const ExtractionLocatorSchema = z.object({
  type: z.enum(['page', 'paragraph', 'document']),
  number: z.number().int().positive().nullable(),
  text: z.string(),
  confidence: z.enum(['confirmed', 'needs_review']),
});

export const ExtractionArtifactSchema = z.object({
  version: z.literal(1),
  document_id: z.string().uuid(),
  filename: z.string(),
  created_at: z.string(),
  locators: z.array(ExtractionLocatorSchema),
});

export type ExtractionArtifact = z.infer<typeof ExtractionArtifactSchema>;

export function buildExtractionArtifact(input: {
  documentId: string;
  filename: string;
  extracted: ExtractedDocument;
  locatorConfidence?: 'confirmed' | 'needs_review';
}): ExtractionArtifact {
  const isPdf = input.filename.split('.').pop()?.toLowerCase() === 'pdf';
  const confidence = input.locatorConfidence ?? 'confirmed';
  const locators = isPdf
    ? input.extracted.pages.map((text, index) => ({
        type: 'page' as const, number: index + 1, text, confidence,
      }))
    : paragraphs(input.extracted.text).map((text, index) => ({
        type: 'paragraph' as const,
        number: index + 1,
        text,
        confidence: 'confirmed' as const,
      }));

  return {
    version: 1,
    document_id: input.documentId,
    filename: input.filename,
    created_at: new Date().toISOString(),
    locators: locators.length > 0
      ? locators
      : [{ type: 'document', number: null, text: input.extracted.text, confidence }],
  };
}

export async function saveExtractionArtifact(
  supabase: SupabaseClient,
  processoId: string,
  artifact: ExtractionArtifact,
): Promise<string> {
  const path = `${processoId}/extracted/${artifact.document_id}.json.gz`;
  const compressed = await gzipAsync(Buffer.from(JSON.stringify(artifact), 'utf8'));
  const { error } = await supabase.storage.from(BUCKET).upload(path, compressed, {
    contentType: 'application/gzip', cacheControl: '0', upsert: true,
  });
  if (error) throw new Error(`Falha ao salvar texto extraido: ${error.message}`);
  return path;
}

export async function loadExtractionArtifact(
  supabase: SupabaseClient,
  input: {
    id: string;
    filename: string;
    extraction_storage_path?: string | null;
    extracted_text?: string | null;
  },
): Promise<ExtractionArtifact | null> {
  if (input.extraction_storage_path) {
    const { data, error } = await supabase.storage.from(BUCKET).download(input.extraction_storage_path);
    if (!error && data) {
      const bytes = Buffer.from(await data.arrayBuffer());
      const parsed = ExtractionArtifactSchema.safeParse(
        JSON.parse((await gunzipAsync(bytes)).toString('utf8')),
      );
      if (parsed.success) return parsed.data;
    }
  }
  if (!input.extracted_text?.trim()) return null;
  return {
    version: 1,
    document_id: input.id,
    filename: input.filename,
    created_at: new Date(0).toISOString(),
    locators: [{
      type: 'document', number: null, text: input.extracted_text, confidence: 'needs_review',
    }],
  };
}

export function formatArtifactForPrompt(artifact: ExtractionArtifact): string {
  return artifact.locators.map((locator) => {
    const label = locator.type === 'page'
      ? `PAGINA ${locator.number}`
      : locator.type === 'paragraph' ? `PARAGRAFO ${locator.number}` : 'DOCUMENTO';
    return `--- ${label} | DOC_ID=${artifact.document_id} | CONFIANCA=${locator.confidence} ---\n${locator.text}`;
  }).join('\n\n');
}

export function quoteExistsInArtifact(quote: string, artifact: ExtractionArtifact): boolean {
  return artifact.locators.some((locator) => textContainsQuote(locator.text, quote));
}

export function locatorContainsQuote(
  quote: string,
  artifact: ExtractionArtifact,
  type: 'page' | 'paragraph' | 'document',
  number: number | null,
): boolean {
  return artifact.locators.some((locator) =>
    locator.type === type && locator.number === number &&
    textContainsQuote(locator.text, quote),
  );
}

/** Tolera somente diferenças de formatação comuns na extração de PDFs. */
export function textContainsQuote(text: string, quote: string): boolean {
  const needle = normalizeForMatch(quote);
  const haystack = normalizeForMatch(text);
  if (needle.length >= 8 && haystack.includes(needle)) return true;

  const compactNeedle = compactForMatch(needle);
  const compactHaystack = compactForMatch(haystack);
  return compactNeedle.length >= 20 && compactHaystack.includes(compactNeedle);
}

function normalizeForMatch(value: string): string {
  return value
    .replace(/([\p{L}\p{N}])-\s*\r?\n\s*([\p{L}\p{N}])/gu, '$1$2')
    .replace(/[\u00ad\u200b-\u200d\ufeff]/g, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[“”„‟«»]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

function compactForMatch(value: string): string {
  return value.replace(/[^a-z0-9]/g, '');
}

function paragraphs(text: string): string[] {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/)
    .map((value) => value.trim()).filter(Boolean);
  return blocks.length > 0 ? blocks : [text.trim()].filter(Boolean);
}
