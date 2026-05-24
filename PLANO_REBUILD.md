# TCE Minutas v2 — Plano de Arquitetura

Documento de referência para o rebuild do sistema.
Decisões já travadas com o Tercio:

- **Single-user** (só você)
- **Rebuild limpo** em TypeScript (não refatoração incremental)
- **Busca de processos similares** usando a base vetorial Vertex AI Search já existente, retornando os 3 mais recentes quando há muitos resultados
- Preferência por hospedagem **gratuita**, com Render como alternativa aceitável

---

## 1. Hospedagem: por que Render e não Vercel

A pergunta original era "dá pra rodar igualmente bem no Vercel". Resposta honesta: **dá, mas vai ficar mais complexo do que precisa, sem ganho real**. Comparação direta para o seu caso:

| Critério | Vercel Hobby (grátis) | Vercel Pro Fluid (~US$20/mês) | Render Starter (US$7/mês) | Render Free (grátis) |
|---|---|---|---|---|
| Timeout máximo de função | 10s — **inviável** | ~800s | ilimitado (long-running) | ilimitado |
| Cold start | sim (ms) | quase nenhum | nenhum (sempre quente) | sim, dorme após 15min |
| Roda Python no mesmo container | não | runtime separado | sim | sim |
| Storage local persistente | não | não | sim (volumes) | sim |
| Worker em background | exige fila externa | exige fila externa | trivial | trivial |

A geração da minuta com Gemini Pro + prompt de centenas de milhares de tokens leva **30 a 90 segundos** em condições normais. Em Vercel Hobby isso é fisicamente impossível em uma única request — você seria obrigado a:

1. Criar tabela `jobs` no banco
2. API dispara o job e retorna `202 Accepted`
3. Worker separado (em Render, Railway, Fly.io ou similar) consome a fila
4. Frontend faz polling a cada 3s pra saber se acabou
5. Tratar idempotência, retries, dead letter queue

Tudo isso é feito normalmente em sistemas grandes — mas pra um single-user é overengineering puro. **Render Starter (US$7/mês) ou Render Free elimina esse problema**: você roda sync, sem fila, sem polling, sem worker separado.

**Recomendação:** Render Starter por US$7/mês. Render Free funciona, mas vai dormir e a primeira requisição depois do "sleep" demora ~30s acordando, o que polui a UX. Se quiser ficar 100% grátis, dá pra implementar com Vercel Hobby + Supabase Edge Functions (workers), mas o custo de complexidade não compensa pra um usuário só.

**Decisão proposta:** ficar em Render. Se você quiser usar a Vercel só pelo deploy git push automático e DX, dá pra rodar o Next na Vercel e mandar os jobs pesados pra um endpoint do Render — mas isso é dois ambientes pra debugar. Render sozinho é mais limpo.

---

## 2. Stack escolhida

| Camada | Escolha | Motivo |
|---|---|---|
| Framework | Next.js 15 (App Router) | mantém o que você já sabe |
| Linguagem | TypeScript estrito | apanha bugs em compile time, tipos vivem entre client/server |
| Validação | Zod | schemas únicos pra request/response/IA — nunca mais um `JSON.parse` cego |
| Estilo | Tailwind v4 | mantém |
| DB / Auth / Storage | Supabase | mantém |
| IA generativa | `@google/genai` SDK | versão nova, suporta JSON mode nativo, melhor que `@google/generative-ai` |
| Busca vetorial | Vertex AI Search (data store atual) | reaproveita a base já indexada |
| Auth GCP | `google-auth-library` | troca o JWT manual por lib oficial |
| PDF → texto | `unpdf` ou `pdf-parse` | **elimina dependência de Python** |
| DOCX | `docxtemplater` + template com placeholders `{{numero}}`, `{{ementa}}`, etc. | troca o `clear_and_set(p[2], ...)` frágil por placeholders nomeados |
| Markdown | `react-markdown` em todo lugar | unifica os 2 renderizadores que tem hoje |
| Observabilidade | Pino (logs estruturados) + Sentry free tier | substitui `console.log` espalhado |
| Testes | Vitest + Playwright (smoke tests) | snapshots dos prompts e parsers |
| Migrations | Supabase CLI (`supabase/migrations/*.sql`) | schema versionado no git |

---

## 3. Estrutura de pastas

