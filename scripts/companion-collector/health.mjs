import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { sanitizeHealth } from './health-contract.mjs';
import { STREAMERS } from './automation-core.mjs';

export async function createHealthReport(
  directory,
  state,
  { live = [], liveCheck = 'unknown', collectorState = 'running' } = {}
) {
  let sessionFile = 'missing',
    cookieExpiresAt = null,
    sessionSavedAt = null;
  try {
    const path = join(directory, '.auth/state.json');
    const saved = JSON.parse(await readFile(path, 'utf8'));
    const cookie = saved.cookies?.find(
      (c) => c.name === 'auth-token' && c.value && /(^|\.)twitch\.tv$/.test(c.domain)
    );
    if (cookie) {
      sessionFile = 'present';
      if (Number.isFinite(cookie.expires) && cookie.expires > 0)
        cookieExpiresAt = new Date(cookie.expires * 1000).toISOString();
      sessionSavedAt = (await stat(path)).mtime.toISOString();
    }
  } catch {
    /* Report missing/unreadable state without exposing credential contents. */
  }
  let autoJoin = null;
  try {
    const path = join(directory, 'results/autojoin/status.json');
    if ((await stat(path)).size <= 128 * 1024) autoJoin = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    /* A missing status is reported as unavailable, without exposing raw files. */
  }
  return sanitizeHealth({
    reportedAt: new Date().toISOString(),
    collectorState,
    liveCheck,
    sessionFile,
    cookieExpiresAt,
    sessionSavedAt,
    attemptsToday: state?.day === new Date().toISOString().slice(0, 10) ? state.attempts : 0,
    autoJoin,
    channels: STREAMERS.map((streamer) => {
      const c = state?.channels?.[streamer] || {};
      return {
        ...c,
        streamer,
        live: live.includes(streamer),
        nextAttempt: Number.isSafeInteger(c.nextAttempt)
          ? new Date(c.nextAttempt).toISOString()
          : null,
      };
    }),
  });
}

export async function sendHealth(config, report, fetchImpl = fetch) {
  const endpoint = new URL(config.endpoint);
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  )
    throw new Error('Invalid endpoint.');
  endpoint.pathname = '/api/companion-health';
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.token}` },
    body: JSON.stringify(sanitizeHealth(report)),
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error('Health delivery failed.');
}
