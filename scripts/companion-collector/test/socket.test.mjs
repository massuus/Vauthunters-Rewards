import test from 'node:test';
import assert from 'node:assert/strict';
import { CollectorError, retrievePlayers, validateSocketUrl } from '../socket.mjs';
import { shouldBlockRequest } from '../policy.mjs';

const url =
  'wss://ebs.vaulthunters.gg/socket.io/?streamer=hoy_82&extensionToken=test&helixToken=test&EIO=4&transport=websocket';
const player = {
  name: 'Tester',
  skin: 'Steve',
  alias: 'Test',
  seasonLevel: 10,
  vaultsJoined: 3,
  secret: 'omit',
};
function fakeSocket(onSend, companion = {}) {
  const instances = [];
  class Socket extends EventTarget {
    constructor() {
      super();
      this.sent = [];
      this.closed = false;
      instances.push(this);
      queueMicrotask(() => this.receive('0{}'));
    }
    receive(message) {
      const event = new Event('message');
      event.data = message;
      this.dispatchEvent(event);
    }
    send(message) {
      this.sent.push(message);
      if (message === '40/extension,') queueMicrotask(() => this.receive('40/extension,{}'));
      else if (message === '42/extension,0["requestCompanion"]')
        queueMicrotask(() => this.receive(`43/extension,0${JSON.stringify([companion])}`));
      else queueMicrotask(() => onSend(this, message));
    }
    close() {
      this.closed = true;
      this.dispatchEvent(new Event('close'));
    }
  }
  return { Socket, instances };
}

test('socket URL must be the expected service and streamer, with real auth fields', () => {
  for (const bad of [
    url.replace('ebs.vaulthunters.gg', 'attacker.example'),
    url.replace('hoy_82', 'other'),
    url.replace('wss:', 'ws:'),
    url.replace('/socket.io/', '/other'),
    url.replace('extensionToken=test', 'extensionToken='),
    `${url}&streamer=other`,
    url.replace('ebs.', 'user:pass@ebs.'),
    url.replace('EIO=4', 'EIO=3'),
  ])
    assert.throws(() => validateSocketUrl(bad, 'hoy_82'), CollectorError);
  assert.equal(
    new URL(validateSocketUrl(`${url}&sid=old`, 'hoy_82')).searchParams.has('sid'),
    false
  );
});

test('collects all pages, ignores unrelated acks, deduplicates and removes extra fields', async () => {
  const { Socket, instances } = fakeSocket((socket, message) => {
    const page = Number(message.match(/^42\/extension,(\d+)/)?.[1]);
    socket.receive(
      `43/extension,99${JSON.stringify([{ data: [], pagination: { totalPages: 1 } }])}`
    );
    socket.receive(
      `43/extension,${page}${JSON.stringify([{ data: [{ ...player, seasonLevel: page }], pagination: { totalPages: 2 } }])}`
    );
  });
  const result = await retrievePlayers(url, 'hoy_82', { WebSocketImpl: Socket });
  assert.equal(result.pages, 2);
  assert.equal(result.received, 2);
  assert.equal(result.players.length, 1);
  assert.equal(result.players[0].seasonLevel, 2);
  assert.equal(result.players[0].secret, undefined);
  assert.ok(instances[0].closed);
  assert.deepEqual(
    instances[0].sent.filter((s) => s.startsWith('42') && !s.startsWith('42/extension,0')),
    [
      '42/extension,1["requestDraftCompanionSearch","",1,20]',
      '42/extension,2["requestDraftCompanionSearch","",2,20]',
    ]
  );
});

test('bad or incomplete pages fail instead of producing a partial snapshot', async (t) => {
  for (const [name, payload, code] of [
    ['missing data', { pagination: { totalPages: 1 } }, 'invalid-pagination'],
    [
      'unbounded pages',
      { data: [player], pagination: { totalPages: 999999 } },
      'invalid-pagination',
    ],
    ['empty result', { data: [], pagination: { totalPages: 1 } }, 'empty-result'],
    [
      'missing stats',
      { data: [{ name: 'Tester', skin: 'Steve' }], pagination: { totalPages: 1 } },
      'empty-result',
    ],
    ['empty intermediate', { data: [], pagination: { totalPages: 2 } }, 'empty-intermediate-page'],
  ])
    await t.test(name, async () => {
      const { Socket, instances } = fakeSocket((socket) =>
        socket.receive(`43/extension,1${JSON.stringify([payload])}`)
      );
      await assert.rejects(retrievePlayers(url, 'hoy_82', { WebSocketImpl: Socket }), { code });
      assert.ok(instances[0].closed);
    });
});

test('changed pagination and early disconnect discard already received players', async () => {
  for (const disconnect of [false, true]) {
    const { Socket } = fakeSocket((socket, message) => {
      const page = Number(message.match(/^42\/extension,(\d+)/)?.[1]);
      if (page === 2 && disconnect) return socket.close();
      socket.receive(
        `43/extension,${page}${JSON.stringify([{ data: [player], pagination: { totalPages: page === 1 ? 2 : 3 } }])}`
      );
    });
    await assert.rejects(retrievePlayers(url, 'hoy_82', { WebSocketImpl: Socket }), {
      code: disconnect ? 'socket-closed-early' : 'pagination-changed',
    });
  }
});

