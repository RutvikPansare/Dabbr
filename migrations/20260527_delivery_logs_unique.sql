-- Ensure delivery_logs has a unique constraint on (customer_id, date, meal_slot).
-- The API already upserts with onConflict on these three columns, but the
-- constraint must exist in the DB for the upsert to UPDATE instead of INSERT.
-- Without it, every status flip creates a new row → duplicate activity entries.

-- Step 1: deduplicate — keep only the latest row per (customer_id, date, meal_slot)
DELETE FROM delivery_logs
WHERE id NOT IN (
  SELECT DISTINCT ON (customer_id, date, meal_slot) id
  FROM delivery_logs
  ORDER BY customer_id, date, meal_slot, marked_at DESC NULLS LAST, created_at DESC NULLS LAST
);

-- Step 2: add the constraint so future upserts work correctly
ALTER TABLE delivery_logs
  ADD CONSTRAINT delivery_logs_customer_date_slot_key
  UNIQUE (customer_id, date, meal_slot);
