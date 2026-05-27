-- Rider notification inbox — mirrors provider_notifications exactly.
-- Notifications are NEVER deleted; dismissed_at drives visibility.
--
-- rider_id references delivery_riders.id (NOT auth users.id).
-- The dismiss server action verifies identity via delivery_riders.user_id.

CREATE TABLE IF NOT EXISTS rider_notifications (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id      UUID        NOT NULL REFERENCES delivery_riders(id) ON DELETE CASCADE,
  type          TEXT        NOT NULL,   -- 'assignment' | 'message' | …
  title         TEXT        NOT NULL,
  message       TEXT        NOT NULL,
  payload       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at       TIMESTAMPTZ NULL,
  dismissed_at  TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_rider_notifications_unread
  ON rider_notifications (rider_id, created_at DESC)
  WHERE dismissed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rider_notifications_badge
  ON rider_notifications (rider_id)
  WHERE read_at IS NULL AND dismissed_at IS NULL;
