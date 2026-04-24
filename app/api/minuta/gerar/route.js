import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function fetchVetorial(processoId, achados) {
  try {
    // Build thematic queries from achados
    const queries = (achados || []).map(a => a.titulo);
    queries.push('LINDB art 22 dificuldades reais gestor regular ressalvas');
    
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const res = await fetch(`${baseUrl}/api/vetorial`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ processoId, queries }),
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (!res.ok) {
      console.error(`[fetchVetorial] Erro na resposta: ${res.status}`);
      return '';
    }
    const data = await res.json();
    
    // Format results as context for the LLM
    let context = '';
    for (const [query, results] of Object.entries(data.results || {})) {
      if (results.length === 0) continue;
      context += `\n--- Precedentes para "${query}" ---\n`;
      for (const r of results) {
        if (r.type === 'summary') {
          context += `Resumo: ${r.text.substring(0, 500)}\n`;
        } else if (r.type === 'document') {
          context += `📄 ${r.title}\n`;
          for (const seg of (r.extractiveSegments || []).slice(0, 2)) {
            context += `  Trecho: ${seg.substring(0, 400)}\n`;
          }
          for (const snip of (r.snippets || []).slice(0, 1)) {
            context += `  Snippet: ${snip.substring(0, 300)}\n`;
          }
        }
      }
    }
    return context;
  } catch (err) {
    console.error('Erro ao buscar base vetorial:', err.message);
    return '';
  }
}

export async function POST(request) {
  const { processoId, diretrizGeral } = await request.json();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'COLE_SUA_CHAVE_AQUI') {
    return NextResponse.json({ error: 'Configure a GEMINI_API_KEY no .env.local' }, { status: 500 });
  }

  // 1. Get processo + achados + configs
  const { data: processo } = await supabase.from('processos').select('*').eq('id', processoId).single();
  const { data: achados } = await supabase.from('achados').select('*').eq('processo_id', processoId).order('ordem');
  const { data: configs } = await supabase.from('configuracoes').select('*');
  const configMap = {};
  (configs || []).forEach(c => { configMap[c.chave] = c.valor; });

  // 2. Fetch vector search results (precedents from Conselheiro)
  const precedentes = await fetchVetorial(processoId, achados);

  // 2.5 Fetch local full documents (Opção B)
  let documentosBrutos = '';
  try {
    const baseDir = "C:\\Users\\Tercio\\Documents\\TCE\\TCE\\Elaborando Voto";
    if (fs.existsSync(baseDir)) {
      const folders = fs.readdirSync(baseDir);
      // Clean string match looking for process numeric pattern
      const processFolder = folders.find(f => f.includes(processo.numero));
      if (processFolder) {
        const cleanDir = path.join(baseDir, processFolder, '_clean');
        if (fs.existsSync(cleanDir)) {
          const txtFiles = fs.readdirSync(cleanDir).filter(f => f.endsWith('.txt'));
          for (const file of txtFiles) {
            const content = fs.readFileSync(path.join(cleanDir, file), 'utf-8');
            documentosBrutos += `\n\n=== DOCUMENTO DE INSTRUÇÃO PROCESSUAL: ${file} ===\n${content}\n`;
          }
        }
      }
    }
  } catch (error) {
    console.error("Erro ao ler documentos originais:", error);
  }

  // 3. Build achados context
  const achadosText = (achados || []).map(a => {
    return `### ${a.numero}. ${a.titulo}
Resultado desejado: ${a.resultado || 'a definir'}
Multa: ${a.aplicar_multa ? 'Sim' : 'Não'}
Débito: R$ ${a.valor_debito || '0,00'}
Diretriz do Conselheiro: ${a.diretriz_usuario || 'Nenhuma'}

Apontamento da auditoria: "${a.apontamento_auditoria}"
Alegação da defesa: "${a.alegacao_defesa}"`;
  }).join('\n\n---\n\n');

  // 4. Build the master prompt
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-pro',
    generationConfig: { responseMimeType: 'application/json' }
  });

  const prompt = `${configMap.persona || ''}

${configMap.tom_voz || ''}

${configMap.estrutura_analise || ''}

Palavras proibidas: ${configMap.proibicoes_vocabulario || ''}

=== DADOS DO PROCESSO ===
Processo: ${processo.numero}
UJ: ${processo.unidade_jurisdicionada}
Exercício: ${processo.exercicio}
Interessados: ${processo.interessados}

=== ACHADOS E DIRETRIZES ===
${achadosText}

${diretrizGeral ? `=== DIRETRIZES GERAIS DO CONSELHEIRO ===\n${diretrizGeral}` : ''}

${precedentes ? `=== RECURSO DE TOM DE VOZ (PRECEDENTES) ===
ATENÇÃO: Este bloco contém decisões antigas de OUTROS PROCESSOS APENAS PARA CALIBRAGEM ESTILÍSTICA.
É ABSOLUTAMENTE PROIBIDO COPIAR QUALQUER INFORMAÇÃO MATERIAL DAQUI. NENHUM nome de município, nenhuma data, nenhum valor, nenhuma pessoa e NENHUMA tese fática daqui pode aparecer na sua geração. Você deve APENAS absorver o peso do vocabulário (ex: quão dura é a magistrada) e desprezar todo o resto.

