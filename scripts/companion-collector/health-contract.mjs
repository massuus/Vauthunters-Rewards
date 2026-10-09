// Shared wire contract: explicitly allowlisted metadata only, never raw logs/cookies/URLs.
const STREAMERS = [
  'hoy_82',
  'iskall85',
  'therealhellfirem4ge',
  'linahun',
  'mastercwg',
  'mayaicefire',
  'stressmonstah',
];
const CODES = new Set([
  'login-or-extension-access-required',
  'extension-access-rejected',
  'empty-result',
  'companion-socket-not-found',
  'invalid-companion-response',
  'invalid-page-json',
  'invalid-pagination',
  'invalid-socket-url',
  'empty-intermediate-page',
  'pagination-changed',
  'run-time-limit',
  'request-limit',
  'browser-byte-limit',
  'socket-byte-limit',
  'socket-closed-early',
  'socket-connection-failed',
  'socket-idle-timeout',
  'socket-send-failed',
  'socket-time-limit',
  'unexpected-binary-frame',
  'browser-or-file-error',
  'collector-no-result',
  'collector-failed',
  'collector-exit-error',
  'interrupted',
  'streamer-offline',
  'upload-unavailable',
  'upload-too-large',
  'unknown-error',
  ...[400, 401, 403, 404, 408, 409, 413, 415, 429, 500, 502, 503, 504].map(
    (n) => `upload-http-${n}`
  ),
]);
const date = (value) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
const count = (value) =>
  Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000 ? value : 0;
const bytes = (value) =>
  Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000 ? value : 0;
const JOIN_ISSUES = new Set([
  'login-required',
  'wrong-account',
  'extension-access-required',
  'extension-unavailable',
  'token-request-failed',
  'response-limit',
  'connection-timeout',
  'socket-disconnected',
  'heartbeat-timeout',
  'invalid-socket-data',
  'resource-limit',
  'live-check-failed',
  'no-companion',
  'companion-unavailable',
  'game-offline',
  'passive-window-observed',
  'join-unconfirmed',
  'socket-read-failed',
]);
function autoJoin(value) {
  if (!value || !date(value.checkedAt)) return null;
  return {
    checkedAt: date(value.checkedAt),
    state: value.state === 'stopped' ? 'stopped' : 'running',
    mode: value.mode === 'active' ? 'active' : 'passive',
    liveCheck: ['ok', 'failed', 'unknown'].includes(value.liveCheck) ? value.liveCheck : 'unknown',
    tokensToday: count(value.tokensToday),
    connectionsToday: count(value.connectionsToday),
    socketBytesToday: bytes(value.socketBytesToday),
    channels: STREAMERS.map((streamer) => {
      const c = Array.isArray(value.channels)
        ? value.channels.find((row) => row?.streamer === streamer)
        : null;
      return {
        streamer,
        live: c?.live === true,
        connected: c?.connected === true,
        status: ['waiting', 'connecting', 'connected', 'offline', 'fallback'].includes(c?.status)
          ? c.status
          : 'waiting',
        issue: JOIN_ISSUES.has(c?.issue) ? c.issue : null,
        windowOpen: c?.windowOpen === true,
        vaultRunning: c?.vaultRunning === true,
        vaultStartedAt: c?.vaultRunning === true ? date(c?.vaultStartedAt) : null,
        lastVaultEndedAt: date(c?.lastVaultEndedAt),
        lastWindowAt: date(c?.lastWindowAt),
        lastActionAt: date(c?.lastActionAt),
        method: ['socket', 'chat'].includes(c?.method) ? c.method : null,
        outcome: ['sending', 'confirmed', 'unconfirmed', 'chat-sent', 'chat-failed'].includes(
          c?.outcome
        )
          ? c.outcome
          : null,
        confirmedAt: date(c?.confirmedAt),
        notificationFailed: c?.notificationFailed === true,
      };
    }),
  };
}
function outcome(value) {
  if (
    !value ||
    !['collected', 'failed', 'skipped', 'imported', 'already-imported'].includes(value.status)
  )
    return null;
  return {
    status: value.status,
    code: value.status === 'failed' ? (CODES.has(value.code) ? value.code : 'unknown-error') : null,
    time: date(value.time),
    players: count(value.players),
  };
}
export function sanitizeHealth(value) {
  if (!value || !date(value.reportedAt) || !['running', 'stopped'].includes(value.collectorState))
    throw new Error('Invalid health report.');
  return {
    reportedAt: date(value.reportedAt),
    collectorState: value.collectorState,
    liveCheck: ['ok', 'failed', 'unknown'].includes(value.liveCheck) ? value.liveCheck : 'unknown',
    sessionFile: value.sessionFile === 'present' ? 'present' : 'missing',
    cookieExpiresAt: date(value.cookieExpiresAt),
    sessionSavedAt: date(value.sessionSavedAt),
    attemptsToday: count(value.attemptsToday),
    autoJoin: autoJoin(value.autoJoin),
    channels: STREAMERS.map((streamer) => {
      const c = Array.isArray(value.channels)
        ? value.channels.find((row) => row?.streamer === streamer)
        : null;
      return {
        streamer,
        live: c?.live === true,
        pending: c?.pending === true,
        nextAttempt: date(c?.nextAttempt),
        lastUploadedAt: date(c?.lastUploadedAt),
        lastCollection: outcome(c?.lastCollection),
        lastUpload: outcome(c?.lastUpload),
      };
    }),
  };
}
