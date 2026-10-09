import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanitizeHealth } from '../scripts/companion-collector/health-contract.mjs';
import { storeHealth, loadHealth } from '../functions/utils/companion-health.js';
import { onRequest as readStatus } from '../functions/api/admin/companion-health.js';
import { onRequest as writeStatus } from '../functions/api/companion-health.js';
import { renderCollectorHealth } from '../public/js/components/companion-health.js';
const sqlite = await import('node:sqlite').catch(() => null);
const now = Date.now();
const report = (extra) => ({
  reportedAt: new Date(now).toISOString(),
  collectorState: 'running',
  liveCheck: 'ok',
  sessionFile: 'present',
  cookieExpiresAt: new Date(now + 30 * 86400_000).toISOString(),
  channels: [],
  ...extra,
});
const escape = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

test('health contract discards credentials, raw errors, and unknown channels', () => {
  const safe = sanitizeHealth(
    report({
      token: 'SECRET',
      cookies: [{ value: 'SECRET' }],
      autoJoin: {
        checkedAt: new Date(now).toISOString(),
        state: 'running',
        mode: 'active',
        secret: 'SECRET',
        channels: [
          {
            streamer: 'mayaicefire',
            connected: true,
            status: 'connected',
            issue: 'SECRET',
            token: 'SECRET',
          },
          { streamer: 'SECRET', issue: 'login-required' },
        ],
      },
      channels: [
        {
          streamer: 'mayaicefire',
          url: 'SECRET',
          lastCollection: {
            status: 'failed',
            code: 'SECRET',
            message: 'SECRET',
            time: new Date(now).toISOString(),
          },
        },
        { streamer: 'SECRET' },
      ],
    })
  );
  assert.equal(JSON.stringify(safe).includes('SECRET'), false);
  assert.equal(safe.channels.length, 7);
  assert.equal(safe.autoJoin.channels.length, 7);
  assert.equal(safe.autoJoin.channels.find((c) => c.streamer === 'mayaicefire').issue, null);
  assert.equal(
    safe.channels.find((c) => c.streamer === 'mayaicefire').lastCollection.code,
    'unknown-error'
  );
});

test('ingestion requires the secret and limits health reports to 16 KiB', async () => {
  const env = { COMPANION_SYNC_TOKEN: 'a'.repeat(64) };
  assert.equal(
    (
      await writeStatus({
        env,
        request: new Request('https://example.test/api/companion-health', { method: 'POST' }),
      })
    ).status,
    401
  );
  const response = await writeStatus({
    env,
    request: new Request('https://example.test/api/companion-health', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.COMPANION_SYNC_TOKEN}`,
        'content-type': 'application/json',
      },
      body: ' '.repeat(17000),
    }),
  });
  assert.equal(response.status, 413);
});

test('status read rejects anonymous and ordinary users, permits admins, and is never cached', async () => {
  const env = {
    ADMIN_TWITCH_USER_IDS: 'admin',
    LEADERBOARD_DB: {
      prepare(sql) {
        return {
          bind() {
            return this;
          },
          async first() {
            if (sql.includes('auth_sessions'))
              return {
                twitch_user_id: 'viewer',
                expires_at: new Date(now + 86400_000).toISOString(),
                last_twitch_validation_at: new Date(now).toISOString(),
              };
            throw new Error('Unauthorized status read');
          },
        };
      },
    },
  };
  const url = 'https://example.test/api/admin/companion-health';
  assert.equal((await readStatus({ env, request: new Request(url) })).status, 401);
  assert.equal(
    (
      await readStatus({
        env,
        request: new Request(url, { headers: { cookie: 'vhr_session=test' } }),
      })
    ).status,
    403
  );
  env.ADMIN_TWITCH_USER_IDS = 'viewer';
  env.LEADERBOARD_DB.prepare = (sql) => ({
    bind() {
      return this;
    },
    async first() {
      return sql.includes('auth_sessions')
        ? {
            twitch_user_id: 'viewer',
            expires_at: new Date(now + 86400_000).toISOString(),
            last_twitch_validation_at: new Date(now).toISOString(),
          }
        : null;
    },
    async all() {
      return { results: [] };
    },
  });
  const response = await readStatus({
    env,
    request: new Request(url, { headers: { cookie: 'vhr_session=test' } }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).report, null);
});

test(
  'heartbeat storage stays bounded, rejects old reports, and detects missed check-ins',
  { skip: !sqlite },
  async () => {
    const database = new sqlite.DatabaseSync(':memory:');
    for (const file of ['0007_companion_automation.sql', '0010_companion_health.sql'])
      database.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
    const env = {
      LEADERBOARD_DB: {
        prepare(sql) {
          let values = [];
          const statement = {
            bind(...args) {
              values = args;
              return statement;
            },
            async run() {
              return database
                .prepare(sql)
                .run(Object.fromEntries(values.map((v, i) => [String(i + 1), v])));
            },
            async first() {
              return database.prepare(sql).get() || null;
            },
            async all() {
              return { results: database.prepare(sql).all() };
            },
          };
          return statement;
        },
      },
    };
    await storeHealth(env, report({}), now);
    await storeHealth(
      env,
      report({ reportedAt: new Date(now - 1000).toISOString(), collectorState: 'stopped' }),
      now
    );
    assert.equal((await loadHealth(env, now)).report.collectorState, 'running');
    assert.equal((await loadHealth(env, now)).stale, false);
    assert.equal((await loadHealth(env, now + 46 * 60_000)).stale, true);
    assert.equal(database.prepare('SELECT count(*) n FROM companion_collector_health').get().n, 1);
    await assert.rejects(
      storeHealth(env, report({ reportedAt: '2020-01-01' }), now),
      (e) => e.status === 400
    );
    database.close();
  }
);

test('admin panel explains stale, expired, upcoming expiry, and per-channel failures', () => {
  const data = {
    report: sanitizeHealth(
      report({
        cookieExpiresAt: new Date(now - 1000).toISOString(),
        channels: [
          { streamer: 'linahun', lastCollection: { status: 'failed', code: 'empty-result' } },
        ],
      })
    ),
    stale: true,
    serverTime: new Date(now).toISOString(),
    imports: [],
  };
  const html = renderCollectorHealth(data, escape);
  assert.match(html, /more than 45 minutes/);
  assert.match(html, /cookie has expired/);
  assert.match(html, /missing companion/);
  assert.match(html, /Renew VH Twitch Login/);
  data.stale = false;
  data.report.cookieExpiresAt = new Date(now + 2 * 86400_000).toISOString();
  assert.match(renderCollectorHealth(data, escape), /within seven days/);
  data.report.channels[0].streamer = '<script>bad</script>';
  assert.equal(renderCollectorHealth(data, escape).includes('<script>'), false);
});
