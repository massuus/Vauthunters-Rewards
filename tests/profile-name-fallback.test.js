import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/profile.js';

const uuid = 'a37759b7a74143b6b8f1f1e4668072d0';
const found = (name, id = uuid) =>
  Response.json({ success: true, data: { player: { username: name, raw_id: id } } });

test('missing Minecraft name resolves via its verified Twitch-to-Minecraft link', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    const value = String(url);
    requests.push(value);
    if (value.includes('playerdb') && value.endsWith('/darkest9469'))
      return Response.json({}, { status: 400 });
    if (value.includes('/rewards?twitchUsername=darkest9469'))
      return Response.json({ minecraftId: uuid, sets: ['companion10'], rewards: {} });
    if (value.includes('playerdb') && value.endsWith(`/${uuid}`)) return found('_Darkest');
    if (value.includes('/users/reward/list')) return Response.json({});
    if (value.includes('/users/reward?uuid=')) return Response.json({ tier: [] });
    throw new Error(`Unexpected request: ${value}`);
  });
  const response = await onRequest({
    request: new Request('https://example.test/api/profile?username=Darkest9469'),
    env: {},
  });
  assert.equal(response.status, 200);
  const profile = await response.json();
  assert.equal(profile.id, uuid);
  assert.equal(profile.name, '_Darkest');
  assert.equal(profile.twitchUsername, 'darkest9469');
  assert.equal(profile.minecraftLinked, true);
  assert.deepEqual(profile.sets, ['companion10']);
  assert.ok(requests.some((url) => url.endsWith(`/${uuid}`)));
});

test('existing Minecraft username takes priority over a same-named Twitch account', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    const value = String(url);
    assert.equal(value.includes('twitchUsername='), false);
    if (value.includes('playerdb')) return found('ExistingPlayer');
    if (value.includes('/users/reward/list')) return Response.json({});
    if (value.includes('/users/reward?uuid=')) return Response.json({ tier: [] });
    if (value.includes('/rewards?minecraft=')) return Response.json({ sets: [], rewards: {} });
    throw new Error(`Unexpected request: ${value}`);
  });
  const response = await onRequest({
    request: new Request('https://example.test/api/profile?username=ExistingPlayer'),
    env: {},
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).twitchUsername, undefined);
});

test('a matching Twitch handle without a verified Minecraft link does not substitute another identity', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).includes('playerdb')) return Response.json({}, { status: 404 });
    return Response.json({ sets: ['some_reward'], rewards: {} });
  });
  const response = await onRequest({
    request: new Request('https://example.test/api/profile?username=NoLinkedPlayer'),
    env: {},
  });
  assert.equal(response.status, 404);
});
