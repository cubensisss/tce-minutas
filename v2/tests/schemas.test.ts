import { describe, it, expect } from 'vitest';
import { ResumoSchema } from '@/schemas/resumo';
import {
  canonicalizeDiretrizes,
  DiretrizesSchema,
  diretrizesForGeneration,
  PropostaJulgamentoIaSchema,
} from '@/schemas/diretrizes';
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
    expect(r.evidencias).toEqual([]);
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
  it('remove textos de sancoes desmarcadas do contexto vinculante', () => {
    const diretrizes = DiretrizesSchema.parse({
      achados: [{
        achado_numero: '1.1', confirmado: true, resultado: 'regular_com_ressalvas',
        multa: { confirmado: true, aplicar: false, valor: 'Multa sugerida pela IA' },
        debito: { confirmado: true, imputar: false, valor: 'R$ 10.000,00' },
        medida: { confirmado: true, aplicar: false, texto: 'Determinar providencias' },
        sugestao_ia: {
          resultado: 'irregular', multa: 'Multa sugerida pela IA',
          fontes: [{ tipo: 'legislacao', citacao: 'Lei 12.600/2004' }],
        },
      }],
    });

    const canonical = canonicalizeDiretrizes(diretrizes);
    expect(canonical.achados[0]!.multa.valor).toBe('');
    expect(canonical.achados[0]!.debito.valor).toBe('');
    expect(canonical.achados[0]!.medida.texto).toBe('');
    expect(canonical.achados[0]!.sugestao_ia?.multa).toBe('Multa sugerida pela IA');
    expect(diretrizesForGeneration(diretrizes).achados[0]!.sugestao_ia).toBeNull();
  });

  it('aceita diretrizes mínimas (1 achado, sem multas/débitos)', () => {
    const ok = DiretrizesSchema.safeParse({
      achados: [{ achado_numero: '1.1', resultado: 'irregular' }],
    });
    expect(ok.success).toBe(true);
  });

  it('rejeita resultado fora das opcoes atuais', () => {
    const bad = DiretrizesSchema.safeParse({
      achados: [{ achado_numero: '1', resultado: 'procedente' }],
    });
    expect(bad.success).toBe(false);
  });

  it('mantém decisões de sanção pendentes por padrão', () => {
    const value = DiretrizesSchema.parse({ achados: [{ achado_numero: '1.1' }] });
    expect(value.achados[0]!.confirmado).toBe(false);
    expect(value.achados[0]!.resultado).toBeNull();
    expect(value.achados[0]!.multa.confirmado).toBe(false);
    expect(value.achados[0]!.debito.confirmado).toBe(false);
    expect(value.achados[0]!.medida.confirmado).toBe(false);
  });

  it('exige que a proposta da IA traga um resultado de julgamento', () => {
    expect(PropostaJulgamentoIaSchema.safeParse({ justificativa: 'Fundamentação' }).success).toBe(false);
    expect(PropostaJulgamentoIaSchema.safeParse({
      resultado: 'irregular',
      justificativa: 'Fundamentação',
      fontes: [{
        tipo: 'legislacao',
        citacao: 'art. 73 da Lei Estadual nº 12.600/2004',
        link: 'https://www.tcepe.tc.br/internet/docs/tce/Lei-Organica-atualizada_2015.pdf',
      }],
    }).success).toBe(true);
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
