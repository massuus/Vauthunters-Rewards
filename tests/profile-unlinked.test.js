import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/profile.js';

test('Twitch rewards remain available without a Minecraft account', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(String(url));
    if (String(url).includes('/rewards?twitchUsername=')) {
      return Response.json({
        twitchUsername: 'grim_stoner',
        sets: ['companion10'],
        rewards: { 'the_vault:companion': ['the_vault:dylan_penguin'] },
      });
    }
    if (String(url).includes('/users/reward/list')) return Response.json({});
    throw new Error(`Unexpected request: ${url}`);
  });
  const response = await onRequest({
    request: new Request('https://example.com/api/profile?twitchUsername=grim_stoner'),
    env: {},
  });
  assert.equal(response.status, 200);
  const profile = await response.json();
  assert.equal(profile.minecraftLinked, false);
  assert.equal(profile.id, null);
  assert.equal(profile.name, 'grim_stoner');
  assert.equal(profile.twitchUsername, 'grim_stoner');
  assert.deepEqual(profile.sets, ['companion10']);
  assert.deepEqual(profile.rewards['the_vault:companion'], ['the_vault:dylan_penguin']);
  assert.deepEqual(profile.companionStats, []);
  assert.equal(
    requests.some((url) => url.includes('playerdb')),
    false
  );
});

test('unknown Twitch accounts still return 404', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));
  const response = await onRequest({
    request: new Request('https://example.com/api/profile?twitchUsername=unknown_player'),
    env: {},
  });
  assert.equal(response.status, 404);
});
