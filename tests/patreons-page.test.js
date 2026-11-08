import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePatreonRoster, resolveLegendTiers } from '../functions/api/patreons.js';
import {
  isPatreonsQuery,
  renderPatreonGroups,
} from '../public/js/components/special-pages/patreons-page.js';
import { escapeHtml } from '../public/js/features/reward-utils.js';

test('Patreon page aliases do not take over player names', () => {
  for (const value of ['patreon', 'patreons', ' PATRONS '])
    assert.equal(isPatreonsQuery(value), true);
  for (const value of ['', null, 'PatreonFan']) assert.equal(isPatreonsQuery(value), false);
});

test('Patreon roster excludes unrelated tiers and sorts highest tier first', () => {
  const roster = normalizePatreonRoster({
    Dweller: { vaultHunters: 'Vault Dweller' },
    Legend: { vaultHunters: 'Vault Legend' },
    ChampB: { vaultHunters: 'Vault Champion' },
    ChampA: { vaultHunters: 'Vault Champion' },
    Other: { vaultHunters: null, iskall85: 'Diamond' },
    null: { vaultHunters: 'Vault Legend' },
  });
  assert.deepEqual(
    roster.map(({ ign, tier }) => [ign, tier]),
    [
      ['Legend', 'Vault Legend'],
      ['ChampA', 'Vault Champion'],
      ['ChampB', 'Vault Champion'],
      ['Dweller', 'Vault Dweller'],
    ]
  );
});

test('Legend members are discovered from individual entitlements without name overrides', async () => {
  const roster = normalizePatreonRoster({
    TwitchLegend: { vaultHunters: 'Vault Champion' },
    MinecraftLegend: { vaultHunters: 'Vault Champion' },
    RegularChampion: { vaultHunters: 'Vault Champion' },
  });
  const fetchImpl = async (url) => {
    if (url.includes('twitchUsername=TwitchLegend'))
      return Response.json({ minecraftId: 'twitch-uuid' });
    if (url.includes('twitchUsername=MinecraftLegend')) return Response.json({});
    if (url.includes('twitchUsername=RegularChampion'))
      return Response.json({ minecraftId: 'champion-uuid' });
    if (url.includes('/minecraft/MinecraftLegend')) {
      return Response.json({
        data: { player: { raw_id: '22222222222222222222222222222222' } },
      });
    }
    if (
      url.includes('uuid=twitch-uuid') ||
      url.includes('uuid=22222222-2222-2222-2222-222222222222')
    ) {
      return Response.json({ tier: [{ name: 'Vault Champion' }, { name: 'Vault Legend' }] });
    }
    if (url.includes('uuid=champion-uuid'))
      return Response.json({ tier: [{ name: 'Vault Champion' }] });
    return new Response(null, { status: 404 });
  };
  await resolveLegendTiers(roster, fetchImpl, 2);
  assert.deepEqual(
    roster.map(({ ign, tier }) => [ign, tier]),
    [
      ['MinecraftLegend', 'Vault Legend'],
      ['TwitchLegend', 'Vault Legend'],
      ['RegularChampion', 'Vault Champion'],
    ]
  );
});

test('Patreon groups render tier headings and clickable profile buttons', () => {
  const html = renderPatreonGroups(
    [
      { ign: 'LegendPlayer', tier: 'Vault Legend' },
      { ign: 'GoblinPlayer', tier: 'Vault Goblin' },
    ],
    (url) => url,
    escapeHtml
  );
  assert.ok(html.indexOf('Vault Legend') < html.indexOf('Vault Goblin'));
  assert.match(html, /data-player-name="LegendPlayer"/);
  assert.match(html, /Vault Legend \(1\)/);
  assert.match(html, /Vault Champion \(0\)/);
  assert.match(html, /No linked players are listed for this tier yet/);
});
