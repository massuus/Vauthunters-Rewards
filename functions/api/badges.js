import {
  sanitizeBadgeCatalog,
  catalogBadge,
} from '../../scripts/companion-collector/badge-catalog.mjs';
import { methodNotAllowed, noStoreJson } from '../utils/http.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  try {
    const row = await env.LEADERBOARD_DB.prepare(
      'SELECT report_json FROM companion_collector_health WHERE id=1'
    ).first();
    const catalog = sanitizeBadgeCatalog(row ? JSON.parse(row.report_json).badgeCatalog : null);
    if (!catalog)
      return noStoreJson(
        {
          error:
            'The companion badge catalog is not available yet. Please try again after the next collector update.',
        },
        503
      );
    return Response.json(
      { updatedAt: catalog.checkedAt, badges: catalog.badges.map(catalogBadge) },
      {
        headers: { 'cache-control': 'public, max-age=300, s-maxage=300' },
      }
    );
  } catch {
    return noStoreJson({ error: 'The badge catalog is temporarily unavailable.' }, 503);
  }
}