```
tce-minutas-v2/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx                  # Sidebar + TopNav, exige login
│   │   ├── page.tsx                    # Dashboard
│   │   ├── novo/page.tsx
│   │   ├── arquivos/page.tsx
│   │   ├── similares/page.tsx          # 🆕 busca livre na base vetorial
│   │   ├── configuracoes/page.tsx
│   │   └── processo/[id]/
│   │       ├── layout.tsx              # injeta contexto do processo
│   │       ├── resumo/page.tsx
│   │       ├── similares/page.tsx      # 🆕 similares ao processo atual
│   │       ├── diretrizes/page.tsx
│   │       └── minuta/page.tsx
│   └── api/
│       ├── processos/route.ts
│       ├── processo/[id]/route.ts
│       ├── upload/route.ts
│       ├── resumo/route.ts
│       ├── minuta/
│       │   ├── gerar/route.ts
│       │   ├── aplicar/route.ts
│       │   └── exportar/route.ts
│       ├── chat/route.ts
│       └── similares/
│           ├── buscar/route.ts         # 🆕 busca livre por query
│           └── processo/[id]/route.ts  # 🆕 similares ao processo
├── lib/
│   ├── supabase/
│   │   ├── client.ts                   # browser
│   │   ├── server.ts                   # server, com service_role
│   │   └── middleware.ts               # protege rotas
│   ├── gemini.ts                       # cliente único, com retry
│   ├── vertex-search.ts                # busca vetorial, com cache
│   ├── pdf-extract.ts                  # unpdf wrapper
│   ├── docx-generate.ts                # docxtemplater wrapper
│   └── logger.ts                       # pino + Sentry
├── services/
│   ├── resumo.service.ts               # orquestração: storage → extract → IA → save
│   ├── minuta.service.ts               # orquestração da geração
│   ├── similares.service.ts            # 🆕 busca + dedup + ordenação
│   └── export.service.ts
├── prompts/
│   ├── resumo.md                       # prompt do resumo (era inline)
│   ├── minuta.md                       # prompt da minuta (era inline, 60+ linhas)
│   └── chat.md
├── schemas/
│   ├── achado.ts                       # Zod
│   ├── processo.ts
│   ├── minuta.ts
│   └── ai-response.ts                  # schemas das respostas da IA
├── components/
│   ├── ui/                             # primitivos (button, card, etc.)
│   ├── nav/Sidebar.tsx
│   ├── nav/TopNav.tsx
│   ├── processo/StepIndicator.tsx
│   └── similares/ResultadoCard.tsx
├── supabase/
│   ├── migrations/
│   │   ├── 20260101000000_initial.sql
│   │   ├── 20260101000001_auth.sql
│   │   └── 20260101000002_jobs.sql
│   └── seed.sql                        # configurações default
├── tests/
│   ├── unit/parsers.test.ts
│   ├── unit/prompts.test.ts            # snapshots
│   └── e2e/fluxo-completo.spec.ts
├── .env.example
├── render.yaml                         # IaC do Render
├── tsconfig.json
├── package.json
└── README.md
```

---

## 4. Modelo de dados (Supabase)

Tabelas atuais que ficam, com pequenas mudanças, e as novas:

### Atuais (com ajustes)

```sql
-- processos: ganha owner_id pra alinhar com auth
processos (
  id uuid pk,
  owner_id uuid references auth.users not null,
  numero text not null,
  unidade_jurisdicionada text,
  exercicio text,
  interessados text,
  descricao_objeto text,
  status text check (status in ('upload','resumo','diretrizes','minuta','revisao','finalizado')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- documentos: nada muda, só RLS
documentos (
  id uuid pk,
  processo_id uuid references processos on delete cascade,
  tipo text check (tipo in ('auditoria','defesa','instrucao')),  -- 🆕 instrucao = os _clean txt
  nome_arquivo text,
  storage_path text,
  texto_extraido text,
  created_at timestamptz default now()
);

-- achados, minutas, chat_mensagens, configuracoes: idem, só ganham RLS
```

### Novas

