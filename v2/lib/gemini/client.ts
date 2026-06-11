/**
 * Wrapper sobre @google/genai com:
 *  - timeout explícito (Gemini Pro pode passar de 60s)
 *  - retry exponencial em 429/503
 *  - parse resiliente quando o modelo gera ```json ... ``` ou JSON cru
 *  - validação opcional via Zod schema do chamador
 *
 * Nota: a SDK @google/genai (nova, unificada Vertex/Studio) usa a API
 *   ai.models.generateContent({ model, contents, config }), diferente da
 *   antiga @google/generative-ai (model.generateContent).
 */
import { GoogleGenAI } from '@google/genai';
import { z, type ZodSchema } from 'zod';
import { getEnv } from '@/lib/env';
import { loggerFor } from '@/lib/logger';

const log = loggerFor('gemini');

let cachedClient: GoogleGenAI | null = null;
function client() {
  if (!cachedClient) cachedClient = new GoogleGenAI({ apiKey: getEnv().GEMINI_API_KEY });
  return cachedClient;
}

export type GenerateOptions = {
  /** 'flash' (rápido, resumo/chat) ou 'pro' (raciocínio profundo, minuta). */
  model: 'flash' | 'pro';
  /** Prompt do sistema (persona/restrições). */
  system?: string;
  /** Mensagem do usuário. */
  prompt: string;
  /** Temperatura. Default conservador (0.4). */
  temperature?: number;
  /** Esperamos JSON estrito? Liga responseMimeType + responseSchema. */
  json?: boolean;
  /** Timeout em ms. Default 90s. */
  timeoutMs?: number;
  /** Retries em erros transitórios. Default 2. */
  retries?: number;
  /** Limite de tokens de saída (default da SDK quando ausente). */
  maxOutputTokens?: number;
};

export async function generateText(opts: GenerateOptions): Promise<string> {
  const env = getEnv();
  const modelName = opts.model === 'pro' ? env.GEMINI_PRO_MODEL : env.GEMINI_FLASH_MODEL;
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const retries = opts.retries ?? 2;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const response = await client().models.generateContent({
          model: modelName,
          contents: opts.prompt,
          config: {
            ...(opts.system ? { systemInstruction: opts.system } : {}),
            temperature: opts.temperature ?? 0.4,
            ...(opts.json ? { responseMimeType: 'application/json' } : {}),
            ...(opts.maxOutputTokens ? { maxOutputTokens: opts.maxOutputTokens } : {}),
          },
        });

        const text = response.text ?? '';
        if (!text) throw new Error('Gemini retornou resposta vazia');
        log.debug({ model: modelName, chars: text.length, attempt }, 'gemini ok');
        return text;
      } finally {
        clearTimeout(t);
      }
    } catch (err: unknown) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isRetriable = /429|503|UNAVAILABLE|RESOURCE_EXHAUSTED|aborted/i.test(msg);
      log.warn({ attempt, msg, isRetriable }, 'gemini falhou');
      if (!isRetriable || attempt === retries) break;
      await sleep(500 * Math.pow(2, attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Falha desconhecida no Gemini');
}

export type GenerateWithFileOptions = Omit<GenerateOptions, 'json'> & {
  /** Bytes do arquivo a enviar como input multimodal. */
  fileBytes: Uint8Array | ArrayBuffer;
  /** MIME type (ex: 'application/pdf', 'image/png'). */
  fileMimeType: string;
};

/**
 * Igual ao generateText, mas envia um arquivo binário (PDF, imagem) como
 * parte do contents — usado para OCR quando a extração textual falhar.
 *
 * O Gemini aceita inlineData até ~20MB. Acima disso seria preciso usar
 * a Files API; mantemos inline aqui pra simplicidade.
 */
export async function generateTextWithFile(opts: GenerateWithFileOptions): Promise<string> {
  const env = getEnv();
  const modelName = opts.model === 'pro' ? env.GEMINI_PRO_MODEL : env.GEMINI_FLASH_MODEL;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const retries = opts.retries ?? 2;

  const bytes =
    opts.fileBytes instanceof Uint8Array
      ? opts.fileBytes
      : new Uint8Array(opts.fileBytes);
  const base64 = Buffer.from(bytes).toString('base64');

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const response = await client().models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType: opts.fileMimeType, data: base64 } },
                { text: opts.prompt },
              ],
            },
          ],
          config: {
            ...(opts.system ? { systemInstruction: opts.system } : {}),
            temperature: opts.temperature ?? 0.1,
            ...(opts.maxOutputTokens ? { maxOutputTokens: opts.maxOutputTokens } : {}),
          },
        });

        const text = response.text ?? '';
        if (!text) throw new Error('Gemini retornou resposta vazia');
        log.debug(
          { model: modelName, chars: text.length, attempt, mime: opts.fileMimeType, sizeKb: Math.round(bytes.length / 1024) },
          'gemini-com-arquivo ok',
        );
        return text;
      } finally {
        clearTimeout(t);
      }
    } catch (err: unknown) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isRetriable = /429|503|UNAVAILABLE|RESOURCE_EXHAUSTED|aborted/i.test(msg);
      log.warn({ attempt, msg, isRetriable }, 'gemini-com-arquivo falhou');
      if (!isRetriable || attempt === retries) break;
      await sleep(500 * Math.pow(2, attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Falha desconhecida no Gemini (com arquivo)');
}

/** Gera + valida com Zod. Lança ZodError se a resposta não bater. */
export async function generateJson<T>(
  opts: Omit<GenerateOptions, 'json'> & { schema: ZodSchema<T> },
): Promise<T> {
  const raw = await generateText({ ...opts, json: true });
  const cleaned = stripJsonFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    log.error({ raw: raw.slice(0, 500) }, 'JSON.parse falhou na resposta do Gemini');
    throw new Error(`Gemini retornou JSON inválido: ${(err as Error).message}`);
  }
  return opts.schema.parse(parsed);
}

function stripJsonFences(s: string): string {
  let cleaned = s
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  // Se houver lixo após o fechamento do JSON, cortamos fora
  if (cleaned.startsWith('{')) {
    const lastBrace = cleaned.lastIndexOf('}');
    if (lastBrace !== -1) {
      cleaned = cleaned.substring(0, lastBrace + 1);
    }
  } else if (cleaned.startsWith('[')) {
    const lastBracket = cleaned.lastIndexOf(']');
    if (lastBracket !== -1) {
      cleaned = cleaned.substring(0, lastBracket + 1);
    }
  }

  return cleaned;
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

// re-export pra ergonomia
export { z };
