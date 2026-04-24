import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ error: 'ID do processo não informado' }, { status: 400 });

  try {
    // 1. Get process and minuta data
    const { data: processo } = await supabase.from('processos').select('*').eq('id', id).single();
    const { data: minuta } = await supabase.from('minutas').select('*').eq('processo_id', id).order('versao', { ascending: false }).limit(1).single();

    if (!minuta) return NextResponse.json({ error: 'Minuta não encontrada' }, { status: 404 });

    // 2. Prepare temp files
    const tmpDir = path.join(process.cwd(), 'tmp', 'export_' + id.substring(0, 8));
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const tmpInput = path.join(tmpDir, 'input.json');
    const tmpOutput = path.join(tmpDir, `Minuta_${processo.numero.replace(/\//g, '_')}.docx`);

    const inputData = {
      processo: processo,
      ementa: minuta.ementa,
      relatorio: minuta.relatorio || '',
      analise_completa: minuta.analise_completa,
      decisao_voto: minuta.decisao_voto
    };

    fs.writeFileSync(tmpInput, JSON.stringify(inputData, null, 2));

    // 3. Call Python script
    const scriptPath = path.join(process.cwd(), 'scripts', 'generate_minuta_docx.py');
    console.log(`[exportar] Gerando DOCX para processo ${processo.numero}...`);
    
    try {
      await execAsync(`python "${scriptPath}" --input "${tmpInput}" --output "${tmpOutput}"`);
    } catch (execErr) {
      console.error('[exportar] Erro no script Python:', execErr.stderr || execErr.message);
      return NextResponse.json({ error: 'Erro ao gerar documento: ' + (execErr.stderr || execErr.message) }, { status: 500 });
    }

    if (!fs.existsSync(tmpOutput)) {
      return NextResponse.json({ error: 'O documento não foi gerado pelo servidor.' }, { status: 500 });
    }

    // 4. Read and return the file
    const fileBuffer = fs.readFileSync(tmpOutput);

    // Cleanup
    try {
      fs.unlinkSync(tmpInput);
      fs.unlinkSync(tmpOutput);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn('[exportar] Erro no cleanup:', cleanupErr.message);
    }

    return new NextResponse(fileBuffer, {
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
