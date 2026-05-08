-- 010-feature-usage.sql
-- Uso de features específicas por usuário — alimenta o gráfico "estilos mais usados"
-- Aplicar DEPOIS de: 009-presence.sql
-- Depende de: nada

create table if not exists feature_usage (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null,
  feature  text not null,     -- 'style_base' | 'style_base_v2' | 'style_serie' | 'style_nano'
                               -- | 'style_nano_veo2' | 'style_roupa_feminina' | 'batch' | 'biblioteca'
  used_at  timestamptz not null default now()
);

create index if not exists feature_usage_user_id_idx on feature_usage(user_id);
create index if not exists feature_usage_feature_idx on feature_usage(feature);
create index if not exists feature_usage_used_at_idx on feature_usage(used_at desc);
