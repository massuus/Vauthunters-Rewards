ALTER TABLE companion_leaderboard_players ADD COLUMN minecraft_uuid TEXT;
ALTER TABLE companion_leaderboard_players ADD COLUMN minecraft_name TEXT;

CREATE INDEX IF NOT EXISTS idx_companion_leaderboard_minecraft_uuid
ON companion_leaderboard_players (minecraft_uuid);
