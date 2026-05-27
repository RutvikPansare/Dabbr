-- ── Rider Accounts Migration ───────────────────────────────────────────────
-- Extends delivery_riders with login capability and adds rider_assignments.
-- Run in Supabase SQL editor.

-- 1. Extend delivery_riders ─────────────────────────────────────────────────

ALTER TABLE delivery_riders
  ADD COLUMN IF NOT EXISTS email          text,
  ADD COLUMN IF NOT EXISTS user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invite_status  text NOT NULL DEFAULT 'pending'
                                          CHECK (invite_status IN ('pending', 'active'));

-- Index for fast role-check lookup by user_id
CREATE INDEX IF NOT EXISTS delivery_riders_user_id_idx ON delivery_riders (user_id);

-- 2. rider_assignments table ────────────────────────────────────────────────
-- One row = "Rider X handles [full list | area Y] for provider P on date D."
-- Customer list is derived at query time from customers + area data.

CREATE TABLE IF NOT EXISTS rider_assignments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rider_id        uuid        NOT NULL REFERENCES delivery_riders(id) ON DELETE CASCADE,
  assignment_date date        NOT NULL DEFAULT CURRENT_DATE,
  scope           text        NOT NULL CHECK (scope IN ('full', 'area')),
  area_name       text,       -- NULL when scope = 'full'
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- One assignment per rider per date per scope/area combination
  UNIQUE (rider_id, assignment_date, scope, area_name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS rider_assignments_provider_date_idx
  ON rider_assignments (provider_id, assignment_date);

CREATE INDEX IF NOT EXISTS rider_assignments_rider_date_idx
  ON rider_assignments (rider_id, assignment_date);

-- 3. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE rider_assignments ENABLE ROW LEVEL SECURITY;

-- Providers can read/write their own assignments
DROP POLICY IF EXISTS "provider_manage_rider_assignments" ON rider_assignments;
CREATE POLICY "provider_manage_rider_assignments"
  ON rider_assignments FOR ALL TO authenticated
  USING  (provider_id = auth.uid())
  WITH CHECK (provider_id = auth.uid());

-- Riders can read assignments where they are the assigned rider
DROP POLICY IF EXISTS "rider_read_own_assignments" ON rider_assignments;
CREATE POLICY "rider_read_own_assignments"
  ON rider_assignments FOR SELECT TO authenticated
  USING (
    rider_id IN (
      SELECT id FROM delivery_riders WHERE user_id = auth.uid()
    )
  );
