import test from 'node:test';
import assert from 'node:assert/strict';
import { mountLeaderboardAdmin } from '../public/js/components/leaderboard-admin.js';
import { escapeHtml } from '../public/js/features/reward-utils.js';

function createRoot() {
  const listeners = new Map();
  const content = { innerHTML: '' };
  const healthButton = {
    addEventListener() {},
    removeEventListener() {},
  };
  const health = {
    querySelector(selector) {
      return selector === '[data-health-content]' ? content : healthButton;
    },
  };
  const slot = {
    querySelector() {
      return health;
    },
  };
  const feedback = {
    hidden: true,
    textContent: '',
    classList: { toggle() {} },
  };
  return {
    listeners,
    feedback,
    innerHTML: '',
    querySelector(selector) {
      return selector === '[data-leaderboard-admin-slot]' ? slot : feedback;
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) listeners.delete(type);
    },
  };
}

test('the admin component shows access messages without mounting forms or polling', () => {
  for (const auth of [null, { authenticated: true, user: { isAdmin: false } }]) {
    const root = createRoot();
    const result = mountLeaderboardAdmin({ root, auth });
    assert.equal(result, undefined);
    assert.equal(root.listeners.size, 0);
    assert.match(root.innerHTML, auth ? /Administrator access required/ : /Administrator sign in/);
  }
});

test('the admin component saves manual data and disposes its form and health timer', async (t) => {
  const requests = [];
  const scheduled = [];
  const cleared = [];
  const saved = [];
  let active = true;
  let menusUpdated = 0;
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    const timer = { callback, delay };
    scheduled.push(timer);
    return timer;
  });
  t.mock.method(globalThis, 'clearTimeout', (timer) => cleared.push(timer));
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return Response.json(url.endsWith('companion-health') ? { report: null } : {});
  });
  t.mock.method(
    globalThis,
    'FormData',
    class {
      constructor(form) {
        return new Map(Object.entries(form.values));
      }
    }
  );
  const root = createRoot();
  const dispose = mountLeaderboardAdmin({
    root,
    auth: { authenticated: true, user: { isAdmin: true, csrfToken: 'csrf-example' } },
    escapeHtml,
    isActive: () => active,
    updateStreamerMenus: () => {
      menusUpdated += 1;
    },
    onSaved: async (streamer) => {
      saved.push(streamer);
    },
  });
  t.after(dispose);
  const button = { disabled: false };
  const form = {
    values: {
      streamer: ' Iskall85 ',
      twitchName: '',
      playerName: 'Alice',
      alias: '',
      seasonLevel: '12',
      vaultsJoined: '3',
    },
    matches(selector) {
      return selector.includes('data-companion-manual-form');
    },
    querySelector() {
      return button;
    },
  };
  let prevented = false;
  const submit = root.listeners.get('submit');
  await submit({
    target: form,
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(menusUpdated, 1);
  assert.deepEqual(saved, ['iskall85']);
  const request = requests.find(({ url }) => url === '/api/admin/companion-leaderboard');
  assert.equal(request.options.headers['x-csrf-token'], 'csrf-example');
  assert.deepEqual(JSON.parse(request.options.body), {
    streamer: 'iskall85',
    players: [{ twitchName: '', playerName: 'Alice', alias: '', seasonLevel: 12, vaultsJoined: 3 }],
    source: 'manual-admin',
  });
  assert.match(root.feedback.textContent, /Alice was added or updated/);
  assert.equal(button.disabled, false);
  assert.equal(scheduled[0].delay, 60000);
  active = false;
  const count = requests.length;
  await submit({ target: form });
  assert.equal(requests.length, count);
  dispose();
  assert.equal(root.listeners.has('submit'), false);
  assert.ok(cleared.includes(scheduled[0]));
});
