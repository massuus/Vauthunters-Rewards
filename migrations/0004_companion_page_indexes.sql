-- Match the complete page ordering, including deterministic ties. Apply before
-- deploying the query optimization; these also support the rank boundary count.
CREATE INDEX IF NOT EXISTS idx_companion_page_season
ON companion_leaderboard_players (
  streamer_login, season_level DESC, vaults_joined DESC,
  COALESCE(alias, twitch_name) COLLATE NOCASE ASC, twitch_name ASC
);

CREATE INDEX IF NOT EXISTS idx_companion_page_vaults
ON companion_leaderboard_players (
  streamer_login, vaults_joined DESC, season_level DESC,
  COALESCE(alias, twitch_name) COLLATE NOCASE ASC, twitch_name ASC
);

PRAGMA optimize;
