import { DEVELOPERS } from '../utils/developers.js';
import { methodNotAllowed } from '../utils/http.js';

export function onRequest({ request }) {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  const developers = Object.entries(DEVELOPERS)
    .map(([ign, uuid]) => ({ ign, uuid }))
    .sort((a, b) => a.ign.localeCompare(b.ign, 'en', { sensitivity: 'base' }));
  return Response.json(developers, {
    headers: { 'cache-control': 'public, max-age=300, s-maxage=300' },
  });
}
