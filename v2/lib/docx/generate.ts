/**
 * Geração do DOCX da minuta usando docxtemplater.
 *
 * O template em assets/template.docx replica a formatação do modelo de
 * referência da Conselheira:
 *   - Caixas/bordas em IDENTIFICAÇÃO, EMENTA, DESCRIÇÃO DO OBJETO,
 *     RELATÓRIO, VOTO.
 *   - Cabeçalho de identificação com rótulos em negrito.
 *
 * Os blocos longos (ementa, descrição, relatório, análise, decisão)
 * vêm da IA em texto com markdown leve. Aqui convertemos esse texto
 * em XML do Word (parágrafos justificados, negrito para **...**, itálico
 * para *...*, citações com indent para linhas que começam com "> ").
 * O template usa raw tags ({@bloco_xml}) para receber esse XML.
 *
 * Dessa forma a Conselheira pode ajustar fonte/margens no Word sem
 * tocar no fluxo de geração.
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import type { Minuta } from '@/schemas/minuta';
import type { Processo } from '@/lib/types/database';

const TEMPLATE_PATH = path.join(process.cwd(), 'assets', 'template.docx');

export type GenerateDocxInput = {
  processo: Pick<
    Processo,
    'numero' | 'unidade_jurisdicionada' | 'exercicio' | 'interessados' | 'relator'
  >;
  minuta: Minuta;
};

export async function generateMinutaDocx(input: GenerateDocxInput): Promise<Buffer> {
  const templateBytes = await fs.readFile(TEMPLATE_PATH);
  const zip = new PizZip(templateBytes);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: false,
    delimiters: { start: '{', end: '}' },
    nullGetter: () => '',
  });

  const relatorClean = (input.processo.relator ?? 'Andressa Cordeiro')
    .replace(/(CONSELHEIRO\(A\)\s*|CONSELHEIRO\s*|CONSELHEIRA\s*)+/gi, '')
    .trim();

  doc.render({
    numero: input.processo.numero ?? '',
    relator: relatorClean,
    modalidade_tipo: input.minuta.modalidade_tipo ?? 'Auditoria Especial',
    exercicio: input.minuta.exercicio ?? input.processo.exercicio ?? '',
    unidade: (input.processo.unidade_jurisdicionada ?? '').toUpperCase(),
    interessados: input.minuta.interessados ?? input.processo.interessados ?? '',
    // Blocos longos como XML pré-formatado (raw):
    // EMENTA: indentada à direita (~3968 DXA ≈ 2,75"), igual ao modelo.
    ementa_xml: markdownToWordXml(input.minuta.ementa, {
      defaultAlign: 'both',
      defaultIndentLeft: 3968,
    }),
    descricao_objeto_xml: markdownToWordXml(input.minuta.descricao_objeto ?? '', {
      defaultAlign: 'both',
    }),
    relatorio_xml: markdownToWordXml(input.minuta.relatorio, { defaultAlign: 'both' }),
    analise_xml: markdownToWordXml(input.minuta.analise_completa, { defaultAlign: 'both' }),
    decisao_xml: markdownToWordXml(input.minuta.decisao_voto, { defaultAlign: 'both' }),
  });

  const out = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  return out as Buffer;
}

// ─── Conversão Markdown → WordprocessingML ───────────────────────────

type MdToXmlOptions = {
  defaultAlign?: 'left' | 'right' | 'center' | 'both';
  /**
   * Indent à esquerda em DXA aplicado a TODOS os parágrafos do bloco
   * (exceto citações com "> ", que já usam indent próprio). Usado pela
   * EMENTA, que no modelo da Conselheira fica empurrada para a direita
   * (~3968 DXA ≈ 2,75").
   */
  defaultIndentLeft?: number;
};

/**
 * Converte texto com markdown leve em uma sequência de <w:p>...</w:p>
 * pronta para ser injetada no template via {@raw}. Suporta:
 *
 *   - Parágrafos separados por linha em branco.
 *   - **negrito** e *itálico* dentro do parágrafo.
 *   - Linhas começando com "> " viram parágrafo de citação (indentado
 *     ~720 dxa, em itálico, como no modelo).
 *   - Linhas que começam com `# `, `## ` ou `### ` viram parágrafos em
 *     negrito (cabeçalhos internos das seções de análise dos achados).
 *   - Listas "1. ", "2. ", "a) ", "b) " mantêm o marcador como texto.
 *
 * O conversor é deliberadamente conservador — não tenta reproduzir
 * markdown completo, só o subconjunto que aparece nas minutas.
 */
