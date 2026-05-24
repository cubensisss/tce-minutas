# Começando — TCE-Minutas v2

Tudo que você precisa fazer pra rodar o sistema localmente em 5 minutos.

---

## Passo 1 — Instalar e configurar

Abra o terminal na pasta `v2` e rode:

```bash
npm install
npm run gen:template
cp .env.example .env.local
```

O `gen:template` cria automaticamente o `assets/template.docx`. Depois você
pode abrir no Word e ajustar fonte/cabeçalho — só não mexa nos `{placeholders}`.

Abra o arquivo `.env.local` que foi criado e preencha as chaves. Você pode
copiar a maioria do `.env` do v1 (mesmo Supabase, mesma API key do Gemini,
mesma credencial GCP). Os campos críticos:

```
NEXT_PUBLIC_SUPABASE_URL=...        # (mesmo do v1)
NEXT_PUBLIC_SUPABASE_ANON_KEY=...   # (mesmo do v1)
SUPABASE_SERVICE_ROLE_KEY=...       # (mesmo do v1)
GEMINI_API_KEY=...                  # (mesmo do v1)
GOOGLE_APPLICATION_CREDENTIALS=C:\Users\Tercio\Documents\TCE\TCE\credencial_gcp.json
ALLOWED_USER_EMAIL=tercioaraujo1@gmail.com
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

---

## Passo 2 — Aplicar SQL no Supabase

Abra o **SQL Editor** do Supabase Studio (https://supabase.com/dashboard).
Selecione o seu projeto. Clique em "New query". Cole **o arquivo inteiro**:

```
v2/supabase/APLICAR_NO_SUPABASE.sql
```

Clique em "Run". Deve aparecer "Success. No rows returned".

> 💡 É seguro rodar quantas vezes quiser — o script é idempotente (não duplica nada).

---

## Passo 3 — Subir o app e logar

```bash
npm run dev
```

Abra http://localhost:3000 no navegador. Vai redirecionar pra `/login`.

Digite seu e-mail (`tercioaraujo1@gmail.com`) e clique em "Enviar link".
O Supabase manda um e-mail com link mágico — clique nele.

Você cai no painel.

---

## Passo 4 — Backfill e RLS (UMA vez só, depois do primeiro login)

Volte ao SQL Editor do Supabase e rode os DOIS arquivos abaixo, em ordem:

1. Cole e rode: `v2/supabase/seeds/backfill_owner.sql`
   (Atribui você como dono dos processos antigos)

2. Cole e rode: `v2/supabase/migrations/0002_rls_single_user.sql`
   (Ativa Row Level Security — só você acessa seus dados)

Pronto. A partir daqui o sistema está protegido.

---

## Como testar tudo está OK

1. **Painel** carrega seus processos antigos? ✓
2. Click "Novo processo", suba um relatório PDF + uma defesa, criar.
3. Cai na página de **Resumo** → ele extrai e gera automaticamente.
4. Click "Definir diretrizes" → marque procedente em algum achado, salve.
5. Cai em **Minuta** → gera (60–180s).
6. Click "Baixar DOCX" → arquivo abre no Word.
7. Click "Similares" → aparecem 3 precedentes do TCE Andressa.
8. Click "Revisão" → peça "encurtar a ementa em 30%" → ele reescreve.

Se algum passo falhar, o erro aparece na tela. Manda pra mim.

---

## Comandos úteis

```bash
npm run dev          # subir app local
npm run build        # build de produção (testa que tudo compila)
npm run typecheck    # só checa tipos sem buildar
npm run test         # roda os testes Vitest
npm run gen:template # regera o template.docx
```

---

## Quando fizer deploy (Render)

1. Commit + push do v2 pro repositório
2. No Render: New → Blueprint → aponte pro repo
3. Render lê o `v2/render.yaml` e cria o serviço
4. Preencha as envs marcadas `sync: false` no painel:
   - `SUPABASE_*`, `GEMINI_API_KEY`
   - `GOOGLE_APPLICATION_CREDENTIALS_JSON` — cole o JSON inteiro do
     `credencial_gcp.json` como string única
   - `ALLOWED_USER_EMAIL=tercioaraujo1@gmail.com`
   - `NEXT_PUBLIC_SITE_URL=https://tce-minutas-v2.onrender.com`
     (ou o domínio que o Render der)

Deploy automático. URL pública pronta em ~3 min.
