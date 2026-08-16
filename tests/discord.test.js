import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSubmissionMessage,
  getDiscordModerator,
  verifyDiscordRequest,
} from '../functions/utils/discord.js';

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('');
}

test('verifies Discord Ed25519 request signatures', async () => {
  const keyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const publicKey = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ type: 1 });
  const signature = await crypto.subtle.sign(
    { name: 'Ed25519' },
    keyPair.privateKey,
    new TextEncoder().encode(timestamp + body)
  );
  const request = new Request('https://example.test/api/discord/interactions', {
    method: 'POST',
    headers: {
      'x-signature-ed25519': toHex(signature),
      'x-signature-timestamp': timestamp,
    },
    body,
  });

  assert.equal(await verifyDiscordRequest(request, toHex(publicKey), body), true);
  assert.equal(await verifyDiscordRequest(request, toHex(publicKey), `${body} `), false);
});

test('allows configured Discord moderator roles in the configured channel', () => {
  const moderator = getDiscordModerator(
    {
      guild_id: 'guild-1',
      channel_id: 'channel-1',
      member: { user: { id: 'user-1', username: 'Mod' }, roles: ['role-1'], permissions: '0' },
    },
    {
      DISCORD_GUILD_ID: 'guild-1',
      DISCORD_CHANNEL_ID: 'channel-1',
      DISCORD_MODERATOR_ROLE_IDS: 'role-1',
    }
  );
  assert.deepEqual(moderator, { id: 'user-1', name: 'Mod' });
});

test('rejects Discord interactions from another channel', () => {
  const moderator = getDiscordModerator(
    {
      guild_id: 'guild-1',
      channel_id: 'channel-2',
      member: { user: { id: 'user-1' }, roles: ['role-1'], permissions: '8' },
    },
    {
      DISCORD_GUILD_ID: 'guild-1',
      DISCORD_CHANNEL_ID: 'channel-1',
      DISCORD_MODERATOR_ROLE_IDS: 'role-1',
    }
  );
  assert.equal(moderator, null);
});

test('includes a submitted Twitch clip in the Discord proof field', () => {
  const message = buildSubmissionMessage({
    id: 'submission-1',
    clueText: 'A clue from a clip.',
    answer: 'surface',
    submissionType: 'new',
    submitterTwitchUserId: '123',
    submitterLogin: 'viewer',
    submitterDisplayName: 'Viewer',
    createdAt: '2026-08-16T20:15:00.000Z',
    proof: {
      streamerLogin: 'iskall85',
      date: '2026-08-16',
      time: '20:15',
      timezone: 'Europe/Amsterdam',
      vodUrl: null,
      vodTimestamp: null,
      clipUrl: 'https://clips.twitch.tv/FunPoisedGiraffeGingerPower-KDy2fwLNuUEHU',
    },
  });

  const proof = message.embeds[0].fields.find((field) => field.name === 'Proof');
  assert.match(proof.value, /Open clip/);
  assert.match(proof.value, /clips\.twitch\.tv/);
});