```sql
-- jobs: rastreia operações longas (geração, exportação)
-- útil mesmo sem fila, pra UI saber o status
jobs (
  id uuid pk,
  processo_id uuid references processos on delete cascade,
  tipo text check (tipo in ('resumo','minuta','export','similares')),
  status text check (status in ('pending','running','succeeded','failed')),
  payload jsonb,            -- input do job
  resultado jsonb,          -- output ou erro
  erro text,
  iniciado_em timestamptz,
  finalizado_em timestamptz,
  created_at timestamptz default now()
);

-- similares_cache: evita pagar Vertex AI toda vez que o usuário abre a aba
similares_cache (
  id uuid pk,
  processo_id uuid references processos on delete cascade,  -- null se busca livre
  query_hash text,          -- hash da query, pra cache de busca livre
  query_text text,
  resultados jsonb,         -- top N do Vertex AI
  expires_at timestamptz,   -- TTL de 24h
  created_at timestamptz default now()
);
```

### Row Level Security
Todas as tabelas com `owner_id` direto ou via `processo_id`:
```sql
create policy "single_user_only" on processos
  for all using (owner_id = auth.uid());
```
Como é single-user, RLS é mais "cinto e suspensório" — mas custa nada e te protege contra acidente futuro de expor a anon key.

---

## 5. Feature nova: Processos Similares

### Telas

**5.1 `/similares` — busca livre**
- Barra de pesquisa grande
- Tags rápidas com queries pré-prontas (ex.: "contratação direta", "dispensa de licitação", "subsídios irregulares")
- Resultados em cards, max 10, com:
  - Título do processo / decisão
  - Trecho extrativo do Vertex AI (snippet com highlight)
  - Data (quando disponível no metadata)
  - Botão "Ver no Conselheiro" (link)
  - Botão "Usar como referência neste processo →" (se houver processo aberto)

**5.2 `/processo/[id]/similares` — similares ao processo atual**
- Sem barra de busca: o backend monta a query automaticamente a partir dos `achados.titulo` do processo
- Top 3 mais recentes (conforme você pediu)
- Mesmos cards
- Bonus: botão "Citar no chat" que joga o snippet no chat lateral da minuta como contexto adicional

### Backend

`/api/similares/buscar`
```ts
POST /api/similares/buscar
body: { query: string, processoId?: string }
response: { resultados: Array<{ titulo, snippet, link, data?, score }> }
```

`/api/similares/processo/[id]`
```ts
GET /api/similares/processo/:id
response: { resultados: Array<...> }
// monta queries a partir dos achados
// busca em paralelo
// dedup por título/link
// ordena por data desc se disponível, senão por score
// retorna top 3
```

### Cache
- Hit no `similares_cache` antes de bater no Vertex AI
- TTL de 24h (decisões antigas não mudam)
- Invalida quando o processo tem novos achados

### Gotcha pra verificar antes
A `derivedStructData` do Vertex AI Search atualmente expõe `title` e `link`. Pra ordenar "por mais recente" precisamos de **um campo de data**. Antes de implementar, vou precisar inspecionar uma resposta real do data store `tceandressa_1775759460294` pra ver se ele tem `data_publicacao`, `data_julgamento` ou similar nos `derivedStructData`. Se não tiver, duas saídas:
1. Ordenar por score (relevância) e mostrar "top 3 mais relevantes" em vez de "mais recentes"
2. Re-indexar o data store com data como structured field (mais trabalhoso)

Esse item fica no checklist do início da implementação.

---

## 6. O problema dos arquivos locais

Hoje a geração da minuta lê `C:\Users\Tercio\Documents\TCE\TCE\Elaborando Voto\<numero>\_clean\*.txt`. Isso precisa virar:

