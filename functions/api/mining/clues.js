import { listMiningClues } from '../../utils/mining-db.js';
import { handleApiError, json, methodNotAllowed } from '../../utils/http.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return methodNotAllowed('GET');

  try {
    const payload = await listMiningClues(env, new URL(request.url).searchParams);
    return json(payload, 200, {
      'cache-control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=60',
    });
  } catch (error) {
    return handleApiError(error, 'Mining clues could not be loaded.');
  }
}