${precedentes}` : ''}

=== TEXTOS INTEGRAIS DA AUDITORIA E DEFESA PRÉVIA (USAR COMO MATÉRIA FÁTICA EXCLUSIVA) ===
${documentosBrutos ? documentosBrutos : '(Não foram encontrados arquivos locais na respectiva subpasta, baseie-se no resumo)'}

=== INSTRUÇÕES FINAIS DE GERAÇÃO ===
Crie a MINUTA COMPLETA E EXTENSAMENTE VERBORRÁGICA DO VOTO, perfeitamente fracionada nestas 4 keys. NUNCA USE tags HTML como <b>, <i>, <p> ou <br>. Retorne o bloco textualmente puro em JSON:

1. "ementa": ${configMap.formato_ementa || 'Estruture uma ementa altamente rica que consolide as razões jurídicas. Mantenha 3 blocos: I. CASO EM EXAME; II. RAZÕES DE DECIDIR; III. DISPOSITIVO E TESE. Exclua do resumo detalhes que já constarão na decisão'}

2. "relatorio": Relatório de introdução objetivo e sumário. DEVE SEGUIR ESTA ESTRUTURA E REGRAS:
 - Informe a numeração dos autos e discorra sobre O QUE LEVOU à abertura desse processo de auditoria (utilize a introdução do relatório base).
 - Liste TODOS os documentos juntados aos autos (relatórios, defesas). ATENÇÃO: Os Nomes dos Arquivos estão indicados logo acima dos seus textos (ex: "=== DOCUMENTO DE INSTRUÇÃO PROCESSUAL: 0052-EAUD... ==="). A numeração exata do documento SÃO OS 4 PRIMEIROS DÍGITOS DAQUELE ARQUIVO (neste exemplo, doc. 0052). É EXPRESSAMENTE PROIBIDO dizer que os números não foram informados, pois eles estão estampados no nome do arquivo.
 - EXTRAIA OS NOMES E CARGOS REAIS lendo rigorosamente a tabela/seção de 'DADOS DOS RESPONSÁVEIS' ou 'RESPONSABILIZAÇÃO' no Relatório de Auditoria e cruze com as defesas. NUNCA, SOB HIPÓTESE ALGUMA, utilize variáveis ou placeholders falsos (como {{Nome}}). Preencha textualmente com os nomes verdadeiros da tabela.
 - É DEVER SEU mencionar explicitamente caso algum interessado NÃO tenha apresentado defesa prévia.
 - SE EXISTIR um "Relatório Complementar" na lista de documentos, você É OBRIGADO a mencionar a existência dele, explicando o fluxo seguido e citando a data de emissão desse relatório complementar.
 - Informe a data de publicação de TODOS os relatórios de auditoria (A data está carimbada no final do texto do relatório de auditoria, logo antes do nome/assinatura do auditor. É proibido dizer que a data não foi informada: VÁ ATÉ O FINAL DO DOCUMENTO ORIGINAL E LEIA A DATA).
 - É EXPRESSAMENTE PROIBIDO resumir os achados ou julgar atos nesta seção. Reserve todo o embate e julgamento para a seção seguinte.

3. "analise_completa": Esta é a área crucial, a fundamentação (VOTO). 
 - VOCÊ DEVE SEGUIR RIGOROSAMENTE A ORDEM DOS ACHADOS.
 - Para CADA item irregular (cada Achado), siga EXATAMENTE este funil: 
    A) Copiar citações LITERAIS e diretas do Relatório de Auditoria sobre a conduta; 
    B) Copiar citações LITERAIS e diretas da Alegação da Defesa sobre o ponto; 
    C) Discorrer a Análise do Relator (julgamento).
 - MANTENHA OS TÍTULOS DOS ACHADOS. Antes de discorrer cada achado, escreva explicitamente o seu respectivo número e título (ex: '2.1.2. Contratação Indevida...').
 - SEPARE, COM TÍTULOS EXPLÍCITOS, A APRESENTAÇÃO DOS ELEMENTOS: Utilize os subtítulos "Apontamentos da Auditoria" para as citações da auditoria, "Alegações da Defesa" para as citações da defesa, e "Análise do Relator" (ou "Voto") para as suas razões de decidir e julgamento.
 - REGRA DE BLOQUEIO MENTAL: Você utilizará 100% dos fatos extraídos dos Documentos Brutos e 0% dos fatos da Base Vetorial. A base vetorial é só para estilo. Construa o julgamento robusto respeitando o diretriz escolhido para a multa/débito.

4. "decisao_voto": ${configMap.estrutura_decisao || 'Escreva o encerramento do aresto (Secao 6) providenciando as concatenações lógicas em parágrafos iniciados por CONSIDERANDO e formalizando a Tese do Relator em INCISOS ROMANOS enumerativos das consequências judiciais impostas (multamentos e isenções sem injetar teses coladas ou sumuladas estranhas de precedentes).'}

5. "descricao_objeto": Extraia rigorosamente do Relatório de Auditoria a descrição do objeto (geralmente encontrado na introdução sob o título "Objetivo da auditoria" ou similar). Exemplo aproximado: 'Examinar os procedimentos de licitação...' Copie este trecho faticamente e retorne como string pura.

6. "interessados": Extraia a lista de responsáveis/interessados localizando explicitamente a seção de Responsabilização ou a tabela 'DADOS DOS RESPONSÁVEIS' do Relatório de Auditoria. Retorne APENAS Nome e Cargo (sem CPF/CNPJ), formatados e separados por vírgula. Exemplo: 'Gustavo Adolfo Neves (Prefeito), Benício José (Procurador)'. NÃO coloque CPF ou detalhes secundários. NUNCA use placeholders formatados com chaves.

7. "exercicio": Extraia o ano ou ciclo do exercício do Relatório de Auditoria (ex: 2020). Retorne APENAS o número/ano como string pura.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Parse
    let minutaData;
    try {
      minutaData = JSON.parse(text);
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return NextResponse.json({ error: 'IA não retornou objeto JSON', raw: text.substring(0, 500) }, { status: 500 });
      }
      // Sanitize standard unescaped formatting newlines that break JSON parsing
      const sanitized = jsonMatch[0].replace(/(?<=:\s*"[^"]*)\n/g, ' ');
      try {
        minutaData = JSON.parse(sanitized);
      } catch (err2) {
        return NextResponse.json({ error: 'Falha fatal de formatação na resposta da IA: ' + err2.message }, { status: 500 });
      }
    }

    // 5. Get version number
    const { data: existingMinutas } = await supabase
      .from('minutas')
      .select('versao')
      .eq('processo_id', processoId)
      .order('versao', { ascending: false })
      .limit(1);

    const nextVersion = (existingMinutas && existingMinutas.length > 0) ? existingMinutas[0].versao + 1 : 1;

    // 6. Save minuta
    const { error: insertError } = await supabase.from('minutas').insert([{
      processo_id: processoId,
      versao: nextVersion,
      ementa: minutaData.ementa || '',
      relatorio: minutaData.relatorio || '',
      analise_completa: minutaData.analise_completa || '',
      decisao_voto: minutaData.decisao_voto || '',
    }]);

    if (insertError) {
      console.error('[minuta/gerar] Erro no insert Supabase:', insertError);
      throw insertError;
    }

    // 7. Update processo with extractions
    const updates = {};
    if (minutaData.descricao_objeto) updates.descricao_objeto = minutaData.descricao_objeto;
    if (minutaData.interessados) updates.interessados = minutaData.interessados;
    if (minutaData.exercicio) updates.exercicio = minutaData.exercicio;

    if (Object.keys(updates).length > 0) {
      const { error: updateProcErr } = await supabase
        .from('processos')
        .update(updates)
        .eq('id', processoId);
      
      if (updateProcErr) {
        console.error('[minuta/gerar] Erro ao atualizar processos (extrações):', updateProcErr);
      }
    }

    await supabase.from('processos').update({ status: 'revisao' }).eq('id', processoId);

    return NextResponse.json({ success: true, versao: nextVersion });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
