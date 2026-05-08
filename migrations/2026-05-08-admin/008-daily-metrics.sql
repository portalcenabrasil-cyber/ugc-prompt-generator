-- 008-daily-metrics.sql
-- Snapshot diário pré-computado — evita queries pesadas no painel em tempo real
-- Atualizado por job noturno ou por endpoint POST /api/admin/metrics/recompute
-- Aplicar DEPOIS de: 007-link-clicks.sql
-- Depende de: nada

create table if not exists daily_metrics (
  id           uuid primary key default gen_random_uuid(),
  date         date not null unique,     -- uma row por dia, constraint garante idempotência
  revenue_brl  numeric(10,2) default 0,
  cost_usd     numeric(12,6) default 0,
  cost_brl     numeric(10,2) default 0,
  margin_brl   numeric(10,2) default 0,
  sales_count  int default 0,
  new_users    int default 0,
  active_users int default 0,
  generations  int default 0,
  tokens_used  bigint default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists daily_metrics_date_idx on daily_metrics(date desc);
