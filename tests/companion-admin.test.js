import test from 'node:test';
import assert from 'node:assert/strict';
import {
  apiRequest,
  retrieveCompanions,
  resolvePlayerIdentities,
  uploadPlayers,
} from '../public/js/features/companion-admin.js';

test('companion imports validate the socket host before opening a connection', () => {
  for (const url of [
    'invalid',
    'ws://ebs.vaulthunters.gg/?streamer=iskall85',
    'wss://example.com/?streamer=iskall85',
    'wss://ebs.vaulthunters.gg/',
  ]) {
    assert.throws(() => retrieveCompanions(url, () => {}));
  }
});

test('socket imports paginate, answer pings, discard invalid rows and deduplicate names', async (t) => {
  const sent = [];
  let socket;
  class MockSocket extends EventTarget {
    constructor(url) {
      super();
      this.url = url;
      socket = this;
    }
    send(message) {
      sent.push(message);
    }
    close(code, reason) {
      this.closed = { code, reason };
    }
    receive(data) {
      this.dispatchEvent(new MessageEvent('message', { data }));
    }
  }
  const originalSocket = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: MockSocket });
  t.after(() => {
    if (originalSocket) Object.defineProperty(globalThis, 'WebSocket', originalSocket);
    else delete globalThis.WebSocket;
  });
  const progress = [];
  const result = retrieveCompanions(
    'wss://ebs.vaulthunters.gg/socket.io/?streamer=Iskall85&amp;token=example',
    (message) => progress.push(message)
  );
  socket.receive('0{}');
  socket.receive('2heartbeat');
  socket.receive('40/extension,{}');
  socket.receive(
    `43/extension,1${JSON.stringify([
      {
        data: [{ name: 'Alice', skin: 'first' }, { name: 'invalid' }],
        pagination: { totalPages: 2 },
      },
    ])}`
  );
  socket.receive(
    `43/extension,2${JSON.stringify([
      {
        data: [
          { name: 'ALICE', skin: 'last' },
          { name: 'Bob', skin: 'bob' },
        ],
      },
    ])}`
  );
  assert.deepEqual(await result, {
    streamer: 'iskall85',
    players: [
      { name: 'ALICE', skin: 'last' },
      { name: 'Bob', skin: 'bob' },
    ],
    received: 4,
  });
  assert.deepEqual(sent, [
    '40/extension,',
    '3heartbeat',
    '42/extension,1["requestDraftCompanionSearch","",1,20]',
    '42/extension,2["requestDraftCompanionSearch","",2,20]',
  ]);
  assert.equal(new URL(socket.url).searchParams.get('token'), 'example');
  assert.equal(progress.length, 2);
  assert.deepEqual(socket.closed, { code: 1000, reason: 'complete' });
});

test('uploads preserve batch limits, CSRF credentials and aggregate results', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url, options, body });
    return Response.json({ updated: body.players.length, skipped: 1 });
  });
  const players = Array.from({ length: 101 }, (_, index) => ({ name: `player${index}` }));
  assert.deepEqual(await uploadPlayers('csrf-example', 'iskall85', players, () => {}), {
    updated: 101,
    skipped: 2,
  });
  assert.deepEqual(
    requests.map(({ body }) => body.players.length),
    [100, 1]
  );
  for (const { url, options, body } of requests) {
    assert.equal(url, '/api/admin/companion-leaderboard');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.headers['x-csrf-token'], 'csrf-example');
    assert.equal(body.streamer, 'iskall85');
    assert.equal(body.source, 'wss-browser-import');
  }
});

test('identity lookups normalize and deduplicate names before batching', async (t) => {
  const batches = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/admin/companion-identities');
    assert.equal(options.headers['x-csrf-token'], 'csrf-example');
    const { twitchNames } = JSON.parse(options.body);
    batches.push(twitchNames);
    return Response.json({ resolved: twitchNames.length });
  });
  const players = [
    { name: ' Alice ' },
    { twitchName: 'ALICE' },
    { name: 'invalid!' },
    ...['bob', 'carol', 'dave', 'eve', 'frank'].map((name) => ({ name })),
  ];
  assert.deepEqual(await resolvePlayerIdentities('csrf-example', players, () => {}), {
    resolved: 6,
    existing: 0,
    missing: 0,
    failed: 0,
    skipped: 0,
  });
  assert.deepEqual(batches, [['alice', 'bob', 'carol', 'dave', 'eve'], ['frank']]);
});

test('admin requests surface server errors and tolerate empty successful responses', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ error: 'Access denied' }, { status: 403 })
  );
  await assert.rejects(apiRequest('/api/auth/me'), /Access denied/);
  globalThis.fetch.mock.mockImplementation(async () => new Response(null, { status: 204 }));
  assert.deepEqual(await apiRequest('/api/auth/me'), {});
});
