import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (
  await readFile(new URL('../public/js/components/recent-section.js', import.meta.url), 'utf8')
)
  .replace(/^import[\s\S]*?;\s*/gm, '')
  .replaceAll('export ', '');

function fixture({ home = true } = {}) {
  const classes = new Set(['hidden']);
  const context = vm.createContext({
    showHomeDashboard() {},
    hideHomeDashboard() {},
    usernameInput: { value: home ? '' : 'Alice' },
    resultContainer: { classList: { contains: () => home } },
    recentContainer: {
      innerHTML: '',
      classList: {
        add: (value) => classes.add(value),
        remove: (value) => classes.delete(value),
      },
      querySelectorAll: () => [],
    },
    getRecentUsers: () => (home ? [] : [{ name: 'Alice' }]),
    escapeHtml: (value) => value,
    proxiedImageUrl: (value) => value,
    getBestPatreonTier: () => null,
    DEFAULT_FAVICON: '',
    loadTemplate: async () => 'template',
    renderTemplate: (_template, data) => JSON.stringify(data),
  });
  vm.runInContext(source, context);
  return { context, classes };
}

test('delayed home leaderboard cannot reappear after navigating away', async () => {
  const { context, classes } = fixture();
  const releases = [];
  context.fetchLeaderboardPage = () =>
    new Promise((resolve) => {
      releases.push(resolve);
    });
  const pending = context.renderRecentSection();
  context.usernameInput.value = 'leaderboard';
  context.cancelRecentSectionRender();
  context.recentContainer.innerHTML = 'New page state';
  releases.forEach((release) =>
    release({ players: [{ playerNickname: 'Alice', seasonLevel: 1 }] })
  );
  await pending;
  assert.equal(context.recentContainer.innerHTML, 'New page state');
  assert.equal(classes.has('hidden'), true);
});

test('delayed profile recents cannot commit after their navigation is cancelled', async () => {
  const { context, classes } = fixture({ home: false });
  let release;
  context.loadTemplate = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const controller = new AbortController();
  const pending = context.renderRecentSection({ signal: controller.signal });
  controller.abort();
  context.recentContainer.innerHTML = 'New page state';
  release('template');
  await pending;
  assert.equal(context.recentContainer.innerHTML, 'New page state');
  assert.equal(classes.has('hidden'), true);
});

test('recent search chips that do not fit are hidden and restored when space returns', () => {
  const items = [80, 90, 100].map((width) => ({
    hidden: false,
    addEventListener() {},
    getAttribute: () => 'Alice',
    getBoundingClientRect: () => ({ width }),
  }));
  const grid = {
    clientWidth: 170,
    querySelectorAll: () => items,
  };
  let resize;
  const context = vm.createContext({
    recentContainer: {
      querySelector: () => grid,
      querySelectorAll: () => items,
    },
    getComputedStyle: () => ({ columnGap: '8px' }),
    ResizeObserver: class {
      constructor(callback) {
        resize = callback;
      }

      observe() {}
      disconnect() {}
    },
  });
  vm.runInContext(source, context);
  context.bindRecentHandlers();
  assert.deepEqual(
    items.map((item) => item.hidden),
    [false, true, true]
  );
  grid.clientWidth = 300;
  resize();
  assert.deepEqual(
    items.map((item) => item.hidden),
    [false, false, false]
  );
});

test('startup lets a preset route own its recent-section rendering', async () => {
  let recents = 0;
  let submissions = 0;
  const context = vm.createContext({
    navigator: {},
    usernameInput: {},
    document: {
      getElementById: () => ({
        dispatchEvent() {
          submissions += 1;
        },
      }),
    },
    Event,
    initializeErrorHandlers() {},
    initRewardModelPreviews() {},
    initSeasonalThemes() {},
    initializeSearch() {},
    initPlayerSuggestions() {},
    initNavigation() {},
    initPWAInstall() {},
    initSupportPopup() {},
    initPressFeedback() {},
    preloadTemplates: async () => {},
    getUsernameFromQuery: () => 'leaderboard',
    renderRecentSection: async () => {
      recents += 1;
    },
  });
  const app = await readFile(new URL('../public/js/core/app.js', import.meta.url), 'utf8');
  vm.runInContext(
    app.split('// Initialize the app\n')[0].replace(/^import[\s\S]*?;\s*/gm, ''),
    context
  );
  await context.initializeApp();
  assert.equal(submissions, 1);
  assert.equal(recents, 0);
  context.getUsernameFromQuery = () => '';
  await context.initializeApp();
  assert.equal(recents, 1);
});
