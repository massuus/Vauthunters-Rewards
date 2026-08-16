import {
  buildTwitchAuthorizationUrl,
  createOauthFlow,
  oauthStateCookie,
  sanitizeReturnPath,
} from '../../../utils/auth.js';
import { handleApiError, methodNotAllowed } from '../../../utils/http.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return methodNotAllowed('GET');

  try {
    const url = new URL(request.url);
    const returnPath = sanitizeReturnPath(url.searchParams.get('returnTo'));
    const state = await createOauthFlow(env, returnPath);
    const headers = new Headers({
      Location: buildTwitchAuthorizationUrl(request, env, state),
      'cache-control': 'no-store',
    });
    headers.append('Set-Cookie', oauthStateCookie(request, state));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    return handleApiError(error, 'Twitch login could not be started.');
  }
}
