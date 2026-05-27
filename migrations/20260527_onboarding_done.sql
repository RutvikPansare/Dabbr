-- ── Onboarding completion flag ────────────────────────────────────────────────
-- Persists onboarding state to the DB so it survives across devices/reinstalls.
-- Once a provider completes or dismisses the setup guide, this is set to true
-- so the guide never re-appears even on a fresh device.

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS onboarding_done boolean NOT NULL DEFAULT false;
