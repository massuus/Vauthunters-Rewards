-- One rollback snapshot and import watermark per channel, bounded by the allowlist.
CREATE TABLE IF NOT EXISTS companion_sync_state (
  streamer_login TEXT PRIMARY KEY,
  collected_at TEXT NOT NULL DEFAULT '',
  digest TEXT NOT NULL DEFAULT '',
  player_count INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL DEFAULT '',
  previous_collected_at TEXT NOT NULL DEFAULT '',
  backup_json TEXT NOT NULL DEFAULT '[]'
);
