import { describe, it, expect } from 'vitest';
import { ResumoSchema } from '@/schemas/resumo';
import { DiretrizesSchema } from '@/schemas/diretrizes';
import { MinutaSchema } from '@/schemas/minuta';

describe('ResumoSchema', () => {
  it('aceita um resumo mínimo com pelo menos 1 achado', () => {
    const ok = ResumoSchema.safeParse({
      processo: {
        numero: '22XXXXX-X',
        unidade_jurisdicionada: 'Prefeitura X',
      },
      achados: [
        { numero: '1.1', titulo: 'X', descricao: 'descr' },
      ],
    });
    expect(ok.success).toBe(true);
  });

  it('aplica defaults nos campos opcionais', () => {
    const r = ResumoSchema.parse({
      processo: { numero: 'A', unidade_jurisdicionada: 'B' },
      achados: [{ numero: '1', titulo: 't', descricao: 'd' }],
    });
    expect(r.processo.interessados).toEqual([]);
    expect(r.achados[0]!.gravidade).toBe('media');
    expect(r.achados[0]!.fundamentacao_legal).toEqual([]);
  });

  it('rejeita gravidade inválida', () => {
    const bad = ResumoSchema.safeParse({
      processo: { numero: 'A', unidade_jurisdicionada: 'B' },
      achados: [{ numero: '1', titulo: 't', descricao: 'd', gravidade: 'critica' }],
    });
    expect(bad.success).toBe(false);
  });

  it('rejeita resumo sem achados', () => {
    const bad = ResumoSchema.safeParse({
      processo: { numero: 'A', unidade_jurisdicionada: 'B' },
      achados: [],
    });
    expect(bad.success).toBe(false);
  });
});

describe('DiretrizesSchema', () => {
  it('aceita diretrizes mínimas (1 achado, sem multas/débitos)', () => {
    const ok = DiretrizesSchema.safeParse({
      achados: [{ achado_numero: '1.1', resultado: 'procedente' }],
    });
    expect(ok.success).toBe(true);
  });

  it('multa com valor negativo é rejeitada', () => {
    const bad = DiretrizesSchema.safeParse({
      achados: [{ achado_numero: '1', resultado: 'procedente' }],
      multas: [{ responsavel: 'X', valor: -10, fundamento: 'art' }],
    });
    expect(bad.success).toBe(false);
  });
});

describe('MinutaSchema', () => {
  it('aceita minuta com todos os blocos preenchidos', () => {
    const ok = MinutaSchema.safeParse({
      ementa: 'A'.repeat(30),
      relatorio: 'B'.repeat(60),
      analise_completa: 'C'.repeat(120),
      decisao_voto: 'D'.repeat(60),
    });
    expect(ok.success).toBe(true);
  });

  it('rejeita ementa muito curta', () => {
    const bad = MinutaSchema.safeParse({
      ementa: 'curta',
      relatorio: 'B'.repeat(60),
      analise_completa: 'C'.repeat(120),
      decisao_voto: 'D'.repeat(60),
    });
    expect(bad.success).toBe(false);
  });
});
