# SNAPSHOT — Versão estável v1.0
**Data:** 2026-04-29 04:45 (UTC)
**Tag git:** stable-v1.0-20260429
**Branch backup:** backup/stable-v1.0-20260429
**Commit hash:** 755fbf0d4772cb575f675e29e90c2f05f8e8318a
**URL produção:** https://ugc-prompt-generator-six.vercel.app

---

## Estado funcional (confirmado por logs de produção)
- [x] 4 estilos de prompt funcionando (Base, Edredons Premium, Nano + Vídeos, Nano + Vídeos 2)
- [x] Geração single funcional
- [x] Geração em lote sem truncamento (fix safeParseJSON aplicado — 7/7 itens OK em lote de teste)
- [x] Galeria salva e renderiza todos os estilos corretamente
- [x] Auth + perfil + estatísticas funcionais

**Evidência de log do lote (lote de 7 itens Base, todos OK):**
```
[2026-04-29T06:57:11.099Z] [callClaude] style=base stop_reason=end_turn output=707
[2026-04-29T06:57:11.100Z] [processItem] index=2 pv.length=1699 OK | tail: "...pure video frame only, 9:16 photorealistic"
[2026-04-29T06:57:11.887Z] [callClaude] style=base stop_reason=end_turn output=754
[2026-04-29T06:57:11.887Z] [processItem] index=0 pv.length=1880 OK | tail: "...pure video frame only, 9:16 photorealistic"
[2026-04-29T06:57:13.873Z] [callClaude] style=base stop_reason=end_turn output=772
[2026-04-29T06:57:13.873Z] [processItem] index=1 pv.length=1947 OK | tail: "...pure video frame only, 9:16 photorealistic"
... (índices 3, 4, 5, 6 — todos OK, todos terminando com pure video frame only)
```

---

## Stack
- **Backend:** Node.js + Express (`server.js`)
- **Frontend:** HTML/CSS/JS single-file (`public/index.html`)
- **DB:** Supabase (tabelas: `users`, `gallery`, `queue_jobs`)
- **IA:** Anthropic Claude `claude-sonnet-4-6`
- **Deploy:** Vercel (auto-deploy do branch `main`)

---

## System prompts
| Arquivo | Estilo | Tamanho |
|---|---|---|
| `PROMPT.md` | `base` — ⚡ Base | 6.178 chars |
| `PROMPT-serie.md` | `serie` — 🛏️ Edredons Premium | 18.326 chars |
| `PROMPT-nano.md` | `nano` — 🎬 Edredom Nano + Vídeos | 17.599 chars |
| `PROMPT-nano-veo-2.md` | `nano-veo-2` — 🧪 Nano + Vídeos 2 | 27.106 chars |
| `CLAUDE.md` | Regras permanentes do projeto | — |

---

## Variáveis de ambiente (.env) — apenas nomes, sem valores
```
ANTHROPIC_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_KEY
JWT_SECRET
EMAIL_USER
EMAIL_PASS
ADMIN_EMAIL
ADMIN_PASSWORD
ADMIN_SETUP_SECRET
APP_URL
FAL_INITIAL_BALANCE
PORT
```

---

## Estrutura de pastas
```
ugc-prompt-generator/
├── server.js                    ← backend principal
├── package.json / package-lock.json
├── vercel.json                  ← config deploy
├── PROMPT.md                    ← system prompt base
├── PROMPT-serie.md              ← system prompt edredons premium
├── PROMPT-nano.md               ← system prompt nano + vídeos
├── PROMPT-nano-veo-2.md         ← system prompt nano + vídeos 2
├── CLAUDE.md                    ← regras permanentes do projeto
├── CONTEXT.md                   ← skills de copy e design
├── supabase_migration.sql       ← DDL das tabelas
├── test-parse-fix.js            ← 11 testes unitários do fix
├── public/
│   ├── index.html               ← frontend completo
│   └── hero.mp4                 ← vídeo do hero da landing
├── docs/
│   └── edredom-nano-spec.pdf    ← briefing do produto
├── logs/
│   └── batch-debug.log          ← log de debug do batch
└── backups/                     ← esta pasta
```

---

## Endpoints da API (`server.js`)
| Método | Rota | Função |
|---|---|---|
| POST | `/api/auth/register` | Cadastro de usuário |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Dados do usuário logado |
| POST | `/api/auth/forgot-password` | Esqueci a senha |
| POST | `/api/auth/reset-password` | Reset de senha |
| POST | `/api/auth/setup-admin` | Setup inicial do admin |
| POST | `/api/auth/migrate-gallery` | Migração de galeria local → Supabase |
| PATCH | `/api/users/profile` | Atualizar perfil |
| POST | `/api/generate` | Gerar prompt (single) |
| POST | `/api/generate-batch` | Gerar prompts em lote (SSE stream) |
| GET | `/api/gallery` | Listar galeria do usuário |
| POST | `/api/gallery` | Salvar item na galeria |
| DELETE | `/api/gallery/:id` | Deletar item da galeria |
| GET | `/api/stats` | Estatísticas do usuário |
| GET | `/api/exchange-rate` | Taxa de câmbio USD→BRL |
| GET | `/api/fal/balance` | Saldo Fal.ai |
| POST | `/api/queue/submit` | Submeter lote para fila |
| GET | `/api/queue/batch/:batchId` | Status do lote na fila |
| POST | `/api/webhook/kiwify` | Webhook de pagamento Kiwify |
| GET | `/api/debug/last-batch` | Log do último batch (admin only) |
| GET | `/termos` | Página de termos de uso |
| GET | `*` | Serve `public/index.html` |

