import test from 'node:test';
import assert from 'node:assert/strict';
import { communityStreamRows } from '../functions/api/community-live.js';

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
