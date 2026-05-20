-- Enable REPLICA IDENTITY FULL on delivery_logs so that Supabase Realtime
-- DELETE events include all row columns (customer_id, meal_slot, date, etc.)
-- and not just the primary key.
--
-- Without this, the client receives DELETE payloads with only the PK and
-- cannot determine which customer:slot key to remove from state, breaking
-- multi-device delivery sync when a mark is undone (set back to pending).
ALTER TABLE public.delivery_logs REPLICA IDENTITY FULL;
