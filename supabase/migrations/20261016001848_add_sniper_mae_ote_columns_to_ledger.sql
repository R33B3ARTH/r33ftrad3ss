/*
# Add Sniper Profile, MAE, and OTE/Tension columns to master_tally_ledger

1. Modified Tables
- `master_tally_ledger` — adds six new columns to support the Master System Logic integration:
  - `sniper_profile_id` (text, default 'ES_4pt') — which sniper execution bracket profile was used (ES_4pt, ES_6pt, NQ_60pt)
  - `mae` (numeric, default 0) — Maximum Adverse Excursion in points during the trade
  - `mae_flagged` (boolean, default false) — whether MAE exceeded the guardrail threshold (median or p80)
  - `ote_zone` (text, nullable) — OTE zone at entry: 'Premium OTE', 'Discount OTE', or null
  - `tension_ratio` (numeric, default 0) — Rubber Band Tension ratio at entry (|close - ON_EQ| / ATR)
  - `tension_triggered` (boolean, default false) — whether tension ratio >= 1.5 trigger threshold

2. Security
- No RLS policy changes. Existing anon+authenticated CRUD policies remain in effect.
- All new columns are nullable or have safe defaults so existing rows are not affected.

3. Important Notes
- This migration is idempotent: each ALTER TABLE uses IF NOT EXISTS.
- No data is lost — only additive columns.
- Existing rows will have default values for the new columns.
*/

ALTER TABLE master_tally_ledger
  ADD COLUMN IF NOT EXISTS sniper_profile_id text NOT NULL DEFAULT 'ES_4pt',
  ADD COLUMN IF NOT EXISTS mae numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mae_flagged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ote_zone text,
  ADD COLUMN IF NOT EXISTS tension_ratio numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tension_triggered boolean NOT NULL DEFAULT false;