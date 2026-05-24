import { describe, it, expect } from 'vitest';
import { hashQuery } from '@/lib/vertex/search';

describe('hashQuery', () => {
  it('é determinístico para a mesma string', () => {
    expect(hashQuery('contratação direta')).toBe(hashQuery('contratação direta'));
  });

  it('ignora maiúsculas/minúsculas e espaços nas pontas', () => {
    expect(hashQuery('  Contratação Direta  ')).toBe(hashQuery('contratação direta'));
  });

  it('produz hashes diferentes pra queries diferentes', () => {
    expect(hashQuery('A')).not.toBe(hashQuery('B'));
  });
});
