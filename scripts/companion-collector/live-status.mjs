import { CollectorError } from './socket.mjs';

// Uses only the app credentials. Never reuse or refresh the chat bot's user token.
export function createLiveChecker({
  clientId,
  clientSecret,
  signal,
  fetchImpl = fetch,
  now = Date.now,
}) {
  let token;
  let tokenValidUntil = 0;
  const boundedSignal = () =>
    signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000);
  return async (streamers) => {
    if (
      !Array.isArray(streamers) ||
      !streamers.length ||
      streamers.length > 100 ||
      streamers.some((streamer) => !/^[a-z0-9_]{1,25}$/.test(streamer))
    )
      throw new CollectorError('invalid-streamer');
    if (!clientId || !clientSecret) throw new CollectorError('live-check-credentials-missing');
    try {
      if (!token || now() >= tokenValidUntil) {
        const auth = await fetchImpl('https://id.twitch.tv/oauth2/token', {
          method: 'POST',
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'client_credentials',
          }),
          signal: boundedSignal(),
        });
        if (!auth.ok) throw new CollectorError('live-check-auth-failed');
        const authData = await auth.json();
        token = authData.access_token;
        if (typeof token !== 'string' || !token) throw new CollectorError('live-check-auth-failed');
        tokenValidUntil = now() + Math.max(0, (Number(authData.expires_in) || 0) - 60) * 1000;
      }
      const url = new URL('https://api.twitch.tv/helix/streams');
      for (const streamer of new Set(streamers)) url.searchParams.append('user_login', streamer);
      const response = await fetchImpl(url, {
        headers: { 'Client-Id': clientId, Authorization: `Bearer ${token}` },
        signal: boundedSignal(),
      });
      if (!response.ok) {
        if (response.status === 401) tokenValidUntil = 0;
        throw new CollectorError('live-check-request-failed');
      }
      const data = (await response.json()).data;
      if (
        !Array.isArray(data) ||
        data.length > streamers.length ||
        data.some(
          (row) => !streamers.includes(row?.user_login?.toLowerCase()) || row?.type !== 'live'
        )
      ) {
        throw new CollectorError('live-check-invalid-response');
      }
      return [...new Set(data.map((row) => row.user_login.toLowerCase()))];
    } catch (error) {
      if (error instanceof CollectorError) throw error;
      throw new CollectorError('live-check-unavailable');
    }
  };
}

export async function isStreamerLive(streamer, options) {
  return (await createLiveChecker(options)([streamer])).includes(streamer);
}
