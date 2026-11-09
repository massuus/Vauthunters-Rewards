import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPatreonsPage } from '../public/js/components/special-pages/patreons-page.js';
import { renderIskall85PatreonsPage } from '../public/js/components/special-pages/iskall85-patreons-page.js';
import { escapeHtml } from '../public/js/features/reward-utils.js';

test('shared Patreon pages keep their endpoints, titles, routes and player navigation', async (t) => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {} });
  t.after(() => {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else delete globalThis.document;
  });
  for (const [render, endpoint, title, tier, query] of [
    [renderPatreonsPage, '/api/patreons', 'Vault Hunters Patreons', 'Vault Legend', 'patreons'],
    [
      renderIskall85PatreonsPage,
      '/api/iskall85-patreons',
      'Iskall85 Patreons',
      'Emerald',
      'iskall85-patreons',
    ],
  ]) {
    let click;
    let route;
    let submitted;
    const input = { value: '' };
    const container = {
      innerHTML: '',
      classList: { remove() {} },
      querySelectorAll(selector) {
        assert.equal(selector, '[data-player-name]');
        return [
          {
            addEventListener(type, handler) {
              assert.equal(type, 'click');
              click = handler;
            },
            getAttribute() {
              return 'Alice';
            },
          },
        ];
      },
    };
    const fetchMock = t.mock.method(globalThis, 'fetch', async (url) => {
      assert.equal(url, endpoint);
      return Response.json([{ ign: 'Alice', tier }]);
    });
    const args = [
      container,
      () => {},
      () => {},
      (value) => {
        route = value;
      },
      (url) => url,
      escapeHtml,
      '/favicon.ico',
      input,
      {
        dispatchEvent(event) {
          submitted = event;
        },
      },
    ];
    await render(...args);
    assert.equal(document.title, title);
    assert.equal(route, query);
    assert.ok(container.innerHTML.includes(`${tier} (1)`));
    click();
    assert.equal(input.value, 'Alice');
    assert.equal(submitted.type, 'submit');
    assert.equal(submitted.cancelable, true);

    fetchMock.mock.mockImplementation(async () => new Response(null, { status: 503 }));
    await assert.rejects(render(...args), /Failed to load/);
    assert.match(container.innerHTML, /Please try again/);
    fetchMock.mock.restore();
  }
});
