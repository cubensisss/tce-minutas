import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Vertex AI Search config
const PROJECT_ID = 'uptemporada';
const DATA_STORE_ID = 'tceandressa_1775759460294';
const APP_ID = 'tceandressa_1775759242362';
const LOCATION = 'global';

async function getAccessToken() {
  // Use service account credentials stored as env var or file
  const keyPath = process.env.GCP_KEY_FILE || 'c:\\Users\\Tercio\\Documents\\TCE\\TCE\\credencial_gcp.json';
  
  try {
    const fs = await import('fs');
    const keyFile = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
    
    // Create JWT for service account
    const jwt = await createServiceAccountJWT(keyFile);
    
    // Exchange JWT for access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });
    
    const tokenData = await tokenRes.json();
    return tokenData.access_token;
  } catch (err) {
    console.error('Erro ao obter token GCP:', err.message);
    return null;
  }
}

async function createServiceAccountJWT(keyFile) {
  const crypto = await import('crypto');
  
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
  
  return `${signInput}.${signature}`;
}

async function searchVertexAI(queryText, pageSize = 5) {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;
  
  const url = `https://discoveryengine.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/collections/default_collection/engines/${APP_ID}/servingConfigs/default_search:search`;
  
  const payload = {
    query: queryText,
    pageSize,
    queryExpansionSpec: { condition: 'AUTO' },
    spellCorrectionSpec: { mode: 'AUTO' },
    contentSearchSpec: {
      snippetSpec: { returnSnippet: true, maxSnippetCount: 3 },
      summarySpec: { summaryResultCount: 5, includeCitations: true },
      extractiveContentSpec: { maxExtractiveAnswerCount: 3, maxExtractiveSegmentCount: 5 },
    },
  };
  
  try {
    let response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Goog-User-Project': PROJECT_ID,
      },
      body: JSON.stringify(payload),
    });
    
    // Fallback endpoint
    if (!response.ok) {
      const url2 = `https://discoveryengine.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/collections/default_collection/dataStores/${DATA_STORE_ID}/servingConfigs/default_search:search`;
      response = await fetch(url2, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Goog-User-Project': PROJECT_ID,
        },
        body: JSON.stringify(payload),
      });
    }
    
    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    console.error('Erro na busca vetorial:', err.message);
    return null;
  }
}

function extractResults(responseJson) {
  if (!responseJson) return [];
  const results = [];
  
  if (responseJson.summary?.summaryText) {
    results.push({ type: 'summary', text: responseJson.summary.summaryText });
  }
  
  if (responseJson.results) {
    for (const [i, result] of responseJson.results.entries()) {
      const doc = result.document || {};
      const docData = doc.derivedStructData || {};
      
      results.push({
        type: 'document',
        rank: i + 1,
        title: docData.title || '',
        link: docData.link || '',
        snippets: (docData.snippets || []).map(s => s.snippet || ''),
        extractiveAnswers: (docData.extractive_answers || []).map(ea => ea.content || ''),
        extractiveSegments: (docData.extractive_segments || []).map(es => es.content || ''),
      });
    }
  }
  
  return results;
}

// POST - Search for precedents based on achados
export async function POST(request) {
  const { processoId, queries } = await request.json();
  
  if (!queries || queries.length === 0) {
    // Auto-generate queries from achados
    const { data: achados } = await supabase
      .from('achados')
      .select('titulo, resumo_ia')
      .eq('processo_id', processoId);
    
    const autoQueries = (achados || []).map(a => a.titulo);
    autoQueries.push('LINDB art 22 dificuldades reais gestor regular ressalvas');
    
    const allResults = {};
    const searchPromises = autoQueries.map(async (q) => {
      const response = await searchVertexAI(q, 3);
      allResults[q] = extractResults(response);
    });

    await Promise.all(searchPromises);
    
    return NextResponse.json({ success: true, results: allResults });
  }
  
  // Use provided queries in parallel
  const allResults = {};
  const searchPromises = queries.map(async (q) => {
    const response = await searchVertexAI(q, 3); // Reduced pageSize to 3 for speed
    allResults[q] = extractResults(response);
  });
  
  await Promise.all(searchPromises);
  
  return NextResponse.json({ success: true, results: allResults });
}
