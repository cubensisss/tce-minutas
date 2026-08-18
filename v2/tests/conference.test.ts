import { describe, expect, it } from 'vitest';
import { buildConferenceReport, directiveBlockers, generationContextHash } from '@/lib/conference/checks';
import { ResumoSchema } from '@/schemas/resumo';
import {
  canonicalizeDiretrizes,
  DiretrizesSchema,
  diretrizesForGeneration,
} from '@/schemas/diretrizes';
import { MinutaSchema } from '@/schemas/minuta';
import { contentHash } from '@/lib/evidence/verify';
import { isApprovedForDownload } from '@/lib/minuta/approval';

const documentId = '11111111-1111-4111-8111-111111111111';

function state() {
  const resumo = ResumoSchema.parse({
    processo: { numero: 'TCE-001', unidade_jurisdicionada: 'Município' },
    evidencias: [{
      id: 'ev-1', document_id: documentId, filename: 'relatorio.pdf',
      locator_type: 'page', locator_start: 2, quote: 'O contrato foi executado integralmente.',
      verification: 'verified', confirmed_by_user: true,
    }],
    achados: [{
      numero: '1.1', titulo: 'Execução', descricao: 'Descrição do achado',
      fatos_apurados: ['O contrato foi executado integralmente.'],
      fatos_referenciados: [{ text: 'O contrato foi executado integralmente.', evidence_ids: ['ev-1'] }],
    }],
  });
  const diretrizes = DiretrizesSchema.parse({
    achados: [{
      achado_numero: '1.1', confirmado: true, resultado: 'regular_com_ressalvas',
      multa: { confirmado: true, aplicar: false, valor: '' },
      debito: { confirmado: true, imputar: false, valor: '' },
      medida: { confirmado: true, aplicar: false, texto: '' },
      sugestao_ia: {
        resultado: 'regular_com_ressalvas',
        justificativa: 'Conclusão apoiada na Lei Orgânica do TCE-PE.',
        fontes: [{
          tipo: 'legislacao',
          citacao: 'Lei Estadual nº 12.600/2004',
          link: 'https://www.tcepe.tc.br/internet/docs/tce/Lei-Organica-atualizada_2015.pdf',
        }],
      },
    }],
  });
  const minuta = MinutaSchema.parse({
    ementa: `Ementa ${'técnica '.repeat(5)}`,
    relatorio: `O contrato foi executado integralmente. ${'Relatório '.repeat(8)}`,
    analise_completa: `Análise fundamentada ${'com elementos documentais '.repeat(8)}`,
    decisao_voto: `Voto pela REGULARIDADE COM RESSALVAS. ${'Decisão fundamentada '.repeat(4)}`,
    referencias: [{
      id: 'ref-1', section: 'relatorio', excerpt: 'O contrato foi executado integralmente.',
      source_type: 'document', evidence_id: 'ev-1', verification: 'verified', confirmed_by_user: true,
    }],
  });
  return { resumo, diretrizes, minuta };
}

