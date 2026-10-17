/*
# Trading Helper Hub - Database Schema

## Overview
Creates the database tables for the Trading Helper Hub application, supporting
user authentication, per-user preferences, and saved trading setups.

## New Tables

### user_preferences
Per-user trading configuration. One row per user.
- `id` (uuid, primary key)
- `user_id` (uuid, FK to auth.users, defaults to auth.uid())
- `default_asset` (text, default 'ES') - preferred asset on login
- `es_target_points` (numeric, default 20) - ES profit target in points
- `nq_target_points` (numeric, default 100) - NQ profit target in points
- `confluence_threshold` (numeric, default 80) - alert threshold percentage
- `created_at`, `updated_at` (timestamps)

### saved_setups
Bookmarked high-confluence trading setups.
- `id` (uuid, primary key)
- `user_id` (uuid, FK to auth.users, defaults to auth.uid())
- `asset` (text) - ES, NQ, or SPX
- `confluence_score` (numeric) - score at time of save (0-100)
- `price` (numeric) - price at time of save
- `direction` (text) - LONG or SHORT
- `strategies` (jsonb) - breakdown of strategy scores
- `notes` (text, nullable) - user notes
- `created_at` (timestamp)

## Security
- RLS enabled on both tables.
- Owner-scoped CRUD: each authenticated user can only access their own rows.
- No public/anon access (app requires sign-in).
*/