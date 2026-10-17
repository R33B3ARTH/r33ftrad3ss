/*
# Convert to single-tenant (no auth)

## Overview
Removes user-scoped tables and recreates them as single-tenant tables with no user_id.
The app is a personal dashboard with no login. All data is shared/public (anon+authenticated).

## Changes
- DROP saved_setups and user_preferences (they had user_id + auth-scoped RLS)
- Recreate both tables WITHOUT user_id columns
- RLS enabled, policies use TO anon, authenticated (public/shared data)

## Security
- No auth required - app operates as anon role
- RLS enabled but policies allow all CRUD to anon+authenticated (intentionally shared data)
*/

DROP TABLE IF EXISTS saved_setups CASCADE;
DROP TABLE IF EXISTS user_preferences CASCADE;

CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  default_asset text NOT NULL DEFAULT 'ES',
  es_target_points numeric NOT NULL DEFAULT 20,
  nq_target_points numeric NOT NULL DEFAULT 100,
  confluence_threshold numeric NOT NULL DEFAULT 80,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_preferences" ON user_preferences;
CREATE POLICY "anon_select_preferences" ON user_preferences
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_preferences" ON user_preferences;
CREATE POLICY "anon_insert_preferences" ON user_preferences
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_preferences" ON user_preferences;
CREATE POLICY "anon_update_preferences" ON user_preferences
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_preferences" ON user_preferences;
CREATE POLICY "anon_delete_preferences" ON user_preferences
  FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS saved_setups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset text NOT NULL,
  confluence_score numeric NOT NULL,
  price numeric NOT NULL,
  direction text NOT NULL DEFAULT 'LONG',
  strategies jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE saved_setups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_setups" ON saved_setups;
CREATE POLICY "anon_select_setups" ON saved_setups
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_setups" ON saved_setups;
CREATE POLICY "anon_insert_setups" ON saved_setups
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_setups" ON saved_setups;
CREATE POLICY "anon_update_setups" ON saved_setups
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_setups" ON saved_setups;
CREATE POLICY "anon_delete_setups" ON saved_setups
  FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_saved_setups_created_at ON saved_setups(created_at DESC);