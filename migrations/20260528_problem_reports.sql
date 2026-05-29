-- Problem reports submitted by providers from the app
CREATE TABLE IF NOT EXISTS problem_reports (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid        REFERENCES providers(id) ON DELETE SET NULL,
  category    text        NOT NULL DEFAULT 'other',
  description text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE problem_reports ENABLE ROW LEVEL SECURITY;

-- Providers can insert their own reports
CREATE POLICY "providers_insert_own_reports"
  ON problem_reports FOR INSERT
  WITH CHECK (provider_id = auth.uid());

-- Providers can view their own reports
CREATE POLICY "providers_view_own_reports"
  ON problem_reports FOR SELECT
  USING (provider_id = auth.uid());
