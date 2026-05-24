/**
 * GET /api/similares/abrir?gs=gs://bucket/object
 *
 * Os resultados do Vertex AI Search trazem links no formato gs:// que o
 * navegador não abre. Esta rota faz proxy: autentica via service account,
 * baixa o arquivo do GCS e devolve com Content-Disposition inline.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getAccessToken } from '@/lib/vertex/auth';
import { loggerFor } from '@/lib/logger';

const log = loggerFor('api/similares/abrir');

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // Auth: só usuário logado.
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const gs = request.nextUrl.searchParams.get('gs');
  if (!gs || !gs.startsWith('gs://')) {
    return NextResponse.json({ error: 'invalid_gs_url' }, { status: 400 });
  }

  // gs://bucket/object/path/file.pdf  →  bucket="bucket", object="object/path/file.pdf"
  const withoutScheme = gs.slice('gs://'.length);
  const slashIdx = withoutScheme.indexOf('/');
  if (slashIdx <= 0) {
    return NextResponse.json({ error: 'malformed_gs_url' }, { status: 400 });
  }
  const bucket = withoutScheme.slice(0, slashIdx);
  const object = withoutScheme.slice(slashIdx + 1);

  let token: string;
  try {
    token = await getAccessToken();
  } catch (err) {
    log.error({ err }, 'falha ao obter access token GCP');
    return NextResponse.json({ error: 'gcp_auth_failed' }, { status: 500 });
  }

  // Endpoint XML API: requer encodeURIComponent no nome do objeto
  const upstreamUrl =
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}` +
    `/o/${encodeURIComponent(object)}?alt=media`;

  const upstream = await fetch(upstreamUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!upstream.ok) {
    const txt = await upstream.text().catch(() => '');
    log.warn({ status: upstream.status, gs, body: txt.slice(0, 300) }, 'GCS retornou erro');
    return NextResponse.json(
      { error: `gcs_${upstream.status}`, message: txt.slice(0, 300) },
      { status: upstream.status === 404 ? 404 : 502 },
    );
  }

  const filename = object.split('/').pop() || 'documento.pdf';
  const contentType = upstream.headers.get('content-type') || 'application/pdf';
  const contentLength = upstream.headers.get('content-length');

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Disposition': `inline; filename="${filename}"`,
    'Cache-Control': 'private, max-age=300',
  };
  if (contentLength) headers['Content-Length'] = contentLength;

  return new Response(upstream.body, { status: 200, headers });
}
