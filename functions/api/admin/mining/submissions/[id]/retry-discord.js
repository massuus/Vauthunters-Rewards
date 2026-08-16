import { requireAuth } from '../../../../../utils/auth.js';
import { sendSubmissionToDiscord } from '../../../../../utils/discord.js';
import { getMiningSubmission, setDiscordDelivery } from '../../../../../utils/mining-db.js';
import {
  ApiError,
  handleApiError,
  methodNotAllowed,
  noStoreJson,
} from '../../../../../utils/http.js';

export async function onRequest(context) {
  if (context.request.method !== 'POST') return methodNotAllowed('POST');

  try {
    await requireAuth(context, { admin: true, csrf: true });
    const submissionId = String(context.params.id || '').trim();
    const submission = await getMiningSubmission(context.env, submissionId);
    if (!submission) throw new ApiError(404, 'Submission not found.');
    if (submission.status !== 'pending') {
      throw new ApiError(409, 'Only pending submissions can be sent to Discord.');
    }
    if (submission.discordDeliveryStatus === 'sent') {
      return noStoreJson({ submission, message: 'This submission is already in Discord.' });
    }

    const delivery = await sendSubmissionToDiscord(context.env, submission);
    await setDiscordDelivery(context.env, submission.id, { status: 'sent', ...delivery });
    return noStoreJson({
      submission: { ...submission, discordDeliveryStatus: 'sent', ...delivery },
      message: 'Submission sent to Discord.',
    });
  } catch (error) {
    return handleApiError(error, 'Discord delivery could not be retried.');
  }
}
