import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
const SECOES_VALIDAS = ['ementa', 'relatorio', 'analise_completa', 'decisao_voto'];
export async function POST(request) {
  const { processoId, secao, texto } = await request.json();

  if (!processoId || !secao || !texto) {
    return NextResponse.json({ error: 'processoId, secao e texto são obrigatórios.' }, { status: 400 });
  }

  if (!SECOES_VALIDAS.includes(secao)) {
    return NextResponse.json({ error: `Seção inválida: ${secao}. Use: ${SECOES_VALIDAS.join(', ')}` }, { status: 400 });
  }

  // Find the latest minuta for this processo
  const { data: minutaAtual, error: findError } = await supabase
    .from('minutas')
    .select('id, versao')
    .eq('processo_id', processoId)
    .order('versao', { ascending: false })
    .limit(1)
    .single();

  if (findError || !minutaAtual) {
    return NextResponse.json({ error: 'Minuta não encontrada para este processo.' }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from('minutas')
    .update({ [secao]: texto })
    .eq('id', minutaAtual.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, secao, versao: minutaAtual.versao });
}
