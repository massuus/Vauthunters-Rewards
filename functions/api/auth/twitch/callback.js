import {
  OAUTH_STATE_COOKIE,
  clearOauthStateCookie,
  consumeOauthFlow,
  createAuthSession,
  exchangeTwitchCode,
  getTwitchIdentity,
  sessionCookie,
} from '../../../utils/auth.js';
import {
  ApiError,
  getExpectedOrigin,
  methodNotAllowed,
  parseCookies,
} from '../../../utils/http.js';

function errorPage(request, message, status = 400) {
  const safeMessage = String(message || 'Twitch login failed.').replace(/[&<>"']/g, (character) => {
    const replacements = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return replacements[character];
  });
  const headers = new Headers({
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  headers.append('Set-Cookie', clearOauthStateCookie(request));
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Twitch login</title><body style="font-family:system-ui;background:#171a1d;color:#fff;padding:2rem"><h1>Twitch login failed</h1><p>${safeMessage}</p><p><a style="color:#ff9a10" href="/?mining">Return to Mining Clues</a></p></body></html>`,
    { status, headers }
  );
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return methodNotAllowed('GET');

  try {
    const url = new URL(request.url);
    const returnedState = String(url.searchParams.get('state') || '');
    const stateCookie = String(parseCookies(request)[OAUTH_STATE_COOKIE] || '');
    if (!returnedState || !stateCookie || returnedState !== stateCookie) {
      throw new ApiError(400, 'The login security check did not match. Please start again.');
    }
    if (url.searchParams.get('error')) {
      throw new ApiError(400, 'Twitch authorization was cancelled.');
    }
    const code = String(url.searchParams.get('code') || '');
    if (!code) throw new ApiError(400, 'Twitch did not return a login code.');

    const flow = await consumeOauthFlow(env, returnedState);
    const tokens = await exchangeTwitchCode(request, env, code);
    const identity = await getTwitchIdentity(env, tokens.access_token);
    const session = await createAuthSession(env, identity, tokens);
    const location = new URL(flow.returnPath, getExpectedOrigin(request, env)).toString();
    const headers = new Headers({ Location: location, 'cache-control': 'no-store' });
    headers.append('Set-Cookie', sessionCookie(request, session.sessionToken));
    headers.append('Set-Cookie', clearOauthStateCookie(request));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error('Twitch callback failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return errorPage(request, error instanceof ApiError ? error.message : 'Twitch login failed.');
  }
}
