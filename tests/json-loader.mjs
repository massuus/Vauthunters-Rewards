import { readFile } from 'node:fs/promises';

const developerCatalog = new URL('../functions/data/developers.json', import.meta.url).href;
const setArtCatalog = new URL('../public/data/set-art.json', import.meta.url).href;

export async function load(url, context, nextLoad) {
  if (url !== developerCatalog && url !== setArtCatalog) return nextLoad(url, context);
  const data = JSON.parse((await readFile(new URL(url), 'utf8')).replace(/^\uFEFF/, ''));
  return {
    format: 'module',
    source: `export default ${JSON.stringify(data)};`,
    shortCircuit: true,
  };
}
