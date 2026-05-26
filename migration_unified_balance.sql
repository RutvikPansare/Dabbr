-- ─────────────────────────────────────────────────────────────────────────────
-- Dabbr: Unified balance model migration
-- Run this in the Supabase SQL editor BEFORE deploying the code changes.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add the new balance column (rupees, can be negative)
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS balance numeric(10,2) NOT NULL DEFAULT 0;

-- 2. Ensure credit_limit exists and is NOT NULL with default 0
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS credit_limit numeric(10,2) NOT NULL DEFAULT 0;

-- (If credit_limit already exists but is nullable, run this instead:)
-- UPDATE customers SET credit_limit = 0 WHERE credit_limit IS NULL;
-- ALTER TABLE customers ALTER COLUMN credit_limit SET NOT NULL;
-- ALTER TABLE customers ALTER COLUMN credit_limit SET DEFAULT 0;

-- 3. Convert PREPAID customers: balance_rupees = balance_days × (price_per_month / 30)
UPDATE customers
SET balance = ROUND((COALESCE(balance_days, 0) * (price_per_month::numeric / 30)), 2)
WHERE billing_type = 'prepaid' OR billing_type IS NULL;

-- 4. Convert MONTHLY SETTLEMENT customers:
--    balance = total payments received − (meals_delivered × effective_meal_rate)
UPDATE customers c
SET balance = (
  COALESCE(
    (SELECT SUM(amount) FROM monthly_payments WHERE customer_id = c.id),
    0
  )
  - (
    COALESCE(c.meals_delivered, 0)
    * COALESCE(
        c.meal_rate,
        (SELECT default_meal_rate FROM providers WHERE id = c.provider_id),
        120
      )
  )
)
WHERE c.billing_type = 'monthly_settlement';

-- 5. Migrate monthly_payments into the unified payments table
--    (so all payment history lives in one place)
INSERT INTO payments (customer_id, provider_id, amount, notes, created_at)
SELECT
  mp.customer_id,
  mp.provider_id,
  mp.amount,
  mp.note,
  mp.created_at
FROM monthly_payments mp
WHERE NOT EXISTS (
  -- avoid duplicates if re-run
  SELECT 1 FROM payments p
  WHERE p.customer_id = mp.customer_id
    AND p.amount      = mp.amount
    AND p.created_at  = mp.created_at
);

-- 6. Update the mark_slot_delivery RPC to work with balance (rupees)
--    Delta sign convention:
--      balance_delta < 0  →  delivery marked (balance reduced)
--      balance_delta > 0  →  delivery un-marked (balance restored)
--      balance_delta = 0  →  no change
CREATE OR REPLACE FUNCTION mark_slot_delivery(
  p_customer_id uuid,
  p_provider_id uuid,
  p_date        date,
  p_meal_slot   text,
  p_status      text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prev_status  text;
  v_price        numeric;
  v_per_day_cost numeric;
  v_delta        numeric := 0;
BEGIN
  -- Get previous log status (NULL = pending/unlogged)
  SELECT status INTO v_prev_status
  FROM delivery_logs
  WHERE customer_id = p_customer_id
    AND provider_id = p_provider_id
    AND date        = p_date
    AND meal_slot   = p_meal_slot;

  -- No-op if status unchanged
  IF v_prev_status IS NOT DISTINCT FROM NULLIF(p_status, 'pending') THEN
    IF p_status = 'pending' AND v_prev_status IS NULL THEN
      RETURN jsonb_build_object('balance_delta', 0);
    END IF;
  END IF;

  -- Upsert delivery log (delete if resetting to pending)
  IF p_status = 'pending' THEN
    DELETE FROM delivery_logs
    WHERE customer_id = p_customer_id
      AND provider_id = p_provider_id
      AND date        = p_date
      AND meal_slot   = p_meal_slot;
  ELSE
    INSERT INTO delivery_logs (customer_id, provider_id, date, meal_slot, status)
    VALUES (p_customer_id, p_provider_id, p_date, p_meal_slot, p_status)
    ON CONFLICT (customer_id, provider_id, date, meal_slot)
    DO UPDATE SET status = EXCLUDED.status;
  END IF;

  -- Get per-day cost (price_per_month ÷ 30)
  SELECT price_per_month INTO v_price
  FROM customers WHERE id = p_customer_id;

  v_per_day_cost := ROUND(v_price / 30.0, 4);

  -- Compute balance delta:
  --   marking delivered   → deduct per_day_cost from balance
  --   un-marking delivered → restore per_day_cost to balance
  IF p_status = 'delivered'
     AND (v_prev_status IS NULL OR v_prev_status IN ('pending', 'skipped'))
  THEN
    v_delta := -v_per_day_cost;

  ELSIF p_status IN ('skipped', 'pending')
     AND v_prev_status = 'delivered'
  THEN
    v_delta := v_per_day_cost;
  END IF;

  -- Apply balance change
  IF v_delta <> 0 THEN
    UPDATE customers
    SET balance = balance + v_delta
    WHERE id = p_customer_id;
  END IF;

  RETURN jsonb_build_object('balance_delta', v_delta);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Run the DROP statements ONLY after verifying the new code is working.
-- ─────────────────────────────────────────────────────────────────────────────

-- ALTER TABLE customers
--   DROP COLUMN IF EXISTS balance_days,
--   DROP COLUMN IF EXISTS billing_type,
--   DROP COLUMN IF EXISTS meals_delivered,
--   DROP COLUMN IF EXISTS meal_rate;

-- DROP TABLE IF EXISTS monthly_payments;
