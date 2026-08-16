import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeClue, validateMiningSubmission } from '../functions/utils/mining-validation.js';

test('normalizes harmless clue formatting differences', () => {
  assert.equal(normalizeClue('  Under  the  STONE!  '), 'under the stone');
  assert.equal(normalizeClue('Miner’s old—road.'), "miner's old-road");
});

test('accepts each supported answer', () => {
  for (const answer of ['surface', 'mineshaft', 'cave']) {
    const result = validateMiningSubmission({ clueText: 'A useful clue', answer });
    assert.equal(result.answer, answer);
    assert.equal(result.proof, null);
  }
});

test('rejects unsupported answers', () => {
  assert.throws(
    () => validateMiningSubmission({ clueText: 'A useful clue', answer: 'nether' }),
    /Surface, Mineshaft, or Cave/
  );
});

test('requires a complete proof group', () => {
  assert.throws(
    () =>
      validateMiningSubmission({
        clueText: 'A useful clue',
        answer: 'cave',
        proof: { streamerLogin: 'iskall85' },
      }),
    /streamer, date, time, and timezone/
  );
});

test('accepts complete Twitch VOD proof', () => {
  const result = validateMiningSubmission({
    clueText: 'A useful clue',
    answer: 'surface',
    proof: {
      streamerLogin: 'iskall85',
      date: '2026-08-16',
      time: '19:30',
      timezone: 'Europe/Amsterdam',
      vodUrl: 'https://www.twitch.tv/videos/123456789',
      vodTimestamp: '1h23m45s',
    },
  });
  assert.equal(result.proof.streamerLogin, 'iskall85');
  assert.equal(result.proof.vodTimestamp, '1h23m45s');
});

test('accepts a Twitch clip as stream proof', () => {
  const result = validateMiningSubmission({
    clueText: 'The clue points below.',
    answer: 'cave',
    proof: {
      streamerLogin: 'iskall85',
      date: '2026-08-16',
      time: '20:15',
      timezone: 'Europe/Amsterdam',
      clipUrl: 'https://clips.twitch.tv/FunPoisedGiraffeGingerPower-KDy2fwLNuUEHU',
    },
  });

  assert.equal(
    result.proof.clipUrl,
    'https://clips.twitch.tv/FunPoisedGiraffeGingerPower-KDy2fwLNuUEHU'
  );
});

test('rejects non-Twitch clip URLs', () => {
  assert.throws(
    () =>
      validateMiningSubmission({
        clueText: 'The clue points below.',
        answer: 'cave',
        proof: {
          streamerLogin: 'iskall85',
          date: '2026-08-16',
          time: '20:15',
          timezone: 'Europe/Amsterdam',
          clipUrl: 'https://example.com/not-a-twitch-clip',
        },
      }),
    /Twitch clip URL/
  );
});
