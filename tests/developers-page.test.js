import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/developers.js';
import { DEVELOPERS } from '../functions/utils/developers.js';
import {
  isDevelopersQuery,
  renderDevelopersPage,
} from '../public/js/components/special-pages/developers-page.js';
import { escapeHtml } from '../public/js/features/reward-utils.js';

test('dev and devs searches match without taking over other usernames', () => {
  for (const value of ['dev', 'devs', ' DEV ', 'DeVs'])
    assert.equal(isDevelopersQuery(value), true);
  for (const value of ['', null, 'developer123', 'Douwsky'])
    assert.equal(isDevelopersQuery(value), false);
});

test('developer roster API uses the shared JSON list and rejects writes', async () => {
  const response = onRequest({ request: new Request('https://example.test/api/developers') });
  assert.equal(response.status, 200);
  const roster = await response.json();
  assert.equal(roster.length, Object.keys(DEVELOPERS).length);
  assert.equal(roster.find((player) => player.ign === '_CsaBa_').uuid, DEVELOPERS._CsaBa_);
  assert.equal(
    onRequest({ request: new Request('https://example.test/api/developers', { method: 'POST' }) })
      .status,
    405
  );
});

test('developer roster renders server-style player buttons and opens selected profiles', async (t) => {
  const originalDocument = globalThis.document;
  globalThis.document = {};
  const roster = [{ ign: '_CsaBa_', uuid: DEVELOPERS._CsaBa_ }];
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, '/api/developers');
    return Response.json(roster);
  });
  let clicked;
  let submitted = false;
  let query;
  const input = { value: '' };
  const button = {
    addEventListener(type, handler) {
      if (type === 'click') clicked = handler;
    },
    getAttribute() {
      return '_CsaBa_';
    },
  };
  const container = {
    classList: { remove() {} },
    innerHTML: '',
    querySelectorAll(selector) {
      return selector === '[data-player-name]' ? [button] : [];
    },
    querySelector() {
      return null;
    },
  };
  try {
    await renderDevelopersPage(
      container,
      () => {},
      () => {},
      () => {},
      (value) => {
        query = value;
      },
      (url) => url,
      escapeHtml,
      '/favicon.ico',
      input,
      {
        dispatchEvent(event) {
          submitted = event.type === 'submit';
        },
      }
    );
    assert.equal(query, 'devs');
    assert.match(container.innerHTML, /recent-grid official-servers-page__players/);
    assert.match(container.innerHTML, /data-player-name="_CsaBa_"/);
    assert.ok(container.innerHTML.includes(DEVELOPERS._CsaBa_));
    clicked();
    assert.equal(input.value, '_CsaBa_');
    assert.equal(submitted, true);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});
