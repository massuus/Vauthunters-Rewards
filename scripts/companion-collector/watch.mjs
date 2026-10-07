import process from 'node:process';
import { execFile } from 'node:child_process';
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseEnv } from 'node:util';
import { createLiveChecker } from './live-status.mjs';
import { watchOnce } from './watch-core.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const trialId = process.env.COLLECTOR_TRIAL_ID;
if (!/^\d{8}T\d{6}Z$/.test(trialId || ''))
  throw new Error('A unique COLLECTOR_TRIAL_ID is required.');
const results = join(directory, 'results', 'trials', trialId);
const configPath = '/home/ubuntu/vault-pinger/.env';
const streamers = [
  'hoy_82',
  'iskall85',
  'therealhellfirem4ge',
  'linahun',
  'master_cwg',
  'mayaicefire',
  'stressmonstah',
];
const controller = new AbortController();
process.once('SIGTERM', () => controller.abort());
process.once('SIGINT', () => controller.abort());
const report = async (result) => {
  const summary = { ...result, time: new Date().toISOString(), uploaded: false };
  const temporary = join(results, `watch-status-${process.pid}.tmp`);
  await writeFile(temporary, JSON.stringify(summary, null, 2), { mode: 0o600 });
  await rename(temporary, join(results, 'watch-status.json'));
  await appendFile(join(results, 'history.jsonl'), `${JSON.stringify(summary)}\n`, { mode: 0o600 });
  if (result.attemptFinished && streamers.includes(result.streamer)) {
    await writeFile(
      join(results, `${result.streamer}-status.json`),
      JSON.stringify(summary, null, 2),
      { mode: 0o600 }
    );
  }
  process.stdout.write(`${JSON.stringify(summary)}\n`);
};

const collect = (streamer) =>
  new Promise((resolve) => {
    execFile(
      '/usr/bin/timeout',
      [
        '-k',
        '5',
        '150',
        process.execPath,
        join(directory, 'collect.mjs'),
        '--streamer',
        streamer,
        '--storage-state',
        join(directory, '.auth/state.json'),
        '--output',
        join(results, `${streamer}.json`),
      ],
      { cwd: directory, maxBuffer: 128 * 1024, signal: controller.signal },
      (error, stdout) => {
        try {
          const result = JSON.parse(stdout.trim());
          if (!['collected', 'failed', 'skipped'].includes(result.status)) throw new Error();
          const safe = { status: result.status };
          const diagnostic = result.diagnostics;
          if (diagnostic && typeof diagnostic === 'object') {
            safe.diagnostics = {};
            if (['unknown', 'missing', 'present'].includes(diagnostic.companionState))
              safe.diagnostics.companionState = diagnostic.companionState;
            for (const key of ['page', 'totalPages', 'dataLength']) {
              if (Number.isSafeInteger(diagnostic[key])) safe.diagnostics[key] = diagnostic[key];
            }
            if (typeof diagnostic.hasData === 'boolean')
              safe.diagnostics.hasData = diagnostic.hasData;
            for (const key of ['payloadType', 'totalPagesType']) {
              if (
                ['undefined', 'object', 'string', 'number', 'boolean', 'null'].includes(
                  diagnostic[key]
                )
              )
                safe.diagnostics[key] = diagnostic[key];
            }
          }
          if (typeof result.code === 'string' && /^[a-z-]{1,80}$/.test(result.code))
            safe.code = result.code;
          for (const key of [
            'players',
            'pages',
            'skipped',
            'socketBytes',
            'browserBytes',
            'requests',
            'blocked',
            'elapsedMs',
          ]) {
            if (Number.isFinite(result[key]) && result[key] >= 0) safe[key] = result[key];
          }
          if (error && safe.status === 'collected')
            return resolve({ status: 'failed', code: 'collector-exit-error' });
          resolve(safe);
        } catch {
          resolve({ status: 'failed', code: 'collector-no-result' });
        }
      }
    );
  });

try {
  await mkdir(results, { recursive: true, mode: 0o700 });
  // A unique trial directory preserves all previous reports and limits restart budgets.
  await writeFile(
    join(results, 'watch-start.json'),
    JSON.stringify({
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 48 * 60 * 60_000).toISOString(),
      streamers,
      maxAttempts: streamers.length,
    }),
    { mode: 0o600, flag: 'wx' }
  );
  await writeFile(
    join(directory, 'results', 'latest-trial.json'),
    JSON.stringify({ trialId, results }, null, 2),
    { mode: 0o600 }
  );
  const config = parseEnv(await readFile(configPath, 'utf8'));
  const checkLive = createLiveChecker({
    clientId: config.TWITCH_CLIENT_ID,
    clientSecret: config.TWITCH_CLIENT_SECRET,
    signal: controller.signal,
  });
  const result = await watchOnce({
    streamers,
    checkLive,
    collect,
    onStatus: report,
    signal: controller.signal,
    maxAttempts: streamers.length,
    maxChecks: 192,
    durationMs: 48 * 60 * 60_000,
  });
  if (!result.attemptFinished) await report(result);
} catch {
  // Do not expose environment contents, browser URLs, or upstream error messages.
  process.stderr.write(
    'Trial watcher could not start or save its report. Existing start marker is never overwritten.\n'
  );
  process.exitCode = 1;
}
