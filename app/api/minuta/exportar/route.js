import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ error: 'ID do processo não informado' }, { status: 400 });

  try {
    const supabase = getSupabase();
    const { data: processo } = await supabase.from('processos').select('*').eq('id', id).single();
    const { data: minuta } = await supabase.from('minutas').select('*').eq('processo_id', id).order('versao', { ascending: false }).limit(1).single();

    if (!minuta) return NextResponse.json({ error: 'Minuta não encontrada' }, { status: 404 });

    // Dynamic import of docx library
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import('docx');

    // Helper to create paragraphs from text blocks
    function textToParagraphs(text, style = {}) {
      if (!text) return [];
      return text.split('\n').filter(line => line.trim()).map(line => 
        new Paragraph({
          children: [new TextRun({ text: line.trim(), ...style })],
          spacing: { after: 120 },
        })
      );
    }

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          // Title
          new Paragraph({
            children: [new TextRun({ text: 'MINUTA DE VOTO', bold: true, size: 32 })],
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          // Process info
          new Paragraph({
            children: [new TextRun({ text: `Processo: ${processo.numero}`, bold: true, size: 24 })],
            spacing: { after: 200 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `UJ: ${processo.unidade_jurisdicionada || ''}`, size: 22 })],
            spacing: { after: 200 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `Exercício: ${processo.exercicio || ''}`, size: 22 })],
            spacing: { after: 400 },
          }),
          // EMENTA
          new Paragraph({
            children: [new TextRun({ text: 'EMENTA', bold: true, size: 28 })],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),
          ...textToParagraphs(minuta.ementa, { size: 22 }),
          // RELATÓRIO
          new Paragraph({
            children: [new TextRun({ text: 'RELATÓRIO', bold: true, size: 28 })],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),
          ...textToParagraphs(minuta.relatorio, { size: 22 }),
          // ANÁLISE / VOTO
          new Paragraph({
            children: [new TextRun({ text: 'VOTO', bold: true, size: 28 })],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),
          ...textToParagraphs(minuta.analise_completa, { size: 22 }),
          // DECISÃO
          new Paragraph({
            children: [new TextRun({ text: 'DECISÃO', bold: true, size: 28 })],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),
          ...textToParagraphs(minuta.decisao_voto, { size: 22 }),
        ],
      }],
    });

    const buffer = await Packer.toBuffer(doc);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="Minuta_${processo.numero.replace(/[^a-zA-Z0-9-]/g, '_')}.docx"`,
        'Cache-Control': 'no-cache'
      },
    });
  } catch (err) {
    console.error('[exportar] Erro Crítico:', err);
    return NextResponse.json({ error: 'Erro interno ao exportar: ' + err.message }, { status: 500 });
  }
}
