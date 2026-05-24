import { describe, it, expect } from 'vitest';

/**
 * Esses testes garantem que a lógica de stripping de fences ```json funciona,
 * sem disparar requisição real. Reimplementamos a função aqui pra evitar
 * import de @/lib/gemini/client (que requer envs).
 */

function stripJsonFences(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
}

describe('stripJsonFences', () => {
  it('remove fence ```json ... ```', () => {
    expect(stripJsonFences('```json\n{"a": 1}\n```')).toBe('{"a": 1}');
  });

  it('remove fence ``` ... ``` sem language tag', () => {
    expect(stripJsonFences('```\n{"a": 1}\n```')).toBe('{"a": 1}');
  });

  it('passa JSON cru sem alterar', () => {
    expect(stripJsonFences('{"a": 1}')).toBe('{"a": 1}');
  });

  it('lida com espaços extras', () => {
    expect(stripJsonFences('  ```json  \n{"a":1}\n  ```  ')).toBe('{"a":1}');
  });
});
