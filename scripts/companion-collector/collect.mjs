import process from 'node:process';
import { mkdir, rename, writeFile, rm, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs, parseEnv } from 'node:util';
import { chromium } from 'playwright';
import { CollectorError, retrievePlayers, validateSocketUrl } from './socket.mjs';
import { EXTENSION_HOST, shouldBlockRequest } from './policy.mjs';
import { isStreamerLive } from './live-status.mjs';

const { values } = parseArgs({
  options: {
    streamer: { type: 'string', default: 'hoy_82' },
    'storage-state': { type: 'string' },
    output: { type: 'string' },
    'live-check-env-file': { type: 'string' },
  },
});
const streamer = values.streamer.toLowerCase();
if (!/^[a-z0-9_]{1,25}$/.test(streamer)) throw new CollectorError('invalid-streamer');

const started = Date.now();
const controller = new AbortController();
const metrics = { requests: 0, blocked: 0, browserBytes: 0 };
let browser;
let socketUrl;
let failure;
let shuttingDown = false;
const stop = (code) => {
  if (shuttingDown) return;
  shuttingDown = true;
  failure = code;
  controller.abort();
  void browser?.close().catch(() => {});
};
const timer = setTimeout(() => stop('run-time-limit'), 120_000);
process.once('SIGTERM', () => stop('interrupted'));
process.once('SIGINT', () => stop('interrupted'));
const report = (result) =>
  process.stdout.write(
    `${JSON.stringify({
      streamer,
      ...result,
      ...metrics,
      elapsedMs: Date.now() - started,
    })}\n`
  );

async function run() {
  try {
    if (values['live-check-env-file']) {
      const config = parseEnv(await readFile(values['live-check-env-file'], 'utf8'));
      const live = await isStreamerLive(streamer, {
        clientId: config.TWITCH_CLIENT_ID,
        clientSecret: config.TWITCH_CLIENT_SECRET,
        signal: controller.signal,
      });
      if (!live) {
        report({ status: 'skipped', code: 'streamer-offline', uploaded: false });
        return;
      }
    }
    browser = await chromium.launch({ headless: true, timeout: 20_000 });
    const context = await browser.newContext({
      serviceWorkers: 'block',
      viewport: { width: 1280, height: 720 },
      ...(values['storage-state'] ? { storageState: values['storage-state'] } : {}),
    });
    await context.route('**/*', async (route) => {
      metrics.requests++;
      if (metrics.requests > 800) stop('request-limit');
      if (
        shuttingDown ||
        shouldBlockRequest(route.request().url(), route.request().resourceType())
      ) {
        metrics.blocked++;
        return route.abort().catch(() => {});
      }
      return route.continue().catch(() => {});
    });
    context.on('requestfinished', async (request) => {
      try {
        const size = await request.sizes();
        metrics.browserBytes += size.responseBodySize + size.responseHeadersSize;
        // A stop threshold, not a strict network quota: in-flight requests can overshoot.
        if (metrics.browserBytes > 30 * 1024 * 1024) stop('browser-byte-limit');
      } catch {
        /* A closed browser has no further size report. */
      }
    });
    const page = await context.newPage();
    page.on('websocket', (socket) => {
      try {
        socketUrl = validateSocketUrl(socket.url(), streamer);
      } catch {
        /* Other extensions/chat. */
      }
    });
    await page.goto(`https://www.twitch.tv/${streamer}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    const discoveryDeadline = Date.now() + 45_000;
    let accessRequiredSince;
    while (!socketUrl && Date.now() < discoveryDeadline && !shuttingDown) {
      const extension = page.frames().find((frame) => {
        try {
          return new URL(frame.url()).hostname === EXTENSION_HOST;
        } catch {
          return false;
        }
      });
      if (extension) {
        const needsAccess = await extension
          .locator('body')
          .innerText({ timeout: 1_000 })
          .then((text) => text.includes('ACCESS REQUIRED'))
          .catch(() => false);
        // Allow initial authorization to settle before reporting a login requirement.
        if (needsAccess) accessRequiredSince ??= Date.now();
        else accessRequiredSince = undefined;
        if (accessRequiredSince && Date.now() - accessRequiredSince > 8_000)
          throw new CollectorError('login-or-extension-access-required');
      }
      await page.waitForTimeout(500);
    }
    if (shuttingDown) throw new CollectorError(failure);
    if (!socketUrl) throw new CollectorError('companion-socket-not-found');
    const result = await retrievePlayers(socketUrl, streamer, { signal: controller.signal });
    if (shuttingDown) throw new CollectorError(failure);
    if (values.output) {
      const output = resolve(values.output);
      const temporary = `${output}.tmp-${process.pid}`;
      await mkdir(dirname(output), { recursive: true, mode: 0o700 });
      try {
        await writeFile(
          temporary,
          JSON.stringify({
            streamer,
            collectedAt: new Date().toISOString(),
            players: result.players,
          }),
          { mode: 0o600, flag: 'wx' }
        );
        await rename(temporary, output);
      } finally {
        await rm(temporary, { force: true });
      }
    }
    report({
      status: 'collected',
      players: result.players.length,
      pages: result.pages,
      skipped: result.skipped,
      socketBytes: result.receivedBytes,
      diagnostics: result.diagnostics,
      uploaded: false,
    });
  } catch (error) {
    // Browser errors can contain credential-bearing URLs; never print raw errors.
    const code =
      failure || (error instanceof CollectorError ? error.code : 'browser-or-file-error');
    report({
      status: 'failed',
      code,
      uploaded: false,
      ...(error instanceof CollectorError && error.diagnostics
        ? { diagnostics: error.diagnostics }
        : {}),
    });
    process.exitCode = code === 'login-or-extension-access-required' ? 2 : 1;
  } finally {
    clearTimeout(timer);
    await browser?.close().catch(() => {});
  }
}

await run();
