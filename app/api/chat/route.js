import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(request) {
  const { processoId, message } = await request.json();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'COLE_SUA_CHAVE_AQUI') {
    return NextResponse.json({ error: 'Configure a GEMINI_API_KEY' }, { status: 500 });
  }

  // Get context
  const { data: processo } = await supabase.from('processos').select('*').eq('id', processoId).single();
  const { data: minuta } = await supabase.from('minutas').select('*').eq('processo_id', processoId).order('versao', { ascending: false }).limit(1).single();
  const { data: history } = await supabase.from('chat_mensagens').select('*').eq('processo_id', processoId).order('created_at').limit(20);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json' },
  });

  const chatHistory = (history || []).map(m => `${m.role === 'user' ? 'Conselheiro' : 'Assistente'}: ${m.conteudo}`).join('\n');

  const prompt = `Você é o Assistente de Voto do TCE-PE. Ajude o Conselheiro a refinar a minuta de voto.

Processo: ${processo?.numero} - ${processo?.unidade_jurisdicionada}

Minuta atual (ementa):
${minuta?.ementa?.substring(0, 2000) || 'Não disponível'}

Minuta atual (análise/voto):
${minuta?.analise_completa?.substring(0, 5000) || 'Não disponível'}

Minuta atual (decisão):
${minuta?.decisao_voto?.substring(0, 3000) || 'Não disponível'}

Histórico do chat:
${chatHistory}

Solicitação do Conselheiro: ${message}

DIRETRIZES OBRIGATÓRIAS:
1. NUNCA retorne a minuta inteira. Isso poluiria o chat.
2. Se a solicitação pede uma alteração textual, proponha APENAS o trecho específico revisado.
3. Pergunte ao final se o Conselheiro aprova a redação proposta e deseja aplicá-la.
4. Se a mensagem for uma confirmação de aplicação ("sim", "pode", "confirma", "aplica", "ok", "aprovo" etc.), identifique a seção e o texto final a aplicar.

Responda EXCLUSIVAMENTE em JSON válido com este esquema:
{
  "response": "Sua resposta em linguagem natural para o Conselheiro (markdown permitido, sem JSON aqui)",
  "sugestao": null | {
    "secao": "ementa" | "analise_completa" | "decisao_voto",
    "texto": "Texto exato e completo da seção revisada (somente se houver proposta de alteração ativa)",
    "pronto_para_aplicar": false | true
  }
}

- "sugestao" deve ser null quando a resposta for apenas informativa, uma pergunta ou uma explicação sem proposta de alteração.
- "pronto_para_aplicar" deve ser true SOMENTE quando o Conselheiro confirmou explicitamente que quer aplicar a mudança.`;

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { response: raw, sugestao: null };
    }
    return NextResponse.json({
      response: parsed.response || raw,
      sugestao: parsed.sugestao || null,
    });
  } catch (err) {
    return NextResponse.json({ response: `Erro ao processar: ${err.message}`, sugestao: null });
  }
}
