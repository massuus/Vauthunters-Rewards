import test from 'node:test';
import assert from 'node:assert/strict';
import { getAppDb, requireAppDb } from '../functions/utils/database.js';

test('shared database access preserves binding preference for existing deployments', () => {
  const dedicated = {};
  const fallback = {};
  assert.equal(getAppDb({ MINING_DB: dedicated, LEADERBOARD_DB: fallback }), dedicated);
  assert.equal(requireAppDb({ LEADERBOARD_DB: fallback }), fallback);
  assert.equal(getAppDb({}), null);
  assert.throws(
    () => requireAppDb({}),
    (error) => error.status === 503
  );
});
