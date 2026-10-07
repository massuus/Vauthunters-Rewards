import test from 'node:test';
import assert from 'node:assert/strict';
import { isStreamerLive, createLiveChecker } from '../live-status.mjs';

const credentials = { clientId: 'example-client', clientSecret: 'example-secret' };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('batch checker reuses its app token until near expiry', async () => {
  let now = 0;
  let authCalls = 0;
  const check = createLiveChecker({
    ...credentials,
    now: () => now,
    fetchImpl: async (url) => {
      if (String(url).startsWith('https://id.twitch.tv/')) {
        authCalls++;
        return response({ access_token: 'app-token', expires_in: 3600 });
      }
      assert.deepEqual(new URL(url).searchParams.getAll('user_login'), ['hoy_82', 'iskall85']);
      return response({ data: [{ user_login: 'iskall85', type: 'live' }] });
    },
  });
  assert.deepEqual(await check(['hoy_82', 'iskall85']), ['iskall85']);
  await check(['hoy_82', 'iskall85']);
  assert.equal(authCalls, 1);
  now = 3600_000;
  await check(['hoy_82', 'iskall85']);
  assert.equal(authCalls, 2);
});

test('live check distinguishes offline from live without using a browser or user token', async () => {
  for (const live of [false, true]) {
    const requests = [];
    const result = await isStreamerLive('hoy_82', {
      ...credentials,
      fetchImpl: async (url, options) => {
        requests.push({ url: String(url), options });
        return requests.length === 1
          ? response({ access_token: 'app-token' })
          : response({ data: live ? [{ user_login: 'hoy_82', type: 'live' }] : [] });
      },
    });
    assert.equal(result, live);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].options.body.get('grant_type'), 'client_credentials');
    assert.equal(requests[0].url.includes('example-secret'), false);
    assert.equal(new URL(requests[1].url).searchParams.get('user_login'), 'hoy_82');
    assert.equal(requests[1].options.headers.Authorization, 'Bearer app-token');
  }
});

test('live-check failures are never treated as offline or allowed to fall through', async () => {
  for (const [body, status, code] of [
    [{ data: [] }, 429, 'live-check-request-failed'],
    [{ message: 'upstream-secret' }, 200, 'live-check-invalid-response'],
    [{ data: [{ user_login: 'other', type: 'live' }] }, 200, 'live-check-invalid-response'],
  ]) {
    let calls = 0;
    await assert.rejects(
      isStreamerLive('hoy_82', {
        ...credentials,
        fetchImpl: async () =>
          ++calls === 1 ? response({ access_token: 'app-token' }) : response(body, status),
      }),
      { code, message: code }
    );
  }
});

test('missing credentials, auth failures and network failures have redacted errors', async () => {
  await assert.rejects(isStreamerLive('hoy_82', {}), { code: 'live-check-credentials-missing' });
  await assert.rejects(
    isStreamerLive('hoy_82', {
      ...credentials,
      fetchImpl: async () => response({ message: 'secret' }, 401),
    }),
    { code: 'live-check-auth-failed' }
  );
  await assert.rejects(
    isStreamerLive('hoy_82', {
      ...credentials,
      fetchImpl: async () => {
        throw new Error('sensitive URL');
      },
    }),
    { code: 'live-check-unavailable', message: 'live-check-unavailable' }
  );
});