function markdownToWordXml(text: string, opts: MdToXmlOptions = {}): string {
  const align = opts.defaultAlign ?? 'both';
  const baseIndent = opts.defaultIndentLeft ?? 0;
  const cleaned = (text ?? '').replace(/\r\n/g, '\n').trim();
  if (!cleaned) {
    return emptyParagraph();
  }

  // Quebra em parágrafos: linhas em branco separam blocos. Linhas
  // únicas dentro do mesmo bloco viram parágrafos individuais também,
  // porque a IA frequentemente gera assim.
  const blocks = cleaned.split(/\n{2,}/);
  const out: string[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    for (const line of lines) {
      out.push(renderLine(line, align, baseIndent));
    }
    // Espaçamento entre blocos: parágrafo vazio fininho.
    out.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:p>`);
  }

  return out.join('');
}

function renderLine(line: string, defaultAlign: string, baseIndent: number): string {
  // Cabeçalho de achado: "## 2.1.1. Título" ou "### algo" — vira
  // parágrafo em negrito justificado, com espaço antes.
  const headingMatch = line.match(/^#{1,6}\s+(.*)$/);
  if (headingMatch) {
    return paragraph(runs(headingMatch[1] ?? '', { boldAll: true }), {
      align: 'left',
      indentLeft: baseIndent || undefined,
      spacingBefore: 240,
      spacingAfter: 120,
    });
  }

  // Citação em blockquote: "> texto" — indentada, em itálico.
  // Se o bloco já tem baseIndent (ex: ementa), soma 720 ao indent base.
  if (line.startsWith('> ')) {
    const inner = line.slice(2);
    return paragraph(runs(inner, { italicAll: true }), {
      align: 'both',
      indentLeft: baseIndent + 720,
      spacingBefore: 60,
      spacingAfter: 60,
    });
  }

  // Linha "comum": pode conter **negrito**/*itálico*.
  return paragraph(runs(line), {
    align: defaultAlign,
    indentLeft: baseIndent || undefined,
    spacingBefore: 0,
    spacingAfter: 120,
  });
}

type RunOpts = { boldAll?: boolean; italicAll?: boolean };

/**
 * Tokeniza inline markdown em runs do Word. Suporta **bold** e *italic*
 * intercalados; o tokenizer é simples (greedy match) — mas como a IA
 * gera markdown disciplinado, isso basta.
 */
function runs(text: string, opts: RunOpts = {}): string {
  const tokens: Array<{ text: string; bold: boolean; italic: boolean }> = [];
  let i = 0;
  let bold = !!opts.boldAll;
  let italic = !!opts.italicAll;
  let buf = '';

  const flush = () => {
    if (buf.length === 0) return;
    tokens.push({ text: buf, bold, italic });
    buf = '';
  };

  while (i < text.length) {
    if (text.startsWith('**', i)) {
      flush();
      bold = !bold;
      i += 2;
      continue;
    }
    if (text[i] === '*' && text[i + 1] !== '*') {
      flush();
      italic = !italic;
      i += 1;
      continue;
    }
    buf += text[i];
    i += 1;
  }
  flush();

  // Fallback: se o tokenizer "fechou" no meio (asteriscos órfãos), faz
  // graceful degradation tratando tudo como texto plano.
  if (tokens.length === 0) {
    tokens.push({ text, bold: !!opts.boldAll, italic: !!opts.italicAll });
  }

  return tokens
    .map((t) => {
      const rPrParts: string[] = [
        '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>',
        '<w:sz w:val="22"/>',
        '<w:szCs w:val="22"/>',
      ];
      if (t.bold) rPrParts.push('<w:b/>', '<w:bCs/>');
      if (t.italic) rPrParts.push('<w:i/>', '<w:iCs/>');
      return `<w:r><w:rPr>${rPrParts.join('')}</w:rPr><w:t xml:space="preserve">${escapeXml(t.text)}</w:t></w:r>`;
    })
    .join('');
}

type PStyle = {
  align: string;
  indentLeft?: number;
  spacingBefore?: number;
  spacingAfter?: number;
};

function paragraph(innerRuns: string, style: PStyle): string {
  const indent = style.indentLeft
    ? `<w:ind w:left="${style.indentLeft}"/>`
    : '';
  const spacing = `<w:spacing w:before="${style.spacingBefore ?? 0}" w:after="${
    style.spacingAfter ?? 120
  }" w:line="276" w:lineRule="auto"/>`;
  return `<w:p><w:pPr>${spacing}${indent}<w:jc w:val="${style.align}"/></w:pPr>${innerRuns}</w:p>`;
}

function emptyParagraph(): string {
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:p>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
