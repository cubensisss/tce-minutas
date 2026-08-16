import type { Minuta } from '@/schemas/minuta';
import { contentHash } from '@/lib/evidence/verify';

export function isApprovedForDownload(input: {
  status: string | null;
  approvedHash: string | null;
  minuta: Minuta;
  storedContextHash: string | null;
  currentContextHash: string | null;
}): boolean {
  return input.status === 'approved' &&
    input.approvedHash === contentHash(input.minuta) &&
    !!input.currentContextHash &&
    input.storedContextHash === input.currentContextHash;
}
