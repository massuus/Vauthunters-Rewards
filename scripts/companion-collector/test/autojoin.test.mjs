import test from 'node:test';
import assert from 'node:assert/strict';
import { PresenceConnection } from '../autojoin/connection.mjs';
import { JoinCoordinator } from '../autojoin/coordinator.mjs';

const socketUrl = (streamer) =>
  `wss://ebs.vaulthunters.gg/socket.io/?streamer=${streamer}&extensionToken=x&helixToken=y&EIO=4&transport=websocket`;
class FakeSocket extends EventTarget {
  sent = [];
  send(value) {
    this.sent.push(value);
  }
  close() {}
  receive(data) {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
}

test('presence connection exposes vault state and companion XP without allowing arbitrary writes', async () => {
  let socket, vault, companion;
  const connection = new PresenceConnection(socketUrl('mayaicefire'), 'mayaicefire', {
    WebSocketImpl: class extends FakeSocket {
      constructor() {
        super();
        socket = this;
      }
    },
    onVaultState: (value) => {
      vault = value;
    },
    onCompanion: (value) => {
      companion = value;
    },
  });
  socket.receive('0{}');
  assert.deepEqual(socket.sent, ['40/extension,']);
  socket.receive('42/extension,["authenticated"]');
  socket.receive('42/extension,["updateActiveVaultPresence",{"presence":1}]');
  socket.receive(
    '42/extension,["updateCompanion",{"activeThisVault":false,"state":"AWAKE","totalXp":20}]'
  );
  assert.equal(connection.ready, true);
  assert.equal(vault, true);
  assert.equal(companion.totalXp, 20);
  await assert.rejects(connection.request('requestShopItems'), /request-not-allowed/);
  connection.close();
});

test('socket join is persisted before sending and confirmed by reading companion state', async () => {
  const saved = [];
  const notices = [];
  const state = { channels: {} };
  const connection = {
    ready: true,
    presence: true,
    online: true,
    calls: [],
    async readCompanion() {
      this.calls.push('read');
      return { activeThisVault: this.calls.includes('write'), state: 'AWAKE' };
    },
    async request(name) {
      this.calls.push('write');
      assert.equal(name, 'requestTriggerPresence');
    },
  };
  const coordinator = new JoinCoordinator({
    state,
    save: () => saved.push(structuredClone(state)),
    getConnection: () => connection,
    sendChat: async () => assert.fail('chat fallback'),
    notify: async (name) => notices.push(name),
    wait: async () => {},
  });
  await coordinator.presence('mayaicefire', true);
  assert.deepEqual(connection.calls, ['read', 'write', 'read']);
  assert.equal(state.channels.mayaicefire.lastAction.outcome, 'confirmed');
  assert.equal(
    saved.some((s) => s.channels.mayaicefire.lastAction?.outcome === 'sending'),
    true
  );
  assert.deepEqual(notices, ['mayaicefire']);
});

test('chat fallback is suppressed when the socket authoritatively says no join window', async () => {
  let chats = 0;
  const coordinator = new JoinCoordinator({
    state: { channels: {} },
    save: () => {},
    getConnection: () => ({ ready: true, presence: false }),
    sendChat: async () => {
      chats++;
    },
    notify: async () => {},
  });
  await coordinator.chat('hoy_82');
  assert.equal(chats, 0);
});

test('uncertain socket writes are not repeated through chat', async () => {
  let chats = 0;
  const state = { channels: {} };
  const connection = {
    ready: true,
    presence: true,
    online: true,
    async readCompanion() {
      return { activeThisVault: false, state: 'AWAKE' };
    },
    async request() {
      throw new Error('ack lost');
    },
  };
  const coordinator = new JoinCoordinator({
    state,
    save: () => {},
    getConnection: () => connection,
    sendChat: async () => {
      chats++;
    },
    notify: async () => {},
    wait: async () => {},
  });
  await coordinator.presence('hoy_82', true);
  await coordinator.chat('hoy_82');
  assert.equal(state.channels.hoy_82.lastAction.outcome, 'unconfirmed');
  assert.equal(chats, 0);
});
