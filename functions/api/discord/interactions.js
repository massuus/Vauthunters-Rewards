import {
  buildModeratedInteractionResponse,
  ephemeralDiscordResponse,
  getDiscordModerator,
  verifyDiscordRequest,
} from '../../utils/discord.js';
import { moderateMiningSubmission } from '../../utils/mining-db.js';
import { ApiError, json, methodNotAllowed } from '../../utils/http.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return methodNotAllowed('POST');

  const rawBody = await request.text();
  const verified = await verifyDiscordRequest(
    request,
    String(env?.DISCORD_PUBLIC_KEY || '').trim(),
    rawBody
  );
  if (!verified) return new Response('Invalid request signature.', { status: 401 });

  let interaction;
  try {
    interaction = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid JSON.', { status: 400 });
  }

  if (interaction.type === 1) return json({ type: 1 }, 200, { 'cache-control': 'no-store' });
  if (interaction.type !== 3) {
    return json(ephemeralDiscordResponse('Unsupported interaction.'), 200, {
      'cache-control': 'no-store',
    });
  }

  const moderator = getDiscordModerator(interaction, env);
  if (!moderator) {
    return json(ephemeralDiscordResponse('You are not allowed to moderate mining clues.'), 200, {
      'cache-control': 'no-store',
    });
  }

  const match = /^mining:(accept|decline|block):([A-Za-z0-9_-]{10,64})$/.exec(
    String(interaction.data?.custom_id || '')
  );
  if (!match) {
    return json(ephemeralDiscordResponse('This mining-clue button is not valid.'), 200, {
      'cache-control': 'no-store',
    });
  }

  try {
    const result = await moderateMiningSubmission(env, match[2], match[1], moderator);
    return json(
      buildModeratedInteractionResponse(
        interaction.message,
        result.submission,
        moderator,
        result.alreadyHandled
      ),
      200,
      { 'cache-control': 'no-store' }
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? error.message
        : 'The moderation action failed. Please use the site admin tools or try again.';
    console.error('Discord moderation action failed', {
      submissionId: match[2],
      action: match[1],
      message: error instanceof Error ? error.message : String(error),
    });
    return json(ephemeralDiscordResponse(message), 200, { 'cache-control': 'no-store' });
  }
}
