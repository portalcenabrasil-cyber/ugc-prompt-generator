-- 005-api-costs.down.sql
-- Rollback de 005-api-costs.sql
-- ATENÇÃO: apaga TODOS os registros de custo Anthropic. Irreversível.

drop table if exists api_costs;
