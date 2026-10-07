import test from 'node:test';
import assert from 'node:assert/strict';
import { manualEdgeArgs, twitchOnlyState, hasTwitchSession } from '../login-state.mjs';

test('manual browser launch uses a dedicated profile without attaching automation', () => {
  const profile = 'E:\\Project With Spaces\\.auth\\manual-edge';
  const args = manualEdgeArgs(profile);
  assert.equal(args[0], `--user-data-dir=${profile}`);
  assert.equal(args.at(-1), 'https://www.twitch.tv/login');
  assert.equal(
    args.some((arg) => /remote-debugging|automation|disable-blink|user-agent/.test(arg)),
    false
  );
});

test('export keeps only Twitch-owned state, excluding lookalike and unrelated domains', () => {
  const domains = [
    '.twitch.tv',
    'id.twitch.tv',
    '.not-twitch.tv',
    '.twitch.tv.evil.example',
    '.example.com',
  ];
  const result = twitchOnlyState({
    cookies: domains.map((domain) => ({ domain, name: 'test', value: 'placeholder' })),
    origins: domains.map((domain) => ({
      origin: `https://${domain.replace(/^\./, '')}`,
      localStorage: [],
    })),
  });
  assert.deepEqual(
    result.cookies.map((cookie) => cookie.domain),
    ['.twitch.tv', 'id.twitch.tv']
  );
  assert.deepEqual(
    result.origins.map((origin) => origin.origin),
    ['https://twitch.tv', 'https://id.twitch.tv']
  );
});

test('expired, missing, empty, or unrelated cookies are not accepted as a Twitch session', () => {
  const cookie = { domain: '.twitch.tv', name: 'auth-token', value: 'placeholder', expires: 2000 };
  assert.equal(hasTwitchSession([cookie], 1000), true);
  assert.equal(hasTwitchSession([{ ...cookie, expires: -1 }], 1000), true);
  for (const change of [
    { expires: 999 },
    { value: '' },
    { domain: '.not-twitch.tv' },
    { name: 'other' },
  ]) {
    assert.equal(hasTwitchSession([{ ...cookie, ...change }], 1000), false);
  }
  assert.equal(hasTwitchSession([], 1000), false);
});
