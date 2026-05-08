-- 007-link-clicks.sql
-- Cliques em links de checkout, upgrade e CTA monitorados
-- Aplicar DEPOIS de: 006-infra-costs.sql
-- Depende de: nada

create table if not exists link_clicks (
  id       uuid primary key default gen_random_uuid(),
  trk      uuid,
  user_id  uuid,
  link_id  text not null,       -- 'checkout-starter' | 'checkout-pro' | 'checkout-elite' | 'upgrade-banner' | etc.
  page_url text,
  ts       timestamptz not null default now()
);

create index if not exists link_clicks_link_id_idx on link_clicks(link_id);
create index if not exists link_clicks_user_id_idx on link_clicks(user_id);
create index if not exists link_clicks_ts_idx      on link_clicks(ts desc);
