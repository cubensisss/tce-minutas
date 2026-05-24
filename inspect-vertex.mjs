/**
 * Script de inspeção do Vertex AI Search.
 *
 * Objetivo: descobrir a estrutura real dos resultados do data store
 * tceandressa_1775759460294, em especial se há algum campo de data
 * (data_publicacao, data_julgamento, created_at, etc) que possa ser
 * usado para ordenar processos similares por "mais recentes".
 *
 * Uso:
 *   node inspect-vertex.mjs
 *
 * Esse arquivo é descartável — pode deletar depois. Não interage com
 * o sistema em produção.
 */

import fs from 'fs';
import crypto from 'crypto';

const CREDENTIAL_PATH = 'C:\\Users\\Tercio\\Documents\\TCE\\TCE\\credencial_gcp.json';
const PROJECT_ID = 'uptemporada';
const DATA_STORE_ID = 'tceandressa_1775759460294';
const APP_ID = 'tceandressa_1775759242362';
const LOCATION = 'global';

// Três queries variadas pra ver se a estrutura é consistente entre temas
const TEST_QUERIES = [
  'contratação direta sem licitação',
  'subsídio irregular folha de pagamento',
  'LINDB art 22 dificuldades reais gestor',
];

async function getAccessToken(keyFile) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: keyFile.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url');

  const signInput = `${header}.${payload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signInput);
  const signature = sign.sign(keyFile.private_key, 'base64url');
  const jwt = `${signInput}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const data = await tokenRes.json();
  if (!data.access_token) {
    throw new Error('Falha ao obter access token: ' + JSON.stringify(data));
  }
  return data.access_token;
}

async function search(token, query) {
  const url = `https://discoveryengine.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/collections/default_collection/engines/${APP_ID}/servingConfigs/default_search:search`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Goog-User-Project': PROJECT_ID,
    },
    body: JSON.stringify({
      query,
      pageSize: 3,
      contentSearchSpec: {
        snippetSpec: { returnSnippet: true },
        extractiveContentSpec: {
          maxExtractiveAnswerCount: 1,
          maxExtractiveSegmentCount: 1,
        },
      },
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 500)}`);
  }
  return res.json();
}

function inspectResponse(data, query) {
  console.log('\n' + '='.repeat(70));
  console.log(`QUERY: ${query}`);
  console.log('='.repeat(70));
  console.log(`Total resultados: ${data.results?.length || 0}`);

  if (!data.results || data.results.length === 0) {
    console.log('(sem resultados)');
    return;
  }

  // Inspeciona o primeiro resultado em detalhe
  const first = data.results[0];
  console.log('\n--- DOCUMENT (primeiro resultado) ---');
  console.log('Top-level keys:', Object.keys(first.document || {}));

  if (first.document?.derivedStructData) {
    const dsd = first.document.derivedStructData;
    console.log('\nderivedStructData keys:', Object.keys(dsd));
    console.log('derivedStructData (primeiros 1500 chars):');
    console.log(JSON.stringify(dsd, null, 2).slice(0, 1500));
  }

  if (first.document?.structData) {
    console.log('\nstructData keys:', Object.keys(first.document.structData));
    console.log('structData:');
    console.log(JSON.stringify(first.document.structData, null, 2).slice(0, 1000));
  }

  // Procura campos de data em todos os resultados
  console.log('\n--- CAMPOS DE DATA (em todos os resultados) ---');
  const allText = JSON.stringify(data.results);
  const dateLikeRegex = /"([^"]*(?:data|date|publicacao|publicado|julgamento|julgado|sessao|emissao|created|updated)[^"]*)":\s*"([^"]+)"/gi;
  const found = new Set();
  let match;
  while ((match = dateLikeRegex.exec(allText)) !== null) {
    found.add(`${match[1]} = ${match[2]}`);
  }
  if (found.size > 0) {
    console.log('Encontrados:');
    for (const f of found) console.log('  ', f);
  } else {
    console.log('⚠️  Nenhum campo com nome óbvio de data encontrado.');
    console.log('   (pode ser que a data esteja embutida no título ou snippet)');
  }

  // Mostra todos os títulos pra avaliar se data está no nome
  console.log('\n--- TÍTULOS (todos os resultados) ---');
  for (const r of data.results) {
    console.log('  •', r.document?.derivedStructData?.title || '(sem título)');
  }

  // Mostra LINKS — onde provavelmente estão número do processo / data
  console.log('\n--- LINKS (todos os resultados) ---');
  for (const r of data.results) {
    console.log('  •', r.document?.derivedStructData?.link || '(sem link)');
  }

  // Mostra IDs do documento — outro candidato pra ter info estruturada
  console.log('\n--- IDs DOS DOCUMENTOS ---');
  for (const r of data.results) {
    console.log('  •', r.document?.id || '(sem id)');
    console.log('    name:', r.document?.name || '(sem name)');
  }
}

async function main() {
  console.log('Lendo credencial em:', CREDENTIAL_PATH);
  if (!fs.existsSync(CREDENTIAL_PATH)) {
    console.error('❌ Credencial não encontrada nesse caminho.');
    console.error('   Ajuste a constante CREDENTIAL_PATH no topo do arquivo.');
    process.exit(1);
  }

  const keyFile = JSON.parse(fs.readFileSync(CREDENTIAL_PATH, 'utf-8'));
  console.log('Cliente:', keyFile.client_email);

  console.log('\nObtendo access token...');
  const token = await getAccessToken(keyFile);
  console.log('Token obtido (primeiros 20 chars):', token.slice(0, 20) + '...');

  for (const q of TEST_QUERIES) {
    try {
      const data = await search(token, q);
      inspectResponse(data, q);
    } catch (err) {
      console.error(`\n❌ Erro na query "${q}":`, err.message);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('FIM DA INSPEÇÃO');
  console.log('='.repeat(70));
  console.log('\nCole toda a saída acima na conversa pra eu analisar.');
}

main().catch((err) => {
  console.error('❌ ERRO FATAL:', err);
  process.exit(1);
});
