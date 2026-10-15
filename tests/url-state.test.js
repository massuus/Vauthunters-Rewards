import test from 'node:test';
import assert from 'node:assert/strict';
import { getUsernameFromQuery } from '../public/js/features/url-state.js';

test('leaderboard URLs restore the route with or without a focused player', () => {
  const previousWindow = globalThis.window;
  try {
    for (const [search, expected] of [
      ['?leaderboard=&metric=seasonLevel&streamer=iskall85', 'leaderboard'],
      ['?leaderboard=&metric=vaultsJoined&streamer=hoy_82', 'leaderboard'],
      ['?leaderboard&metric=seasonLevel&streamer=iskall85', 'leaderboard'],
      ['?metric=vaultsJoined&streamer=hoy_82&leaderboard=', 'leaderboard'],
      ['?leaderboard=massuus&metric=seasonLevel&streamer=iskall85', 'leaderboard:massuus'],
      ['?leaderboard', 'leaderboard'],
      ['?user=massuus', 'massuus'],
    ]) {
      globalThis.window = { location: { pathname: '/', search } };
      assert.equal(getUsernameFromQuery(), expected, search);
    }
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
