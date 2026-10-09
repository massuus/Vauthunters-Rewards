import test from 'node:test';
import assert from 'node:assert/strict';
import { healthEventFingerprint } from '../health-events.mjs';

const status = () => ({
  checkedAt: '2026-10-09T12:00:00.000Z',
  state: 'running',
  mode: 'active',
  liveCheck: 'ok',
  socketBytesToday: 100,
  channels: [
    {
      streamer: 'therealhellfirem4ge',
      live: true,
      connected: true,
      status: 'connected',
      issue: null,
      windowOpen: false,
      vaultRunning: false,
      vaultStartedAt: null,
    },
  ],
});

test('heartbeat fingerprint ignores routine timestamps and counters', () => {
  const before = status();
  const after = { ...before, checkedAt: '2026-10-09T12:00:30.000Z', socketBytesToday: 500 };
  assert.equal(healthEventFingerprint(after), healthEventFingerprint(before));
});

test('heartbeat fingerprint changes for public live and vault activity', () => {
  const before = status();
  for (const change of [
    { live: false },
    { connected: false },
    { windowOpen: true },
    { vaultRunning: true, vaultStartedAt: '2026-10-09T12:01:00.000Z' },
    { issue: 'socket-disconnected' },
  ]) {
    const after = status();
    Object.assign(after.channels[0], change);
    assert.notEqual(healthEventFingerprint(after), healthEventFingerprint(before));
  }
});

test('invalid status cannot trigger a heartbeat', () => {
  assert.equal(healthEventFingerprint(null), null);
  assert.equal(healthEventFingerprint({ channels: null }), null);
});
