import test from 'node:test';
import assert from 'node:assert/strict';
import { automaticTheme } from '../public/js/features/seasonal-themes.js';

test('automatic themes follow the seasonal calendar', () => {
  const date = (month) => new Date(2026, month - 1, 15, 12);
  assert.equal(automaticTheme(date(4)), 'standard');
  assert.equal(automaticTheme(date(6)), 'pride');
  assert.equal(automaticTheme(date(7)), 'standard');
  assert.equal(automaticTheme(date(8)), 'standard');
  assert.equal(automaticTheme(date(10)), 'halloween');
  assert.equal(automaticTheme(date(12)), 'winter');
  assert.equal(automaticTheme(date(2)), 'standard');
});
