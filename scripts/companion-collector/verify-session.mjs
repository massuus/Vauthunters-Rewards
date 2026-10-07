import process from 'node:process';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { shouldBlockRequest } from './policy.mjs';

const { values } = parseArgs({ options: { 'storage-state': { type: 'string' } } });
let browser;
let verified = false;
let requests = 0;
let bytes = 0;
const timer = setTimeout(() => {
  void browser?.close().catch(() => {});
}, 50_000);
try {
  browser = await chromium.launch({ headless: true, timeout: 20_000 });
  const context = await browser.newContext({
    storageState: values['storage-state'],
    serviceWorkers: 'block',
  });
  await context.route('**/*', (route) => {
    requests++;
    if (
      requests > 800 ||
      bytes > 30 * 1024 * 1024 ||
      shouldBlockRequest(route.request().url(), route.request().resourceType())
    )
      return route.abort().catch(() => {});
    return route.continue().catch(() => {});
  });
  context.on('requestfinished', async (request) => {
    try {
      const size = await request.sizes();
      bytes += size.responseBodySize + size.responseHeadersSize;
    } catch {
      /* Browser closed. */
    }
  });
  const page = await context.newPage();
  page.on('response', async (response) => {
    if (new URL(response.url()).hostname !== 'gql.twitch.tv') return;
    try {
      const body = await response.json();
      for (const item of Array.isArray(body) ? body : [body]) {
        if (item?.data?.currentUser?.id) verified = true;
      }
    } catch {
      /* Never log response bodies or account IDs. */
    }
  });
  await page.goto('https://www.twitch.tv/hoy_82', {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  const deadline = Date.now() + 20_000;
  while (!verified && Date.now() < deadline) await page.waitForTimeout(500);
} catch {
  /* Browser errors may contain credentials. */
} finally {
  clearTimeout(timer);
  await browser?.close().catch(() => {});
}
process.stdout.write(`${JSON.stringify({ verified, requests, bytes })}\n`);
process.exitCode = verified ? 0 : 1;
