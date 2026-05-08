-- 003-leads.sql
-- Momento exato do primeiro contato — jornada do lead até conversão
-- Aplicar DEPOIS de: 001-sessions.sql, 002-events.sql
-- Depende de: nada (user_id é referência soft)

create table if not exists leads (
  id             uuid primary key default gen_random_uuid(),
  trk            uuid,                    -- liga ao cookie anônimo da visita
  user_id        uuid,                    -- preenchido quando o lead faz cadastro
  email          text,
  name           text,
  source         text,                    -- 'organic' | 'tiktok' | 'instagram' | 'direct' | 'paid'
  medium         text,                    -- valor do utm_medium
  campaign       text,                    -- valor do utm_campaign
  first_page_url text,
  first_seen_at  timestamptz,             -- timestamp da primeira visita rastreada
  converted_at   timestamptz,             -- timestamp do primeiro pagamento confirmado
  status         text default 'lead',     -- 'lead' | 'converted' | 'churned'
  created_at     timestamptz not null default now()
);

create index if not exists leads_trk_idx     on leads(trk);
create index if not exists leads_user_id_idx on leads(user_id);
create index if not exists leads_email_idx   on leads(email);
create index if not exists leads_status_idx  on leads(status);
