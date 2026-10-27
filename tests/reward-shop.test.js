import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRewardShop,
  mergeApiSets,
  getLockedRewardDescription,
  renderRewardShop,
} from '../public/js/features/reward-shop.js';
import { onRequest } from '../functions/api/sets.js';

const sale = {
  id: 'old',
  cost: 1500,
  price: 750,
  discount: 0.5,
  unavailable: false,
  featured: true,
  description: 'Halloween reward',
};

test('shop discounts are fractions and final API prices are authoritative', () => {
  const shop = getRewardShop(sale);
  const html = renderRewardShop({ shop });
  assert.match(html, /50% off/);
  assert.match(html, /<s>1,500<\/s>/);
  assert.match(html, /<strong>750<\/strong>/);
  assert.equal(getRewardShop({ ...sale, price: 749 }).price, 749);
  assert.equal(getRewardShop({ ...sale, price: undefined }).price, 750);
});

test('shop reissues override legacy availability without losing art or unlock history', () => {
  const local = {
    old: {
      image: '/old.png',
      obtainable: false,
      descriptionLocked: 'No longer obtainable.',
      descriptionObtained: 'Original event',
    },
  };
  const merged = mergeApiSets(local, [
    sale,
    { id: 'new', category: 'Halloween', unavailable: true },
  ]);
  assert.equal(merged.old.obtainable, true);
  assert.equal(merged.old.image, '/old.png');
  assert.equal(merged.old.descriptionObtained, 'Original event');
  assert.equal(getLockedRewardDescription(merged.old), 'No longer obtainable.');
  assert.equal(local.old.obtainable, false);
  assert.equal(merged.new.category, 'Halloween');
  assert.equal(merged.new.obtainable, false);
  assert.deepEqual(mergeApiSets(local, []), local);
});

test('custom descriptions take precedence over shop API descriptions', () => {
  const merged = mergeApiSets(
    {
      old: { description: 'My custom description' },
    },
    [sale]
  );
  assert.equal(getLockedRewardDescription(merged.old), 'My custom description');
  assert.equal(getLockedRewardDescription(mergeApiSets({}, [sale]).old), 'Halloween reward');
});

test('unavailable, malformed and sentinel prices never advertise a free shop reward', () => {
  for (const cost of [-1, 0, null, '3000', Infinity])
    assert.equal(getRewardShop({ ...sale, cost }), null);
  assert.equal(renderRewardShop({ shop: getRewardShop({ ...sale, unavailable: true }) }), '');
  assert.equal(getRewardShop({ ...sale, discount: 50 }).discount, 0);
  assert.equal(getRewardShop({ ...sale, unavailable: undefined }), null);
  const local = { eternal: { obtainable: true } };
  assert.equal(
    mergeApiSets(local, [{ id: 'eternal', cost: -1, unavailable: true }]).eternal.obtainable,
    true
  );
});

test('sets API forwards only public shop metadata and falls back without claiming prices', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json([{ ...sale, privateToken: 'SECRET', sets: {} }])
  );
  const request = new Request('https://example.test/api/sets');
  const response = await onRequest({ request, env: {} });
  const data = await response.json();
  assert.equal(data[0].discount, 0.5);
  assert.equal(data[0].price, 750);
  assert.equal(JSON.stringify(data).includes('SECRET'), false);
  t.mock.method(globalThis, 'fetch', async (url) =>
    url.includes('ebs.') ? Response.json({ error: true }, { status: 403 }) : Response.json([sale])
  );
  const fallback = await onRequest({ request, env: {} });
  assert.equal(fallback.status, 200);
  assert.equal((await fallback.json())[0].price, undefined);
});
