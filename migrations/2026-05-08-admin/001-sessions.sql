-- 001-sessions.sql
-- Rastreamento de sessões/visitas — uma row por visita única (via trk cookie)
-- Aplicar ANTES de: 002-events.sql
-- Depende de: nada

create table if not exists sessions (
  id              uuid primary key default gen_random_uuid(),
  trk             uuid not null,            -- ID anônimo do navegador (localStorage)
  user_id         uuid,                     -- null até o login acontecer
  started_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  page_url        text,
  referrer        text,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_content     text,
  utm_term        text,
  ip_hash         text,                     -- SHA-256 do IP — nunca o IP em claro
  user_agent_hash text,
  country         text,
  city            text,
  device_type     text,                     -- 'mobile' | 'desktop' | 'tablet'
  created_at      timestamptz not null default now()
);

create index if not exists sessions_trk_idx        on sessions(trk);
create index if not exists sessions_user_id_idx    on sessions(user_id);
create index if not exists sessions_started_at_idx on sessions(started_at desc);
