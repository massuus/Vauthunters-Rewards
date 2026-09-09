CREATE TABLE IF NOT EXISTS companion_leaderboard_players (
  streamer_login TEXT NOT NULL,
  twitch_name TEXT NOT NULL,
  player_name TEXT NOT NULL,
  alias TEXT,
  season_level INTEGER NOT NULL DEFAULT 0,
  vaults_joined INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'unknown',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (streamer_login, twitch_name)
);

CREATE INDEX IF NOT EXISTS idx_companion_leaderboard_season
ON companion_leaderboard_players (streamer_login, season_level DESC, vaults_joined DESC);

CREATE INDEX IF NOT EXISTS idx_companion_leaderboard_vaults
ON companion_leaderboard_players (streamer_login, vaults_joined DESC, season_level DESC);

CREATE INDEX IF NOT EXISTS idx_companion_leaderboard_player
ON companion_leaderboard_players (streamer_login, player_name COLLATE NOCASE);
