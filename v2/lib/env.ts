/**
 * Validação centralizada das variáveis de ambiente.
 * Falha cedo se algo crítico estiver ausente — evita debug obscuro em produção.
 */
import { z } from 'zod';

const envSchema = z.object({
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // Gemini
  // GEMINI_PRO_MODEL pode ser trocado para 'gemini-3-pro' (ou versão
  // mais recente) quando disponível, sem mexer em código.
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_FLASH_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_PRO_MODEL: z.string().default('gemini-2.5-pro'),

  // GCP Vertex AI
  GCP_PROJECT_ID: z.string().default('uptemporada'),
  GCP_LOCATION: z.string().default('global'),
  VERTEX_DATA_STORE_ID: z.string().default('tceandressa_1775759460294'),
  VERTEX_APP_ID: z.string().default('tceandressa_1775759242362'),
  GOOGLE_APPLICATION_CREDENTIALS_JSON: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),

  // Auth
  // ALLOWED_USER_EMAILS aceita lista separada por vírgula (multi-user).
  // ALLOWED_USER_EMAIL (singular, legado) ainda é honrado se presente.
  ALLOWED_USER_EMAIL: z.string().email().optional(),
  ALLOWED_USER_EMAILS: z.string().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url(),

  // Observabilidade
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('[env] Variáveis de ambiente inválidas:', parsed.error.flatten().fieldErrors);
    throw new Error('Variáveis de ambiente inválidas — ver logs');
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}

/**
 * E-mails autorizados a logar. Une `ALLOWED_USER_EMAILS` (CSV) e
 * `ALLOWED_USER_EMAIL` (singular legado). Comparação é case-insensitive.
 */
export function getAllowedEmails(): Set<string> {
  const env = getEnv();
  const out = new Set<string>();
  if (env.ALLOWED_USER_EMAIL) out.add(env.ALLOWED_USER_EMAIL.trim().toLowerCase());
  if (env.ALLOWED_USER_EMAILS) {
    for (const e of env.ALLOWED_USER_EMAILS.split(',')) {
      const v = e.trim().toLowerCase();
      if (v) out.add(v);
    }
  }
  return out;
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAllowedEmails().has(email.trim().toLowerCase());
}

/** Variáveis seguras de expor no cliente. Não inclui chaves de serviço. */
export function getPublicEnv() {
  const env = getEnv();
  return {
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: env.NEXT_PUBLIC_SITE_URL,
  };
}
