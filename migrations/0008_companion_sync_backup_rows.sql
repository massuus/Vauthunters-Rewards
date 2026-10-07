-- Individual rollback rows avoid D1's per-value size limit on larger channels.
CREATE TABLE IF NOT EXISTS companion_sync_backup (
  streamer_login TEXT NOT NULL,
  twitch_name TEXT NOT NULL,
  player_name TEXT NOT NULL,
  alias TEXT,
  season_level INTEGER NOT NULL,
  vaults_joined INTEGER NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  minecraft_uuid TEXT,
  minecraft_name TEXT,
  PRIMARY KEY (streamer_login, twitch_name)
);
