import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCubeGeometry,
  itemElementBounds,
  ITEM_DETAIL_THICKNESS,
} from '../public/js/features/reward-model-geometry.js';

test('reversed bounds stay scoped to Midnight Thorn', () => {
  const reversed = { from: [13.2, 3.95, 17.2], to: [11.8, -0.45, 12.8] };
  assert.deepEqual(itemElementBounds(reversed, 'Midnight Thorn'), {
    from: reversed.to,
    to: reversed.from,
  });
  for (const label of [
    'Treasure Train Focus',
    'Golden Kappa Shield',
    'Golden Club',
    'Terra Weapons',
  ]) {
    assert.deepEqual(itemElementBounds(reversed, label), reversed);
  }
  const partiallyReversed = { from: [13, 0, 1], to: [12, 2, 3] };
  assert.deepEqual(itemElementBounds(partiallyReversed, 'Midnight Thorn'), partiallyReversed);
});

test('flat eye cubes render one face instead of two overlapping double-sided faces', () => {
  const geometry = createCubeGeometry([2, 2, 0]);
  assert.deepEqual(geometry.groups, [{ start: 30, count: 6, materialIndex: 5 }]);
  geometry.dispose();
});

test('solid cubes retain all faces and other flat axes also render once', () => {
  for (const size of [
    [0, 2, 2],
    [2, 0, 2],
  ]) {
    const geometry = createCubeGeometry(size);
    assert.equal(geometry.groups.length, 1);
    geometry.dispose();
  }
  const geometry = createCubeGeometry([8, 8, 8]);
  assert.equal(geometry.groups.length, 6);
  geometry.dispose();
});

test('flat details can retain the outward face on either side of a model', () => {
  const west = createCubeGeometry([0.02, 2, 2], [0, 2, 2], 1);
  assert.deepEqual(west.groups, [{ start: 6, count: 6, materialIndex: 1 }]);
  west.dispose();

  const south = createCubeGeometry([2, 2, 0.02], [2, 2, 0], 4);
  assert.deepEqual(south.groups, [{ start: 24, count: 6, materialIndex: 4 }]);
  south.dispose();
});

test('flat Java item planes retain both authored front and back faces', () => {
  const geometry = createCubeGeometry([4, 6, ITEM_DETAIL_THICKNESS], [4, 6, 0], undefined, true);
  assert.deepEqual(
    geometry.groups.map(({ materialIndex }) => materialIndex),
    [4, 5]
  );
  geometry.computeBoundingBox();
  assert.ok(
    Math.abs(geometry.boundingBox.max.z - geometry.boundingBox.min.z - ITEM_DETAIL_THICKNESS) < 1e-6
  );
  geometry.dispose();
});
