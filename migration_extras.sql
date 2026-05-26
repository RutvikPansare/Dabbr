-- Migration: delivery extras + provider presets
-- Run in Supabase SQL Editor

-- 1. Extras per delivery
CREATE TABLE IF NOT EXISTS delivery_extras (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid          NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  provider_id   uuid          NOT NULL,
  delivery_date date          NOT NULL DEFAULT CURRENT_DATE,
  item          text          NOT NULL,
  amount        numeric(10,2) NOT NULL DEFAULT 0,
  note          text,
  status        text          NOT NULL DEFAULT 'pending',  -- 'pending' | 'billed'
  billed_at     timestamptz,
  created_at    timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE delivery_extras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "providers_manage_own_extras"
  ON delivery_extras FOR ALL
  USING (provider_id = auth.uid());

CREATE INDEX IF NOT EXISTS delivery_extras_customer_date_idx
  ON delivery_extras (customer_id, delivery_date, status);

CREATE INDEX IF NOT EXISTS delivery_extras_provider_date_idx
  ON delivery_extras (provider_id, delivery_date);

-- 2. Provider-configurable presets
CREATE TABLE IF NOT EXISTS extra_presets (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id  uuid          NOT NULL,
  name         text          NOT NULL,
  amount       numeric(10,2) NOT NULL DEFAULT 0,
  sort_order   int           NOT NULL DEFAULT 0,
  created_at   timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE extra_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "providers_manage_own_presets"
  ON extra_presets FOR ALL
  USING (provider_id = auth.uid());

CREATE INDEX IF NOT EXISTS extra_presets_provider_idx
  ON extra_presets (provider_id, sort_order);
