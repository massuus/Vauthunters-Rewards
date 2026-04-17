import { fetchJson } from '../utils/fetch-utils.js';
import { SERVERS_API_TIMEOUT, SERVERS_URL } from '../utils/config.js';

export async function onRequest() {
  try {
    const result = await fetchJson(SERVERS_URL, 'Official Servers API', SERVERS_API_TIMEOUT);

    if (result.error || !result.data) {
      const err = new Error(result.message || 'Official Servers API failed');
      err.status = 502;
      err.details = { timeout: result.isTimeout, status: result.status };
      throw err;
    }

    const servers = Array.isArray(result.data) ? result.data : [];
    const minimal = servers.map((item) => ({
      _id: String(item?._id || ''),
      name: String(item?.name || ''),
      region: String(item?.region || ''),
      number: Number(item?.number || 0),
      url: String(item?.url || ''),
      port: Number(item?.port || 0),
      isCasual: Boolean(item?.isCasual),
      isSky: Boolean(item?.isSky),
      isArcade: Boolean(item?.isArcade),
      isVisible: item?.isVisible !== false,
      maxPlayers: Number(item?.maxPlayers || 0),
      allowedTiers: Array.isArray(item?.allowedTiers)
        ? item.allowedTiers.map((tier) => String(tier || '')).filter(Boolean)
        : [],
      players: Array.isArray(item?.players)
        ? item.players
            .map((player) => ({
              ign: String(player?.ign || ''),
              active: player?.active !== false,
              hasAccess: player?.hasAccess !== false,
            }))
            .filter((player) => player.ign)
        : [],
      updatedAt: String(item?.updatedAt || ''),
    }));

    return json(minimal, 200, {
      'cache-control': 'public, max-age=600, s-maxage=3600',
    });
  } catch (error) {
    const status = typeof error?.status === 'number' ? error.status : 500;
    return json(
      {
        error:
          status >= 500
            ? 'Failed to retrieve official servers. Please try again.'
            : error?.message || 'Request failed.',
        details: error?.details || undefined,
      },
      status
    );
  }
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}
