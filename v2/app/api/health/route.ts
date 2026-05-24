/**
 * Health check para o Render. Não checa Supabase de propósito —
 * queremos que o serviço siga UP mesmo se o banco estiver com latência.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    status: 'ok',
    service: 'tce-minutas-v2',
    timestamp: new Date().toISOString(),
  });
}
