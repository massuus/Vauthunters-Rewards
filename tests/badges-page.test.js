import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BADGE_CATEGORIES,
  filterBadges,
  isBadgesQuery,
} from '../public/js/components/special-pages/badges-page.js';
import {
  sanitizeBadgeCatalog,
  catalogBadge,
} from '../scripts/companion-collector/badge-catalog.mjs';
import { onRequest } from '../functions/api/badges.js';

const definition = (id, name, description) => ({
  id: `vhcompanions:${id}`,
  display: { displayName: name, description, texture: `vhcompanions:gui/badges/${id}` },
  privateToken: 'SECRET',
});
const raw = [
  definition('season1', 'Season One', 'Reached level 20 in Season 1'),
  definition('halloween_soul_2026', 'Soul Stolen', 'Had their soul stolen during Halloween 2026'),
  definition('streak_100', 'x100 Streak!', 'Present for a x100 streak'),
  definition('tier_vault_champion', 'Patreon', 'Supporter'),
  definition('new_season3', 'New badge', 'Reached level 10 in Season 3'),
];
const catalog = sanitizeBadgeCatalog({ checkedAt: '2026-10-11T12:00:00Z', badges: raw });
const badges = catalog.badges.map(catalogBadge);

test('ordinal stream milestones have their own browsable category', () => {
  assert.ok(BADGE_CATEGORIES.some(([id]) => id === 'stream-milestones'));
  const milestones = [100, 200, 300, 1000].map((number) =>
    catalogBadge(
      definition(`stream_${number}`, `${number}th Stream`, `Present for Season 2 stream ${number}`)
    )
  );
  assert.equal(filterBadges(milestones, 'stream-milestones', '').length, 4);
  assert.equal(filterBadges(milestones, 'stream-milestones', '200th')[0].name, '200th Stream');
  assert.equal(catalogBadge(definition('event', 'Event', 'A special event')).category, 'events');
  assert.equal(
    catalogBadge(definition('streak_100', 'x100 Streak!', 'Present for a x100 streak')).category,
    'streaks'
  );
});

test('new upstream badges are categorized without local definitions or icons', () => {
  assert.equal(badges.at(-1).category, 'season-3');
  assert.equal(
    badges[1].image,
    'https://ebs.vaulthunters.gg/assets/sprites/badges/halloween_soul_2026.png'
  );
  assert.equal(JSON.stringify(catalog).includes('SECRET'), false);
  assert.equal(
    sanitizeBadgeCatalog({
      ...catalog,
      badges: [
        definition('bad', 'Bad', 'Bad'),
        { ...raw[0], display: { ...raw[0].display, texture: 'https://example.test/tracker' } },
      ],
    }),
    null
  );
  assert.equal(sanitizeBadgeCatalog({ ...catalog, badges: [] }), null);
});

test('badge API serves the collector API cache and reports unavailable data', async () => {
  const request = new Request('https://example.test/api/badges');
  const env = {
    LEADERBOARD_DB: {
      prepare: () => ({
        first: async () => ({ report_json: JSON.stringify({ badgeCatalog: catalog }) }),
      }),
    },
  };
  const response = await onRequest({ request, env });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).badges, badges);
  env.LEADERBOARD_DB.prepare = () => ({ first: async () => null });
  assert.equal((await onRequest({ request, env })).status, 503);
  assert.equal(
    (await onRequest({ request: new Request(request.url, { method: 'POST' }), env })).status,
    405
  );
});

test('search combines category with case-insensitive names and acquisition descriptions', () => {
  assert.ok(isBadgesQuery(' BADGES '));
  assert.ok(isBadgesQuery('badge'));
  assert.equal(isBadgesQuery('player'), false);
  assert.equal(filterBadges(badges, 'all', '').length, badges.length);
  assert.ok(
    filterBadges(badges, 'season-1', 'level').every((badge) => badge.category === 'season-1')
  );
  assert.equal(
    filterBadges(badges, 'seasonal', 'SOUL STOLEN')[0].id,
    'vhcompanions:halloween_soul_2026'
  );
  assert.equal(filterBadges(badges, 'streaks', 'x100')[0].id, 'vhcompanions:streak_100');
  assert.equal(filterBadges(badges, 'patreon', 'soul stolen').length, 0);
});
