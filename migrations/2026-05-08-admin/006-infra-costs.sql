-- 006-infra-costs.sql
-- Custos de infraestrutura registrados manualmente pelo admin
-- (Vercel, Supabase, domínio, etc.)
-- Aplicar DEPOIS de: 005-api-costs.sql
-- Depende de: nada

create table if not exists infra_costs (
  id             uuid primary key default gen_random_uuid(),
  description    text not null,
  amount_brl     numeric(10,2) not null,
  amount_usd     numeric(10,2),          -- opcional, para custos em dólar antes da conversão
  provider       text,                   -- 'vercel' | 'supabase' | 'kiwify' | 'dominio' | 'outro'
  billing_period text,                   -- formato 'YYYY-MM' — ex: '2026-05'
  registered_by  text,                   -- email do admin que registrou
  created_at     timestamptz not null default now()
);

create index if not exists infra_costs_period_idx on infra_costs(billing_period);
