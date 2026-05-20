-- Slot-aware delivery tracking
-- Each meal slot (breakfast/lunch/dinner) is an independent operational workspace.
-- Unique constraint changes from (customer_id, date) → (customer_id, date, meal_slot).

ALTER TABLE public.delivery_logs
  ADD COLUMN IF NOT EXISTS meal_slot text NOT NULL DEFAULT 'lunch';

-- Drop the old unique constraint (may have different names depending on how it was created)
ALTER TABLE public.delivery_logs
  DROP CONSTRAINT IF EXISTS delivery_logs_customer_id_date_key;
ALTER TABLE public.delivery_logs
  DROP CONSTRAINT IF EXISTS delivery_logs_customer_id_date_provider_id_key;

-- Add the new slot-aware unique constraint
ALTER TABLE public.delivery_logs
  ADD CONSTRAINT delivery_logs_customer_id_date_meal_slot_key
    UNIQUE (customer_id, date, meal_slot);
