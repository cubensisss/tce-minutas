import type { Resumo } from '@/schemas/resumo';
import type { Diretrizes } from '@/schemas/diretrizes';
import type { Minuta } from '@/schemas/minuta';
import { contentHash } from '@/lib/evidence/verify';

export type ConferenceGroup =
  | 'fatos'
  | 'documentos'
  | 'precedentes'
  | 'diretrizes'
  | 'dispositivo'
  | 'pendencias';

export type ConferenceCheck = {
  id: string;
  group: ConferenceGroup;
  label: string;
  detail: string;
  ok: boolean;
};

export type ConferenceReport = {
  checks: ConferenceCheck[];
  blockers: number;
  ready: boolean;
  content_hash: string;
  generated_at: string;
};

export function directiveBlockers(diretrizes: Diretrizes): string[] {
  const errors: string[] = [];
  for (const achado of diretrizes.achados) {
    const prefix = `Achado ${achado.achado_numero}`;
    if (!achado.confirmado) errors.push(`${prefix}: julgamento não confirmado`);
    if (!achado.resultado) errors.push(`${prefix}: resultado não confirmado`);
    if (!achado.sugestao_ia?.fontes.length) errors.push(`${prefix}: fundamentação jurídica sem fonte verificada`);
    if (!achado.multa.confirmado) errors.push(`${prefix}: decisão sobre multa pendente`);
    if (!achado.debito.confirmado) errors.push(`${prefix}: decisão sobre débito pendente`);
    if (!achado.medida.confirmado) errors.push(`${prefix}: decisão sobre medida pendente`);
    if (achado.multa.aplicar && !achado.multa.valor.trim()) errors.push(`${prefix}: valor da multa ausente`);
    if (achado.debito.imputar && !achado.debito.valor.trim()) errors.push(`${prefix}: valor do débito ausente`);
    if (achado.medida.aplicar && !achado.medida.texto.trim()) errors.push(`${prefix}: texto da medida ausente`);
  }
  return errors;
}

