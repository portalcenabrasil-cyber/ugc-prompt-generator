-- 004-sales.sql
-- Vendas confirmadas via webhook Kiwify
-- Aplicar DEPOIS de: 003-leads.sql
-- Depende de: nada (user_id e trk são referências soft)
--
-- Nota sobre kiwify_order_id unique:
--   Retries da Kiwify para o mesmo pedido são tratados com ON CONFLICT DO NOTHING
--   na camada de aplicação (persistKiwifySale). O constraint fica aqui para garantia.

create table if not exists sales (
  id               uuid primary key default gen_random_uuid(),
  kiwify_order_id  text unique,            -- ID do pedido na Kiwify — idempotência
  user_id          uuid,                   -- preenchido após match por email na tabela users
  email            text not null,
  name             text,
  plan             text,                   -- 'starter' | 'pro' | 'elite'
  amount_brl       numeric(10,2) not null,
  fee_brl          numeric(10,2) default 0,
  net_brl          numeric(10,2),          -- amount_brl - fee_brl
  trk              uuid,                   -- atribuição — liga à sessão/lead de origem
  utm_source       text,
  utm_medium       text,
  utm_campaign     text,
  payment_method   text,                   -- 'credit_card' | 'pix' | 'boleto'
  kiwify_event     text,                   -- 'order.approved' | 'subscription.cancelled'
  raw_payload      jsonb,                  -- payload completo para auditoria e debug
  paid_at          timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists sales_user_id_idx on sales(user_id);
create index if not exists sales_email_idx   on sales(email);
create index if not exists sales_paid_at_idx on sales(paid_at desc);
create index if not exists sales_trk_idx     on sales(trk);
