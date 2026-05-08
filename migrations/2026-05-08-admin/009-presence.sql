-- 009-presence.sql
-- Heartbeat de usuários online — upsert a cada ping (30s de intervalo no client)
-- Considerado "online" se last_ping_at > now() - interval '2 minutes'
-- Aplicar DEPOIS de: 008-daily-metrics.sql
-- Depende de: nada

create table if not exists presence (
  user_id        uuid primary key,       -- uma row por usuário, upsert no ping
  email          text,
  current_page   text,                   -- '/' | '/biblioteca' | '/admin'
  current_action text,                   -- 'idle' | 'generating' | 'viewing_library'
  last_ping_at   timestamptz not null default now(),
  credits        int                     -- créditos restantes no momento do ping
);

create index if not exists presence_last_ping_at_idx on presence(last_ping_at desc);
