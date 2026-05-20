-- Atomic slot delivery marking — resolves two issues:
--
-- 1. Balance race condition: client-side code read stale React state to decide
--    whether to deduct balance, allowing two concurrent calls to both trigger
--    a deduction. This function computes the balance delta inside a single
--    Postgres transaction, so the before/after counts are always consistent.
--
-- 2. Two-phase commit risk: previously delivery_logs write and customers balance
--    update were two separate client calls that could desync on network failure.
--    Now both happen atomically inside this function.

CREATE OR REPLACE FUNCTION public.mark_slot_delivery(
  p_customer_id  UUID,
  p_provider_id  UUID,
  p_date         DATE,
  p_meal_slot    TEXT,
  p_status       TEXT   -- 'delivered' | 'skipped' | 'pending' (pending = delete the log row)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prev_delivered_count  INTEGER;
  new_delivered_count   INTEGER;
  balance_delta         INTEGER := 0;
  v_billing_type        TEXT;
BEGIN
  -- Ownership guard: provider must own this customer
  IF NOT EXISTS (
    SELECT 1 FROM customers
    WHERE id = p_customer_id AND provider_id = p_provider_id
  ) THEN
    RAISE EXCEPTION 'Customer % does not belong to provider %', p_customer_id, p_provider_id;
  END IF;

  -- Snapshot: how many of this customer's slots are already delivered today (before change)
  SELECT COUNT(*) INTO prev_delivered_count
  FROM delivery_logs
  WHERE customer_id = p_customer_id
    AND date        = p_date
    AND status      = 'delivered';

  -- Apply the change atomically
  IF p_status = 'pending' THEN
    DELETE FROM delivery_logs
    WHERE customer_id = p_customer_id
      AND date        = p_date
      AND meal_slot   = p_meal_slot;
  ELSE
    INSERT INTO delivery_logs (customer_id, provider_id, date, meal_slot, status)
    VALUES (p_customer_id, p_provider_id, p_date, p_meal_slot, p_status)
    ON CONFLICT (customer_id, date, meal_slot)
    DO UPDATE SET status = EXCLUDED.status;
  END IF;

  -- Snapshot: how many slots are now delivered (after change)
  SELECT COUNT(*) INTO new_delivered_count
  FROM delivery_logs
  WHERE customer_id = p_customer_id
    AND date        = p_date
    AND status      = 'delivered';

  -- Balance rule: deduct once on first delivered slot; refund once when last is removed.
  IF prev_delivered_count = 0 AND new_delivered_count > 0 THEN
    balance_delta := -1;   -- first delivery of the day → charge one day
  ELSIF prev_delivered_count > 0 AND new_delivered_count = 0 THEN
    balance_delta := 1;    -- all deliveries undone → full refund
  END IF;

  -- Apply balance update in the same transaction if needed
  IF balance_delta != 0 THEN
    SELECT billing_type INTO v_billing_type
    FROM customers WHERE id = p_customer_id;

    IF v_billing_type = 'monthly_settlement' THEN
      UPDATE customers
      SET meals_delivered = GREATEST(0, COALESCE(meals_delivered, 0) - balance_delta)
      WHERE id = p_customer_id;
    ELSE
      UPDATE customers
      SET balance_days = GREATEST(0, COALESCE(balance_days, 0) + balance_delta)
      WHERE id = p_customer_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('balance_delta', balance_delta);
END;
$$;

-- Grant execute to the authenticated role (Supabase RLS-safe)
GRANT EXECUTE ON FUNCTION public.mark_slot_delivery(UUID, UUID, DATE, TEXT, TEXT)
  TO authenticated;
