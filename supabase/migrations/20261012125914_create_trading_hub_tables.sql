CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  default_asset text NOT NULL DEFAULT 'ES',
  es_target_points numeric NOT NULL DEFAULT 20,
  nq_target_points numeric NOT NULL DEFAULT 100,
  confluence_threshold numeric NOT NULL DEFAULT 80,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_preferences" ON user_preferences;
CREATE POLICY "select_own_preferences" ON user_preferences
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_preferences" ON user_preferences;
CREATE POLICY "insert_own_preferences" ON user_preferences
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_preferences" ON user_preferences;
CREATE POLICY "update_own_preferences" ON user_preferences
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_preferences" ON user_preferences;
CREATE POLICY "delete_own_preferences" ON user_preferences
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS saved_setups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  asset text NOT NULL,
  confluence_score numeric NOT NULL,
  price numeric NOT NULL,
  direction text NOT NULL DEFAULT 'LONG',
  strategies jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE saved_setups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_setups" ON saved_setups;
CREATE POLICY "select_own_setups" ON saved_setups
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_setups" ON saved_setups;
CREATE POLICY "insert_own_setups" ON saved_setups
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_setups" ON saved_setups;
CREATE POLICY "update_own_setups" ON saved_setups
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_setups" ON saved_setups;
CREATE POLICY "delete_own_setups" ON saved_setups
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_saved_setups_user_id ON saved_setups(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_setups_created_at ON saved_setups(created_at DESC);