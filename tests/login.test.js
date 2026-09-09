import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequest } from '../functions/login.js';

test('/login forwards to Twitch login and returns to the leaderboard', () => {
  const response = onRequest({ request: new Request('https://example.test/login') });
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get('location'));
  assert.equal(location.pathname, '/api/auth/twitch/login');
  assert.equal(location.searchParams.get('returnTo'), '/?leaderboard');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('/login preserves an explicit local return path for validation by the OAuth endpoint', () => {
  const response = onRequest({
    request: new Request('https://example.test/login?returnTo=%2F%3Fmining'),
  });
  const location = new URL(response.headers.get('location'));
  assert.equal(location.searchParams.get('returnTo'), '/?mining');
});
