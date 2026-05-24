/**
 * POST /api/similares/resumir
 *
 * Baixa o PDF do GCS (mesmo padrão de /api/similares/abrir), extrai texto
 * via unpdf e gera um resumo estruturado via Gemini Flash. Pesado — só
 * roda quando o usuário clica no botão "Gerar resumo".
 *
 * Body: { gs_url, title? }
 * Resp: { resumo: string, paginas: number }
 */
import { z } from 'zod';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getAccessToken } from '@/lib/vertex/auth';
import { extractFromBuffer } from '@/lib/pdf/extract';
import { generateText } from '@/lib/gemini/client';
import { loggerFor } from '@/lib/logger';

const log = loggerFor('api/similares/resumir');

export const runtime = 'nodejs';
export const maxDuration = 120;

const Body = z.object({
  gs_url: z.string().startsWith('gs://'),
  title: z.string().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Parse gs://bucket/object
  const withoutScheme = parsed.data.gs_url.slice('gs://'.length);
  const slashIdx = withoutScheme.indexOf('/');
  if (slashIdx <= 0) {
    return NextResponse.json({ error: 'malformed_gs_url' }, { status: 400 });
  }
  const bucket = withoutScheme.slice(0, slashIdx);
  const object = withoutScheme.slice(slashIdx + 1);
  const filename = object.split('/').pop() || 'documento.pdf';

  // Baixa o PDF do GCS
  let pdfBytes: ArrayBuffer;
  try {
    const token = await getAccessToken();
    const upstreamUrl =
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}` +
      `/o/${encodeURIComponent(object)}?alt=media`;
    const upstream = await fetch(upstreamUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!upstream.ok) {
      const txt = await upstream.text().catch(() => '');
      log.warn({ status: upstream.status, gs: parsed.data.gs_url, body: txt.slice(0, 300) }, 'GCS erro');
      return NextResponse.json(
        { error: `gcs_${upstream.status}` },
        { status: upstream.status === 404 ? 404 : 502 },
      );
    }
    pdfBytes = await upstream.arrayBuffer();
  } catch (err) {
    log.error({ err }, 'falha download GCS');
    return NextResponse.json({ error: 'gcs_fetch_failed' }, { status: 500 });
  }

  // Extrai texto
  let text: string;
  let pages: number;
  try {
    const extracted = await extractFromBuffer(pdfBytes, filename);
    text = extracted.text;
    pages = extracted.pages.length;
    if (!text || text.length < 100) {
      return NextResponse.json(
        { error: 'pdf_vazio_ou_imagem', message: 'PDF parece estar vazio ou ser só imagens (precisa OCR)' },
        { status: 422 },
      );
    }
  } catch (err) {
    log.error({ err }, 'falha extract pdf');
    return NextResponse.json({ error: 'pdf_extract_failed' }, { status: 500 });
  }

  // Resumo com Gemini Flash. Trunca pra ~80k chars (Flash aguenta bem).
  const truncated = text.length > 80_000
    ? text.slice(0, 40_000) + '\n\n[... TEXTO TRUNCADO ...]\n\n' + text.slice(-40_000)
    : text;

  const system = `Você é um assistente jurídico do TCE-PE. Resuma o
documento abaixo (Informação Técnica de Diligência — ITD do TCE-PE) em
formato estruturado, em português formal, ~250 palavras. Use a estrutura:

**Processo:** [número e UJ]
**Matéria:** [tema central — licitação, prestação de contas, etc]
**Achados principais:** [lista curta dos achados em 1 frase cada]
**Posicionamento da auditoria:** [conclusão]
**Fundamentação legal:** [artigos citados]
**Resultado/encaminhamento:** [se identificável no texto]

Não invente. Se um campo não estiver claro no texto, escreva "(não identificado)".`;

  try {
    const resumo = await generateText({
      model: 'flash',
      system,
      prompt: truncated,
      temperature: 0.2,
      timeoutMs: 90_000,
      retries: 1,
    });
    return NextResponse.json({ resumo: resumo.trim(), paginas: pages });
  } catch (err) {
    log.error({ err }, 'falha gemini resumo');
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'gemini_error' },
      { status: 500 },
    );
  }
}
