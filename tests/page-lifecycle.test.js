import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {
  renderLivePage,
  teardownLivePage,
} from '../public/js/components/special-pages/live-page.js';

test('leaving Live during its initial requests does not restart polling', async (t) => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {} });
  t.after(() => {
    teardownLivePage();
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else delete globalThis.document;
  });
  const scheduled = [];
  const pending = [];
  t.mock.method(globalThis, 'setInterval', (callback, delay) => {
    scheduled.push({ callback, delay });
    return scheduled.length;
  });
  t.mock.method(globalThis, 'clearInterval', () => {});
  t.mock.method(globalThis, 'fetch', () => new Promise((resolve) => pending.push(resolve)));
  const elements = new Map();
  const container = {
    classList: { remove() {} },
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, {});
      return elements.get(selector);
    },
  };
  const loading = renderLivePage(
    container,
    () => {},
    () => {},
    () => {},
    (value) => value,
    'favicon'
  );
  assert.equal(pending.length, 2);
  teardownLivePage();
  for (const resolve of pending) resolve(Response.json({ streamers: [] }));
  await loading;
  assert.equal(scheduled.length, 0);

  t.mock.method(globalThis, 'fetch', async () => Response.json({ streamers: [] }));
  await renderLivePage(
    container,
    () => {},
    () => {},
    () => {},
    (value) => value,
    'favicon'
  );
  assert.deepEqual(
    scheduled.map(({ delay }) => delay),
    [60000, 300000]
  );
});

test('home navigation and a new search stop reward-card image timers', async () => {
  const timers = new Map();
  let timerId = 0;
  const listeners = new Map();
  let homeClick;
  const classes = { toggle() {}, add() {}, remove() {} };
  const card = {
    setAttribute() {},
    addEventListener() {},
    classList: classes,
    querySelectorAll() {
      return [{ classList: classes }, { classList: classes }];
    },
    querySelector() {
      return null;
    },
  };
  const context = vm.createContext({
    AbortController,
    navigator: { maxTouchPoints: 0 },
    window: {
      location: { pathname: '/' },
      matchMedia: () => ({ matches: false }),
      scrollTo() {},
      setInterval(callback) {
        const id = ++timerId;
        timers.set(id, callback);
        return id;
      },
      clearInterval(id) {
        timers.delete(id);
      },
    },
    document: {
      querySelector(selector) {
        return selector === '.site-nav__brand'
          ? {
              addEventListener(_event, handler) {
                homeClick = handler;
              },
            }
          : null;
      },
    },
    resultContainer: { classList: classes, querySelectorAll: () => [card] },
    usernameInput: { value: 'Alice' },
    form: {
      addEventListener(event, handler) {
        listeners.set(event, handler);
      },
    },
    teardownLivePage() {},
    cancelRecentSectionRender() {},
    teardownLeaderboardPage() {},
    clearFeedback() {},
    clearResult() {},
    setLoadingState() {},
    showFeedback() {},
    renderRecentSection: async () => {},
    handleSpecialPageSearch: async () => true,
  });
  for (const filename of ['components/profile-interactions.js', 'handlers/search-handler.js']) {
    const source = await readFile(new URL(`../public/js/${filename}`, import.meta.url), 'utf8');
    vm.runInContext(source.replace(/^import[\s\S]*?;\s*/gm, '').replaceAll('export ', ''), context);
  }
  context.initializeSearch();
  context.bindSetCardHandlers();
  assert.equal(timers.size, 1);
  homeClick({ button: 0, preventDefault() {} });
  assert.equal(timers.size, 0);
  context.bindSetCardHandlers();
  assert.equal(timers.size, 1);
  context.usernameInput.value = '';
  listeners.get('submit')({ preventDefault() {} });
  await Promise.resolve();
  assert.equal(timers.size, 1, 'An invalid search leaves the current profile active');
  context.usernameInput.value = 'Bob';
  listeners.get('submit')({ preventDefault() {} });
  await Promise.resolve();
  assert.equal(timers.size, 0);
});
