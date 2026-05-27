-- Unified provider notification inbox
--
-- All in-app events that need a provider's attention land here.
-- Notifications are NEVER deleted — use read_at / dismissed_at to track state.
--
-- read_at     IS NOT NULL → provider has seen it (badge clears)
-- dismissed_at IS NOT NULL → provider explicitly closed it (hidden from panel)
--
-- Timestamps are more powerful than booleans:
--   is_read      = read_at IS NOT NULL
--   is_dismissed = dismissed_at IS NOT NULL
--   analytics, "when did they see it", sort by unread, etc.

CREATE TABLE IF NOT EXISTS provider_notifications (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id   UUID        NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  type          TEXT        NOT NULL,   -- 'pause' | 'cancellation_request' | …
  title         TEXT        NOT NULL,   -- customer name / short headline
  message       TEXT        NOT NULL,   -- human-readable summary line
  payload       JSONB,                  -- structured data for rich UI
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at       TIMESTAMPTZ NULL,
  dismissed_at  TIMESTAMPTZ NULL
);

-- Fast lookup of unread notifications for a provider (most common query)
CREATE INDEX IF NOT EXISTS idx_provider_notifications_unread
  ON provider_notifications (provider_id, created_at DESC)
  WHERE dismissed_at IS NULL;

-- Index for badge count query (read_at IS NULL = unread)
CREATE INDEX IF NOT EXISTS idx_provider_notifications_badge
  ON provider_notifications (provider_id)
  WHERE read_at IS NULL AND dismissed_at IS NULL;

-- Optional: cron can clean up rows older than 90 days
-- DELETE FROM provider_notifications WHERE created_at < NOW() - INTERVAL '90 days';
