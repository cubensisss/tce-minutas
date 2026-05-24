import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export async function POST(request) {
  try {
    const { processoId } = await request.json();

    if (!processoId) {
      return NextResponse.json({ error: 'processoId é obrigatório' }, { status: 400 });
    }

    // Delete dependent records first
    await getSupabase().from('achados').delete().eq('processo_id', processoId);
    await getSupabase().from('documentos').delete().eq('processo_id', processoId);
    await getSupabase().from('chat_mensagens').delete().eq('processo_id', processoId);

    // Delete the processo itself
    const { error } = await getSupabase().from('processos').delete().eq('id', processoId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
