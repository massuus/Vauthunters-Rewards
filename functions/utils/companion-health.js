import { sanitizeHealth } from '../../scripts/companion-collector/health-contract.mjs';
import { ApiError } from './http.js';

export async function storeHealth(env, payload, now = Date.now()) {
  let report;
  try {
    report = sanitizeHealth(payload);
  } catch {
    throw new ApiError(400, 'Invalid health report.');
  }
  if (Math.abs(Date.parse(report.reportedAt) - now) > 5 * 60_000)
    throw new ApiError(400, 'Health report is too old or clock is incorrect.');
  if (!env.LEADERBOARD_DB) throw new ApiError(503, 'Status storage unavailable.');
  await env.LEADERBOARD_DB.prepare(
    `INSERT INTO companion_collector_health (id, reported_at, received_at, report_json)
    VALUES (1, ?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET reported_at=excluded.reported_at,
      received_at=excluded.received_at, report_json=excluded.report_json
    WHERE companion_collector_health.reported_at < excluded.reported_at`
  )
    .bind(report.reportedAt, new Date(now).toISOString(), JSON.stringify(report))
    .run();
}

export async function loadHealth(env, now = Date.now()) {
  const row = await env.LEADERBOARD_DB.prepare(
    'SELECT received_at, report_json FROM companion_collector_health WHERE id=1'
  ).first();
  const imports = await env.LEADERBOARD_DB.prepare(
    'SELECT streamer_login, collected_at, imported_at, player_count FROM companion_sync_state'
  ).all();
  return {
    report: row ? sanitizeHealth(JSON.parse(row.report_json)) : null,
    receivedAt: row?.received_at || null,
    serverTime: new Date(now).toISOString(),
    stale: !row || now - Date.parse(row.received_at) > 45 * 60_000,
    imports: (imports.results || []).map((r) => ({
      streamer: r.streamer_login,
      collectedAt: r.collected_at,
      importedAt: r.imported_at,
      players: r.player_count,
    })),
  };
}
