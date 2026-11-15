-- Phase 1 ranking tables. The API also creates them on first use (server/src/app.ts SCHEMA), so this file is
-- the record for `wrangler d1 migrations`; later schema changes go in 0002_..., run on dev first, then prod.
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  created_at INTEGER NOT NULL, ip_hash TEXT, banned INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY, player_id TEXT NOT NULL, mode TEXT NOT NULL, stage INTEGER NOT NULL DEFAULT 0,
  seed INTEGER NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER,
  score INTEGER, time_ms INTEGER, kills INTEGER, gold INTEGER, ai_assisted INTEGER NOT NULL DEFAULT 0,
  client_version TEXT, status TEXT NOT NULL DEFAULT 'open', flag TEXT);
CREATE INDEX IF NOT EXISTS runs_player ON runs (player_id, started_at);
CREATE TABLE IF NOT EXISTS scores (
  board TEXT NOT NULL, period TEXT NOT NULL, player_id TEXT NOT NULL, run_id TEXT NOT NULL,
  value INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (board, period, player_id));
CREATE INDEX IF NOT EXISTS scores_rank ON scores (board, period, value);
CREATE TABLE IF NOT EXISTS rate (k TEXT PRIMARY KEY, n INTEGER NOT NULL, reset_at INTEGER NOT NULL);
