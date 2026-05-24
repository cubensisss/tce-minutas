import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

async function extractTextFromStorage(processoId) {
  const { data: docs } = await getSupabase()
    .from('documentos')
    .select('tipo, texto_extraido')
    .eq('processo_id', processoId);

  if (!docs || docs.length === 0) return { auditTexts: '', defenseTexts: '' };

  let auditTexts = '';
  let defenseTexts = '';

  for (const doc of docs) {
    if (doc.texto_extraido && doc.texto_extraido.length > 10) {
      if (doc.tipo === 'auditoria') auditTexts += '\n\n' + doc.texto_extraido;
      else defenseTexts += '\n\n' + doc.texto_extraido;
    }
  }

  return { auditTexts, defenseTexts };
}

export async function POST(request) {
  const { processoId } = await request.json();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'COLE_SUA_CHAVE_AQUI') {
    return NextResponse.json({ error: 'Configure a GEMINI_API_KEY no .env.local' }, { status: 500 });
  }

  try {
    console.log(`[resumo] Iniciando resumo para processo: ${processoId}`);
    const { auditTexts, defenseTexts } = await extractTextFromStorage(processoId);

    if (!auditTexts && !defenseTexts) {
      console.warn(`[resumo] Nenhum texto extraído para o processo ${processoId}`);
      return NextResponse.json({ error: 'Nenhum texto pôde ser extraído dos documentos informados.' }, { status: 404 });
    }

    console.log(`[resumo] Texto extraído: Auditoria(${auditTexts.length} chars), Defesa(${defenseTexts.length} chars)`);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });

    const prompt = `Você é um analista jurídico do TCE-PE.
Analise os documentos abaixo e extraia uma lista de achados (irregularidades).

Para cada achado no JSON, use EXATAMENTE estes campos:
- numero: ex "2.1.1"
- titulo: título curto
- apontamento_auditoria: texto literal da auditoria (máx 500 chars)
- alegacao_defesa: texto literal da defesa correspondente (máx 500 chars)
- resumo_ia: explicação clara do confronto (2-3 frases)
- severidade: "grave", "dano_erario", "formal" ou "sanado"

=== RELATÓRIO DE AUDITORIA ===
${auditTexts.substring(0, 500000)}

=== DEFESA PRÉVIA ===
${defenseTexts.substring(0, 500000)}`;

    console.log('[resumo] Chamando Gemini...');
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    console.log('[resumo] Resposta da IA recebida');

    let achados;
    try {
      achados = JSON.parse(text);
    } catch (e) {
      console.error('[resumo] Erro no JSON.parse, tentando extração por regex');
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('IA não gerou um array JSON válido');
      achados = JSON.parse(jsonMatch[0].replace(/(?<=:\s*"[^"]*)\n/g, ' '));
    }

    if (!Array.isArray(achados)) {
      achados = achados.achados || achados.data || Object.values(achados)[0];
    }
    
    if (!Array.isArray(achados)) throw new Error('Formato de resposta da IA inválido (esperado array)');

    console.log(`[resumo] Processando ${achados.length} achados...`);

    // Delete and Re-insert
    await getSupabase().from('achados').delete().eq('processo_id', processoId);
    
    const insertData = achados.slice(0, 30).map((a, i) => ({
      processo_id: processoId,
      numero: a.numero || `2.1.${i+1}`,
      titulo: a.titulo || 'Achado sem título',
      apontamento_auditoria: a.apontamento_auditoria || '',
      alegacao_defesa: a.alegacao_defesa || '',
      resumo_ia: a.resumo_ia || '',
      severidade: a.severidade || 'formal',
      ordem: i
    }));

    const { error: insertError } = await getSupabase().from('achados').insert(insertData);
    if (insertError) throw insertError;

    await getSupabase().from('processos').update({ status: 'resumo' }).eq('id', processoId);

    console.log('[resumo] Sucesso!');
    return NextResponse.json({ success: true, count: achados.length });

  } catch (err) {
    console.error('[resumo] Erro Crítico:', err);
    return NextResponse.json({ 
      error: 'Erro ao gerar resumo: ' + err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined 
    }, { status: 500 });
  }
}
