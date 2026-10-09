import { loadHealth } from '../utils/companion-health.js';
import { methodNotAllowed, noStoreJson } from '../utils/http.js';

const NAMES = {
  hoy_82: 'Hoy',
  iskall85: 'Iskall85',
  therealhellfirem4ge: 'Hellfirem4ge',
  linahun: 'Lina',
  master_cwg: 'Master_CWG',
  mayaicefire: 'Maya',
  stressmonstah: 'Stressmonster',
};

let profileCache = { expiresAt: 0, images: {} };

function safeProfileImage(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'static-cdn.jtvnw.net'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

async function loadProfileImages(env, now = Date.now()) {
  if (now < profileCache.expiresAt) return profileCache.images;
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return {};
  const auth = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: env.TWITCH_CLIENT_ID,
      client_secret: env.TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!auth.ok) throw new Error('Twitch authentication failed.');
  const token = (await auth.json()).access_token;
  const url = new URL('https://api.twitch.tv/helix/users');
  for (const login of Object.keys(NAMES)) url.searchParams.append('login', login);
  const response = await fetch(url, {
    headers: { 'Client-Id': env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error('Twitch profiles unavailable.');
  const rows = (await response.json()).data;
  const images = Object.fromEntries(
    (Array.isArray(rows) ? rows : [])
      .map((row) => [
        String(row?.login || '').toLowerCase(),
        safeProfileImage(row?.profile_image_url),
      ])
      .filter(([, image]) => image)
  );
  profileCache = { expiresAt: now + 6 * 60 * 60_000, images };
  return images;
}

export function publicLiveStatus(health, now = Date.now(), profileImages = {}) {
  const report = health?.report;
  const join = report?.autoJoin;
  const checkedAt = join?.checkedAt || report?.reportedAt || null;
  const stale = health?.stale === true || !checkedAt || now - Date.parse(checkedAt) > 20 * 60_000;
  const channels = Array.isArray(join?.channels) ? join.channels : [];
  return {
    checkedAt,
    stale,
    streamers: Object.entries(NAMES).map(([login, displayName]) => {
      const channel = channels.find((row) => row.streamer === login);
      const live = !stale && channel?.live === true;
      return {
        login,
        displayName,
        profileImageUrl: safeProfileImage(profileImages[login]),
        live,
        connected: live && channel?.connected === true,
        joinWindowOpen: live && channel?.windowOpen === true,
        inVault: live && channel?.vaultRunning === true,
        vaultStartedAt:
          live && channel?.vaultRunning === true ? channel?.vaultStartedAt || null : null,
      };
    }),
  };
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  try {
    const [health, profiles] = await Promise.all([
      loadHealth(env),
      loadProfileImages(env).catch(() => profileCache.images),
    ]);
    return noStoreJson(publicLiveStatus(health, Date.now(), profiles));
  } catch {
    return noStoreJson({ error: 'Live status is temporarily unavailable.' }, 503);
  }
}
