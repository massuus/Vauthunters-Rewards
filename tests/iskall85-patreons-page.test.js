import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIskall85PatreonRoster } from '../functions/api/iskall85-patreons.js';
import {
  isIskall85PatreonsQuery,
  renderIskall85PatreonGroups,
} from '../public/js/components/special-pages/iskall85-patreons-page.js';
import { escapeHtml } from '../public/js/features/reward-utils.js';

test('Iskall85 Patreon aliases do not take over unrelated player names', () => {
  assert.equal(isIskall85PatreonsQuery('iskall85 patreons'), true);
  assert.equal(isIskall85PatreonsQuery(' ISKALL PATREON '), true);
  assert.equal(isIskall85PatreonsQuery('iskall85'), false);
});

test('Iskall85 roster sorts highest tier first and excludes VH-only members', () => {
  const roster = normalizeIskall85PatreonRoster({
    IronPlayer: { iskall85: 'Iron' },
    EmeraldPlayer: { iskall85: 'Emerald' },
    DiamondPlayer: { iskall85: 'Diamond' },
    VaultOnly: { vaultHunters: 'Vault Champion', iskall85: null },
  });
  assert.deepEqual(
    roster.map(({ ign, tier }) => [ign, tier]),
    [
      ['EmeraldPlayer', 'Emerald'],
      ['DiamondPlayer', 'Diamond'],
      ['IronPlayer', 'Iron'],
    ]
  );
});

test('Iskall85 Patreon page renders every tier in rank order', () => {
  const html = renderIskall85PatreonGroups(
    [{ ign: 'EmeraldPlayer', tier: 'Emerald' }],
    (url) => url,
    escapeHtml
  );
  assert.ok(html.indexOf('Emerald (1)') < html.indexOf('Iron (0)'));
  assert.match(html, /data-player-name="EmeraldPlayer"/);
});
