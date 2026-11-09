// Browser-side companion import transport. UI rendering and feedback stay in the page.

const IMPORT_BATCH_SIZE = 100;
const IDENTITY_BATCH_SIZE = 5;
const SOCKET_PAGE_SIZE = 20;

export function normalizeStreamer(value, fallback = 'iskall85') {
  const streamer = String(value || fallback)
    .trim()
    .toLowerCase();
  return /^[a-z0-9_]{1,25}$/.test(streamer) ? streamer : fallback;
}

export async function apiRequest(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  let body = {};
  try {
    body = await response.json();
  } catch {}
  if (!response.ok) throw new Error(body.error || 'The request failed.');
  return body;
}

function cleanWssUrl(value) {
  return String(value || '')
    .trim()
    .replace(/^wss\\:\/\//i, 'wss://')
    .replace(/\\_/g, '_')
    .replace(/&amp;/gi, '&')
    .replace(/&#x26;/gi, '&');
}

function readStreamerFromWss(value) {
  let url;
  try {
    url = new URL(cleanWssUrl(value));
  } catch {
    throw new Error('Enter a valid WSS URL.');
  }
  if (url.protocol !== 'wss:' || url.hostname !== 'ebs.vaulthunters.gg') {
    throw new Error('The URL must use wss://ebs.vaulthunters.gg.');
  }
  const streamer = normalizeStreamer(url.searchParams.get('streamer'), '');
  if (!streamer) throw new Error('The WSS URL does not contain a valid streamer.');
  return { url: url.toString(), streamer };
}

export function retrieveCompanions(wssValue, onProgress) {
  const { url, streamer } = readStreamerFromWss(wssValue);
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const players = [];
    let page = 1;
    let totalPages = null;
    let ackId = 1;
    let finished = false;
    let idleTimer;

    const fail = (message) => {
      if (finished) return;
      finished = true;
      clearTimeout(idleTimer);
      try {
        socket.close();
      } catch {}
      reject(new Error(message));
    };
    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => fail('The companion socket stopped responding.'), 20_000);
    };
    const requestPage = () => {
      resetIdleTimer();
      onProgress(`Retrieving page ${page}${totalPages ? ` of ${totalPages}` : ''}…`);
      socket.send(
        `42/extension,${ackId}["requestDraftCompanionSearch","",${page},${SOCKET_PAGE_SIZE}]`
      );
    };

    socket.addEventListener('open', resetIdleTimer);
    socket.addEventListener('error', () =>
      fail('The WSS connection failed. Check that its tokens are current.')
    );
    socket.addEventListener('close', () => {
      if (!finished) fail('The WSS connection closed before every page was received.');
    });
    socket.addEventListener('message', (event) => {
      const message = String(event.data || '');
      resetIdleTimer();
      if (message.startsWith('0')) {
        socket.send('40/extension,');
        return;
      }
      if (message.startsWith('2')) {
        socket.send(`3${message.slice(1)}`);
        return;
      }
      if (message.startsWith('40/extension')) {
        requestPage();
        return;
      }

      const match = message.match(/^43\/extension,\d+(\[.*\])$/s);
      if (!match) return;
      let acknowledgement;
      try {
        acknowledgement = JSON.parse(match[1]);
      } catch {
        fail('The companion socket returned unreadable data.');
        return;
      }

      const payload = acknowledgement?.[0] || {};
      const pagePlayers = Array.isArray(payload.data) ? payload.data : [];
      players.push(...pagePlayers);
      totalPages = Math.max(1, Number(payload.pagination?.totalPages || page));
      if (page >= totalPages) {
        const uniquePlayers = [
          ...new Map(
            players
              .filter((player) => player?.name && player?.skin)
              .map((player) => [String(player.name).toLowerCase(), player])
          ).values(),
        ];
        if (!uniquePlayers.length) {
          fail(
            'The socket returned no companion players. Paste the WSS URL directly and make sure its tokens are still current.'
          );
          return;
        }
        finished = true;
        clearTimeout(idleTimer);
        socket.close(1000, 'complete');
        resolve({ streamer, players: uniquePlayers, received: players.length });
        return;
      }
      page += 1;
      ackId += 1;
      requestPage();
    });
  });
}

export async function uploadPlayers(csrfToken, streamer, players, onProgress) {
  if (!players.length) throw new Error('The socket returned no companion players to update.');
  let updated = 0;
  let skipped = 0;
  const batches = Math.ceil(players.length / IMPORT_BATCH_SIZE);
  for (let index = 0; index < players.length; index += IMPORT_BATCH_SIZE) {
    const batchNumber = Math.floor(index / IMPORT_BATCH_SIZE) + 1;
    onProgress(`Saving batch ${batchNumber} of ${batches}…`);
    const result = await apiRequest('/api/admin/companion-leaderboard', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        streamer,
        players: players.slice(index, index + IMPORT_BATCH_SIZE),
        source: 'wss-browser-import',
      }),
    });
    updated += Number(result.updated || 0);
    skipped += Number(result.skipped || 0);
  }
  return { updated, skipped };
}

export async function resolvePlayerIdentities(csrfToken, players, onProgress) {
  const twitchNames = [
    ...new Set(
      players
        .map((player) =>
          String(player?.name ?? player?.twitchName ?? '')
            .trim()
            .toLowerCase()
        )
        .filter((name) => /^[a-z0-9_]{1,25}$/.test(name))
    ),
  ];
  const totals = { resolved: 0, existing: 0, missing: 0, failed: 0, skipped: 0 };
  const batches = Math.ceil(twitchNames.length / IDENTITY_BATCH_SIZE);

  for (let index = 0; index < twitchNames.length; index += IDENTITY_BATCH_SIZE) {
    const batchNumber = Math.floor(index / IDENTITY_BATCH_SIZE) + 1;
    onProgress(`Resolving Minecraft names ${batchNumber} of ${batches}…`);
    const result = await apiRequest('/api/admin/companion-identities', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ twitchNames: twitchNames.slice(index, index + IDENTITY_BATCH_SIZE) }),
    });
    Object.keys(totals).forEach((key) => {
      totals[key] += Number(result[key] || 0);
    });
  }

  return totals;
}

export function describeIdentityUpdate(stats) {
  if (!stats) return '';
  const linked = stats.resolved + stats.existing;
  const parts = [`Linked ${linked} Minecraft ${linked === 1 ? 'identity' : 'identities'}`];
  if (stats.resolved) parts.push(`${stats.resolved} newly resolved`);
  if (stats.missing) parts.push(`${stats.missing} not linked to Minecraft`);
  if (stats.failed) parts.push(`${stats.failed} could not be checked`);
  return `${parts.join('; ')}.`;
}
