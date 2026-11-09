import { promises as fs } from 'node:fs';
import path from 'node:path';

// Local tabs may still reference a previous build's content-hashed modules.
// Preserve those modules only for local builds; production output stays clean.
export async function prepareBuildOutput(outputDir, { keepChunks = false } = {}) {
  const outputRoot = path.resolve(outputDir);
  if (!keepChunks) {
    await fs.rm(outputRoot, { recursive: true, force: true });
    await fs.mkdir(outputRoot, { recursive: true });
    return;
  }
  await fs.mkdir(outputRoot, { recursive: true });
  for (const entry of await fs.readdir(outputRoot)) {
    if (entry === 'chunks') continue;
    const target = path.resolve(outputRoot, entry);
    if (path.dirname(target) !== outputRoot) throw new Error('Invalid build output path.');
    await fs.rm(target, { recursive: true, force: true });
  }
}
