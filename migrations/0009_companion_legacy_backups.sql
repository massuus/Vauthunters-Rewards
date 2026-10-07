-- Preserve a backup created while an older Pages deployment was still propagating.
INSERT OR IGNORE INTO companion_sync_backup
  (streamer_login, twitch_name, player_name, alias, season_level, vaults_joined,
   source, created_at, updated_at, minecraft_uuid, minecraft_name)
SELECT state.streamer_login, json_extract(value, '$.twitch_name'),
  json_extract(value, '$.player_name'), json_extract(value, '$.alias'),
  json_extract(value, '$.season_level'), json_extract(value, '$.vaults_joined'),
  json_extract(value, '$.source'), json_extract(value, '$.created_at'),
  json_extract(value, '$.updated_at'), json_extract(value, '$.minecraft_uuid'),
  json_extract(value, '$.minecraft_name')
FROM companion_sync_state AS state, json_each(state.backup_json)
WHERE NOT EXISTS (
  SELECT 1 FROM companion_sync_backup AS backup WHERE backup.streamer_login = state.streamer_login
);
