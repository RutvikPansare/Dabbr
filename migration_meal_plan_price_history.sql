-- Migration: meal plan price history + per-customer rate tracking
-- Run this in Supabase SQL Editor

-- 1. Price history log
CREATE TABLE IF NOT EXISTS meal_plan_price_history (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_id uuid       NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  old_price   numeric(10,2) NOT NULL,
  new_price   numeric(10,2) NOT NULL,
  changed_at  timestamptz   NOT NULL DEFAULT now()
);

-- 2. RLS
ALTER TABLE meal_plan_price_history ENABLE ROW LEVEL SECURITY;

-- Providers can read history for their own plans
CREATE POLICY "providers_read_own_plan_history"
  ON meal_plan_price_history FOR SELECT
  USING (
    meal_plan_id IN (
      SELECT id FROM meal_plans WHERE provider_id = auth.uid()
    )
  );

-- Index for fast per-plan lookups
CREATE INDEX IF NOT EXISTS meal_plan_price_history_plan_idx
  ON meal_plan_price_history (meal_plan_id, changed_at DESC);
