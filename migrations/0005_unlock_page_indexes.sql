-- The unlock table predates migrations and may otherwise only exist after the
-- first request. Include its base schema so fresh databases can migrate too.
CREATE TABLE IF NOT EXISTS leaderboard_players (
  player_uuid TEXT PRIMARY KEY,
  player_name TEXT NOT NULL,
  sets_unlocked INTEGER NOT NULL DEFAULT 0,
  vault_hunters_tier TEXT,
  iskall85_tier TEXT,
  source TEXT NOT NULL DEFAULT 'unknown',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_page
ON leaderboard_players (
  sets_unlocked DESC, updated_at DESC, player_name COLLATE NOCASE ASC, player_uuid ASC
);

-- Existing placement lookups use LOWER(player_name); a plain name index cannot
-- service that expression. This allows the UUID/name OR to use both indexes.
CREATE INDEX IF NOT EXISTS idx_leaderboard_name_lower
ON leaderboard_players (LOWER(player_name));

PRAGMA optimize;
