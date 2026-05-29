import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
const SECOES_VALIDAS = ['ementa', 'relatorio', 'analise_completa', 'decisao_voto'];
export async function POST(request) {
  const { processoId, secao, texto, versaoAlvo } = await request.json();

  if (!processoId) {
    return NextResponse.json({ error: 'processoId é obrigatório.' }, { status: 400 });
  }

  // 1. Obter a minuta atual para saber qual o próximo número de versão
  const { data: minutaAtual, error: findError } = await getSupabase()
    .from('minutas')
    .select('*')
    .eq('processo_id', processoId)
    .order('versao', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError || !minutaAtual) {
    return NextResponse.json({ error: 'Nenhuma minuta base encontrada para este processo.' }, { status: 404 });
  }

  const nextVersion = minutaAtual.versao + 1;

  // 2. CASO A: Reversão para versão anterior
  if (versaoAlvo !== undefined && versaoAlvo !== null) {
    const { data: minutaAlvo, error: targetError } = await getSupabase()
      .from('minutas')
      .select('*')
      .eq('processo_id', processoId)
      .eq('versao', versaoAlvo)
      .maybeSingle();

    if (targetError || !minutaAlvo) {
      return NextResponse.json({ error: `Versão alvo ${versaoAlvo} não encontrada.` }, { status: 404 });
    }

    // Criar nova versão idêntica à versão alvo
    const { error: insertError } = await getSupabase()
      .from('minutas')
      .insert([{
        processo_id: processoId,
        versao: nextVersion,
        ementa: minutaAlvo.ementa || '',
        relatorio: minutaAlvo.relatorio || '',
        analise_completa: minutaAlvo.analise_completa || '',
        decisao_voto: minutaAlvo.decisao_voto || '',
      }]);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, acao: 'reversao', versao: nextVersion });
  }

  // 3. CASO B: Modificação pontual de seção (comportamento padrão atualizado para INSERT)
  if (!secao || texto === undefined) {
    return NextResponse.json({ error: 'secao e texto são obrigatórios na ausência de versaoAlvo.' }, { status: 400 });
  }

  if (!SECOES_VALIDAS.includes(secao)) {
    return NextResponse.json({ error: `Seção inválida: ${secao}. Use: ${SECOES_VALIDAS.join(', ')}` }, { status: 400 });
  }

  // Criar nova versão com a alteração na seção desejada
  const { error: insertError } = await getSupabase()
    .from('minutas')
    .insert([{
      processo_id: processoId,
      versao: nextVersion,
      ementa: secao === 'ementa' ? texto : (minutaAtual.ementa || ''),
      relatorio: secao === 'relatorio' ? texto : (minutaAtual.relatorio || ''),
      analise_completa: secao === 'analise_completa' ? texto : (minutaAtual.analise_completa || ''),
      decisao_voto: secao === 'decisao_voto' ? texto : (minutaAtual.decisao_voto || ''),
    }]);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, acao: 'modificacao', secao, versao: nextVersion });
}
