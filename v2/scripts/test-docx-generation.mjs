/**
 * Smoke test do gerador de DOCX. Carrega o template, renderiza com
 * dados realistas (texto markdown leve com **negrito**, citações
 * "> [...]" e parágrafos), e salva em /tmp para inspeção.
 *
 *   cd v2
 *   node scripts/test-docx-generation.mjs
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

const TEMPLATE_PATH = path.join(process.cwd(), 'assets', 'template.docx');
const OUT_PATH = path.join(process.cwd(), 'modelos', 'minuta_teste_novo.docx');

// Inline cópia do markdownToWordXml (sem importar TS).
function markdownToWordXml(text, opts = {}) {
  const align = opts.defaultAlign ?? 'both';
  const baseIndent = opts.defaultIndentLeft ?? 0;
  const cleaned = (text ?? '').replace(/\r\n/g, '\n').trim();
  if (!cleaned) return emptyParagraph();
  const blocks = cleaned.split(/\n{2,}/);
  const out = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    for (const line of lines) out.push(renderLine(line, align, baseIndent));
    out.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:p>`);
  }
  return out.join('');
}
function renderLine(line, defaultAlign, baseIndent) {
  const heading = line.match(/^#{1,6}\s+(.*)$/);
  if (heading) {
    return paragraph(runs(heading[1], { boldAll: true }), { align: 'left', indentLeft: baseIndent || undefined, spacingBefore: 240, spacingAfter: 120 });
  }
  if (line.startsWith('> ')) {
    return paragraph(runs(line.slice(2), { italicAll: true }), { align: 'both', indentLeft: baseIndent + 720, spacingBefore: 60, spacingAfter: 60 });
  }
  return paragraph(runs(line), { align: defaultAlign, indentLeft: baseIndent || undefined, spacingBefore: 0, spacingAfter: 120 });
}
function runs(text, opts = {}) {
  const tokens = [];
  let i = 0, bold = !!opts.boldAll, italic = !!opts.italicAll, buf = '';
  const flush = () => { if (buf.length) { tokens.push({ text: buf, bold, italic }); buf = ''; } };
  while (i < text.length) {
    if (text.startsWith('**', i)) { flush(); bold = !bold; i += 2; continue; }
    if (text[i] === '*' && text[i + 1] !== '*') { flush(); italic = !italic; i += 1; continue; }
    buf += text[i]; i += 1;
  }
  flush();
  if (tokens.length === 0) tokens.push({ text, bold: !!opts.boldAll, italic: !!opts.italicAll });
  return tokens.map((t) => {
    const rPr = ['<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>', '<w:sz w:val="22"/>', '<w:szCs w:val="22"/>'];
    if (t.bold) rPr.push('<w:b/>', '<w:bCs/>');
    if (t.italic) rPr.push('<w:i/>', '<w:iCs/>');
    return `<w:r><w:rPr>${rPr.join('')}</w:rPr><w:t xml:space="preserve">${escapeXml(t.text)}</w:t></w:r>`;
  }).join('');
}
function paragraph(inner, style) {
  const indent = style.indentLeft ? `<w:ind w:left="${style.indentLeft}"/>` : '';
  const spacing = `<w:spacing w:before="${style.spacingBefore ?? 0}" w:after="${style.spacingAfter ?? 120}" w:line="276" w:lineRule="auto"/>`;
  return `<w:p><w:pPr>${spacing}${indent}<w:jc w:val="${style.align}"/></w:pPr>${inner}</w:p>`;
}
function emptyParagraph() {
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:p>`;
}
function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// ─── Dados realistas ─────────────────────────────────────────────
const minuta = {
  modalidade_tipo: 'Auditoria Especial - Conformidade',
  ementa: `AUDITORIA ESPECIAL. PREFEITURA MUNICIPAL DE BONITO. EXERCÍCIO 2020. CONTRATAÇÃO DIRETA. DISPENSA DE LICITAÇÃO PARA SERVIÇOS DE TERRAPLENAGEM. SITUAÇÃO EMERGENCIAL COM JUSTIFICATIVAS INSUFICIENTES. PROJETO BÁSICO DEFICIENTE. FALHAS NA FISCALIZAÇÃO. REGULARIDADE COM RESSALVAS.

1. A urgência decorrente de cronograma privado não configura, por si só, a hipótese do art. 24, IV, da Lei 8.666/93.

2. Reincidência na elaboração de projeto básico insuficiente caracteriza falha procedimental grave que enseja ressalva.

3. A ausência de boletim de medição definitivo, somada a "atesto" sem identificação na nota fiscal, fragiliza a liquidação da despesa.`,
  descricao_objeto: 'Avaliar a regularidade e a economicidade das despesas do contrato decorrente da Dispensa de Licitação nº 001/2020, para a contratação de serviços de terraplenagem destinados à implantação de uma fábrica automotiva.',
  relatorio: `Dentre outros documentos que integram os autos, destacam-se:

a) o relatório de Auditoria (doc. 56);

b) as notificações dos interessados (docs. 56 a 128);

c) as defesas prévias (docs. 13, 143, 145 a 175).

Após carrear aos autos vasta documentação, a auditoria emitiu, em 12/02/2025, o relatório apontando a ocorrência de cinco irregularidades.

Dentre os notificados, todos apresentaram defesa.

Vieram-me os autos para julgamento.`,
  analise_completa: `Como a auditoria apontou a ocorrência de cinco irregularidades, passo a analisá-las de forma individual, como se segue:

**2.1.1. Dispensa de Licitação baseada em justificativas insuficientes para caracterizar situação emergencial**

A equipe técnica apontou vício na origem da contratação, conforme destacado na conclusão do Relatório Complementar de Auditoria.

**Análise da Auditoria:**

> *[...] CONSIDERANDO o vício de origem configurado na Dispensa de Licitação baseada em documentos desprovidos de justificativas que inegavelmente pudessem ser consideradas suficientes para a contratação emergencial.*

> *[...] A urgência alegada não se enquadrava nos requisitos do art. 24, IV, da Lei nº 8.666/93.*

**Defesa do Interessado:**

> *[...] os prazos a serem cumpridos junto à empresa YAZAKI DO BRASIL LTDA ERAM BASTANTE EXÍGUOS, prazos estes que não poderiam, sob nenhuma hipótese, sujeitar-se ao risco da licitação fracassar.*

**Análise do Relator:**

Compulsando os autos, verifico que a equipe técnica apontou que a contratação direta carecia de elementos que configurassem, de forma inequívoca, situação emergencial. A defesa, por sua vez, contextualiza a decisão na iminência de perder um investimento de R$ 60 milhões e a geração de 2.000 empregos.

A ponderação exigida pelo art. 20 da LINDB compele a análise das consequências práticas. A perda de tal investimento representaria prejuízo concreto ao interesse público local. A falha reside mais na fundamentação formal do que na substância da decisão.

Diante do exposto, voto pela REGULARIDADE COM RESSALVAS do achado.

**2.1.2. Reincidência na emissão de projeto básico insuficiente**

A auditoria constatou deficiências graves no planejamento da obra.

**Análise da Auditoria:**

> *[...] CONSIDERANDO o encadeamento de graves irregularidades configuradas em insuficiências no planejamento da obra.*

**Defesa do Interessado:**

> *[...] a Administração Municipal buscou a elaboração adequada do projeto básico, observando as normas técnicas e legais pertinentes.*

**Análise do Relator:**

Embora o contexto emergencial possa ter pressionado a equipe técnica, a reincidência na emissão de projetos deficientes é uma falha administrativa que não pode ser ignorada. Contudo, não há nos autos elementos que indiquem dolo ou má-fé.

Diante do exposto, voto pela REGULARIDADE COM RESSALVAS do achado.`,
  decisao_voto: `**6. DECISÃO**

Ante o exposto, profiro o seguinte VOTO:

1. **JULGAR REGULARES COM RESSALVAS** as contas objeto da presente Auditoria Especial, referente ao exercício de 2020.

2. **DETERMINAR** à atual gestão da Prefeitura Municipal de Bonito que adote medidas para aprimorar seus processos de contratação, em especial para que: a) as hipóteses de dispensa de licitação por emergência sejam devidamente fundamentadas; b) os projetos básicos sejam elaborados com o nível de detalhamento exigido por lei; c) sejam instituídos rigorosos mecanismos de fiscalização dos contratos.

Deste modo,

Voto no sentido de:

**CONSIDERANDO** as irregularidades apontadas no Relatório de Auditoria;

**CONSIDERANDO** os argumentos de defesa que contextualizam as decisões diante da urgência em garantir investimento socioeconômico relevante;

**CONSIDERANDO** que, apesar das falhas formais, o objeto contratual foi executado;

**CONSIDERANDO** o disposto no art. 59, II, da Lei Estadual nº 12.600/2004;

**JULGAR REGULARES COM RESSALVAS** o objeto da presente Auditoria Especial.`,
};

const processo = {
  numero: '20100698-4',
  unidade_jurisdicionada: 'Prefeitura Municipal de Bonito',
  exercicio: '2020',
  interessados: 'Gustavo Adolfo Neves de Albuquerque Cesar, Benício José Cavalcanti Ferreira, José Valdir da Silva, Wilson Lourenço dos Santos, Augusto Victor Silva Campos, Xavante Aluguéis de Máquinas Ltda - EPP',
  relator: 'Andressa Cordeiro',
};

async function main() {
  const tpl = await fs.readFile(TEMPLATE_PATH);
  const zip = new PizZip(tpl);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: false,
    delimiters: { start: '{', end: '}' },
    nullGetter: () => '',
  });

  doc.render({
    numero: processo.numero,
    relator: processo.relator,
    modalidade_tipo: minuta.modalidade_tipo,
    exercicio: minuta.exercicio ?? processo.exercicio,
    unidade: processo.unidade_jurisdicionada.toUpperCase(),
    interessados: minuta.interessados ?? processo.interessados,
    ementa_xml: markdownToWordXml(minuta.ementa, { defaultAlign: 'both', defaultIndentLeft: 3968 }),
    descricao_objeto_xml: markdownToWordXml(minuta.descricao_objeto),
    relatorio_xml: markdownToWordXml(minuta.relatorio),
    analise_xml: markdownToWordXml(minuta.analise_completa),
    decisao_xml: markdownToWordXml(minuta.decisao_voto),
  });

  const out = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, out);
  console.log('Gerado:', OUT_PATH, '(', out.length, 'bytes )');
}

main().catch((e) => { console.error(e); process.exit(1); });
