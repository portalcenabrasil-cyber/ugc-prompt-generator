# SNAPSHOT — Versão estável v1.1
**Data:** 2026-04-29
**Tag git:** stable-v1.1-20260429
**Branch backup:** backup/stable-v1.1-20260429
**Commit hash:** acec6f7c5736... (git rev-parse HEAD)
**URL produção:** https://ugc-prompt-generator-six.vercel.app
**Versão anterior:** stable-v1.0-20260429 (commit 755fbf0)

---

## O que mudou desde v1.0

### Fix 1 — Auto-deploy GitHub→Vercel (commit abd1edb)
**Problema:** O projeto Vercel foi originalmente criado via CLI (`vercel deploy`) sem GitHub integration. O campo `link` do projeto estava `null`. Pushes ao GitHub não disparavam nenhum deploy — tudo era manual com `vercel deploy --prod`.

**Fix:** Integração conectada via API (`POST /v2/projects/{id}/link`) com:
- `type: "github"`
- `org: "portalcenabrasil-cyber"`
- `repoId: 1214862460`
- `productionBranch: "main"`

**Resultado:** `git push origin main` agora auto-deploya para produção em ~2 min.

---

### Fix 2 — Serverless Lambda crashes (commit acec6f7)
**Problema A:** `fs.mkdirSync(path.join(__dirname, 'logs'))` no startup do servidor — `__dirname` é **read-only** no Lambda da Vercel → `FUNCTION_INVOCATION_FAILED`.

**Fix A:** Detecta `process.env.VERCEL` e usa `/tmp/ugc-logs` em serverless, `logs/` local em desenvolvimento.

**Problema B:** `res.sendFile(path.join(__dirname, 'public', 'index.html'))` — menos confiável em Lambda quando `public/` não está no path correto do bundle ncc.

**Fix B:** `fs.readFileSync` no startup para carregar `index.html` em memória. Fallback automático para `sendFile` se o readFileSync falhar.

---

### Fix 3 — vercel.json com includeFiles (commit 4f2b59e)
Adicionado `"includeFiles": ["public/**", "PROMPT*.md", "CONTEXT.md"]` ao build config do `@vercel/node`. Garante que esses arquivos são bundlados na função serverless.

---

### Fix 4 — safeParseJSON truncamento em lotes (commit 755fbf0)
**Causa raiz:** Tentativa 2 do parser não distinguia fechamento de string JSON de aspas duplas literais no diálogo (`mais: "Gente!"`). Parser dessincronizava, caía no regex da tentativa 3, que capturava só o trecho antes da primeira aspas.

**Fix:** Lookahead ao encontrar `"` dentro de string — verifica próximo char estrutural (`:`, `,`, `}`, `]`, `"`) para distinguir fechamento legítimo de aspas interior sem escape.

**Testado:** 11 testes unitários + lote real de 7 itens em produção, todos OK.

---

## Estado funcional
- [x] 4 estilos funcionando (Base, Edredons Premium, Nano + Vídeos, Nano + Vídeos 2)
- [x] Geração single funcional
- [x] Geração em lote sem truncamento
- [x] Galeria salva e renderiza todos os estilos
- [x] Auth + perfil + estatísticas
- [x] Auto-deploy GitHub→Vercel (git push origin main)
- [x] Lambda não crasha em produção serverless

## Fluxo de deploy (a partir de v1.1)
```
git add + git commit + git push origin main
→ Vercel webhook detecta → build ~2 min → produção atualizada
```
Fallback se não auto-deployer: `vercel deploy --prod`

## Arquivos de backup
| Arquivo | Tamanho |
|---|---|
| `stable-v1.1-20260429-essencial.zip` | 0.12 MB |

## Como restaurar
```bash
git checkout stable-v1.1-20260429
npm install
node server.js        # local
# produção: git push -f origin stable-v1.1-20260429:main
```
