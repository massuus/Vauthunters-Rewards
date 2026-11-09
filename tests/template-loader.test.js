import test from 'node:test';
import assert from 'node:assert/strict';
import { logger } from '../public/js/core/logger.js';
import { loadTemplate, renderTemplate } from '../public/js/loaders/template-loader.js';

test('overlapping template loads share requests, including empty successful templates', async (t) => {
  let calls = 0;
  let release;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    await new Promise((resolve) => {
      release = resolve;
    });
    return new Response('');
  });
  const first = loadTemplate('concurrent-test');
  const second = loadTemplate('concurrent-test');
  assert.equal(calls, 1);
  release();
  assert.deepEqual(await Promise.all([first, second]), ['', '']);
  assert.equal(await loadTemplate('concurrent-test'), '');
  assert.equal(calls, 1);
});

test('failed template requests can be retried', async (t) => {
  let calls = 0;
  t.mock.method(logger, 'error', () => {});
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return calls === 1 ? new Response(null, { status: 503 }) : new Response('Recovered');
  });
  assert.equal(await loadTemplate('retry-test'), '');
  assert.equal(await loadTemplate('retry-test'), 'Recovered');
  assert.equal(calls, 2);
});

test('template values are literal and inserted placeholders are not processed again', () => {
  assert.equal(
    renderTemplate('{{price}} / {{name}} / {{unknown}}', {
      price: '$& $1 {{name}}',
      name: 'Alice',
    }),
    '$& $1 {{name}} / Alice / {{unknown}}'
  );
  assert.equal(
    renderTemplate('{{a.b}} {{empty}} {{count}}', { 'a.b': 'literal key', empty: null, count: 0 }),
    'literal key  0'
  );
});
