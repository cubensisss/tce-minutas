/**
 * Auth pra Vertex AI Search via google-auth-library.
 *
 * Aceita credencial de duas formas:
 *  1. GOOGLE_APPLICATION_CREDENTIALS_JSON  → JSON inteiro como string (Render)
 *  2. GOOGLE_APPLICATION_CREDENTIALS       → caminho de arquivo (dev local)
 *
 * Substitui o `crypto.createSign('RSA-SHA256')` manual do v1, que era
 * frágil e duplicava lógica de cache de token.
 */
import { GoogleAuth, type JWT } from 'google-auth-library';
import { getEnv } from '@/lib/env';
import { loggerFor } from '@/lib/logger';

const log = loggerFor('vertex/auth');
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

let cachedAuth: GoogleAuth | null = null;

function buildAuth(): GoogleAuth {
  const env = getEnv();

  if (env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    } catch (err) {
      log.error({ err }, 'GOOGLE_APPLICATION_CREDENTIALS_JSON inválido');
      throw new Error('Credencial GCP inválida (JSON malformado)');
    }
    return new GoogleAuth({ credentials, scopes: [SCOPE] });
  }

  if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    return new GoogleAuth({
      keyFile: env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: [SCOPE],
    });
  }

  // Fallback ADC (útil em GCP-managed environments). Em Render isso falha
  // claramente, sinalizando que é preciso preencher uma das duas envs acima.
  log.warn('Nenhuma credencial GCP explícita — tentando ADC');
  return new GoogleAuth({ scopes: [SCOPE] });
}

export async function getAccessToken(): Promise<string> {
  if (!cachedAuth) cachedAuth = buildAuth();
  const client = (await cachedAuth.getClient()) as JWT;
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('Falha ao obter access token GCP');
  return token;
}

/** Reset usado em testes pra forçar nova credencial. */
export function _resetAuthCacheForTests() {
  cachedAuth = null;
}
