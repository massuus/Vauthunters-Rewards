import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { renderPatreonsPage } from '../public/js/components/special-pages/patreons-page.js';

async function moduleSource(filename) {
  return (await readFile(new URL(`../public/js/${filename}`, import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?;\s*/gm, '')
    .replaceAll('export ', '');
}

test('blank input validation preserves the active request and its ownership', async () => {
  let finish;
  let signal;
  let calls = 0;
  const feedback = [];
  const input = { value: 'Alice' };
  const context = vm.createContext({
    AbortController,
    usernameInput: input,
    clearFeedback() {},
    teardownSetCardHandlers() {},
    cancelRecentSectionRender() {},
    showFeedback(message) {
      feedback.push(message);
    },
    handleSpecialPageSearch(_name, options) {
      calls += 1;
      signal = options.signal;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  vm.runInContext(await moduleSource('handlers/search-handler.js'), context);
  const pending = context.submitSearch();
  input.value = '';
  await context.submitSearch();
  assert.equal(signal.aborted, false);
  assert.equal(calls, 1);
  assert.deepEqual(feedback, ['Please enter a Minecraft username.']);
  finish(true);
  await pending;
});

test('cancelled roster requests cannot replace a newer page, on success or failure', async (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {} });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete globalThis.document;
  });
  for (const failure of [false, true]) {
    let settle;
    t.mock.method(
      globalThis,
      'fetch',
      () =>
        new Promise((resolve, reject) => {
          settle = () =>
            failure ? reject(new Error('Old request failed')) : resolve(Response.json([]));
        })
    );
    const controller = new AbortController();
    const container = { innerHTML: '', classList: { remove() {} }, querySelectorAll: () => [] };
    const pending = renderPatreonsPage(
      container,
      () => {},
      () => {},
      () => {},
      (url) => url,
      (value) => value,
      '/favicon.ico',
      {},
      {},
      { signal: controller.signal }
    );
    controller.abort();
    container.innerHTML = 'New page';
    settle();
    await pending;
    assert.equal(container.innerHTML, 'New page');
  }
});

test(
  'a cancelled profile cannot commit a late loading skeleton over a special page',
  { timeout: 2000 },
  async () => {
    let release;
    let templateStarted = false;
    let markStarted;
    const started = new Promise((resolve) => {
      markStarted = resolve;
    });
    const result = { innerHTML: '' };
    const input = { value: 'Alice' };
    const context = vm.createContext({
      AbortController,
      usernameInput: input,
      resultContainer: result,
      clearFeedback() {},
      cancelRecentSectionRender() {},
      teardownSetCardHandlers() {},
      setLoadingState() {},
      prepareProfileResources: async () => [],
      showFeedback() {
        assert.fail('Cancelled search must not show errors');
      },
      handleSpecialPageSearch: async (name) => {
        if (name !== 'privacy') return false;
        result.innerHTML = 'Privacy page';
        return true;
      },
      loadTemplate: () => {
        templateStarted = true;
        markStarted();
        return new Promise((resolve) => {
          release = resolve;
        });
      },
    });
    vm.runInContext(await moduleSource('handlers/search-handler.js'), context);
    const old = context.submitSearch();
    await started;
    assert.equal(templateStarted, true);
    input.value = 'privacy';
    await context.submitSearch();
    release('OLD SKELETON');
    await old;
    assert.equal(result.innerHTML, 'Privacy page');
  }
);

test('cancelled special-page dispatch cannot update loading, feedback or scroll', async () => {
  let rejectPage;
  let pageSignal;
  const loading = [];
  const controller = new AbortController();
  const context = vm.createContext({
    isDevelopersQuery: () => false,
    isPatreonsQuery: () => true,
    teardownLivePage() {},
    teardownLeaderboardPage() {},
    recentContainer: null,
    resultContainer: {},
    updateLoadingState(value) {
      loading.push(value);
    },
    displayFeedback() {
      assert.fail('Stale error feedback');
    },
    setFavicon() {},
    setMetaDescription() {},
    proxiedImageUrl() {},
    escapeHtml() {},
    DEFAULT_FAVICON: '',
    usernameInput: {},
    form: {},
    renderPatreonsPage: (...args) => {
      pageSignal = args.at(-1).signal;
      return new Promise((_resolve, reject) => {
        rejectPage = reject;
      });
    },
  });
  vm.runInContext(await moduleSource('handlers/search-special-pages.js'), context);
  const pending = context.handleSpecialPageSearch('patreons', { signal: controller.signal });
  assert.equal(pageSignal, controller.signal);
  controller.abort();
  rejectPage(new Error('Old page request failed'));
  assert.equal(await pending, true);
  assert.deepEqual(loading, [true]);
});
