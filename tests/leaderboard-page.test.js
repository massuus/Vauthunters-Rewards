import test from 'node:test';
import assert from 'node:assert/strict';

import { isLeaderboardPlayerFocused } from '../public/js/components/special-pages/leaderboard-page.js';

test('does not focus every companion row when legacy UUID fields are empty', () => {
  const focusPlayer = {
    twitchName: 'massuus',
    playerNickname: 'Massuus',
  };

  assert.equal(
    isLeaderboardPlayerFocused({ twitchName: 'massuus', playerNickname: 'Massuus' }, focusPlayer),
    true
  );
  assert.equal(
    isLeaderboardPlayerFocused(
      { twitchName: 'someone_else', playerNickname: 'Someone Else' },
      focusPlayer
    ),
    false
  );
});

test('requires non-empty UUIDs before using UUID focus matching', () => {
  assert.equal(
    isLeaderboardPlayerFocused(
      { playerUUID: '', playerNickname: 'Another player' },
      { playerUUID: '', playerNickname: '' }
    ),
    false
  );
});
