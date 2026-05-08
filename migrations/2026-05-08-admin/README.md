# Migrations — Painel Admin Fase 1
> Criado em: 2026-05-08
> Contexto: [decisoes/2026-05-08-fase1-admin-blindado.md](../../decisoes/2026-05-08-fase1-admin-blindado.md)

## Regras obrigatórias

- **NUNCA aplicar direto em produção sem validar em dev/staging primeiro.**
- **NUNCA fazer ALTER em `users`.** Usar `user_metadata` (011) para campos novos.
- Cada migration é independente e reversível via seu `.down.sql`.
- Aplicar em ordem numérica (001 → 011). Rollback em ordem reversa (011 → 001).

---

## Ordem de aplicação (up)

| # | Arquivo | Tabela criada | Depende de |
|---|---|---|---|
| 1 | `001-sessions.sql` | `sessions` | — |
| 2 | `002-events.sql` | `events` | — |
| 3 | `003-leads.sql` | `leads` | — |
| 4 | `004-sales.sql` | `sales` | — |
| 5 | `005-api-costs.sql` | `api_costs` | — |
| 6 | `006-infra-costs.sql` | `infra_costs` | — |
| 7 | `007-link-clicks.sql` | `link_clicks` | — |
| 8 | `008-daily-metrics.sql` | `daily_metrics` | — |
| 9 | `009-presence.sql` | `presence` | — |
| 10 | `010-feature-usage.sql` | `feature_usage` | — |
| 11 | `011-user-metadata.sql` | `user_metadata` | — |

Todas as tabelas são independentes entre si (referências soft, sem FK constraints).
Podem ser aplicadas em qualquer ordem, mas seguir a sequência numérica é mais fácil de auditar.

---

## Ordem de rollback (down)

Reversa: **011 → 001**.

```sql
-- colar no SQL Editor do Supabase, um por vez:
-- 011-user-metadata.down.sql
-- 010-feature-usage.down.sql
-- 009-presence.down.sql
-- 008-daily-metrics.down.sql
-- 007-link-clicks.down.sql
-- 006-infra-costs.down.sql
-- 005-api-costs.down.sql
-- 004-sales.down.sql
-- 003-leads.down.sql
-- 002-events.down.sql
-- 001-sessions.down.sql
```

---

## Como aplicar no Supabase

1. Abrir **Supabase Studio → SQL Editor**.
2. Criar nova query.
3. Colar o conteúdo de `001-sessions.sql`.
4. Executar → confirmar "Success".
5. Repetir para 002, 003... até 011.
6. Verificar na aba **Table Editor** que as 11 tabelas aparecem.

---

## Tabelas criadas

| Tabela | Para que serve |
|---|---|
| `sessions` | Rastreamento de visitas anônimas (trk cookie) |
| `events` | Eventos de comportamento (PageView, Generate, Login...) |
| `leads` | Jornada do lead — primeiro contato → conversão |
| `sales` | Vendas confirmadas via webhook Kiwify |
| `api_costs` | Custo Anthropic por chamada — fire-and-forget |
| `infra_costs` | Custos de infra registrados manualmente pelo admin |
| `link_clicks` | Cliques em links de checkout e upgrade |
| `daily_metrics` | Snapshot diário pré-computado para o dashboard |
| `presence` | Heartbeat de usuários online (upsert a cada 30s) |
| `feature_usage` | Quais estilos cada usuário usa — gráfico de features |
| `user_metadata` | Satélite de `users` — analytics sem ALTER na tabela original |

---

## Impacto em produção

**Zero.** Estas tabelas só ficam lá. Nenhum código existente lê ou escreve nelas
até que as sub-fases 1.2 e 1.3 sejam mergeadas e as feature flags habilitadas.
