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

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === '$schema' || key === 'additionalProperties' || key === 'definitions') continue;
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
