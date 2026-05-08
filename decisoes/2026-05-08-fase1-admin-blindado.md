# Decisão: Painel Admin Fase 1 — Arquitetura Blindada

**Data:** 2026-05-08
**Status:** Em implementação
**Contexto:** Primeira venda orgânica via Kiwify (R$ 61,90) confirmada. O app está em produção e vende. O painel admin não pode, em nenhuma hipótese, quebrar geração de prompts, login ou checkout.

---

## Decisão

Construir o painel `/admin` de forma completamente isolada do código que vende, usando:

1. **Feature flag global** (`ADMIN_ENABLED=false` por padrão) — kill switch instantâneo sem deploy.
2. **SPA React isolada** em `public/admin/` com build separado — falha no build do admin não derruba o app.
3. **Tabelas novas** em Supabase — zero `ALTER` em tabelas existentes, especialmente `users`.
4. **Rotas novas** — zero modificação em rotas existentes (`/api/generate*`, `/api/login`, etc.).
5. **Sub-fases independentes** — cada sub-fase é um PR separado, mergeável e revertível individualmente.

---

## Sub-fases

| Sub-fase | Branch | Escopo | Status |
|---|---|---|---|
| 1.0 | `feature/admin-1-0-schema` | Migrations SQL (11 tabelas + down.sql) | ✅ Arquivos criados — aguardando aplicação no Supabase |
| 1.1 | `feature/admin-1-1-health-flags` | `/api/health` + `lib/feature-flags.js` + `requireAdmin` | ⏳ Pendente |
| 1.2 | `feature/admin-1-2-tracker` | Tracker server-side + script minimalista no client | ⏳ Pendente |
| 1.3 | `feature/admin-1-3-cost-webhook` | `recordCostFireAndForget` + `/webhook/kiwify-v2` | ⏳ Pendente |
| 1.4 | `feature/admin-1-4-endpoints` | Endpoints `/api/admin/*` (somente leitura) | ⏳ Pendente |
| 1.5 | `feature/admin-1-5-spa` | SPA React + UI premium + build isolado | ⏳ Pendente |

---

## Alternativas consideradas e rejeitadas

| Alternativa | Por que rejeitada |
|---|---|
| Modificar `/api/generate` para registrar custos inline | Qualquer falha no registro quebraria a geração. Fire-and-forget é obrigatório. |
| ALTER TABLE users para adicionar campos de analytics | Lock na tabela, risco de downtime. Criada `user_metadata` como satélite. |
| Rota `/webhook/kiwify-v2` substituindo a original | A rota original ativa planos em produção. A nova roda em paralelo até ser validada. |
| Build do admin dentro do build principal | Falha no admin derrubaria o deploy inteiro. Build isolado com `|| echo` de fallback. |
| Mergear sub-fases direto na main | Sem PR review, sem Preview Deploy, sem smoke test. Rejeitado. |

---

## Regras de ouro da Fase 1

- `ADMIN_ENABLED=false` em produção até a sub-fase 1.5 estar validada no Preview Deploy.
- `COST_RECORDING_ENABLED=false` até 1.3 estável por 24h.
- `KIWIFY_WEBHOOK_ENABLED=false` até URL trocada no painel Kiwify + 1.3 estável.
- Nenhum merge para `main` sem aprovação de Pedro + `/api/health` verde no Preview.
- Tag `pre-admin-fase1-20260508` mantida intocada por 14 dias após o último deploy.

---

## Rollback de emergência

```bash
# Reverter TODO o painel de uma vez (estado pré-fase1):
git reset --hard pre-admin-fase1-20260508
git push origin main --force-with-lease

# Ou apenas desligar o painel sem deploy:
# Vercel → Environment Variables → ADMIN_ENABLED=false → Save
# (propagação em ~5 segundos, sem redeploy)
```

---

## Dependências externas pendentes (antes de 1.3)

- [ ] `KIWIFY_WEBHOOK_SECRET` — buscar no painel Kiwify e setar no Vercel
- [ ] Header exato do webhook Kiwify — confirmar se é `x-kiwify-signature` ou outro
