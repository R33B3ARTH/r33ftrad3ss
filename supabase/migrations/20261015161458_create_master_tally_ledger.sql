/*
# Create master_tally_ledger table (single-tenant, no auth)

1. New Tables
- `master_tally_ledger` — persistent store for batch simulation trade outcomes
  - `id` (uuid, primary key)
  - `batch_id` (text, groups trades from the same batch run)
  - `session_id` (text, the replay session identifier)
  - `session_label` (text, human-readable session name)
  - `symbol` (text, 'ES' or 'NQ')
  - `session_date` (text, date of the replayed session)
  - `direction` (text, 'LONG' or 'SHORT')
  - `entry_price` (numeric, entry fill price)
  - `target_price` (numeric, target bracket)
  - `stop_price` (numeric, stop bracket)
  - `result` (text, 'win' or 'loss')
  - `points_captured` (numeric, absolute points from the trade)
  - `pnl_dollars` (numeric, dollar P&L)
  - `auto_executed` (boolean, true if auto-triggered at 100% probability)
  - `fib_level` (text, which fib level was nearest at entry, nullable)
  - `liquidity_session` (text, which session liquidity was active at entry: 'Asia', 'London', 'NY', null)
  - `pullback_depth` (integer, number of pullbacks before entry: 0, 1, 2+)
  - `edge_window` (text, which institutional time window was active: 'AM Reversal', 'Power Hour', null)
  - `created_at` (timestamptz, default now())

2. Security
- Enable RLS on `master_tally_ledger`.
- Single-tenant app with no sign-in — allow anon + authenticated full CRUD.
*/
CREATE TABLE IF NOT EXISTS master_tally_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id text NOT NULL,
  session_id text NOT NULL,
  session_label text NOT NULL,
  symbol text NOT NULL DEFAULT 'ES',
  session_date text NOT NULL,
  direction text NOT NULL,
  entry_price numeric NOT NULL,
  target_price numeric NOT NULL,
  stop_price numeric NOT NULL,
  result text NOT NULL,
  points_captured numeric NOT NULL DEFAULT 0,
  pnl_dollars numeric NOT NULL DEFAULT 0,
  auto_executed boolean NOT NULL DEFAULT true,
  fib_level text,
  liquidity_session text,
  pullback_depth integer NOT NULL DEFAULT 0,
  edge_window text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE master_tally_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_ledger" ON master_tally_ledger;
CREATE POLICY "anon_select_ledger" ON master_tally_ledger FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_ledger" ON master_tally_ledger;
CREATE POLICY "anon_insert_ledger" ON master_tally_ledger FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_ledger" ON master_tally_ledger;
CREATE POLICY "anon_delete_ledger" ON master_tally_ledger FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_ledger_batch ON master_tally_ledger(batch_id);
CREATE INDEX IF NOT EXISTS idx_ledger_symbol ON master_tally_ledger(symbol);
