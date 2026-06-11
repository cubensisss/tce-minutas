/**
 * Extração de texto de PDF/DOCX 100% em Node — substitui o
 * scripts/extract_text.py do v1 (PyMuPDF + child_process.exec).
 *
 * Vantagens:
 *  - sem dependência de Python na imagem Render
 *  - sem custo de spawn de processo por arquivo
 *  - tipos de retorno consistentes
 */
import { extractText as unpdfExtract, getDocumentProxy } from 'unpdf';
import { loggerFor } from '@/lib/logger';

const log = loggerFor('pdf/extract');

export type ExtractedDocument = {
  filename: string;
  /** Texto concatenado do documento todo. */
  text: string;
  /** Texto separado por página (PDFs). DOCX retorna [text]. */
  pages: string[];
  charCount: number;
  warnings: string[];
};

export async function extractFromBuffer(
  buffer: ArrayBuffer | Uint8Array,
  filename: string,
): Promise<ExtractedDocument> {
  const ext = (filename.split('.').pop() ?? '').toLowerCase();
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (ext === 'pdf') return extractPdf(bytes, filename);
  
  if (ext === 'docx' || ext === 'xml' || ext === 'doc') {
    try {
      // Tenta como DOCX (ZIP) primeiro
      return await extractDocx(bytes, filename);
    } catch (err) {
      log.warn({ err, filename }, 'Falha no formato ZIP/DOCX. Tentando leitura como XML puro ou RTF...');
      try {
        const res = await extractXml(bytes, filename);
        // Se extrair um monte de caracteres nulos, provavelmente é um binário .doc
        if (res.text.split('\u0000').length > 50) {
          throw new Error('Arquivo parece ser um formato binário muito antigo (.doc) não suportado. Por favor converta para PDF.');
        }
        return res;
      } catch (xmlErr) {
        throw new Error(`O arquivo "${filename}" não pôde ser lido nem como DOCX nem como XML. Converta para PDF.`);
      }
    }
  }

  throw new Error(`Extensão não suportada: .${ext} (${filename})`);
}

async function extractPdf(bytes: Uint8Array, filename: string): Promise<ExtractedDocument> {
  const warnings: string[] = [];
  try {
    // unpdf retorna { text: string[]|string, totalPages }
    const pdf = await getDocumentProxy(bytes);
    const result = await unpdfExtract(pdf, { mergePages: false });
    const pages: string[] = Array.isArray(result.text) ? result.text : [String(result.text ?? '')];
    const text = pages.join('\n\n').trim();
    if (!text) warnings.push('PDF parece estar vazio ou ser só imagens (precisaria OCR)');
    log.debug({ filename, pages: pages.length, chars: text.length }, 'pdf extraído');
    return { filename, text, pages, charCount: text.length, warnings };
  } catch (err) {
    log.error({ err, filename }, 'falha ao extrair PDF');
    throw new Error(`Erro ao extrair PDF "${filename}": ${(err as Error).message}`);
  }
}

async function extractDocx(bytes: Uint8Array, filename: string): Promise<ExtractedDocument> {
  // Docx é um zip com word/document.xml. Lemos via PizZip + XML strip.
  // Não usamos mammoth pra evitar uma dep só pra essa rota.
  const PizZip = (await import('pizzip')).default;
  try {
    const zip = new PizZip(bytes);
    const xml = zip.file('word/document.xml')?.asText();
    if (!xml) throw new Error('document.xml ausente — DOCX corrompido?');
    const text = xml
      // <w:p> vira quebra de parágrafo
      .replace(/<\/w:p>/g, '\n')
      // <w:tab/> vira tab
      .replace(/<w:tab[^>]*\/?>/g, '\t')
      // remove qualquer outra tag XML
      .replace(/<[^>]+>/g, '')
      // entities básicas
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return { filename, text, pages: [text], charCount: text.length, warnings: [] };
  } catch (err) {
    log.error({ err, filename }, 'falha ao extrair DOCX');
    throw new Error(`Erro ao extrair DOCX "${filename}": ${(err as Error).message}`);
  }
}

async function extractXml(bytes: Uint8Array, filename: string): Promise<ExtractedDocument> {
  try {
    const decoder = new TextDecoder('utf-8');
    const rawXml = decoder.decode(bytes);
    
    const text = rawXml
      // tag replacement
      .replace(/<[^>]+>/g, ' ')
      // entities
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      // Remove strings gigantescas sem espaços (geralmente base64 de assinaturas/anexos dentro do XML)
      // que consomem todos os tokens da IA e causam timeout, mas preserva todo o texto real
      .replace(/[A-Za-z0-9+/=]{50,}/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
      
    if (!text) throw new Error('XML parece não conter texto útil');
    
    return { filename, text, pages: [text], charCount: text.length, warnings: [] };
  } catch (err) {
    log.error({ err, filename }, 'falha ao extrair XML');
    throw new Error(`Erro ao extrair XML "${filename}": ${(err as Error).message}`);
  }
}
