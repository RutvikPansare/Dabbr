-- Provider-seen flag for notification dismissal persistence
-- When a provider dismisses a notification, we record it here
-- so it stays dismissed across devices, app reinstalls, and storage clears.

ALTER TABLE subscription_pauses
  ADD COLUMN IF NOT EXISTS provider_seen boolean NOT NULL DEFAULT false;

ALTER TABLE cancellation_requests
  ADD COLUMN IF NOT EXISTS provider_seen boolean NOT NULL DEFAULT false;

-- Indexes so the dashboard query (WHERE provider_seen = false) is fast
CREATE INDEX IF NOT EXISTS idx_subscription_pauses_provider_seen
  ON subscription_pauses (provider_id, provider_seen)
  WHERE provider_seen = false;

CREATE INDEX IF NOT EXISTS idx_cancellation_requests_provider_seen
  ON cancellation_requests (provider_id, provider_seen)
  WHERE provider_seen = false;
