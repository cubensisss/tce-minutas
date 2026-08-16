import { createHash } from 'node:crypto';
import type { Resumo } from '@/schemas/resumo';
import type { Minuta } from '@/schemas/minuta';
import type { SimilarResult } from '@/lib/types/database';
import type { ExtractionArtifact } from '@/lib/storage/extraction';
import { locatorContainsQuote, quoteExistsInArtifact } from '@/lib/storage/extraction';

export function verifyResumoEvidence(
  resumo: Resumo,
  artifacts: ExtractionArtifact[],
): Resumo {
  const byId = new Map(artifacts.map((artifact) => [artifact.document_id, artifact]));
  return {
    ...resumo,
    evidencias: resumo.evidencias.map((evidence) => {
      const artifact = byId.get(evidence.document_id);
      if (!artifact) return { ...evidence, verification: 'invalid' as const };
      const locatorMatch = locatorContainsQuote(
        evidence.quote,
        artifact,
        evidence.locator_type,
        evidence.locator_start,
      );
      if (!locatorMatch) {
        return {
          ...evidence,
          verification: quoteExistsInArtifact(evidence.quote, artifact)
            ? 'needs_review' as const
            : 'invalid' as const,
        };
      }
      const locator = artifact.locators.find((item) =>
        item.type === evidence.locator_type && item.number === evidence.locator_start,
      );
      return {
        ...evidence,
        verification: locator?.confidence === 'confirmed' ? 'verified' as const : 'needs_review' as const,
      };
    }),
  };
}

export function verifyMinutaReferences(
  minuta: Minuta,
  resumo: Resumo,
  precedentes: SimilarResult[],
): Minuta {
  const evidenceIds = new Set(resumo.evidencias.map((item) => item.id));
  const precedentsById = new Map(precedentes.map((item) => [item.id, item]));
  return {
    ...minuta,
    referencias: minuta.referencias.map((reference) => {
      if (reference.source_type === 'document') {
        return {
          ...reference,
          verification: reference.evidence_id && evidenceIds.has(reference.evidence_id)
            ? 'verified' as const
            : 'invalid' as const,
        };
      }
      const precedent = reference.precedent
        ? precedentsById.get(reference.precedent.result_id)
        : null;
      const valid = !!precedent && !!precedent.link &&
        precedent.link === reference.precedent?.link &&
        normalize(precedent.snippet ?? '').includes(normalize(reference.precedent?.quote ?? ''));
      return { ...reference, verification: valid ? 'verified' as const : 'invalid' as const };
    }),
  };
}

export function contentHash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}
