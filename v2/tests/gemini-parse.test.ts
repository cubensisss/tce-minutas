import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  cleanGeminiJson,
  parseGeminiJson,
  toGeminiResponseSchema,
} from '@/lib/gemini/structured';

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
    expect(result.properties).toMatchObject({
      nome: { type: 'STRING' },
      nivel: { type: 'STRING', enum: ['leve', 'grave'] },
      detalhes: { type: 'STRING', nullable: true },
    });
  });
});
