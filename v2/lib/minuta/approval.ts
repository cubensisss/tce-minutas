import type { Minuta } from '@/schemas/minuta';
import { contentHash } from '@/lib/evidence/verify';

export function isApprovedForDownload(input: {
  status: string | null;
  approvedHash: string | null;
  minuta: Minuta;
  storedContextHash: string | null;
  currentContextHash: string | null;
}): boolean {
  // A aprovação humana da versão exata da minuta é suficiente para liberar o
  // arquivo. Divergências de contexto continuam visíveis na conferência como
  // avisos, mas não bloqueiam o fluxo.
  return input.status === 'approved' &&
    input.approvedHash === contentHash(input.minuta);
}
