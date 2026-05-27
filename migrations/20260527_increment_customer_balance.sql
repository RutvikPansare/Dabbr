-- Atomic balance increment/decrement for delivery marking.
-- Called by /api/mark-delivery via db.rpc('increment_customer_balance').
--
-- Using a SQL function instead of a client read-then-write prevents the race
-- condition where two concurrent deliveries for the same customer both read
-- the same stale balance and each decrement it, resulting in a double deduction.
-- The UPDATE is a single atomic statement inside the Postgres engine.

CREATE OR REPLACE FUNCTION increment_customer_balance(
  p_customer_id uuid,
  p_delta       numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance numeric;
BEGIN
  UPDATE customers
     SET balance = COALESCE(balance, 0) + p_delta
   WHERE id = p_customer_id
  RETURNING balance INTO v_new_balance;

  RETURN v_new_balance;
END;
$$;