describe('conferência verificável', () => {
  it('normaliza os campos salvos antes de remover a proposta do contexto da IA', () => {
    const { diretrizes } = state();
    diretrizes.achados[0]!.confirmado = false;
    diretrizes.achados[0]!.multa.confirmado = false;
    const confirmed = canonicalizeDiretrizes(diretrizes);

    expect(directiveBlockers(confirmed)).toEqual([]);
    expect(confirmed.achados[0]!.confirmado).toBe(true);
    expect(confirmed.achados[0]!.multa.confirmado).toBe(true);
    expect(diretrizesForGeneration(confirmed).achados[0]!.sugestao_ia).toBeNull();
  });

  it('não exige confirmações legadas quando os campos específicos estão preenchidos', () => {
    const { diretrizes } = state();
    diretrizes.achados[0]!.confirmado = false;
    diretrizes.achados[0]!.multa.confirmado = false;
    diretrizes.achados[0]!.debito.confirmado = false;
    diretrizes.achados[0]!.medida.confirmado = false;
    expect(directiveBlockers(diretrizes)).toEqual([]);
  });

  it('exige uma medida concreta para o resultado exclusivamente saneador', () => {
    const { diretrizes } = state();
    diretrizes.achados[0]!.resultado = 'expedicao_medidas_saneadoras';
    expect(directiveBlockers(diretrizes)).toContain(
      'Achado 1.1: descreva ao menos uma determinação, recomendação ou medida saneadora',
    );

    diretrizes.achados[0]!.medida = {
      confirmado: false,
      aplicar: true,
      texto: 'Determinar ao Município a apresentação de plano de ação em 60 dias.',
    };
    expect(directiveBlockers(diretrizes)).toEqual([]);
  });

  it('libera somente quando fatos, fontes, diretrizes e dispositivo estão coerentes', () => {
    const { resumo, diretrizes, minuta } = state();
    const hash = generationContextHash(resumo, diretrizes);
    const report = buildConferenceReport({
      resumo, diretrizes, minuta,
      resumoConfirmedAt: new Date().toISOString(),
      diretrizesConfirmedAt: new Date().toISOString(),
      minutaStatus: 'draft', storedContextHash: hash, currentContextHash: hash,
      jurisprudenceResearchCompleted: true,
    });
    expect(report.ready).toBe(true);
    expect(report.blockers).toBe(0);
  });

  it('detecta minuta desatualizada e divergência no dispositivo', () => {
    const { resumo, diretrizes, minuta } = state();
    minuta.decisao_voto = `Voto pela IRREGULARIDADE. ${'Decisão '.repeat(10)}`;
    const report = buildConferenceReport({
      resumo, diretrizes, minuta,
      resumoConfirmedAt: '2026-01-01', diretrizesConfirmedAt: '2026-01-01',
      minutaStatus: 'stale', storedContextHash: 'antigo', currentContextHash: 'novo',
      jurisprudenceResearchCompleted: true,
    });
    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === 'contexto_atual')?.ok).toBe(false);
    expect(report.checks.find((check) => check.id === 'resultado_1.1')?.ok).toBe(false);
  });

  it('confere o resultado saneador sem aprovar ou reprovar as contas', () => {
    const { resumo, diretrizes, minuta } = state();
    diretrizes.achados[0]!.resultado = 'expedicao_medidas_saneadoras';
    diretrizes.achados[0]!.medida = {
      confirmado: false,
      aplicar: true,
      texto: 'Determinar ao Município a apresentação de plano de ação em 60 dias.',
    };
    minuta.decisao_voto = [
      'Voto pela EXPEDIÇÃO DE DETERMINAÇÕES, RECOMENDAÇÕES E/OU MEDIDAS SANEADORAS.',
      diretrizes.achados[0]!.medida.texto,
      'Decisão fundamentada com providências de monitoramento.',
    ].join(' ');
    const hash = generationContextHash(resumo, diretrizes);
    const report = buildConferenceReport({
      resumo, diretrizes, minuta,
      resumoConfirmedAt: '2026-01-01', diretrizesConfirmedAt: '2026-01-01',
      minutaStatus: 'draft', storedContextHash: hash, currentContextHash: hash,
      jurisprudenceResearchCompleted: true,
    });

    expect(report.checks.find((check) => check.id === 'resultado_1.1')?.ok).toBe(true);
    expect(report.checks.find((check) => check.id === 'sem_julgamento_de_contas')?.ok).toBe(true);
    expect(report.ready).toBe(true);
  });

  it('bloqueia minuta que aplica multa depois de ela ser desmarcada', () => {
    const { resumo, diretrizes, minuta } = state();
    minuta.decisao_voto += ' Aplicar multa individual de 10% do limite do art. 73.';
    const hash = generationContextHash(resumo, diretrizes);
    const report = buildConferenceReport({
      resumo, diretrizes, minuta,
      resumoConfirmedAt: '2026-01-01', diretrizesConfirmedAt: '2026-01-01',
      minutaStatus: 'draft', storedContextHash: hash, currentContextHash: hash,
      jurisprudenceResearchCompleted: true,
    });

    expect(report.checks.find((check) => check.id === 'sancoes_desmarcadas_ausentes')?.ok).toBe(false);
    expect(report.ready).toBe(false);
  });

  it('não invalida o contexto apenas por confirmar uma referência', () => {
    const { resumo, diretrizes } = state();
    const before = generationContextHash(resumo, diretrizes);
    resumo.evidencias[0]!.confirmed_by_user = false;
    expect(generationContextHash(resumo, diretrizes)).toBe(before);
  });

  it('aceita a conferência humana quando a comparação automática falha', () => {
    const { resumo, diretrizes, minuta } = state();
    resumo.evidencias[0]!.verification = 'invalid';
    resumo.evidencias[0]!.confirmed_by_user = true;
    const hash = generationContextHash(resumo, diretrizes);
    const report = buildConferenceReport({
      resumo, diretrizes, minuta,
      resumoConfirmedAt: '2026-01-01', diretrizesConfirmedAt: '2026-01-01',
      minutaStatus: 'draft', storedContextHash: hash, currentContextHash: hash,
      jurisprudenceResearchCompleted: true,
    });
    expect(report.checks.find((check) => check.id === 'evidencias_validas')?.ok).toBe(true);
    expect(report.checks.find((check) => check.id === 'evidencias_confirmadas')?.ok).toBe(true);
  });

  it('bloqueia minuta gerada sem pesquisa registrada na jurisprudência oficial', () => {
    const { resumo, diretrizes, minuta } = state();
    const hash = generationContextHash(resumo, diretrizes);
    const report = buildConferenceReport({
      resumo, diretrizes, minuta,
      resumoConfirmedAt: '2026-01-01', diretrizesConfirmedAt: '2026-01-01',
      minutaStatus: 'draft', storedContextHash: hash, currentContextHash: hash,
      jurisprudenceResearchCompleted: false,
    });
    expect(report.checks.find((check) => check.id === 'jurisprudencia_pesquisada')?.ok).toBe(false);
    expect(report.ready).toBe(false);
  });

  it('recusa DOCX antes da aprovação e após qualquer alteração do hash', () => {
    const { resumo, diretrizes, minuta } = state();
    const contextHash = generationContextHash(resumo, diretrizes);
    const approvedHash = contentHash(minuta);
    expect(isApprovedForDownload({
      status: 'draft', approvedHash, minuta,
      storedContextHash: contextHash, currentContextHash: contextHash,
    })).toBe(false);
    expect(isApprovedForDownload({
      status: 'approved', approvedHash, minuta,
      storedContextHash: contextHash, currentContextHash: contextHash,
    })).toBe(true);
    expect(isApprovedForDownload({
      status: 'approved', approvedHash, minuta,
      storedContextHash: 'contexto-da-geracao', currentContextHash: 'contexto-atual-diferente',
    })).toBe(true);
    minuta.relatorio += ' Alteração posterior.';
    expect(isApprovedForDownload({
      status: 'approved', approvedHash, minuta,
      storedContextHash: contextHash, currentContextHash: contextHash,
    })).toBe(false);
  });
});