---

## Banco de dados Supabase — schema das tabelas

### Tabela `users`
| Coluna | Tipo | Notas |
|---|---|---|
| `id` | TEXT | PK |
| `email` | TEXT | Único |
| `password_hash` | TEXT | bcrypt |
| `name` | TEXT | — |
| `is_admin` | BOOLEAN | — |
| `prompts_count` | INTEGER | Default 0 |
| `tokens_used` | BIGINT | Default 0 |
| `plan` | TEXT | Default 'free' |
| `plan_active` | BOOLEAN | Default false |
| `generations_used` | INTEGER | Default 0 |
| `generations_limit` | INTEGER | Default 0 |
| `reset_token` | TEXT | — |
| `reset_expires` | TIMESTAMPTZ | — |
| `accepted_terms_at` | TIMESTAMPTZ | — |
| `created_at` | TIMESTAMPTZ | — |

### Tabela `gallery`
| Coluna | Tipo | Notas |
|---|---|---|
| `id` | TEXT | PK |
| `user_id` | TEXT | FK → users |
| `prompt_video` | TEXT | Conteúdo gerado |
| `legenda` | TEXT | — |
| `nicho` | TEXT | — |
| `emocao` | TEXT | — |
| `tipo` | TEXT | tipo do produto |
| `price` | TEXT | — |
| `cost` | TEXT | — |
| `image` | TEXT | base64 da imagem |
| `created_at` | TIMESTAMPTZ | — |

### Tabela `queue_jobs`
| Coluna | Tipo | Notas |
|---|---|---|
| `id` | TEXT | PK |
| `batch_id` | TEXT | — |
| `user_id` | TEXT | FK → users |
| `position` | INT | — |
| `name` | TEXT | — |
| `status` | TEXT | waiting/generating/done/error |
| `gallery_id` | TEXT | — |
| `error_msg` | TEXT | — |
| `created_at` | TIMESTAMPTZ | — |
| `updated_at` | TIMESTAMPTZ | — |

---

## Como restaurar essa versão se algo quebrar

```bash
# Opção 1 — restaurar localmente
git checkout stable-v1.0-20260429
npm install
# Configurar .env com as variáveis listadas acima
node server.js

# Opção 2 — restaurar produção (Vercel) a partir da tag
git checkout stable-v1.0-20260429
git push -f origin stable-v1.0-20260429:main
# (aguardar deploy automático na Vercel)

# Opção 3 — restaurar do zip local
# Descompactar backups/stable-v1.0-20260429-projeto2.zip
# npm install
# node server.js
```

---

## Arquivos de backup gerados
| Arquivo | Tamanho | Conteúdo |
|---|---|---|
| `stable-v1.0-20260429-projeto2.zip` | 1,51 MB | Projeto completo sem node_modules |
| `stable-v1.0-20260429-essencial.zip` | 0,12 MB | Só arquivos críticos (server.js, index.html, PROMPT*.md, package.json, vercel.json) |
| `stable-v1.0-20260429-projeto.zip` | ~126 MB | ZIP com node_modules (pode ser deletado) |

> **Nota:** `stable-v1.0-20260429-projeto.zip` foi gerado com node_modules incluídos acidentalmente.
> Pode ser deletado — use `projeto2.zip` ou `essencial.zip` para restauração.

---

## Fixes incluídos nesta versão estável

### Fix principal: truncamento de `prompt_video` em lotes
**Causa raiz:** `safeParseJSON` tentativa 2 não distinguia fechamento de string JSON
de aspas duplas literais dentro do diálogo (ex: `mais: "Gente!"`). Parser dessincronizava,
caía no regex da tentativa 3, capturava só o trecho antes da primeira aspas.

**Fix:** lookahead na tentativa 2 — ao encontrar `"` dentro de string, verifica próximo
char estrutural para distinguir fechamento legítimo de aspas interior sem escape.

**Testado com:** 11 testes unitários (todos OK) + lote real de 7 itens em produção (todos OK).

### Fix secundário: detecção de estilo `nano-veo-2` na galeria
Salve agora usa parâmetro `style` como detecção primária (não campo `emocao`).

---

*Gerado automaticamente em 2026-04-29.*
