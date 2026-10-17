/*
# Add manual price override columns to user_preferences

## Overview
Adds manual price override fields so the user can set exact current prices for ES, NQ, and SPX when the live API is unavailable or rate-limited.

## Changes
- Added columns to user_preferences:
  - es_manual_price (numeric, nullable) - manual override for ES
  - nq_manual_price (numeric, nullable) - manual override for NQ
  - spx_manual_price (numeric, nullable) - manual override for SPX
  - price_source (text, default 'live') - 'live' or 'manual'

## Security
- No policy changes needed - existing anon/authenticated CRUD policies apply.
*/

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS es_manual_price numeric,
  ADD COLUMN IF NOT EXISTS nq_manual_price numeric,
  ADD COLUMN IF NOT EXISTS spx_manual_price numeric,
  ADD COLUMN IF NOT EXISTS price_source text NOT NULL DEFAULT 'live';