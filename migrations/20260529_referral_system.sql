-- ── Referral system ──────────────────────────────────────────────────────────

-- 1. Extend providers table
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS referral_code       text UNIQUE,
  ADD COLUMN IF NOT EXISTS referral_bonus_days integer NOT NULL DEFAULT 0;

-- 2. Referral relationships
--    One row per referred provider. referred_id is UNIQUE — each person can
--    only be referred once and only generates the reward once.
CREATE TABLE IF NOT EXISTS referrals (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id  uuid        NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  referred_id  uuid        NOT NULL UNIQUE REFERENCES providers(id) ON DELETE CASCADE,
  code_used    text        NOT NULL,
  status       text        NOT NULL DEFAULT 'pending', -- 'pending' | 'rewarded'
  rewarded_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 3. Referral reward events (audit log + billing history)
CREATE TABLE IF NOT EXISTS referral_rewards (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id  uuid        NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  provider_id  uuid        NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  role         text        NOT NULL, -- 'referrer' | 'referred'
  bonus_days   integer     NOT NULL DEFAULT 15,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 4. Row-level security
ALTER TABLE referrals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;

-- Referrer can read their own referrals
CREATE POLICY "referrals_referrer_select"
  ON referrals FOR SELECT USING (referrer_id = auth.uid());

-- Each provider can read their own reward events
CREATE POLICY "referral_rewards_own_select"
  ON referral_rewards FOR SELECT USING (provider_id = auth.uid());
