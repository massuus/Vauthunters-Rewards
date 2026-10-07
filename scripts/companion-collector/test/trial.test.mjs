import test from 'node:test';
import assert from 'node:assert/strict';
import { watchOnce } from '../watch-core.mjs';

test('a failed streamer does not prevent a later streamer, and neither is retried', async () => {
  const attempts = [];
  const reports = [];
  let clock = 0;
  let checks = 0;
  const result = await watchOnce({
    streamers: ['linahun', 'therealhellfirem4ge', 'hoy_82'],
    maxAttempts: 3,
    maxChecks: 4,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    checkLive: async () => (++checks === 1 ? ['linahun'] : ['linahun', 'therealhellfirem4ge']),
    collect: async (streamer) => {
      attempts.push(streamer);
      return { status: streamer === 'linahun' ? 'failed' : 'collected' };
    },
    onStatus: async (report) => reports.push(report),
  });
  assert.deepEqual(attempts, ['linahun', 'therealhellfirem4ge']);
  assert.equal(result.code, 'watch-expired');
  assert.equal(reports.filter((r) => r.attemptFinished).length, 2);
});

test('simultaneous live streams run sequentially and stay within the attempt budget', async () => {
  let active = 0;
  let maximum = 0;
  const attempts = [];
  await watchOnce({
    streamers: ['hoy_82', 'iskall85', 'linahun'],
    maxAttempts: 2,
    checkLive: async () => ['hoy_82', 'iskall85', 'linahun'],
    collect: async (name) => {
      active++;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      attempts.push(name);
      active--;
      return { status: 'failed' };
    },
  });
  assert.equal(maximum, 1);
  assert.deepEqual(attempts, ['hoy_82', 'iskall85']);
});
