-- A small change counter lets the publisher skip full-table reads when idle.
-- Triggers also cover imports performed directly through SQL.
CREATE TABLE IF NOT EXISTS leaderboard_snapshot_revision (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO leaderboard_snapshot_revision (id, revision) VALUES (1, 0);

CREATE TRIGGER IF NOT EXISTS snapshot_unlock_insert AFTER INSERT ON leaderboard_players
BEGIN UPDATE leaderboard_snapshot_revision SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER IF NOT EXISTS snapshot_unlock_delete AFTER DELETE ON leaderboard_players
BEGIN UPDATE leaderboard_snapshot_revision SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER IF NOT EXISTS snapshot_unlock_update AFTER UPDATE ON leaderboard_players
WHEN OLD.player_uuid IS NOT NEW.player_uuid OR OLD.player_name IS NOT NEW.player_name
  OR OLD.sets_unlocked IS NOT NEW.sets_unlocked OR OLD.updated_at IS NOT NEW.updated_at
  OR OLD.vault_hunters_tier IS NOT NEW.vault_hunters_tier OR OLD.iskall85_tier IS NOT NEW.iskall85_tier
BEGIN UPDATE leaderboard_snapshot_revision SET revision = revision + 1 WHERE id = 1; END;

CREATE TRIGGER IF NOT EXISTS snapshot_companion_insert AFTER INSERT ON companion_leaderboard_players
BEGIN UPDATE leaderboard_snapshot_revision SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER IF NOT EXISTS snapshot_companion_delete AFTER DELETE ON companion_leaderboard_players
BEGIN UPDATE leaderboard_snapshot_revision SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER IF NOT EXISTS snapshot_companion_update AFTER UPDATE ON companion_leaderboard_players
WHEN OLD.streamer_login IS NOT NEW.streamer_login OR OLD.twitch_name IS NOT NEW.twitch_name
  OR OLD.player_name IS NOT NEW.player_name OR OLD.alias IS NOT NEW.alias
  OR OLD.minecraft_uuid IS NOT NEW.minecraft_uuid OR OLD.minecraft_name IS NOT NEW.minecraft_name
  OR OLD.season_level IS NOT NEW.season_level OR OLD.vaults_joined IS NOT NEW.vaults_joined
  OR OLD.updated_at IS NOT NEW.updated_at
BEGIN UPDATE leaderboard_snapshot_revision SET revision = revision + 1 WHERE id = 1; END;
