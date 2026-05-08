-- 005-api-costs.sql
-- Custo Anthropic por chamada à API — registrado como side-effect fire-and-forget
-- Aplicar DEPOIS de: 004-sales.sql
-- Depende de: nada

create table if not exists api_costs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid,
  trk           uuid,                   -- cookie de rastreamento da sessão que gerou o custo
  endpoint      text,                   -- '/api/generate' | '/api/generate-batch'
  style         text,                   -- 'base' | 'serie' | 'nano' | 'nano-veo-2' | 'base-v2' | etc.
  model         text,                   -- ex: 'claude-sonnet-4-6'
  input_tokens  int not null default 0,
  output_tokens int not null default 0,
  cost_usd      numeric(12,6) not null default 0,
  duration_ms   int,                    -- tempo total de resposta da API
  status        text default 'ok',      -- 'ok' | 'error' | 'truncated'
  created_at    timestamptz not null default now()
);

create index if not exists api_costs_user_id_idx    on api_costs(user_id);
create index if not exists api_costs_created_at_idx on api_costs(created_at desc);
create index if not exists api_costs_model_idx      on api_costs(model);
create index if not exists api_costs_style_idx      on api_costs(style);
