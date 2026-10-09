import { readFileSync, writeFileSync, renameSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTokenProvider } from './auth.mjs';
import { PresenceConnection } from './connection.mjs';
import { JoinCoordinator } from './coordinator.mjs';
import { createLiveChecker } from '../live-status.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SAFE_CODES = new Set([
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
]);
const safeCode = (error) =>
  SAFE_CODES.has(error?.code || error) ? error.code || error : 'socket-disconnected';

export function startAutoJoin({
  channels,
  username,
  clientId,
  clientSecret,
  sendChat,
  notify,
  storageStatePath = join(ROOT, '.auth/state.json'),
  results = join(ROOT, 'results/autojoin'),
  cooldownMs,
  passive = false,
  log = (message) => process.stdout.write(`${message}\n`),
}) {
  if (
    !Array.isArray(channels) ||
    channels.length > 8 ||
    channels.some((c) => !/^[a-z0-9_]{1,25}$/.test(c))
  )
    throw new Error('Invalid auto-join channels.');
  mkdirSync(results, { recursive: true, mode: 0o700 });
  const statePath = join(results, 'state.json');
  const statusPath = join(results, 'status.json');
  let state;
  try {
    if (statSync(statePath).size > 128 * 1024) throw new Error();
    state = JSON.parse(readFileSync(statePath, 'utf8'));
    if (
      state.version !== 1 ||
      !state.channels ||
      typeof state.channels !== 'object' ||
      Object.keys(state.channels).some((c) => !channels.includes(c)) ||
      !state.budget ||
      !Number.isSafeInteger(state.budget.tokens) ||
      !Number.isSafeInteger(state.budget.connections) ||
      !Number.isFinite(state.budget.bytes)
    )
      throw new Error();
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Invalid auto-join state; refusing to reset.');
    state = { version: 1, channels: {}, budget: { day: '', tokens: 0, connections: 0, bytes: 0 } };
  }
  const atomic = (path, data) => {
    writeFileSync(`${path}.tmp`, JSON.stringify(data), { mode: 0o600 });
    renameSync(`${path}.tmp`, path);
  };
  const save = () => atomic(statePath, state);
  const connections = new Map();
  const tokens = new Map(); // Credential-bearing URLs stay in memory only.
  const runtime = new Map(
    channels.map((c) => [c, { status: 'waiting', nextAttempt: 0, failures: 0 }])
  );
  let live = new Set(),
    liveCheckedAt = 0,
    liveCheck = 'unknown',
    stopped = false,
    ticking = false;
  let authMtime = 0;
  const controller = new AbortController();
  const authorize = createTokenProvider({ storageStatePath, username });
  const checkLive = createLiveChecker({ clientId, clientSecret, signal: controller.signal });
  const coordinator = new JoinCoordinator({
    state,
    save,
    cooldownMs,
    passive,
    sendChat,
    notify,
    getConnection: (c) => connections.get(c),
  });
  // These values describe a particular socket session. Rebuild them from the
  // server after every process start instead of reusing a stale open window.
  for (const streamer of channels) {
    const c = coordinator.channel(streamer);
    c.open = false;
    c.vaultRunning = false;
    c.vaultStartedAt = null;
  }
  save();
  const updateVaultState = (streamer, running) => {
    const c = coordinator.channel(streamer);
    if (running && c.vaultRunning !== true) c.vaultStartedAt = Date.now();
    if (c.vaultRunning === true && !running) {
      c.collectionRequestedAt = Date.now();
      c.lastVaultEndedAt = Date.now();
      c.vaultStartedAt = null;
    }
    c.vaultRunning = running;
    save();
  };
  const run = (promise) => void Promise.resolve(promise).catch(() => failClosed());
  const status = () => {
    const now = new Date().toISOString();
    atomic(statusPath, {
      checkedAt: now,
      mode: passive ? 'passive' : 'active',
      state: stopped ? 'stopped' : 'running',
      liveCheck,
      tokensToday: state.budget.tokens,
      connectionsToday: state.budget.connections,
      socketBytesToday: state.budget.bytes,
      channels: channels.map((streamer) => {
        const c = state.channels[streamer] || {};
        const r = runtime.get(streamer);
        return {
          streamer,
          live: live.has(streamer),
          connected: connections.get(streamer)?.ready === true,
          status: r.status,
          issue: c.issue || r.issue || null,
          windowOpen: connections.get(streamer)?.presence === true,
          vaultRunning: c.vaultRunning === true,
          vaultStartedAt:
            c.vaultRunning === true && c.vaultStartedAt
              ? new Date(c.vaultStartedAt).toISOString()
              : null,
          lastVaultEndedAt: c.lastVaultEndedAt ? new Date(c.lastVaultEndedAt).toISOString() : null,
          lastWindowAt: c.window?.openedAt ? new Date(c.window.openedAt).toISOString() : null,
          lastActionAt: c.lastAction?.at ? new Date(c.lastAction.at).toISOString() : null,
          method: c.lastAction?.method || null,
          outcome: c.lastAction?.outcome || null,
          confirmedAt: c.lastAction?.confirmedAt
            ? new Date(c.lastAction.confirmedAt).toISOString()
            : null,
          notificationFailed: c.notificationFailed === true,
        };
      }),
    });
  };
  function failClosed() {
    if (stopped) return;
    stopped = true;
    controller.abort();
    for (const connection of connections.values()) connection.close();
    connections.clear();
    log('[autojoin] Socket automation stopped; check its saved state.');
    try {
      status();
    } catch {
      /* A stale heartbeat remains visible. */
    }
  }
  function budget() {
    const day = new Date().toISOString().slice(0, 10);
    if (state.budget.day !== day) {
      state.budget = { day, tokens: 0, connections: 0, bytes: 0 };
      save();
    }
    return state.budget;
  }
  function connect(streamer, auth) {
    const r = runtime.get(streamer);
    budget().connections++;
    save();
    r.nextAttempt = Date.now() + 60_000;
    r.status = 'connecting';
    let minute = 0,
      minuteBytes = 0;
    const connection = new PresenceConnection(auth.url, streamer, {
      onBytes(size) {
        const current = Math.floor(Date.now() / 60_000);
        if (current !== minute) {
          minute = current;
          minuteBytes = 0;
        }
        minuteBytes += size;
        budget().bytes += size;
        return minuteBytes <= 2 * 1024 * 1024 && state.budget.bytes <= 64 * 1024 * 1024;
      },
      onPresence(open) {
        if (!stopped) run(coordinator.presence(streamer, open));
      },
      onVaultState(running) {
        updateVaultState(streamer, running);
      },
      onCompanion(current, previous) {
        if (current.activeThisVault === true) updateVaultState(streamer, true);
        else if (previous?.activeThisVault === true && current.activeThisVault === false)
          updateVaultState(streamer, false);
        if (!previous) return;
        const increased = ['vaultsJoined', 'totalXp', 'seasonLevel'].some(
          (key) =>
            Number.isFinite(Number(current[key])) && Number(current[key]) > Number(previous[key])
        );
        if (increased) {
          coordinator.channel(streamer).collectionRequestedAt = Date.now();
          save();
        }
      },
      onReady() {
        if (stopped) return;
        r.status = 'connected';
        r.issue = null;
        r.failures = 0;
        log(`[autojoin] ${streamer}: socket authenticated`);
        run(
          (async () => {
            const companion = await connection.readCompanion();
            const c = coordinator.channel(streamer);
            c.issue = !companion
              ? 'no-companion'
              : companion.state === 'UNDEAD'
                ? 'companion-unavailable'
                : null;
            save();
            await coordinator.join(streamer);
          })().catch(() => connection.close('invalid-socket-data'))
        );
      },
      onClose(code) {
        if (stopped) return;
        if (connections.get(streamer) !== connection) return;
        connections.delete(streamer);
        r.status = 'fallback';
        r.issue = safeCode(code);
        r.failures++;
        // Opening the extension yourself can replace this viewer connection. Retry later.
        r.nextAttempt = Date.now() + 10 * 60_000;
        if (code === 'extension-access-required') {
          tokens.delete(streamer);
          r.nextAttempt = Date.now() + 5 * 60_000;
        }
        log(`[autojoin] ${streamer}: ${r.issue}; chat fallback available`);
      },
    });
    connections.set(streamer, connection);
  }
  async function tick() {
    if (stopped || ticking) return;
    ticking = true;
    try {
      budget();
      try {
        const mtime = statSync(storageStatePath).mtimeMs;
        if (authMtime && authMtime !== mtime) {
          tokens.clear();
          for (const r of runtime.values()) r.nextAttempt = 0;
        }
        authMtime = mtime;
      } catch {
        /* Authorization will report the missing login. */
      }
      try {
        live = new Set(await checkLive(channels));
        liveCheckedAt = Date.now();
        liveCheck = 'ok';
      } catch {
        liveCheck = 'failed';
      }
      if (stopped) return;
      for (const streamer of channels) {
        if (stopped) break;
        const r = runtime.get(streamer);
        const connection = connections.get(streamer);
        if (!live.has(streamer) || Date.now() - liveCheckedAt > 5 * 60_000) {
          if (connection) {
            connections.delete(streamer);
            connection.close();
          }
          r.status = liveCheck === 'ok' ? 'offline' : 'fallback';
          r.issue = liveCheck === 'ok' ? null : 'live-check-failed';
          continue;
        }
        if (state.budget.bytes >= 64 * 1024 * 1024 || state.budget.connections >= 512) {
          if (connection) {
            connections.delete(streamer);
            connection.close();
          }
          r.status = 'fallback';
          r.issue = 'resource-limit';
          continue;
        }
        if (Date.now() < r.nextAttempt) continue;
        let auth = tokens.get(streamer);
        if (connection && auth?.expiresAt > Date.now() + 120_000) continue;
        if (!auth || auth.expiresAt <= Date.now() + 120_000) {
          if (state.budget.tokens >= 256) {
            r.issue = 'resource-limit';
            continue;
          }
          state.budget.tokens++;
          save();
          try {
            auth = await authorize(streamer);
            tokens.set(streamer, auth);
          } catch (error) {
            r.status = 'fallback';
            r.issue = safeCode(error);
            r.failures++;
            r.nextAttempt =
              Date.now() +
              (['login-required', 'wrong-account', 'extension-access-required'].includes(r.issue)
                ? 60 * 60_000
                : Math.min(60, 5 * 2 ** Math.min(r.failures - 1, 4)) * 60_000);
            if (connection && (!auth || auth.expiresAt <= Date.now())) {
              connections.delete(streamer);
              connection.close();
            }
            log(`[autojoin] ${streamer}: ${r.issue}; chat fallback available`);
            continue;
          }
        }
        if (stopped) break;
        if (connection) {
          connections.delete(streamer);
          connection.close();
        }
        connect(streamer, auth);
      }
      save();
      status();
    } finally {
      ticking = false;
    }
  }
  status();
  const interval = setInterval(() => run(tick()), 60_000);
  const heartbeat = setInterval(() => {
    try {
      save();
      status();
    } catch {
      failClosed();
    }
  }, 30_000);
  run(tick());
  return {
    async onChat(streamer) {
      if (!channels.includes(streamer)) return;
      // Even if sockets fail, keep durable chat cooldowns in the same coordinator.
      await coordinator.chat(streamer);
    },
    stop() {
      stopped = true;
      controller.abort();
      clearInterval(interval);
      clearInterval(heartbeat);
      for (const connection of connections.values()) connection.close();
      connections.clear();
      tokens.clear();
      try {
        save();
        status();
      } catch {
        /* No secret-bearing errors. */
      }
    },
  };
}
