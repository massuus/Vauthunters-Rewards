const LEADERBOARD_CACHE_KEY_PREFIX = 'vh.leaderboard.page.v3';
const LEADERBOARD_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_PAGE_LIMIT = 10;
const MAX_PAGE_LIMIT = 50;
const MAX_OFFSET = 1_000_000;

const inMemoryPageCache = new Map();
const inFlightPageRequests = new Map();

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function normalizeText(value, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

function getPageKey(offset, limit, metric, streamer, targetPlayer) {
  return `${metric}:${streamer}:${targetPlayer.toLowerCase()}:${offset}:${limit}`;
}

function getStorageKey(pageKey) {
  return `${LEADERBOARD_CACHE_KEY_PREFIX}:${pageKey}`;
}

function clearStoredLeaderboardPages() {
  try {
    const keysToRemove = [];

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`${LEADERBOARD_CACHE_KEY_PREFIX}:`)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      localStorage.removeItem(key);
    });
  } catch {
    // Ignore storage access issues.
  }
}

function normalizePlayer(player) {
  return {
    rank: Math.max(1, Number(player?.rank || 1)),
    playerUUID: normalizeText(player?.playerUUID),
    playerNickname: normalizeText(player?.playerNickname, 'Unknown Player'),
    skinName: normalizeText(player?.skinName) || null,
    minecraftUUID: normalizeText(player?.minecraftUUID) || null,
    minecraftName: normalizeText(player?.minecraftName) || null,
    setsUnlocked: Math.max(0, Number(player?.setsUnlocked || 0)),
    twitchName: normalizeText(player?.twitchName) || null,
    alias: normalizeText(player?.alias) || null,
    seasonLevel: Math.max(0, Number(player?.seasonLevel || 0)),
    vaultsJoined: Math.max(0, Number(player?.vaultsJoined || 0)),
    vaultHuntersTier: normalizeText(player?.vaultHuntersTier) || null,
    iskall85Tier: normalizeText(player?.iskall85Tier) || null,
    updatedAt: normalizeText(player?.updatedAt) || null,
  };
}

function normalizePayload(payload, offset, limit) {
  const normalizedOffset = Math.max(0, Number(payload?.offset ?? offset ?? 0));
  const players = Array.isArray(payload?.players) ? payload.players.map(normalizePlayer) : [];
  const total = Math.max(0, Number(payload?.total || 0));
  const nextOffset = Math.max(
    normalizedOffset + players.length,
    Number(payload?.nextOffset ?? normalizedOffset + players.length)
  );
  const hasMore =
    typeof payload?.hasMore === 'boolean' ? payload.hasMore : nextOffset < Math.max(total, 0);

  const focusPlayer = payload?.focusPlayer
    ? {
        rank: Math.max(1, Number(payload.focusPlayer?.rank || 1)),
        playerUUID: normalizeText(payload.focusPlayer?.playerUUID),
        playerNickname: normalizeText(payload.focusPlayer?.playerNickname, 'Unknown Player'),
        skinName: normalizeText(payload.focusPlayer?.skinName) || null,
        minecraftUUID: normalizeText(payload.focusPlayer?.minecraftUUID) || null,
        minecraftName: normalizeText(payload.focusPlayer?.minecraftName) || null,
        setsUnlocked: Math.max(0, Number(payload.focusPlayer?.setsUnlocked || 0)),
        twitchName: normalizeText(payload.focusPlayer?.twitchName) || null,
        alias: normalizeText(payload.focusPlayer?.alias) || null,
        seasonLevel: Math.max(0, Number(payload.focusPlayer?.seasonLevel || 0)),
        vaultsJoined: Math.max(0, Number(payload.focusPlayer?.vaultsJoined || 0)),
      }
    : null;

  return {
    metric: normalizeText(payload?.metric, 'setsUnlocked'),
    streamer: normalizeText(payload?.streamer) || null,
    streamers: Array.isArray(payload?.streamers)
      ? payload.streamers
          .map((streamer) => ({
            login: normalizeText(streamer?.login).toLowerCase(),
            playerCount: Math.max(0, Number(streamer?.playerCount || 0)),
            updatedAt: normalizeText(streamer?.updatedAt) || null,
          }))
          .filter((streamer) => streamer.login)
      : [],
    total,
    limit,
    offset: normalizedOffset,
    nextOffset,
    hasMore,
    players,
    focusPlayer,
  };
}

