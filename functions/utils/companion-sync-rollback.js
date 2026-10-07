import { ApiError } from './http.js';
import { SYNC_STREAMERS } from './companion-sync.js';

// Operator-only utility, intentionally not exposed through a public HTTP route.
// Execute returned statements together with db.batch after stopping the collector.
export function companionRollbackStatements(db, streamer, collectedAt) {
  if (!SYNC_STREAMERS.includes(streamer) || !Number.isFinite(Date.parse(collectedAt)))
    throw new ApiError(400, 'Invalid rollback target.');
  const guard = `EXISTS (SELECT 1 FROM companion_sync_state WHERE streamer_login = ?1 AND collected_at = ?2)
    AND NOT EXISTS (SELECT 1 FROM companion_leaderboard_players WHERE streamer_login = ?1 AND updated_at > ?2)`;
  // Delete only rows introduced by this import. Existing rows are restored in-place,
  // so the second statement's guard continues to detect later edits.
  return [
    db
      .prepare(
        `DELETE FROM companion_leaderboard_players
      WHERE streamer_login = ?1 AND ${guard}
      AND NOT EXISTS (SELECT 1 FROM companion_sync_backup b WHERE b.streamer_login = ?1
        AND b.twitch_name = companion_leaderboard_players.twitch_name)`
      )
      .bind(streamer, collectedAt),
    db
      .prepare(
        `INSERT INTO companion_leaderboard_players
      SELECT * FROM companion_sync_backup WHERE streamer_login = ?1 AND ${guard}
      ON CONFLICT(streamer_login, twitch_name) DO UPDATE SET
        player_name=excluded.player_name, alias=excluded.alias, season_level=excluded.season_level,
        vaults_joined=excluded.vaults_joined, source=excluded.source, created_at=excluded.created_at,
        updated_at=excluded.updated_at, minecraft_uuid=excluded.minecraft_uuid,
        minecraft_name=excluded.minecraft_name`
      )
      .bind(streamer, collectedAt),
  ];
}
