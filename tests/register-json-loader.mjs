import { register } from 'node:module';

// Production bundlers support plain JSON imports. Let Node tests load the same source.
register('./json-loader.mjs', import.meta.url);
