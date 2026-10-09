import process from 'node:process';
import { readFile, writeFile, mkdir, rename, appendFile, readdir, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { createLiveChecker } from './live-status.mjs';
import { STREAMERS, automationTick, validateState } from './automation-core.mjs';
import { collectChannel, uploadSnapshot } from './automation-io.mjs';
import { createHealthReport, sendHealth } from './health.mjs';
import { healthEventFingerprint } from './health-events.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const results = join(directory, 'results', 'automation');
const controller = new AbortController();
process.once('SIGTERM', () => controller.abort());
process.once('SIGINT', () => controller.abort());
async function atomic(path, data) {
  await writeFile(`${path}.tmp`, JSON.stringify(data, null, 2), { mode: 0o600 });
  await rename(`${path}.tmp`, path);
}
let config;
let state;
let healthQueue = Promise.resolve();
async function heartbeat(details) {
  try {
    await sendHealth(config, await createHealthReport(directory, state, details));
  } catch {
    process.stderr.write('Collector health report could not be delivered.\n');
  }
}
function queuedHeartbeat(details = {}) {
  healthQueue = healthQueue.then(() => heartbeat(details));
  return healthQueue;
}
try {
  await mkdir(results, { recursive: true, mode: 0o700 });
  config = JSON.parse(await readFile(join(directory, '.auth/sync.json'), 'utf8'));
  if (!/^[a-f0-9]{64}$/.test(config.token)) throw new Error('Missing sync token.');
  const bot = parseEnv(await readFile('/home/ubuntu/vault-pinger/.env', 'utf8'));
  const checkLive = createLiveChecker({
    clientId: bot.TWITCH_CLIENT_ID,
    clientSecret: bot.TWITCH_CLIENT_SECRET,
    signal: controller.signal,
  });
  const statePath = join(results, 'state.json');
  try {
    state = JSON.parse(await readFile(statePath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Invalid budget state; refusing to reset.');
    state = { channels: {} };
  }
  validateState(state);
  const autoJoinStatusPath = join(results, '..', 'autojoin', 'status.json');
  let lastHealthFingerprint = null;
  let healthDebounce = null;
  const inspectAutoJoinStatus = async () => {
    try {
      const status = JSON.parse(await readFile(autoJoinStatusPath, 'utf8'));
      const fingerprint = healthEventFingerprint(status);
      if (!fingerprint || fingerprint === lastHealthFingerprint) return;
      lastHealthFingerprint = fingerprint;
      clearTimeout(healthDebounce);
      healthDebounce = setTimeout(() => void queuedHeartbeat(), 5_000);
    } catch (error) {
      if (error.code !== 'ENOENT')
        process.stderr.write('Auto-join live status could not be read.\n');
    }
  };
  await inspectAutoJoinStatus();
  const healthEvents = setInterval(() => void inspectAutoJoinStatus(), 5_000);
  const healthFallback = setInterval(() => void queuedHeartbeat(), 5 * 60_000);
  controller.signal.addEventListener(
    'abort',
    () => {
      clearInterval(healthEvents);
      clearInterval(healthFallback);
      clearTimeout(healthDebounce);
    },
    { once: true }
  );
  const report = async (result) => {
    const summary = { ...result, time: new Date().toISOString() };
    await atomic(join(results, 'status.json'), summary);
    await appendFile(
      join(results, `history-${summary.time.slice(0, 10)}.jsonl`),
      `${JSON.stringify(summary)}\n`,
      { mode: 0o600 }
    );
    // Keep 14 daily logs, seven latest snapshots and one state file; no unbounded growth.
    const histories = (await readdir(results))
      .filter((name) => /^history-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))
      .sort();
    for (const name of histories.slice(0, -14)) await unlink(join(results, name));
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  };
  while (!controller.signal.aborted) {
    let live = [];
    let liveCheck = 'ok';
    try {
      live = await checkLive(STREAMERS);
    } catch {
      liveCheck = 'failed';
      await report({ status: 'waiting', code: 'live-check-failed' });
    }
    if (controller.signal.aborted) break;
    // Vault-end requests come from the lightweight socket process. They may move a
    // collection forward, but never bypass the one-hour or daily browser budgets.
    try {
      const joins = JSON.parse(
        await readFile(join(results, '..', 'autojoin', 'state.json'), 'utf8')
      );
      for (const streamer of STREAMERS) {
        const requested = joins.channels?.[streamer]?.collectionRequestedAt;
        const channel = state.channels[streamer] || (state.channels[streamer] = {});
        if (Number.isSafeInteger(requested) && requested > (channel.refreshHandledAt || 0)) {
          channel.refreshHandledAt = requested;
          const last = Date.parse(channel.lastCollection?.time || '') || 0;
          channel.nextAttempt = Math.min(
            channel.nextAttempt || Infinity,
            Math.max(requested, last + 3600_000)
          );
        }
      }
      await atomic(statePath, state);
    } catch (error) {
      if (error.code !== 'ENOENT')
        process.stderr.write('Auto-join refresh request could not be read.\n');
    }
    await automationTick({
      state,
      live,
      signal: controller.signal,
      collect: (streamer) => collectChannel(directory, results, streamer, controller.signal),
      upload: (streamer) =>
        uploadSnapshot({ results, streamer, token: config.token, endpoint: config.endpoint }),
      save: (value) => atomic(statePath, value),
      report,
    });
    await report({ status: 'waiting', live, attemptsToday: state.attempts || 0 });
    await queuedHeartbeat({ live, liveCheck });
    if (process.argv.includes('--once')) break;
    await delay(15 * 60_000, undefined, { signal: controller.signal }).catch(() => {});
  }
} catch {
  if (config) await queuedHeartbeat({ collectorState: 'stopped' });
  process.stderr.write(
    'Companion automation stopped; check saved state and private configuration.\n'
  );
  process.exitCode = 1;
}