1. Quando você cria um processo novo, junto com o relatório de auditoria e a defesa, faz upload também dos **textos de instrução processual** (os `_clean.txt`). Eles ficam no Supabase Storage com `tipo = 'instrucao'`.
2. A rota `minuta/gerar` lê do storage em vez do disco local.
3. Pra migrar o que já existe: script único `migrate-clean-files.ts` que varre `C:\...\Elaborando Voto\` e sobe pro Supabase, vinculando ao processo certo pelo número.

Isso libera o sistema de depender da sua máquina e faz funcionar de qualquer lugar.

---

## 7. Prompt como código

Hoje o prompt da minuta está hard-coded no meio de `route.js`, com 60+ linhas. Proposta:

- `prompts/minuta.md` — texto puro, com placeholders `{{persona}}`, `{{achados}}`, `{{precedentes}}`, etc.
- `lib/prompts.ts` — função `renderPrompt(name, vars)` que carrega o `.md` e faz interpolação
- Cada prompt tem um teste snapshot: `tests/unit/prompts.test.ts` garante que com inputs fixos o prompt renderizado não muda inadvertidamente

Vantagem: você consegue editar o prompt sem mexer em código, e mudanças no prompt aparecem como diff legível no git.

---

## 8. Auth single-user

Supabase Auth com **magic link** no seu e-mail:
- `/login` — input de e-mail, manda link
- Link redireciona pra `/auth/callback` que troca por sessão
- Middleware `(app)/layout.tsx` valida sessão; sem sessão → redireciona pra login
- Whitelist hard-coded: `if (user.email !== 'tercioaraujo1@gmail.com') deny()`

Simples, sem senha, sem gestão de usuários. Quando virarem 2 ou 3 (assessores), trocar `===` por uma tabela `usuarios_permitidos`.

---

## 9. Roadmap de implementação

Sugiro 6 fases sequenciais. Cada uma é mergeable sozinha — você consegue ver progresso real antes de tudo terminar.

### Fase 0 — Setup (1 dia)
- Repo novo `tce-minutas-v2`
- Next 15 + TS + Tailwind
- Supabase project (pode ser o mesmo, pra reaproveitar dados)
- Migrations iniciais
- CI básico no GitHub Actions (lint + typecheck + test)
- Deploy no Render via `render.yaml`
- Variáveis de ambiente documentadas em `.env.example`

### Fase 1 — Auth e estrutura (1 dia)
- Magic link login
- Layouts `(auth)` e `(app)` com proteção
- Sidebar + TopNav portados
- Dashboard vazio mas funcional

### Fase 2 — Fluxo principal portado (3-4 dias)
- `/novo` — upload pro Supabase Storage
- `/processo/[id]/resumo` — chamando Gemini Flash
- `/processo/[id]/diretrizes`
- `/processo/[id]/minuta` + chat
- Tudo com Zod, services separados, prompts em `.md`
- Substituição do Python: `unpdf` pra PDF, `docxtemplater` pra DOCX

### Fase 3 — Migração de dados (1 dia)
- Script `migrate-from-v1.ts` que copia processos, achados, minutas, configurações do Supabase v1 pro v2
- Script `migrate-clean-files.ts` que sobe os `_clean.txt` do disco

### Fase 4 — Processos Similares (2 dias)
- Inspeção do schema do Vertex AI data store
- `lib/vertex-search.ts` refatorada com `google-auth-library`
- `services/similares.service.ts` com cache
- Telas `/similares` e `/processo/[id]/similares`
- Botão "Citar no chat"

### Fase 5 — Polish e produção (1-2 dias)
- Sentry + Pino
- Snapshot tests dos prompts
- E2E smoke test do fluxo completo
- README com setup, deploy, troubleshooting
- Migrar produção: apontar DNS / atualizar bookmark

**Total estimado:** 9-12 dias de trabalho (não corridos — vai depender do seu ritmo).

---

## 10. O que NÃO vai mudar

Algumas decisões do v1 estão certas e ficam:

- A divisão em 5 estágios (`upload → resumo → diretrizes → minuta → revisao → finalizado`)
- Versionamento de minutas por `versao`
- Chat com sugestão pendente em vez de o LLM editar direto
- Separação "precedentes só pra estilo / documentos brutos como matéria fática"
- Persona / tom de voz / proibições como configuração editável
- O design visual do "Judicial Atelier" (Newsreader + Material Symbols + paleta atual)

---

## 11. Decisões em aberto (precisam de você antes da Fase 0)

1. **Render Starter (US$7/mês) ou Render Free?** Recomendo Starter pelo zero cold-start, mas Free funciona se topar a primeira requisição lenta após inatividade.
2. **Mantém o mesmo projeto Supabase ou cria um novo?** Mesmo é mais simples, novo te dá ambiente de staging.
3. **Domínio próprio?** (`minutas.seudominio.com.br`) ou subdomínio do Render mesmo?
4. **A inspeção do Vertex AI** pra ver se tem campo de data — quer que eu faça isso agora numa chamada de teste, ou prefere depois quando estivermos na Fase 4?

---

*Documento vivo — atualizar conforme decidirmos coisas novas.*
