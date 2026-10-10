import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const MINECRAFT_GAME_ID = '27471';
const MAX_PAGES = 50;
const MAX_CANDIDATES = 80;
const TAGS = new Set(['vaulthunters', 'vaulthunter', 'vh', 'vh3', 'vh4', 'vh5']);
const TITLE = /\bvault\s*hunters?\b|\bvh(?:3|4|5)\b/i;

function normalizedTag(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function isVaultHuntersStream(row) {
  const tags = Array.isArray(row?.tags) ? row.tags : [];
  return tags.some((tag) => TAGS.has(normalizedTag(tag))) || TITLE.test(String(row?.title || ''));
}

function validLogin(value) {
  const login = String(value || '').toLowerCase();
  return /^[a-z0-9_]{1,25}$/.test(login) ? login : null;
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(`${path}.tmp`, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(`${path}.tmp`, path);
}

async function readState(path) {
  try {
    const value = JSON.parse(await readFile(path, 'utf8'));
    const candidates = Array.isArray(value?.candidates) ? value.candidates : [];
    return {
      checkedAt: typeof value?.checkedAt === 'string' ? value.checkedAt : null,
      candidates: candidates
        .map((candidate) => ({
          login: validLogin(candidate?.login),
          discoveredAt: typeof candidate?.discoveredAt === 'string' ? candidate.discoveredAt : null,
          lastSeenAt: typeof candidate?.lastSeenAt === 'string' ? candidate.lastSeenAt : null,
        }))
        .filter((candidate) => candidate.login)
        .slice(0, MAX_CANDIDATES),
    };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { checkedAt: null, candidates: [] };
  }
}

export function createCommunityDiscoverer({
  clientId,
  clientSecret,
  statePath,
  signal,
  fetchImpl = fetch,
  now = Date.now,
}) {
  let token = '';
  let tokenValidUntil = 0;
  const boundedSignal = () =>
    signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000);

  async function headers() {
    if (!clientId || !clientSecret) throw new Error('community-discovery-credentials-missing');
    if (!token || now() >= tokenValidUntil) {
      const response = await fetchImpl('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'client_credentials',
        }),
        signal: boundedSignal(),
      });
      if (!response.ok) throw new Error('community-discovery-auth-failed');
      const body = await response.json();
      token = String(body?.access_token || '');
      if (!token) throw new Error('community-discovery-auth-failed');
      tokenValidUntil = now() + Math.max(0, (Number(body?.expires_in) || 0) - 60) * 1000;
    }
    return { 'Client-Id': clientId, Authorization: `Bearer ${token}` };
  }

  return async function discover() {
    const state = await readState(statePath);
    const found = new Set();
    let cursor = '';
    let pages = 0;
    const requestHeaders = await headers();
    do {
      const url = new URL('https://api.twitch.tv/helix/streams');
      url.searchParams.set('game_id', MINECRAFT_GAME_ID);
      url.searchParams.set('first', '100');
      if (cursor) url.searchParams.set('after', cursor);
      const response = await fetchImpl(url, { headers: requestHeaders, signal: boundedSignal() });
      if (!response.ok) throw new Error('community-discovery-request-failed');
      const body = await response.json();
      if (!Array.isArray(body?.data)) throw new Error('community-discovery-invalid-response');
      for (const row of body.data) {
        const login = validLogin(row?.user_login);
        if (login && isVaultHuntersStream(row)) found.add(login);
      }
      cursor = String(body?.pagination?.cursor || '');
      pages += 1;
    } while (cursor && pages < MAX_PAGES && !signal?.aborted);

    const checkedAt = new Date(now()).toISOString();
    const candidates = new Map(state.candidates.map((candidate) => [candidate.login, candidate]));
    for (const login of found) {
      const previous = candidates.get(login);
      candidates.set(login, {
        login,
        discoveredAt: previous?.discoveredAt || checkedAt,
        lastSeenAt: checkedAt,
      });
    }
    const next = {
      checkedAt,
      scanComplete: !cursor,
      pages,
      candidates: [...candidates.values()]
        .sort((left, right) => left.login.localeCompare(right.login))
        .slice(0, MAX_CANDIDATES),
    };
    await atomicJson(statePath, next);
    return next;
  };
}
