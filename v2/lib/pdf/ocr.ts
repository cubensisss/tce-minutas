/**
 * Fallback de OCR via Gemini Flash multimodal.
 *
 * Quando o unpdf não encontra texto (PDF escaneado, só imagens), enviamos
 * o PDF inteiro pro Gemini Flash pedindo extração LITERAL do conteúdo
 * visual. O modelo aceita PDFs como entrada multimodal direto, então não
 * precisamos converter pra imagem antes.
 *
 * Limite: arquivos até ~20MB cabem inline. Acima disso seria necessário
 * usar a Files API do Gemini. Para o TCE-PE, relatórios costumam ter
 * 1-5MB — confortável.
 */
import { generateTextWithFile } from '@/lib/gemini/client';
import { loggerFor } from '@/lib/logger';

const log = loggerFor('pdf/ocr');

const SYSTEM_PROMPT = `Você é um motor de OCR. Sua única tarefa é
transcrever LITERALMENTE o texto visível no documento fornecido —
sem resumir, sem interpretar, sem reformatar.

Regras:
- Reproduza o texto na ORDEM em que aparece no documento.
- Preserve quebras de parágrafo, mas não invente formatação.
- Mantenha números, datas, valores monetários e nomes próprios EXATAMENTE
  como aparecem (incluindo acentos, pontuação e formatação tipo "R$").
- Se houver tabelas, transcreva linha a linha, separando colunas com
  " | " (barra vertical entre espaços).
- Se uma palavra estiver ilegível, marque como [ilegível] — não chute.
- Não escreva nada além do conteúdo transcrito. Sem cabeçalhos do tipo
  "Aqui está a transcrição:" ou avisos.`;

const USER_PROMPT = `Transcreva LITERALMENTE todo o texto deste PDF. Mantenha
ordem original, quebras de parágrafo e valores exatos.`;

/**
 * Recebe o PDF como bytes e retorna texto puro extraído via Gemini.
 * Lança erro se a chamada falhar — o caller decide se trata como
 * documento intransponível ou propaga.
 */
export async function ocrPdfWithGemini(
  bytes: Uint8Array | ArrayBuffer,
  filename: string,
): Promise<string> {
  log.info({ filename, sizeKb: Math.round((bytes instanceof Uint8Array ? bytes.length : bytes.byteLength) / 1024) }, 'iniciando OCR via Gemini Flash');

  const text = await generateTextWithFile({
    model: 'flash',
    system: SYSTEM_PROMPT,
    prompt: USER_PROMPT,
    fileBytes: bytes,
    fileMimeType: 'application/pdf',
    temperature: 0.1,
    // Relatórios de auditoria reais podem ter 30-80k caracteres.
    // Gemini Flash 2.5 suporta saída de até ~64k tokens — usamos teto
    // generoso para não cortar documentos longos.
    maxOutputTokens: 32_000,
    timeoutMs: 180_000,
    retries: 1,
  });

  log.info({ filename, chars: text.length }, 'OCR concluído');
  return text.trim();
}
