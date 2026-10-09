import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { createHealthReport, sendHealth } from '../health.mjs';

test('report reads only session metadata and strips state secrets before transmission', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vh-health-'));
  try {
    await mkdir(join(directory, '.auth'));
    await mkdir(join(directory, 'results/autojoin'), { recursive: true });
    await writeFile(
      join(directory, '.auth/state.json'),
      JSON.stringify({
        cookies: [
          {
            name: 'auth-token',
            domain: '.twitch.tv',
            value: 'PRIVATECOOKIE',
            expires: Date.now() / 1000 + 86400,
          },
        ],
      })
    );
    await writeFile(
      join(directory, 'results/autojoin/status.json'),
      JSON.stringify({
        checkedAt: new Date().toISOString(),
        state: 'running',
        mode: 'active',
        token: 'PRIVATEJOIN',
        channels: [{ streamer: 'mayaicefire', connected: true, status: 'connected' }],
      })
    );
    const report = await createHealthReport(
      directory,
      {
        channels: {
          mayaicefire: {
            token: 'PRIVATEKEY',
            lastCollection: { status: 'failed', code: 'PRIVATEERROR' },
          },
        },
      },
      {}
    );
    assert.equal(report.sessionFile, 'present');
    assert.ok(report.cookieExpiresAt);
    assert.equal(
      report.autoJoin.channels.find((c) => c.streamer === 'mayaicefire').connected,
      true
    );
    assert.equal(JSON.stringify(report).includes('PRIVATE'), false);
    let called = false;
    await sendHealth(
      { endpoint: 'https://example.test/api/companion-sync', token: 'fake-token' },
      report,
      async (url, options) => {
        called = true;
        assert.equal(url.pathname, '/api/companion-health');
        assert.equal(options.redirect, 'error');
        assert.equal(options.headers.authorization, 'Bearer fake-token');
        assert.equal(options.body.includes('PRIVATE'), false);
        return new Response('{}');
      }
    );
    assert.ok(called);
    await assert.rejects(sendHealth({ endpoint: 'http://example.test', token: 'fake' }, report));
    await assert.rejects(
      sendHealth(
        { endpoint: 'https://example.test', token: 'fake' },
        report,
        async () => new Response('', { status: 401 })
      )
    );
  } finally {
    assert.match(relative(tmpdir(), directory), /^vh-health-[^\\/]+$/);
    await rm(directory, { recursive: true, force: true });
  }
});
