import test from 'node:test';
import assert from 'node:assert/strict';
import { automationTick, STREAMERS, validateState } from '../automation-core.mjs';

test('offline channels do not open browsers; daily budget survives restart and rolls over', async () => {
  let clock = Date.parse('2026-10-07T00:00:00Z');
  let state = {};
  let persisted;
  let calls = 0;
  const run = (live) =>
    automationTick({
      state,
      live,
      now: () => clock,
      save: async (s) => {
        persisted = JSON.stringify(s);
      },
      report: async () => {},
      upload: async () => ({ status: 'imported' }),
      collect: async () => {
        calls++;
        assert.ok(JSON.parse(persisted).attempts > 0);
        return { status: 'failed' };
      },
    });
  await run([]);
  assert.equal(calls, 0);
  await run(STREAMERS);
  assert.equal(calls, 7);
  state = JSON.parse(persisted);
  await run(STREAMERS);
  assert.equal(calls, 7);
  clock += 6 * 3600_000;
  await run(STREAMERS);
  assert.equal(calls, 14);
  clock += 6 * 3600_000;
  await run(STREAMERS);
  assert.equal(calls, 14);
  clock += 12 * 3600_000;
  await run(STREAMERS);
  assert.equal(calls, 21);
});

test('successful collection queues upload, retries delivery without another browser, then stops after three failures', async () => {
  const state = {};
  let clock = Date.now();
  let browsers = 0;
  let uploads = 0;
  const run = () =>
    automationTick({
      state,
      live: ['mayaicefire'],
      now: () => clock,
      save: async () => {},
      report: async () => {},
      collect: async () => {
        browsers++;
        return { status: 'collected' };
      },
      upload: async () => {
        uploads++;
        return { status: 'failed' };
      },
    });
  await run();
  assert.equal(browsers, 1);
  assert.equal(uploads, 0);
  for (let i = 0; i < 4; i++) {
    clock += 3600_000;
    await run();
  }
  assert.equal(uploads, 3);
  assert.equal(browsers, 1);
  assert.equal(state.channels.mayaicefire.pending, false);
});

test('successful delivery is recorded and empty channels get longer backoff', async () => {
  const state = {};
  const clock = Date.now();
  const outcomes = [];
  const options = {
    state,
    live: ['linahun', 'mayaicefire'],
    now: () => clock,
    save: async () => {},
    report: async (r) => outcomes.push(r),
    collect: async (s) =>
      s === 'linahun' ? { status: 'failed', code: 'empty-result' } : { status: 'collected' },
    upload: async () => ({ status: 'imported' }),
  };
  await automationTick(options);
  await automationTick(options);
  assert.ok(state.channels.mayaicefire.lastUploadedAt);
  assert.equal(state.channels.linahun.nextAttempt, clock + 12 * 3600_000);
  assert.equal(outcomes.filter((r) => r.status === 'imported').length, 1);
});

test('corrupt persisted budgets are rejected instead of silently allowing more browsers', () => {
  for (const value of [
    null,
    { channels: null },
    { channels: {}, day: '2026-10-07', attempts: -1, byStreamer: {} },
    { channels: {}, day: '2026-10-07', attempts: 1, byStreamer: [] },
    { channels: { mayaicefire: { nextAttempt: 'bad' } } },
  ])
    assert.throws(() => validateState(value));
  assert.doesNotThrow(() =>
    validateState({ channels: {}, day: '2026-10-07', attempts: 2, byStreamer: { mayaicefire: 2 } })
  );
});

test('permanent delivery errors stop retries and shutdown starts no browser', async () => {
  const state = { channels: { mayaicefire: { pending: true } } };
  let uploads = 0;
  const options = {
    state,
    live: [],
    save: async () => {},
    report: async () => {},
    collect: async () => assert.fail('unexpected browser'),
    upload: async () => {
      uploads++;
      return { status: 'failed', permanent: true };
    },
  };
  await automationTick(options);
  await automationTick(options);
  assert.equal(uploads, 1);
  await automationTick({ ...options, live: ['hoy_82'], signal: AbortSignal.abort() });
});
