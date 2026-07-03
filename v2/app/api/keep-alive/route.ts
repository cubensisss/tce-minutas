import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // Não fazer cache desta rota

export async function GET() {
  try {
    const supabase = createServiceClient();
    
    // Fazemos uma query muito leve apenas para registrar atividade no banco
    // A tabela referenciada não precisa necessariamente existir, 
    // ou usamos um RPC genérico, mas para garantir, vamos tentar ler a tabela de profiles ou users.
    // O auth.users falha via API REST, então usamos o admin.listUsers() que usa a porta da API.
    
    const { data, error } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1
    });

    if (error) {
      console.error('Erro no keep-alive (Supabase):', error.message);
      return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      status: 'ok', 
      message: 'Supabase pinged successfully',
      timestamp: new Date().toISOString()
    });

  } catch (err: any) {
    console.error('Erro inesperado no keep-alive:', err);
    return NextResponse.json({ status: 'error', message: err.message }, { status: 500 });
  }
}
