-- Add marked_at to delivery_logs so customers can see when each meal was marked.
-- Default to now() for existing rows; updated on every status change via the upsert.

ALTER TABLE delivery_logs
  ADD COLUMN IF NOT EXISTS marked_at timestamptz NOT NULL DEFAULT now();
