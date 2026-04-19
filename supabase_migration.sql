-- =====================================================
-- UGC Prompt Generator — Migração da tabela users
-- Cole este SQL no Supabase Dashboard > SQL Editor
-- e clique em "Run"
-- =====================================================

-- Adiciona as colunas que estão faltando na tabela users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS name           TEXT,
  ADD COLUMN IF NOT EXISTS prompts_count  INTEGER   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tokens_used    BIGINT    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reset_token    TEXT,
  ADD COLUMN IF NOT EXISTS reset_expires  TIMESTAMPTZ;

-- ── Colunas de plano ──
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS plan               TEXT      DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS plan_active        BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS generations_used   INTEGER   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS generations_limit  INTEGER   NOT NULL DEFAULT 0;

-- ── Aceite de Termos de Uso ──
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS accepted_terms_at  TIMESTAMPTZ;

-- Atualiza o admin
UPDATE public.users
  SET plan = 'admin', plan_active = true, generations_limit = 999999
WHERE email = 'portalcenabrasil@gmail.com';

-- Verifica o resultado (deve mostrar todas as colunas)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;
