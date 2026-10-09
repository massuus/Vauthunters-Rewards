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

export function publicLiveStatus(health, now = Date.now()) {
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
    return noStoreJson(publicLiveStatus(await loadHealth(env)));
  } catch {
    return noStoreJson({ error: 'Live status is temporarily unavailable.' }, 503);
  }
}
