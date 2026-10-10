import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCommunityDiscoverer, isVaultHuntersStream } from '../community-discovery.mjs';

test('matches Vault Hunters tags and strong title phrases', () => {
  assert.equal(isVaultHuntersStream({ tags: ['Vault Hunters'], title: '' }), true);
  assert.equal(isVaultHuntersStream({ tags: ['English'], title: 'Minecraft Vault Hunters' }), true);
  assert.equal(isVaultHuntersStream({ tags: ['English'], title: 'Vanilla Minecraft' }), false);
});

test('discovery persists candidates and keeps them when later scans do not return them', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vh-community-'));
  const statePath = join(directory, 'community.json');
  let scan = 0;
  const fetchImpl = async (url) => {
    if (String(url).startsWith('https://id.twitch.tv/'))
      return Response.json({ access_token: 'token', expires_in: 3600 });
    scan += 1;
    return Response.json({
      data:
        scan === 1
          ? [{ user_login: 'drgcsg', title: 'Minecraft vault hunters', tags: ['English'] }]
          : [],
      pagination: {},
    });
  };
  try {
    const discover = createCommunityDiscoverer({
      clientId: 'client',
      clientSecret: 'secret',
      statePath,
      fetchImpl,
      now: () => Date.parse('2026-10-10T18:00:00Z'),
    });
    assert.deepEqual(
      (await discover()).candidates.map((row) => row.login),
      ['drgcsg']
    );
    assert.deepEqual(
      (await discover()).candidates.map((row) => row.login),
      ['drgcsg']
    );
    assert.equal(JSON.parse(await readFile(statePath, 'utf8')).candidates[0].login, 'drgcsg');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
