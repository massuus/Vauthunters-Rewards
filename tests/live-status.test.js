import test from 'node:test';
import assert from 'node:assert/strict';
import { publicLiveStatus } from '../functions/api/live-status.js';

const now = Date.parse('2026-10-09T12:00:00.000Z');

test('disconnected channels do not publish a retained vault or join window', () => {
  const payload = publicLiveStatus(
    {
      report: {
        autoJoin: {
          checkedAt: new Date(now).toISOString(),
          channels: [
            {
              streamer: 'iskall85',
              live: true,
              connected: false,
              vaultRunning: true,
              windowOpen: true,
              vaultStartedAt: new Date(now).toISOString(),
            },
          ],
        },
      },
    },
    now
  );
  const iskall = payload.streamers.find((row) => row.login === 'iskall85');
  assert.equal(iskall.live, true);
  assert.equal(iskall.inVault, false);
  assert.equal(iskall.joinWindowOpen, false);
  assert.equal(iskall.vaultStartedAt, null);
});

test('public live status exposes vault activity without private join details', () => {
  const payload = publicLiveStatus(
    {
      stale: false,
      report: {
        reportedAt: new Date(now).toISOString(),
        autoJoin: {
          checkedAt: new Date(now - 10_000).toISOString(),
          token: 'PRIVATE',
          channels: [
            {
              streamer: 'therealhellfirem4ge',
              live: true,
              connected: true,
              companionExpMultiplier: 2.5,
              windowOpen: false,
              vaultRunning: true,
              vaultStartedAt: new Date(now - 12 * 60_000).toISOString(),
              method: 'chat',
              outcome: 'chat-sent',
              issue: 'PRIVATE',
            },
          ],
        },
      },
    },
    now,
    { therealhellfirem4ge: 'https://static-cdn.jtvnw.net/jtv_user_pictures/example.png' }
  );
  const hellfire = payload.streamers.find((row) => row.login === 'therealhellfirem4ge');
  assert.deepEqual(hellfire, {
    login: 'therealhellfirem4ge',
    displayName: 'Hellfirem4ge',
    profileImageUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/example.png',
    live: true,
    connected: true,
    companionExpMultiplier: 2.5,
    joinWindowOpen: false,
    inVault: true,
    vaultStartedAt: new Date(now - 12 * 60_000).toISOString(),
  });
  assert.equal(JSON.stringify(payload).includes('PRIVATE'), false);
  assert.equal(JSON.stringify(payload).includes('chat-sent'), false);
});

test('public live status rejects profile images outside the Twitch CDN', () => {
  const payload = publicLiveStatus({ stale: true, report: null }, now, {
    iskall85: 'https://example.test/tracker.png',
  });
  assert.equal(payload.streamers.find((row) => row.login === 'iskall85').profileImageUrl, null);
});

test('multipliers are hidden for offline, disconnected, stale, or invalid signals', () => {
  for (const change of [
    { live: false },
    { connected: false },
    { companionExpMultiplier: 0 },
    { companionExpMultiplier: '2.5' },
    { companionExpMultiplier: Infinity },
    { companionExpMultiplier: -1 },
    { companionExpMultiplier: 1_000_001 },
  ]) {
    const payload = publicLiveStatus(
      {
        report: {
          autoJoin: {
            checkedAt: new Date(now).toISOString(),
            channels: [
              {
                streamer: 'iskall85',
                live: true,
                connected: true,
                companionExpMultiplier: 2.5,
                ...change,
              },
            ],
          },
        },
      },
      now
    );
    assert.equal(
      payload.streamers.find((row) => row.login === 'iskall85').companionExpMultiplier,
      null
    );
  }
});

test('stale reports fail closed instead of showing old live states', () => {
  const payload = publicLiveStatus(
    {
      stale: false,
      report: {
        autoJoin: {
          checkedAt: new Date(now - 21 * 60_000).toISOString(),
          channels: [
            {
              streamer: 'iskall85',
              live: true,
              connected: true,
              vaultRunning: true,
              companionExpMultiplier: 2.5,
            },
          ],
        },
      },
    },
    now
  );
  assert.equal(payload.stale, true);
  assert.equal(payload.streamers.find((row) => row.login === 'iskall85').live, false);
  assert.equal(
    payload.streamers.find((row) => row.login === 'iskall85').companionExpMultiplier,
    null
  );
});
