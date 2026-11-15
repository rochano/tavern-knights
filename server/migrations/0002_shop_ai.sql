-- Shop + advisor (full version only). Created on first use by server/src/app.ts (SCHEMA); kept here as the record.
CREATE TABLE IF NOT EXISTS coin_ledger (
  id TEXT PRIMARY KEY, player_id TEXT NOT NULL, delta INTEGER NOT NULL, reason TEXT NOT NULL, ref TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS coin_ledger_player ON coin_ledger (player_id);
CREATE TABLE IF NOT EXISTS owned_items (player_id TEXT NOT NULL, item TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (player_id, item));
CREATE TABLE IF NOT EXISTS grants (
  id TEXT PRIMARY KEY, player_id TEXT NOT NULL, item TEXT NOT NULL, created_at INTEGER NOT NULL, claimed_at INTEGER);
CREATE INDEX IF NOT EXISTS grants_player ON grants (player_id, claimed_at);
CREATE TABLE IF NOT EXISTS ai_log (
  id TEXT PRIMARY KEY, player_id TEXT NOT NULL, mode TEXT NOT NULL, cost INTEGER NOT NULL, model TEXT,
  in_tok INTEGER, out_tok INTEGER, status TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ai_log_time ON ai_log (created_at);
