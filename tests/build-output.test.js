import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareBuildOutput } from '../scripts/build-output.js';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vhr-build-output-'));
  // Keep cleanup scoped to this test's newly created directory.
  assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const output = path.join(root, 'dist');
  await fs.mkdir(path.join(output, 'chunks'), { recursive: true });
  await fs.writeFile(
    path.join(output, 'chunks', 'recent-section-OLDHASH1.js'),
    'export const value = 1;'
  );
  await fs.writeFile(path.join(output, 'obsolete.html'), 'old page');
  return output;
}

test('local rebuilds preserve old hashed modules needed by already open tabs', async (t) => {
  const output = await fixture(t);
  await prepareBuildOutput(output, { keepChunks: true });
  assert.equal(
    await fs.readFile(path.join(output, 'chunks', 'recent-section-OLDHASH1.js'), 'utf8'),
    'export const value = 1;'
  );
  await assert.rejects(fs.access(path.join(output, 'obsolete.html')), { code: 'ENOENT' });
});

test('production builds discard obsolete chunks', async (t) => {
  const output = await fixture(t);
  await prepareBuildOutput(output);
  assert.deepEqual(await fs.readdir(output), []);
});
