import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addLinkedMinecraftAccounts,
  communityStreamRows,
} from '../functions/api/community-live.js';

test('community discovery accepts Vault Hunters tags and titles while excluding official channels', () => {
  const rows = communityStreamRows([
    {
      user_login: 'community_player',
      user_name: 'Community Player',
      title: 'Modded Minecraft',
      tags: ['English', 'Vault Hunters'],
      viewer_count: 42,
      started_at: '2026-10-10T10:00:00Z',
      language: 'en',
      thumbnail_url:
        'https://static-cdn.jtvnw.net/previews-ttv/live_user_test-{width}x{height}.jpg',
    },
    { user_login: 'another_player', title: 'Vault Hunters 3 with friends', tags: [] },
    { user_login: 'unrelated', title: 'Vanilla Minecraft', tags: ['English'] },
    { user_login: 'iskall85', title: 'Vault Hunters', tags: ['VaultHunters'] },
  ]);
  assert.deepEqual(
    rows.map((row) => row.login),
    ['community_player', 'another_player']
  );
  assert.equal(rows[0].previewImageUrl.includes('440x248'), true);
  assert.equal(rows[0].viewerCount, 42);
});

test('community discovery rejects unsafe preview image hosts', () => {
  const [row] = communityStreamRows([
    {
      user_login: 'community_player',
      title: 'Playing VH3',
      thumbnail_url: 'https://example.test/tracker.png',
    },
  ]);
  assert.equal(row.previewImageUrl, null);
});

test('community discovery accepts a directly checked known channel by its title', () => {
  const rows = communityStreamRows([
    {
      user_login: 'drgcsg',
      user_name: 'DRGCSG',
      title: 'Minecraft vault hunters with the gremlins',
      tags: ['English'],
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].login, 'drgcsg');
});

test('community streams mark only verified Minecraft links', async () => {
  const calls = [];
  const rows = await addLinkedMinecraftAccounts(
    [{ login: 'linked' }, { login: 'unlinked' }],
    { REWARDS_API_KEY: 'test-key' },
    async (url) => {
      calls.push(url);
      return url.endsWith('twitchUsername=linked')
        ? { data: { minecraftId: '0123456789abcdef0123456789abcdef' } }
        : { data: {} };
    }
  );
  assert.deepEqual(
    rows.map((row) => row.hasLinkedMinecraftAccount),
    [true, false]
  );
  assert.equal(calls.length, 2);
});

test('community Minecraft link checks are skipped without rewards auth', async () => {
  let called = false;
  const input = [{ login: 'community_player' }];
  const rows = await addLinkedMinecraftAccounts(input, {}, async () => {
    called = true;
  });
  assert.equal(rows, input);
  assert.equal(called, false);
});
