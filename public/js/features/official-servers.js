const OFFICIAL_SERVERS_CACHE_KEY = 'vh.officialServers.v1';
const OFFICIAL_SERVERS_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const OFFICIAL_SERVERS_API_URL = '/api/server';
const REGION_QUERY_ALIASES = {
  au: 'australia',
  aus: 'australia',
  oce: 'australia',
  oceania: 'australia',
  ca: 'canada',
  can: 'canada',
  eu: 'europe',
  eur: 'europe',
  na: 'north america',
  us: 'north america',
  usa: 'north america',
};

let serversInMemory = null;
let serversInMemoryExpiresAt = 0;
let serversInFlight = null;

function normalizePlayer(player) {
  return {
    ign: String(player?.ign || '').trim(),
    active: player?.active !== false,
    hasAccess: player?.hasAccess !== false,
  };
}

function normalizeServer(server) {
  return {
    _id: String(server?._id || '').trim(),
    name: String(server?.name || '').trim(),
    region: String(server?.region || '').trim(),
    number: Number(server?.number || 0),
    url: String(server?.url || '').trim(),
    port: Number(server?.port || 0),
    isCasual: Boolean(server?.isCasual),
    isSky: Boolean(server?.isSky),
    isArcade: Boolean(server?.isArcade),
    isVisible: server?.isVisible !== false,
    maxPlayers: Number(server?.maxPlayers || 0),
    allowedTiers: Array.isArray(server?.allowedTiers)
      ? server.allowedTiers.map((tier) => String(tier || '')).filter(Boolean)
      : [],
    players: Array.isArray(server?.players)
      ? server.players.map(normalizePlayer).filter((player) => player.ign)
      : [],
    updatedAt: String(server?.updatedAt || ''),
  };
}

function normalizeServerList(list) {
  const safeList = Array.isArray(list) ? list : [];
  return safeList.map(normalizeServer).filter((server) => server._id && server.name);
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

function normalizeTextNoSpace(value) {
  return normalizeText(value).replace(/\s+/g, '');
}

function readServersCache() {
  try {
    const raw = localStorage.getItem(OFFICIAL_SERVERS_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const expiresAt = Number(parsed?.expiresAt || 0);
    const data = normalizeServerList(parsed?.data);

    if (!expiresAt || Date.now() >= expiresAt || !data.length) {
      return null;
    }

    return {
      data,
      expiresAt,
    };
  } catch {
    return null;
  }
}

function writeServersCache(data) {
  try {
    const expiresAt = Date.now() + OFFICIAL_SERVERS_CACHE_TTL_MS;
    localStorage.setItem(
      OFFICIAL_SERVERS_CACHE_KEY,
      JSON.stringify({
        expiresAt,
        data,
      })
    );
  } catch {
    // Ignore storage write errors.
  }
}

function sortServers(a, b) {
  const regionCompare = a.region.localeCompare(b.region, undefined, { sensitivity: 'base' });
  if (regionCompare !== 0) return regionCompare;

  const numberCompare = a.number - b.number;
  if (numberCompare !== 0) return numberCompare;

  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

export async function fetchOfficialServers({ forceRefresh = false } = {}) {
  const now = Date.now();

  if (!forceRefresh && serversInMemory && now < serversInMemoryExpiresAt) {
    return serversInMemory;
  }

  if (!forceRefresh) {
    const fromStorage = readServersCache();
    if (fromStorage) {
      serversInMemory = fromStorage.data;
      serversInMemoryExpiresAt = fromStorage.expiresAt;
      return serversInMemory;
    }
  }

  if (!forceRefresh && serversInFlight) {
    return serversInFlight;
  }

  serversInFlight = fetch(OFFICIAL_SERVERS_API_URL)
    .then((response) => {
      if (!response.ok) {
        throw new Error('Failed to load official servers');
      }
      return response.json();
    })
    .then((data) => {
      const normalized = normalizeServerList(data).sort(sortServers);
      serversInMemory = normalized;
      serversInMemoryExpiresAt = Date.now() + OFFICIAL_SERVERS_CACHE_TTL_MS;
      writeServersCache(normalized);
      return normalized;
    })
    .catch((error) => {
      serversInFlight = null;
      throw error;
    });

  try {
    return await serversInFlight;
  } finally {
    serversInFlight = null;
  }
}

export function findServerByPlayerName(playerName, servers = []) {
  const target = String(playerName || '')
    .trim()
    .toLowerCase();

  if (!target || !Array.isArray(servers) || !servers.length) {
    return null;
  }

  return (
    servers.find((server) =>
      (Array.isArray(server.players) ? server.players : []).some(
        (player) =>
          String(player?.ign || '')
            .trim()
            .toLowerCase() === target
      )
    ) || null
  );
}

export function getServerById(serverId, servers = []) {
  const target = String(serverId || '').trim();
  if (!target) return null;

  return (
    servers.find((server) => String(server?._id || '') === target) ||
    servers.find((server) => String(server?.name || '').toLowerCase() === target.toLowerCase()) ||
    null
  );
}

export function getVisibleServers(servers = []) {
  return (Array.isArray(servers) ? servers : []).filter((server) => server?.isVisible !== false);
}

export function findServerByQuery(query, servers = []) {
  const input = String(query || '').trim();
  if (!input || !Array.isArray(servers) || !servers.length) {
    return null;
  }

  const exact = getServerById(input, servers);
  if (exact) {
    return exact;
  }

  const regionNumberMatch = input.match(/^([a-zA-Z]{2,16})[\s:_-]?(\d{1,2})$/);
  if (regionNumberMatch) {
    const rawRegion = normalizeTextNoSpace(regionNumberMatch[1]);
    const resolvedRegion = REGION_QUERY_ALIASES[rawRegion] || rawRegion;
    const targetNumber = Number(regionNumberMatch[2]);

    const byRegionAndNumber = servers.find((server) => {
      const serverRegion = normalizeTextNoSpace(server?.region || '');
      const serverNumber = Number(server?.number || 0);

      return (
        serverNumber === targetNumber &&
        (serverRegion === resolvedRegion ||
          serverRegion.startsWith(resolvedRegion) ||
          resolvedRegion.startsWith(serverRegion))
      );
    });

    if (byRegionAndNumber) {
      return byRegionAndNumber;
    }
  }

  return null;
}
