-- 011-user-metadata.sql
-- Tabela satélite de users — ZERO ALTER na tabela users existente
-- Campos de analytics que não existiam na tabela original.
-- user_id referencia users.id logicamente, mas sem FK constraint para
-- evitar lock e dependência de schema.
-- Aplicar DEPOIS de: 010-feature-usage.sql
-- Depende de: nada (referência soft a users)

create table if not exists user_metadata (
  user_id              uuid primary key,   -- mesmo ID de users.id
  last_active_at       timestamptz,        -- última ação registrada (generate, login, etc.)
  acquisition_trk      uuid,               -- trk da primeira sessão que gerou o cadastro
  acquisition_source   text,               -- utm_source da aquisição
  acquisition_campaign text,               -- utm_campaign da aquisição
  ltv_brl              numeric(10,2) default 0,   -- lifetime value acumulado
  generations_count    int default 0,      -- total histórico de gerações (denormalizado)
  updated_at           timestamptz not null default now()
);
