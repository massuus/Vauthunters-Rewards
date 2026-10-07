export class CollectorError extends Error {
  constructor(code, diagnostics) {
    super(code);
    this.code = code;
    if (diagnostics) this.diagnostics = diagnostics;
  }
}

export function validateSocketUrl(value, streamer) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new CollectorError('invalid-socket-url');
  }
  if (
    url.protocol !== 'wss:' ||
    url.hostname !== 'ebs.vaulthunters.gg' ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== '/socket.io/' ||
    url.searchParams.getAll('streamer').length !== 1 ||
    url.searchParams.get('streamer')?.toLowerCase() !== streamer ||
    !url.searchParams.get('extensionToken') ||
    !url.searchParams.get('helixToken') ||
    url.searchParams.get('EIO') !== '4' ||
    url.searchParams.get('transport') !== 'websocket'
  )
    throw new CollectorError('invalid-socket-url');
  // A polling upgrade's session ID cannot be reused for a fresh connection.
  url.searchParams.delete('sid');
  return url.toString();
}

function playerRecord(player) {
  if (
    !/^[a-z0-9_]{1,25}$/i.test(player?.name || '') ||
    !/^[a-z0-9_]{1,16}$/i.test(player?.skin || '')
  )
    return null;
  if (
    ![player.seasonLevel, player.vaultsJoined].every(
      (value) =>
        (typeof value === 'number' || typeof value === 'string') && String(value).trim() !== ''
    )
  )
    return null;
  const seasonLevel = Number(player.seasonLevel);
  const vaultsJoined = Number(player.vaultsJoined);
  if (
    ![seasonLevel, vaultsJoined].every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000)
  )
    return null;
  return {
    name: player.name.toLowerCase(),
    skin: player.skin,
    alias: typeof player.alias === 'string' ? player.alias.slice(0, 64) : null,
    seasonLevel,
    vaultsJoined,
  };
}

// Only the existing read-only companion search event is sent. Never log or persist its URL.
export function retrievePlayers(
  value,
  streamer,
  { WebSocketImpl = WebSocket, maxPages = 500, timeoutMs = 90_000, idleMs = 15_000, signal } = {}
) {
  const url = validateSocketUrl(value, streamer);
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new CollectorError('run-time-limit'));
    const socket = new WebSocketImpl(url);
    let done = false;
    let connected = false;
    let page = 1;
    let totalPages;
    let receivedBytes = 0;
    let received = 0;
    let skipped = 0;
    let idleTimer;
    let companionState = 'unknown';
    let pageDiagnostics;
    const players = new Map();
    const finish = (error) => {
      if (done) return;
      done = true;
      clearTimeout(idleTimer);
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      try {
        socket.close(1000, 'collector-finished');
      } catch {
        /* Already closed. */
      }
      if (error) reject(new CollectorError(error, { companionState, page, ...pageDiagnostics }));
      else
        resolve({
          players: [...players.values()],
          pages: page,
          received,
          skipped,
          receivedBytes,
          diagnostics: { companionState },
        });
    };
    const abort = () => finish('run-time-limit');
    const timer = setTimeout(() => finish('socket-time-limit'), timeoutMs);
    const resetIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => finish('socket-idle-timeout'), idleMs);
    };
    const send = (message) => {
      try {
        socket.send(message);
      } catch {
        finish('socket-send-failed');
      }
    };
    const requestPage = () => {
      resetIdle();
      send(`42/extension,${page}["requestDraftCompanionSearch","",${page},20]`);
    };
    signal?.addEventListener('abort', abort, { once: true });
    resetIdle();
    socket.addEventListener('error', () => finish('socket-connection-failed'));
    socket.addEventListener('close', () => finish('socket-closed-early'));
    socket.addEventListener('message', (event) => {
      if (done) return;
      if (typeof event.data !== 'string') return finish('unexpected-binary-frame');
      const message = event.data;
      const size = new TextEncoder().encode(message).length;
      receivedBytes += size;
      if (size > 1024 * 1024 || receivedBytes > 8 * 1024 * 1024) return finish('socket-byte-limit');
      if (message.startsWith('0')) {
        send('40/extension,');
        return;
      }
      if (message.startsWith('2')) {
        send(`3${message.slice(1)}`);
        return;
      }
      if (message.startsWith('44/extension')) return finish('extension-access-rejected');
      if (message.startsWith('40/extension') && !connected) {
        connected = true;
        resetIdle();
        send('42/extension,0["requestCompanion"]');
        return;
      }
      const match = message.match(/^43\/extension,(\d+)(\[.*\])$/s);
      // Ignore unrelated acknowledgements; they must never advance pagination.
      if (!connected || !match) return;
      if (Number(match[1]) === 0 && companionState === 'unknown') {
        let companion;
        try {
          companion = JSON.parse(match[2])?.[0];
        } catch {
          return finish('invalid-companion-response');
        }
        if (companion === 0) {
          companionState = 'missing';
          requestPage();
          return;
        }
        if (!companion || typeof companion !== 'object' || Array.isArray(companion))
          return finish('invalid-companion-response');
        companionState = 'present';
        requestPage();
        return;
      }
      if (companionState === 'unknown' || Number(match[1]) !== page) return;
      let payload;
      try {
        payload = JSON.parse(match[2])?.[0];
      } catch {
        return finish('invalid-page-json');
      }
      const rawCount = payload?.pagination?.totalPages;
      const count =
        typeof rawCount === 'string' && /^\d+$/.test(rawCount) ? Number(rawCount) : rawCount;
      pageDiagnostics = {
        payloadType: payload === null ? 'null' : typeof payload,
        hasData: Array.isArray(payload?.data),
        totalPagesType: typeof rawCount,
        ...(Array.isArray(payload?.data) ? { dataLength: payload.data.length } : {}),
        ...(Number.isSafeInteger(count) ? { totalPages: count } : {}),
      };
      if (count === 0 && Array.isArray(payload?.data) && payload.data.length === 0 && page === 1)
        return finish('empty-result');
      if (
        !Array.isArray(payload?.data) ||
        !Number.isSafeInteger(count) ||
        count < page ||
        count > maxPages ||
        payload.data.length > 20
      ) {
        return finish('invalid-pagination');
      }
      if (totalPages !== undefined && totalPages !== count) return finish('pagination-changed');
      totalPages = count;
      received += payload.data.length;
      for (const raw of payload.data) {
        const player = playerRecord(raw);
        if (player) players.set(player.name, player);
        else skipped++;
      }
      if (page === totalPages) return finish(players.size ? null : 'empty-result');
      if (!payload.data.length) return finish('empty-intermediate-page');
      page++;
      requestPage();
    });
  });
}