test('namespace rejection and malformed responses fail safely', async () => {
  for (const [frame, code] of [
    ['44/extension,{"message":"secret"}', 'extension-access-rejected'],
    ['43/extension,1[invalid]', 'invalid-page-json'],
  ]) {
    const { Socket } = fakeSocket((socket) => socket.receive(frame));
    await assert.rejects(retrievePlayers(url, 'hoy_82', { WebSocketImpl: Socket }), {
      code,
      message: code,
    });
  }
});

test('heartbeat answers do not keep an unresponsive page request alive', async () => {
  const { Socket, instances } = fakeSocket((socket, message) => {
    if (message.startsWith('42')) socket.receive('2');
  });
  await assert.rejects(retrievePlayers(url, 'hoy_82', { WebSocketImpl: Socket, idleMs: 15 }), {
    code: 'socket-idle-timeout',
  });
  assert.ok(instances[0].sent.includes('3'));
  assert.ok(instances[0].closed);
});

test('run cancellation closes a pending socket', async () => {
  const controller = new AbortController();
  const { Socket, instances } = fakeSocket(() => controller.abort());
  await assert.rejects(
    retrievePlayers(url, 'hoy_82', { WebSocketImpl: Socket, signal: controller.signal }),
    { code: 'run-time-limit' }
  );
  assert.ok(instances[0].closed);
});

test('oversized socket frames stop collection', async () => {
  const { Socket, instances } = fakeSocket((socket) => socket.receive('x'.repeat(1024 * 1024 + 1)));
  await assert.rejects(retrievePlayers(url, 'hoy_82', { WebSocketImpl: Socket }), {
    code: 'socket-byte-limit',
  });
  assert.ok(instances[0].closed);
});

test('total time limit ends a stalled connection even before the idle timeout', async () => {
  const { Socket, instances } = fakeSocket(() => {});
  await assert.rejects(
    retrievePlayers(url, 'hoy_82', { WebSocketImpl: Socket, timeoutMs: 10, idleMs: 1000 }),
    { code: 'socket-time-limit' }
  );
  assert.ok(instances[0].closed);
});

test('missing own companion is recorded but does not block a successful search', async () => {
  const { Socket } = fakeSocket(
    (socket) =>
      socket.receive(
        `43/extension,1${JSON.stringify([{ data: [player], pagination: { totalPages: '1' } }])}`
      ),
    0
  );
  const result = await retrievePlayers(url, 'hoy_82', { WebSocketImpl: Socket });
  assert.equal(result.players.length, 1);
  assert.equal(result.diagnostics.companionState, 'missing');
});

test('pagination errors retain only safe shape diagnostics', async () => {
  const { Socket } = fakeSocket((socket) =>
    socket.receive(
      `43/extension,1${JSON.stringify([{ data: [], pagination: { totalPages: 9999 }, token: 'do-not-log' }])}`
    )
  );
  await assert.rejects(retrievePlayers(url, 'hoy_82', { WebSocketImpl: Socket }), (error) => {
    assert.equal(error.code, 'invalid-pagination');
    assert.equal(error.diagnostics.totalPages, 9999);
    assert.equal(error.diagnostics.companionState, 'present');
    assert.equal(JSON.stringify(error).includes('do-not-log'), false);
    return true;
  });
});

test('zero-page empty results are reported as empty, not malformed pagination', async () => {
  const { Socket } = fakeSocket(
    (socket) => socket.receive('43/extension,1[{"data":[],"pagination":{"totalPages":0}}]'),
    0
  );
  await assert.rejects(retrievePlayers(url, 'hoy_82', { WebSocketImpl: Socket }), {
    code: 'empty-result',
    diagnostics: {
      companionState: 'missing',
      page: 1,
      payloadType: 'object',
      hasData: true,
      totalPagesType: 'number',
      dataLength: 0,
      totalPages: 0,
    },
  });
});

test('blocks video and unrelated extensions but allows Twitch auth and VH assets', () => {
  assert.equal(
    shouldBlockRequest('https://video-weaver.example.ttvnw.net/v1/playlist', 'fetch'),
    true
  );
  assert.equal(shouldBlockRequest('https://example.com/video.m3u8', 'fetch'), true);
  assert.equal(shouldBlockRequest('https://other.ext-twitch.tv/app.js', 'script'), true);
  assert.equal(
    shouldBlockRequest('https://o8bt9pw89m6ycsmdgp4evjezdlmyvl.ext-twitch.tv/app.js', 'script'),
    false
  );
  assert.equal(
    shouldBlockRequest('https://supervisor.ext-twitch.tv/supervisor.js', 'script'),
    false
  );
  assert.equal(shouldBlockRequest('https://id.twitch.tv/oauth2/authorize', 'document'), false);
  assert.equal(shouldBlockRequest('https://gql.twitch.tv/gql', 'fetch'), false);
});
