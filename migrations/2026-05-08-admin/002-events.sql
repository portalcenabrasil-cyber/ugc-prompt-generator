-- 002-events.sql
-- Eventos de comportamento do usuário (PageView, Generate, Login, Checkout, LinkClick...)
-- Aplicar DEPOIS de: 001-sessions.sql
-- Depende de: nada (session_id é referência soft, sem FK hard)

create table if not exists events (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid,                -- ref soft a sessions.id — sem FK constraint
  trk          uuid not null,       -- sempre presente, mesmo sem session_id
  user_id      uuid,                -- null até login
  event_name   text not null,       -- 'PageView' | 'Generate' | 'BatchGenerate' | 'Login' | 'Checkout' | 'LinkClick'
  page_url     text,
  properties   jsonb,               -- dados extras flexíveis por tipo de evento
  ts           timestamptz not null default now()
);

create index if not exists events_trk_idx        on events(trk);
create index if not exists events_user_id_idx    on events(user_id);
create index if not exists events_event_name_idx on events(event_name);
create index if not exists events_ts_idx         on events(ts desc);
