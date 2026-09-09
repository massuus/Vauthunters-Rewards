CREATE INDEX IF NOT EXISTS idx_companion_leaderboard_twitch_name
ON companion_leaderboard_players (twitch_name);

PRAGMA optimize;
