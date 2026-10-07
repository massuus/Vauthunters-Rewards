import test from 'node:test';
import assert from 'node:assert/strict';
import { watchOnce } from '../watch-core.mjs';

function harness(overrides = {}) {
  let time = 0;
  const records = [];
  return {
    streamers: ['hoy_82', 'iskall85'],
    checkLive: async () => [],
    collect: async () => {
      throw new Error('must not launch a browser');
    },
    now: () => time,
    sleep: async (ms) => {
      time += ms;
    },
    onStatus: async (status) => records.push(status),
    records,
    ...overrides,
  };
}

test('offline watcher reaches its limit with no browser attempts', async () => {
  const run = harness();
  assert.equal((await watchOnce(run)).code, 'watch-expired');
  assert.equal(run.records.length, 96);
  assert.equal(run.now(), 95 * 15 * 60_000);
});

test('first live streamer gets exactly one attempt, including a failed collection', async () => {
  for (const status of ['collected', 'failed']) {
    let calls = 0;
    let attempts = 0;
    const run = harness({
      checkLive: async () => (++calls === 1 ? [] : ['iskall85', 'hoy_82']),
      collect: async (name) => {
        attempts++;
        assert.equal(name, 'hoy_82');
        return { status };
      },
    });
    const result = await watchOnce(run);
    assert.equal(result.status, status);
    assert.equal(result.attemptFinished, true);
    assert.equal(attempts, 1);
    assert.equal(calls, 2);
  }
});

test('three consecutive status failures stop the watcher', async () => {
  const run = harness({
    checkLive: async () => {
      throw new Error('secret');
    },
  });
  assert.equal((await watchOnce(run)).code, 'repeated-live-check-failure');
  assert.equal(run.records.length, 3);
  assert.equal(JSON.stringify(run.records).includes('secret'), false);
});

test('cancellation or deadline prevents a collection after a live check', async () => {
  const controller = new AbortController();
  const run = harness({
    signal: controller.signal,
    checkLive: async () => {
      controller.abort();
      return ['hoy_82'];
    },
  });
  assert.equal((await watchOnce(run)).code, 'interrupted');
  let time = 0;
  const expired = harness({
    now: () => time,
    durationMs: 10,
    checkLive: async () => {
      time = 11;
      return ['hoy_82'];
    },
  });
  assert.equal((await watchOnce(expired)).code, 'watch-expired');
});
