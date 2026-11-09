import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function collectPrecacheAssets(metafile, outputDir, publicDir) {
  const outputRoot = path.resolve(outputDir);
  const assets = new Set();
  for (const filename of Object.keys(metafile.outputs)) {
    if (!filename.endsWith('.js')) continue;
    const relative = path.relative(outputRoot, path.resolve(filename));
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Build output is outside the output directory: ${filename}`);
    }
    assets.add(`/${relative.split(path.sep).join('/')}`);
  }

  async function collectStyles(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) await collectStyles(filename);
      else if (entry.isFile() && entry.name.endsWith('.css')) {
        assets.add(`/${path.relative(publicDir, filename).split(path.sep).join('/')}`);
      }
    }
  }
  await collectStyles(path.join(publicDir, 'css'));
  return [...assets].sort();
}