function readPageCache(pageKey, offset, limit) {
  const now = Date.now();
  const fromMemory = inMemoryPageCache.get(pageKey);

  if (fromMemory && now < fromMemory.expiresAt) {
    return fromMemory.payload;
  }

  if (fromMemory) {
    inMemoryPageCache.delete(pageKey);
  }

  try {
    const raw = localStorage.getItem(getStorageKey(pageKey));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    const expiresAt = Number(parsed?.expiresAt || 0);

    if (!expiresAt || now >= expiresAt || !parsed?.payload) {
      localStorage.removeItem(getStorageKey(pageKey));
      return null;
    }

    const normalized = normalizePayload(parsed.payload, offset, limit);
    inMemoryPageCache.set(pageKey, {
      expiresAt,
      payload: normalized,
    });

    return normalized;
  } catch {
    return null;
  }
}

function writePageCache(pageKey, payload) {
  const expiresAt = Date.now() + LEADERBOARD_CACHE_TTL_MS;

  inMemoryPageCache.set(pageKey, {
    expiresAt,
    payload,
  });

  try {
    localStorage.setItem(
      getStorageKey(pageKey),
      JSON.stringify({
        expiresAt,
        payload,
      })
    );
  } catch {
    // Ignore storage write issues.
  }
}

async function readApiError(response) {
  let message = 'Failed to load leaderboard data.';

  try {
    const body = await response.json();
    if (body?.error) {
      message = String(body.error);
    }
  } catch {
    // Keep fallback message.
  }

  const error = new Error(message);
  error.status = response.status;
  return error;
}

export async function fetchLeaderboardPage({
  offset = 0,
  limit = DEFAULT_PAGE_LIMIT,
  forceRefresh = false,
  targetPlayer = '',
  metric = 'setsUnlocked',
  streamer = 'iskall85',
} = {}) {
  const safeOffset = clampInt(offset, 0, 0, MAX_OFFSET);
  const safeLimit = clampInt(limit, DEFAULT_PAGE_LIMIT, 1, MAX_PAGE_LIMIT);
  const safeTargetPlayer = normalizeText(targetPlayer);
  const safeMetric = ['setsUnlocked', 'seasonLevel', 'vaultsJoined'].includes(metric)
    ? metric
    : 'setsUnlocked';
  const safeStreamer = normalizeText(streamer, 'iskall85').toLowerCase();
  const pageKey = getPageKey(safeOffset, safeLimit, safeMetric, safeStreamer, safeTargetPlayer);

  if (!forceRefresh) {
    const cached = readPageCache(pageKey, safeOffset, safeLimit);
    if (cached) {
      return cached;
    }

    if (inFlightPageRequests.has(pageKey)) {
      return inFlightPageRequests.get(pageKey);
    }
  }

  const requestPromise = (async () => {
    const url = new URL('/api/leaderboard', window.location.origin);
    url.searchParams.set('offset', String(safeOffset));
    url.searchParams.set('limit', String(safeLimit));
    url.searchParams.set('metric', safeMetric);
    if (safeMetric !== 'setsUnlocked') {
      url.searchParams.set('streamer', safeStreamer);
    }
    if (safeTargetPlayer) {
      url.searchParams.set('player', safeTargetPlayer);
    }
    if (forceRefresh) {
      url.searchParams.set('refresh', '1');
    }

    const response = await fetch(url.toString(), {
      headers: {
        accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw await readApiError(response);
    }

    const payload = await response.json();
    const normalized = normalizePayload(payload, safeOffset, safeLimit);

    if (!forceRefresh) {
      writePageCache(pageKey, normalized);
    }

    return normalized;
  })();

  if (!forceRefresh) {
    inFlightPageRequests.set(pageKey, requestPromise);
  }

  try {
    return await requestPromise;
  } finally {
    if (!forceRefresh) {
      inFlightPageRequests.delete(pageKey);
    }
  }
}

export function clearLeaderboardCache() {
  inMemoryPageCache.clear();
  inFlightPageRequests.clear();
  clearStoredLeaderboardPages();
}
