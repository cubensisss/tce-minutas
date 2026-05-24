/**
 * Gera o assets/template.docx replicando a formatacao do modelo de
 * referencia da Conselheira (modelos/Modelo andressa).
 *
 *   - A4, fonte Arial 11pt, margens proximas do modelo.
 *   - Caixas (tabelas com borda preta) em "IDENTIFICACAO DO PROCESSO",
 *     "EMENTA", "DESCRICAO DO OBJETO", "RELATORIO" e "VOTO".
 *   - Conteudo justificado.
 *
 * Os blocos longos (ementa, relatorio, analise, decisao) sao inseridos
 * via raw XML pelo lib/docx/generate.ts (placeholder {@bloco_xml}).
 *
 * Uso:
 *   cd v2
 *   node scripts/generate-template.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import PizZip from 'pizzip';

const TEMPLATE_PATH = path.join(process.cwd(), 'assets', 'template.docx');

// Largura util A4 (11906) - margens (1814 + 1308) = 8784.
const TBL_W = 8784;

function caixa(label) {
  return `
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="${TBL_W}" w:type="dxa"/>
        <w:jc w:val="left"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="8" w:space="0" w:color="000000"/>
          <w:left w:val="single" w:sz="8" w:space="0" w:color="000000"/>
          <w:bottom w:val="single" w:sz="8" w:space="0" w:color="000000"/>
          <w:right w:val="single" w:sz="8" w:space="0" w:color="000000"/>
          <w:insideH w:val="single" w:sz="8" w:space="0" w:color="000000"/>
          <w:insideV w:val="single" w:sz="8" w:space="0" w:color="000000"/>
        </w:tblBorders>
        <w:tblLayout w:type="fixed"/>
      </w:tblPr>
      <w:tblGrid><w:gridCol w:w="${TBL_W}"/></w:tblGrid>
      <w:tr>
        <w:trPr><w:trHeight w:val="510" w:hRule="atLeast"/></w:trPr>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="${TBL_W}" w:type="dxa"/>
            <w:tcMar>
              <w:top w:w="100" w:type="dxa"/>
              <w:left w:w="100" w:type="dxa"/>
              <w:bottom w:w="100" w:type="dxa"/>
              <w:right w:w="100" w:type="dxa"/>
            </w:tcMar>
            <w:vAlign w:val="center"/>
          </w:tcPr>
          <w:p>
            <w:pPr>
              <w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>
              <w:jc w:val="center"/>
              <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:sz w:val="24"/></w:rPr>
            </w:pPr>
            <w:r>
              <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:sz w:val="24"/></w:rPr>
              <w:t xml:space="preserve">${label}</w:t>
            </w:r>
          </w:p>
        </w:tc>
      </w:tr>
    </w:tbl>`;
}

const BR = `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="276" w:lineRule="auto"/></w:pPr></w:p>`;

function ident(label, placeholder) {
  return `
    <w:p>
      <w:pPr>
        <w:spacing w:before="60" w:after="60" w:line="276" w:lineRule="auto"/>
        <w:jc w:val="left"/>
        <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/></w:rPr>
      </w:pPr>
      <w:r>
        <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:sz w:val="22"/></w:rPr>
        <w:t xml:space="preserve">${label}</w:t>
      </w:r>
      <w:r>
        <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/></w:rPr>
        <w:t xml:space="preserve">${placeholder}</w:t>
      </w:r>
    </w:p>`;
}

const interessadosBlock = `
  <w:p>
    <w:pPr>
      <w:spacing w:before="60" w:after="60" w:line="276" w:lineRule="auto"/>
      <w:jc w:val="left"/>
      <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:sz w:val="22"/></w:rPr>
    </w:pPr>
    <w:r>
      <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:sz w:val="22"/></w:rPr>
      <w:t xml:space="preserve">INTERESSADOS:</w:t>
    </w:r>
  </w:p>
  <w:p>
    <w:pPr>
      <w:spacing w:before="0" w:after="120" w:line="276" w:lineRule="auto"/>
      <w:jc w:val="both"/>
      <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/></w:rPr>
    </w:pPr>
    <w:r>
      <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/></w:rPr>
      <w:t xml:space="preserve">{interessados}</w:t>
    </w:r>
  </w:p>`;

const eOrelatorio = `
  <w:p>
    <w:pPr>
      <w:spacing w:before="240" w:after="120" w:line="276" w:lineRule="auto"/>
      <w:jc w:val="right"/>
      <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/></w:rPr>
    </w:pPr>
    <w:r>
      <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/></w:rPr>
      <w:t>É o relatório.</w:t>
    </w:r>
  </w:p>`;

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${caixa('IDENTIFICAÇÃO DO PROCESSO')}
    ${BR}
    ${ident('PROCESSO TCE-PE Nº ', '{numero}')}
    ${ident('RELATOR: ', 'Conselheiro(a) {relator}')}
    ${ident('MODALIDADE - TIPO: ', '{modalidade_tipo}')}
    ${ident('EXERCÍCIO: ', '{exercicio}')}
    ${ident('UNIDADE(S) JURISDICIONADA(S): ', '{unidade}')}
    ${interessadosBlock}
    ${BR}
    ${caixa('EMENTA')}
    <w:p><w:r><w:t>{@ementa_xml}</w:t></w:r></w:p>
    ${BR}
    ${caixa('DESCRIÇÃO DO OBJETO')}
    <w:p><w:r><w:t>{@descricao_objeto_xml}</w:t></w:r></w:p>
    ${BR}
    ${caixa('RELATÓRIO')}
    <w:p><w:r><w:t>{@relatorio_xml}</w:t></w:r></w:p>
    ${eOrelatorio}
    ${caixa('VOTO')}
    <w:p><w:r><w:t>{@analise_xml}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{@decisao_xml}</w:t></w:r></w:p>
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1684" w:right="1308" w:bottom="1264" w:left="1814" w:header="0" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
        <w:lang w:val="pt-BR"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="120" w:line="276" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
</w:styles>`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const wordRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

async function main() {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', rels);
  zip.file('word/document.xml', documentXml);
  zip.file('word/styles.xml', stylesXml);
  zip.file('word/_rels/document.xml.rels', wordRels);
  const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  await fs.mkdir(path.dirname(TEMPLATE_PATH), { recursive: true });
  await fs.writeFile(TEMPLATE_PATH, buf);
  console.log('Template gerado:', TEMPLATE_PATH, '(', buf.length, 'bytes )');
}

main().catch((err) => {
  console.error('Erro:', err);
  process.exit(1);
});
