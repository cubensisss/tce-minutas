import type { SchemaUnion } from '@google/genai';
import type { ZodSchema } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/** Converte Zod para o subconjunto OpenAPI aceito pelo generateContent. */
export function toGeminiResponseSchema(schema: ZodSchema): SchemaUnion {
  const jsonSchema = zodToJsonSchema(schema, {
    target: 'openApi3',
    $refStrategy: 'none',
  });
  return normalizeSchema(jsonSchema) as SchemaUnion;
}

function normalizeSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeSchema);
  if (!value || typeof value !== 'object') return value;

  const source = value as Record<string, unknown>;
  const normalizedType = typeof source.type === 'string' ? source.type.toUpperCase() : null;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(source)) {
    // `default` e os demais campos abaixo podem ser produzidos pelo conversor,
    // mas nao sao aceitos em schemas de RESPOSTA da Gemini API.
    if (
      key === '$schema' ||
      key === 'additionalProperties' ||
      key === 'definitions' ||
      key === 'default'
    ) continue;
    // `z.number().int().positive()` vira `exclusiveMinimum: 0` no OpenAPI,
    // mas o campo nao existe no Schema protobuf usado por responseSchema.
    // Para inteiros, preservamos exatamente a restricao convertendo > N em
    // >= N + 1. Para numeros continuos, a API nao possui equivalente seguro.
    if (key === 'exclusiveMinimum') {
      if (normalizedType === 'INTEGER' && typeof child === 'number') {
        out.minimum = Math.floor(child) + 1;
      }
      continue;
    }
    if (key === 'exclusiveMaximum') {
      if (normalizedType === 'INTEGER' && typeof child === 'number') {
        out.maximum = Math.ceil(child) - 1;
      }
      continue;
    }
    if (
      key === 'minimum' &&
      normalizedType === 'INTEGER' &&
      source.exclusiveMinimum === true &&
      typeof child === 'number'
    ) {
      out.minimum = Math.floor(child) + 1;
      continue;
    }
    if (
      key === 'maximum' &&
      normalizedType === 'INTEGER' &&
      source.exclusiveMaximum === true &&
      typeof child === 'number'
    ) {
      out.maximum = Math.ceil(child) - 1;
      continue;
    }
    if (key === 'type' && typeof child === 'string') {
      out[key] = child.toUpperCase();
      continue;
    }
    out[key] = normalizeSchema(child);
  }
  return out;
}

/** Remove cercas Markdown e texto depois do primeiro JSON completo. */
export function cleanGeminiJson(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  const end = findJsonEnd(cleaned);
  return end === -1 ? cleaned : cleaned.slice(0, end + 1);
}

function findJsonEnd(value: string): number {
  const first = value[0];
  if (first !== '{' && first !== '[') return -1;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') stack.push(char);
    else if (char === '}' || char === ']') {
      const expected = char === '}' ? '{' : '[';
      if (stack.pop() !== expected) return -1;
      if (stack.length === 0) return index;
    }
  }
  return -1;
}

export function parseGeminiJson(raw: string): unknown {
  return JSON.parse(cleanGeminiJson(raw));
}
