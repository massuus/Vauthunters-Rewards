export function onRequest({ request }) {
  if (request.method !== 'GET') {
    return new Response('Method not allowed.', {
      status: 405,
      headers: { Allow: 'GET', 'cache-control': 'no-store' },
    });
  }

  const url = new URL(request.url);
  const returnTo = String(url.searchParams.get('returnTo') || '/?leaderboard').trim();
  const loginUrl = new URL('/api/auth/twitch/login', url.origin);
  loginUrl.searchParams.set('returnTo', returnTo);

  return new Response(null, {
    status: 302,
    headers: {
      Location: loginUrl.toString(),
      'cache-control': 'no-store',
    },
  });
}
