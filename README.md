# TCE-Minutas v2

Reescrita limpa em TypeScript do Atelier Judicial. Single-user, mesmo Supabase
do v1, hospedagem Render Free.

## Por que reescrita

O v1 tem caminhos Windows hard-coded (`C:\Users\Tercio\...`) que falham em
produção, sem RLS, sem auth, e mistura JS/Python/Next em paths frágeis. O v2
traz: TypeScript estrito, Zod nas bordas, prompts versionados em arquivos,
busca de processos similares como aba dedicada, magic-link auth, RLS.

## Stack

- Next.js 15 App Router + React 19
- Tailwind v4 (CSS-first, design tokens em `app/globals.css`)
- Supabase (Postgres + Storage + Auth) — mesmo projeto do v1
- Gemini 2.5 (Flash para resumo/chat, Pro para minuta) via `@google/genai`
- Vertex AI Search para precedentes (Discovery Engine + `google-auth-library`)
- `unpdf` (PDFs) e `docxtemplater` (DOCX) — sem Python
- Pino para logs

## Bring-up local (passo a passo)

### 1. Instalar dependências

```bash
cd v2
npm install
```

### 2. Configurar `.env.local`

```bash
cp .env.example .env.local
```

Preencha (mínimo viável):

- `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` — do mesmo projeto do v1
- `SUPABASE_SERVICE_ROLE_KEY` — do mesmo projeto
- `GEMINI_API_KEY` — Google AI Studio
- `GOOGLE_APPLICATION_CREDENTIALS` — caminho local do `credencial_gcp.json`
- `ALLOWED_USER_EMAIL=tercioaraujo1@gmail.com`
- `NEXT_PUBLIC_SITE_URL=http://localhost:3000`

### 3. Aplicar migrações no Supabase

No SQL Editor do Supabase Studio (ou via `supabase db push`), aplique na ordem:

1. `supabase/migrations/0001_v2_extensions.sql` — adiciona `owner_id`,
   `jobs`, `similares_cache`
2. `supabase/migrations/0003_documentos.sql` — tabela `documentos`
3. **Ainda NÃO aplique** `0002_rls_single_user.sql` — só depois do passo 5

### 4. Subir o app local

```bash
npm run dev
```

Abrir `http://localhost:3000`. Fará redirect para `/login`. Entre com seu
e-mail (deve bater com `ALLOWED_USER_EMAIL`).

### 5. Backfill do `owner_id` e ativação do RLS

Após o primeiro login (sua linha aparece em `auth.users`):

1. Rode `supabase/seeds/backfill_owner.sql`
2. Aplique `supabase/migrations/0002_rls_single_user.sql`

A partir desse ponto, RLS está ativa e protege os dados.

### 6. Template DOCX

Para a geração de DOCX funcionar, criar `assets/template.docx` conforme
`assets/TEMPLATE_INSTRUCTIONS.md`.

## Deploy (Render Free)

O `render.yaml` na raiz da v2 já define o serviço. Conectar o repo no Render,
criar Web Service via Blueprint, preencher os `sync: false` no painel
(SUPABASE_*, GEMINI_API_KEY, GOOGLE_APPLICATION_CREDENTIALS_JSON com o
JSON inteiro como string, ALLOWED_USER_EMAIL, NEXT_PUBLIC_SITE_URL).

## Estrutura

```
v2/
  app/
    (auth)/login/         # magic link
    (app)/                # rotas autenticadas (sidebar, painel, fluxo)
      processo/[id]/
        resumo/           # triagem auto-gerada
        diretrizes/       # decisões da Conselheira
        minuta/           # voto gerado pelo Gemini Pro
        similares/        # top 3 precedentes do Vertex
    api/                  # route handlers
    auth/callback/        # OAuth/magic link callback
  lib/
    gemini/               # @google/genai wrapper com retry/timeout
    vertex/               # Discovery Engine + cache 7d
    pdf/                  # unpdf (sem Python)
    docx/                 # docxtemplater (placeholders nomeados)
    storage/              # Supabase Storage helpers
    supabase/             # client/server/middleware
    config/               # carrega persona da Conselheira
    types/                # tipos client-safe
  prompts/                # persona, resumo, minuta — texto separado de código
  schemas/                # Zod (resumo, diretrizes, minuta)
  components/             # UI compartilhada
  supabase/
    migrations/           # 0001, 0002, 0003 — SQL idempotente
    seeds/                # backfill_owner.sql
  assets/                 # template.docx (criado fora do git)
```

## Notas de migração v1 → v2

- **Banco:** mesmas tabelas. v2 adiciona `owner_id` nullable + `jobs` +
  `similares_cache` + `documentos`. Sem breaking change enquanto RLS não
  for ativada.
- **Storage:** mesmo bucket `processos`. v2 usa convenção
  `{processo_id}/{kind}/{filename}`.
- **Configurações:** v1 já popula `tom_voz`, `proibicoes`, etc. v2 lê das
  mesmas linhas.
- **Vertex AI:** v1 usa JWT manual via `crypto`. v2 usa
  `google-auth-library` (cache de token automático, refresh próprio).

## TODO

- [ ] Página `/processo/[id]/revisao` (Step 5) com chat de ajustes
- [ ] Página de detalhes/edição de um processo individual
- [ ] Testes Vitest dos schemas e do parser do Vertex
- [ ] Smoke E2E com Playwright
- [ ] Sentry
