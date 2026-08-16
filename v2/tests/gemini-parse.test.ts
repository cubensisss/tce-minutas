import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  cleanGeminiJson,
  parseGeminiJson,
  toGeminiResponseSchema,
} from '@/lib/gemini/structured';
import { ResumoSchema } from '@/schemas/resumo';
import { MinutaSchema } from '@/schemas/minuta';

describe('cleanGeminiJson', () => {
  it('remove fence ```json ... ```', () => {
    expect(cleanGeminiJson('```json\n{"a": 1}\n```')).toBe('{"a": 1}');
  });

  it('remove fence sem language tag', () => {
    expect(cleanGeminiJson('```\n{"a": 1}\n```')).toBe('{"a": 1}');
  });

  it('passa JSON cru sem alterar', () => {
    expect(cleanGeminiJson('{"a": 1}')).toBe('{"a": 1}');
  });

  it('remove texto depois do primeiro JSON completo', () => {
    expect(parseGeminiJson('{"texto":"chave } interna"}\ncomentario')).toEqual({
      texto: 'chave } interna',
    });
  });

  it('rejeita JSON quebrado internamente para permitir nova geracao', () => {
    expect(() => parseGeminiJson('{"itens":["a" "b"]}')).toThrow();
  });
});

describe('toGeminiResponseSchema', () => {
  it('converte tipos Zod para o enum da SDK e preserva restricoes', () => {
    const result = toGeminiResponseSchema(z.object({
      nome: z.string(),
      nivel: z.enum(['leve', 'grave']),
      detalhes: z.string().nullable().default(null),
    })) as unknown as Record<string, unknown>;

    expect(result.type).toBe('OBJECT');
    expect(result).not.toHaveProperty('$schema');
    expect(result).not.toHaveProperty('additionalProperties');
    expect(JSON.stringify(result)).not.toContain('"default"');
    expect(result.properties).toMatchObject({
      nome: { type: 'STRING' },
      nivel: { type: 'STRING', enum: ['leve', 'grave'] },
      detalhes: { type: 'STRING', nullable: true },
    });
  });

  it.each([
    ['resumo', ResumoSchema],
    ['minuta', MinutaSchema],
  ])('remove defaults do schema real de %s', (_name, schema) => {
    const serialized = JSON.stringify(toGeminiResponseSchema(schema));
    expect(serialized).not.toContain('"default"');
    expect(serialized).not.toContain('"additionalProperties"');
    expect(serialized).not.toContain('"exclusiveMinimum"');
    expect(serialized).not.toContain('"exclusiveMaximum"');
  });

  it('converte limite inteiro exclusivo para o formato aceito pelo Gemini', () => {
    const result = toGeminiResponseSchema(z.object({ pagina: z.number().int().positive() })) as unknown as {
      properties: { pagina: Record<string, unknown> };
    };
    expect(result.properties.pagina).toMatchObject({ type: 'INTEGER', minimum: 1 });
    expect(result.properties.pagina).not.toHaveProperty('exclusiveMinimum');
  });
});
