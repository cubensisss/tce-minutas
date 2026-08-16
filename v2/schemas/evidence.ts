import { z } from 'zod';

export const EvidenceVerificationSchema = z.enum([
  'pending',
  'verified',
  'needs_review',
  'invalid',
]);

export const EvidenceRefSchema = z.object({
  id: z.string().min(1),
  document_id: z.string().uuid(),
  filename: z.string().min(1),
  locator_type: z.enum(['page', 'paragraph', 'document']),
  locator_start: z.number().int().positive().nullable().default(null),
  locator_end: z.number().int().positive().nullable().default(null),
  quote: z.string().min(1),
  verification: EvidenceVerificationSchema.default('pending'),
  confirmed_by_user: z.boolean().default(false),
});

export const ReferencedFactSchema = z.object({
  text: z.string().min(1),
  evidence_ids: z.array(z.string().min(1)).min(1),
});

export const PrecedentRefSchema = z.object({
  result_id: z.string().min(1),
  processo: z.string().nullable().default(null),
  acordao: z.string().nullable().default(null),
  title: z.string().nullable().default(null),
  link: z.string().url().nullable().default(null),
  quote: z.string().min(1),
});

export const MinutaReferenceSchema = z.object({
  id: z.string().min(1),
  section: z.enum(['ementa', 'relatorio', 'analise_completa', 'decisao_voto']),
  excerpt: z.string().min(1),
  source_type: z.enum(['document', 'precedent']),
  evidence_id: z.string().nullable().default(null),
  precedent: PrecedentRefSchema.nullable().default(null),
  verification: EvidenceVerificationSchema.default('pending'),
  confirmed_by_user: z.boolean().default(false),
});

export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;
export type ReferencedFact = z.infer<typeof ReferencedFactSchema>;
export type MinutaReference = z.infer<typeof MinutaReferenceSchema>;

