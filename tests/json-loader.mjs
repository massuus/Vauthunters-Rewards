import { readFile } from 'node:fs/promises';

const developerCatalog = new URL('../functions/data/developers.json', import.meta.url).href;

export async function load(url, context, nextLoad) {
  if (url !== developerCatalog) return nextLoad(url, context);
  const data = JSON.parse(await readFile(new URL(url), 'utf8'));
  return {
    format: 'module',
    source: `export default ${JSON.stringify(data)};`,
    shortCircuit: true,
  };
}
