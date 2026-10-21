import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (
  await readFile(new URL('../public/js/core/error-handler.js', import.meta.url), 'utf8')
)
  .replace("import { logger } from './logger.js';", '')
  .replaceAll('export ', '');

function setup() {
  const handlers = [];
  const logs = [];
  const feedback = { textContent: '', hidden: true };
  const window = {
    addEventListener: (name, handler, capture) => handlers.push({ name, handler, capture }),
  };
  const context = vm.createContext({
    window,
    document: { getElementById: () => feedback },
    logger: { error: (...args) => logs.push(args) },
    URL,
    setTimeout: () => {},
  });
  vm.runInContext(`${source}\ninitializeErrorHandlers();`, context);
  return {
    feedback,
    logs,
    emit(event, capture = false) {
      event.target ??= window;
      handlers
        .find((entry) => entry.name === 'error' && Boolean(entry.capture) === capture)
        .handler(event);
    },
  };
}

test('opaque iOS script errors are logged without showing a search failure', () => {
  const app = setup();
  app.emit({ message: 'Script error.', filename: '', error: null });
  assert.equal(app.feedback.hidden, true);
  assert.equal(app.logs.length, 1);
});

test('optional analytics failures do not replace search feedback', () => {
  for (const capture of [false, true]) {
    const app = setup();
    app.feedback.textContent = 'Please enter a Minecraft username.';
    const url = 'https://static.cloudflareinsights.com/beacon.min.js';
    app.emit(capture ? { target: { tagName: 'SCRIPT', src: url } } : { filename: url }, capture);
    assert.equal(app.feedback.textContent, 'Please enter a Minecraft username.');
    assert.equal(app.logs.length, 1);
  }
});

test('application runtime and resource failures still show feedback', () => {
  const app = setup();
  app.emit({
    message: 'Broken app',
    filename: 'https://example.com/js/core/app.js',
    error: new Error('Broken app'),
  });
  assert.equal(app.feedback.hidden, false);
  assert.match(app.feedback.textContent, /unexpected error/);
  app.emit({ target: { tagName: 'SCRIPT', src: 'https://example.com/js/core/app.js' } }, true);
  assert.match(app.feedback.textContent, /Failed to load application resources/);
});