export function buildConferenceReport(input: {
  resumo: Resumo;
  diretrizes: Diretrizes;
  minuta: Minuta;
  resumoConfirmedAt: string | null;
  diretrizesConfirmedAt: string | null;
  minutaStatus: string | null;
  storedContextHash: string | null;
  currentContextHash: string;
}): ConferenceReport {
  const checks: ConferenceCheck[] = [];
  const add = (item: ConferenceCheck) => checks.push(item);

  add({
    id: 'resumo_confirmado', group: 'fatos', label: 'Resumo confirmado pelo assessor',
    detail: input.resumoConfirmedAt ? 'Confirmação registrada.' : 'Revise e confirme o resumo antes de continuar.',
    ok: !!input.resumoConfirmedAt,
  });

  const evidenceIds = new Set(input.resumo.evidencias.map((item) => item.id));
  const facts = input.resumo.achados.flatMap((achado) => achado.fatos_apurados);
  const referencedFacts = input.resumo.achados.flatMap((achado) => achado.fatos_referenciados);
  const factsCovered = facts.length > 0 && facts.every((fact) =>
    referencedFacts.some((item) => normalize(item.text) === normalize(fact) &&
      item.evidence_ids.length > 0 && item.evidence_ids.every((id) => evidenceIds.has(id))),
  );
  add({
    id: 'fatos_referenciados', group: 'fatos', label: 'Fatos vinculados às fontes',
    detail: `${referencedFacts.length} de ${facts.length} fatos possuem vínculo estruturado.`,
    ok: factsCovered,
  });

  const invalidEvidence = input.resumo.evidencias.filter((item) =>
    item.verification === 'invalid' && !item.confirmed_by_user,
  );
  const pendingEvidence = input.resumo.evidencias.filter((item) => !item.confirmed_by_user);
  add({
    id: 'evidencias_validas', group: 'documentos', label: 'Trechos encontrados nos documentos',
    detail: invalidEvidence.length === 0
      ? `${input.resumo.evidencias.length} evidências localizadas.`
      : `${invalidEvidence.length} evidência(s) não tiveram correspondência automática nem confirmação humana.`,
    ok: input.resumo.evidencias.length > 0 && invalidEvidence.length === 0,
  });
  add({
    id: 'evidencias_confirmadas', group: 'documentos', label: 'Referências documentais conferidas',
    detail: pendingEvidence.length === 0
      ? 'Todas as referências foram confirmadas.'
      : `${pendingEvidence.length} referência(s) aguardam confirmação humana.`,
    ok: input.resumo.evidencias.length > 0 && pendingEvidence.length === 0,
  });

  const directiveErrors = directiveBlockers(input.diretrizes);
  add({
    id: 'diretrizes_completas', group: 'diretrizes', label: 'Todas as decisões foram confirmadas',
    detail: directiveErrors.length === 0 ? 'Resultados e medidas estão completos.' : directiveErrors.join('; '),
    ok: directiveErrors.length === 0 && !!input.diretrizesConfirmedAt,
  });

  const contextOk = input.minutaStatus !== 'stale' &&
    !!input.storedContextHash && input.storedContextHash === input.currentContextHash;
  add({
    id: 'contexto_atual', group: 'pendencias', label: 'Minuta usa o contexto atual',
    detail: contextOk ? 'Resumo e diretrizes não mudaram desde a geração.' : 'A minuta precisa ser regenerada.',
    ok: contextOk,
  });

  const documentRefs = input.minuta.referencias.filter((item) => item.source_type === 'document');
  const precedentRefs = input.minuta.referencias.filter((item) => item.source_type === 'precedent');
  const minuteText = [input.minuta.ementa, input.minuta.relatorio, input.minuta.analise_completa, input.minuta.decisao_voto].join('\n');
  const citesPrecedent = /(?:ac[oó]rd[aã]o|processo\s+tce[-\s])/i.test(minuteText);
  const sectionText = {
    ementa: input.minuta.ementa,
    relatorio: input.minuta.relatorio,
    analise_completa: input.minuta.analise_completa,
    decisao_voto: input.minuta.decisao_voto,
  };
  const invalidMinuteRefs = input.minuta.referencias.filter((item) =>
    item.verification === 'invalid' || !sectionText[item.section].includes(item.excerpt),
  );
  const unconfirmedMinuteRefs = input.minuta.referencias.filter((item) => !item.confirmed_by_user);
  add({
    id: 'referencias_minuta', group: 'documentos', label: 'Minuta vinculada às evidências',
    detail: `${documentRefs.length} referência(s) documental(is); ${invalidMinuteRefs.length} inválida(s).`,
    ok: documentRefs.length > 0 && invalidMinuteRefs.length === 0,
  });
  add({
    id: 'precedentes_verificados', group: 'precedentes', label: 'Precedentes identificados e verificáveis',
    detail: precedentRefs.length === 0
      ? 'Nenhum precedente nominal foi usado.'
      : `${precedentRefs.length} precedente(s) referenciado(s).`,
    ok: (!citesPrecedent || precedentRefs.length > 0) &&
      precedentRefs.every((item) => item.verification === 'verified' && !!item.precedent?.link),
  });
  add({
    id: 'referencias_minuta_confirmadas', group: 'pendencias', label: 'Referências da minuta conferidas',
    detail: unconfirmedMinuteRefs.length === 0
      ? 'Todas as referências da minuta foram confirmadas.'
      : `${unconfirmedMinuteRefs.length} referência(s) aguardam confirmação.`,
    ok: input.minuta.referencias.length > 0 && unconfirmedMinuteRefs.length === 0,
  });

  for (const achado of input.diretrizes.achados) {
    const required = achado.resultado === 'irregular'
      ? 'IRREGULARIDADE'
      : achado.resultado === 'regular_com_ressalvas' ? 'REGULARIDADE COM RESSALVAS' : 'REGULARIDADE';
    add({
      id: `resultado_${achado.achado_numero}`, group: 'dispositivo',
      label: `Resultado do achado ${achado.achado_numero}`,
      detail: `O dispositivo deve conter “${required}”.`,
      ok: normalize(input.minuta.decisao_voto).includes(normalize(required)),
    });
    for (const sanction of [
      { name: 'multa', active: achado.multa.aplicar, value: achado.multa.valor },
      { name: 'débito', active: achado.debito.imputar, value: achado.debito.valor },
      { name: 'medida', active: achado.medida.aplicar, value: achado.medida.texto },
    ]) {
      if (!sanction.active) continue;
      add({
        id: `${sanction.name}_${achado.achado_numero}`, group: 'dispositivo',
        label: `${sanction.name} do achado ${achado.achado_numero}`,
        detail: `O valor/texto confirmado deve aparecer literalmente no dispositivo.`,
        ok: normalize(input.minuta.decisao_voto).includes(normalize(sanction.value)),
      });
    }
  }

  const hasVerifyMarker = /\[VERIFICAR\s*:/i.test([
    input.minuta.ementa, input.minuta.relatorio, input.minuta.analise_completa,
    input.minuta.decisao_voto, input.minuta.sugestao_pendente ?? '',
  ].join('\n'));
  add({
    id: 'sem_pendencias_textuais', group: 'pendencias', label: 'Sem marcações pendentes',
    detail: hasVerifyMarker || input.minuta.sugestao_pendente
      ? 'Existem marcações [VERIFICAR] ou sugestões pendentes.'
      : 'Nenhuma marcação pendente foi encontrada.',
    ok: !hasVerifyMarker && !input.minuta.sugestao_pendente,
  });

  const blockers = checks.filter((item) => !item.ok).length;
  return {
    checks,
    blockers,
    ready: blockers === 0,
    content_hash: contentHash(input.minuta),
    generated_at: new Date().toISOString(),
  };
}

export function generationContextHash(resumo: Resumo, diretrizes: Diretrizes): string {
  // Confirmações de referência são metadados da conferência e não alteram o
  // conteúdo que serviu de base à redação. Por isso não tornam a minuta obsoleta.
  const normalizedResumo = {
    ...resumo,
    evidencias: resumo.evidencias.map(({ confirmed_by_user: _confirmed, ...evidence }) => evidence),
  };
  return contentHash({ resumo: normalizedResumo, diretrizes });
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim().toUpperCase();
}
