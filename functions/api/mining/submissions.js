import { requireAuth } from '../../utils/auth.js';
import { createMiningSubmission, setDiscordDelivery } from '../../utils/mining-db.js';
import { sendSubmissionToDiscord } from '../../utils/discord.js';
import { validateMiningSubmission } from '../../utils/mining-validation.js';
import { handleApiError, methodNotAllowed, noStoreJson, readJson } from '../../utils/http.js';

export async function onRequest(context) {
  if (context.request.method !== 'POST') return methodNotAllowed('POST');

  try {
    const session = await requireAuth(context, { csrf: true });
    if (session.user.blocked) {
      return noStoreJson({ error: 'This Twitch account is blocked from submitting clues.' }, 403);
    }
    const payload = validateMiningSubmission(await readJson(context.request));
    const submission = await createMiningSubmission(context.env, session.user, payload);

    try {
      const delivery = await sendSubmissionToDiscord(context.env, submission);
      await setDiscordDelivery(context.env, submission.id, { status: 'sent', ...delivery });
      return noStoreJson(
        {
          submission: { ...submission, discordDeliveryStatus: 'sent' },
          message: 'Your clue was sent to the moderators.',
        },
        201
      );
    } catch (error) {
      console.error('Discord submission delivery failed', {
        submissionId: submission.id,
        message: error instanceof Error ? error.message : String(error),
      });
      await setDiscordDelivery(context.env, submission.id, {
        status: 'failed',
        error: String(error instanceof Error ? error.message : error).slice(0, 500),
      });
      return noStoreJson(
        {
          submission: { ...submission, discordDeliveryStatus: 'failed' },
          message:
            'Your clue was saved, but Discord delivery is delayed. The site administrator can retry it.',
        },
        202
      );
    }
  } catch (error) {
    return handleApiError(error, 'Your clue could not be submitted.');
  }
}
