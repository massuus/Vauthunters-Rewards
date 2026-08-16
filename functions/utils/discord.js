import { hexToBytes } from './crypto.js';
import { answerLabel } from './mining-validation.js';

const encoder = new TextEncoder();

function truncate(value, maxLength) {
  const text = String(value || '').trim();
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1))}…` : text;
}

function safeDiscordText(value, maxLength = 1024) {
  return truncate(String(value || '').replace(/[`*_~|>]/g, '\\$&'), maxLength) || '—';
}

function splitConfiguredIds(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function hasDiscordConfig(env) {
  return Boolean(
    String(env?.DISCORD_BOT_TOKEN || '').trim() && String(env?.DISCORD_CHANNEL_ID || '').trim()
  );
}

export async function verifyDiscordRequest(request, publicKeyHex, rawBody) {
  const signature = hexToBytes(request.headers.get('x-signature-ed25519'));
  const publicKey = hexToBytes(publicKeyHex);
  const timestamp = String(request.headers.get('x-signature-timestamp') || '');
  if (!signature || !publicKey || !timestamp) return false;

  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
    return false;
  }

  try {
    const key = await crypto.subtle.importKey('raw', publicKey, { name: 'Ed25519' }, false, [
      'verify',
    ]);
    return crypto.subtle.verify(
      { name: 'Ed25519' },
      key,
      signature,
      encoder.encode(timestamp + rawBody)
    );
  } catch (error) {
    console.error('Discord signature verification failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export function getDiscordModerator(interaction, env) {
  const expectedGuild = String(env?.DISCORD_GUILD_ID || '').trim();
  const expectedChannel = String(env?.DISCORD_CHANNEL_ID || '').trim();
  if (expectedGuild && String(interaction?.guild_id || '') !== expectedGuild) return null;
  if (expectedChannel && String(interaction?.channel_id || '') !== expectedChannel) return null;

  const user = interaction?.member?.user || interaction?.user;
  if (!user?.id) return null;
  const allowedUsers = splitConfiguredIds(env?.DISCORD_MODERATOR_USER_IDS);
  const allowedRoles = splitConfiguredIds(env?.DISCORD_MODERATOR_ROLE_IDS);
  const memberRoles = Array.isArray(interaction?.member?.roles) ? interaction.member.roles : [];

  let hasAdminPermission = false;
  try {
    hasAdminPermission = (BigInt(interaction?.member?.permissions || '0') & 8n) === 8n;
  } catch {}

  const allowed =
    allowedUsers.includes(String(user.id)) ||
    allowedRoles.some((roleId) => memberRoles.includes(roleId)) ||
    hasAdminPermission;
  if (!allowed) return null;

  return {
    id: String(user.id),
    name: String(interaction.member?.nick || user.global_name || user.username || user.id),
  };
}

function proofField(proof) {
  if (!proof) return null;
  const lines = [
    `Streamer: [${safeDiscordText(proof.streamerLogin, 50)}](https://twitch.tv/${encodeURIComponent(proof.streamerLogin)})`,
    `When: ${safeDiscordText(proof.date, 20)} ${safeDiscordText(proof.time, 10)} (${safeDiscordText(proof.timezone, 80)})`,
  ];
  if (proof.vodUrl) {
    const timestamp = proof.vodTimestamp ? ` at ${safeDiscordText(proof.vodTimestamp, 30)}` : '';
    lines.push(`[Open VOD](${proof.vodUrl})${timestamp}`);
  }
  if (proof.clipUrl) lines.push(`[Open clip](${proof.clipUrl})`);
  return { name: 'Proof', value: truncate(lines.join('\n'), 1024), inline: false };
}

export function buildSubmissionMessage(submission) {
  const isChange = submission.submissionType === 'answer_change';
  const fields = [
    { name: 'Clue', value: safeDiscordText(submission.clueText), inline: false },
    { name: 'Proposed answer', value: answerLabel(submission.answer), inline: true },
  ];
  if (isChange) {
    fields.push({
      name: 'Current answer',
      value: answerLabel(submission.currentAnswer),
      inline: true,
    });
  }
  fields.push({
    name: 'Submitted by',
    value: `[${safeDiscordText(submission.submitterDisplayName || submission.submitterLogin, 80)}](https://twitch.tv/${encodeURIComponent(submission.submitterLogin || '')})\nTwitch ID: ${safeDiscordText(submission.submitterTwitchUserId, 40)}`,
    inline: false,
  });
  if (submission.note) {
    fields.push({ name: 'Submitter note', value: safeDiscordText(submission.note), inline: false });
  }
  const proof = proofField(submission.proof);
  if (proof) fields.push(proof);
  if (submission.possibleDuplicate) {
    fields.push({
      name: 'Possible duplicate',
      value: safeDiscordText(submission.possibleDuplicate.clueText),
      inline: false,
    });
  }

  return {
    allowed_mentions: { parse: [] },
    nonce: submission.id.slice(0, 25),
    enforce_nonce: true,
    embeds: [
      {
        title: isChange ? '⚠️ Mining clue answer change' : '⛏️ New mining clue',
        color: isChange ? 0xffa726 : 0x43a047,
        fields,
        footer: { text: `Submission ${submission.id}` },
        timestamp: submission.createdAt,
      },
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 3,
            label: 'Accept',
            custom_id: `mining:accept:${submission.id}`,
          },
          {
            type: 2,
            style: 4,
            label: 'Decline',
            custom_id: `mining:decline:${submission.id}`,
          },
          {
            type: 2,
            style: 4,
            label: 'Block user',
            custom_id: `mining:block:${submission.id}`,
          },
        ],
      },
    ],
  };
}

export async function sendSubmissionToDiscord(env, submission) {
  if (!hasDiscordConfig(env)) {
    throw new Error('Discord bot token or channel ID is not configured.');
  }

  const channelId = String(env.DISCORD_CHANNEL_ID).trim();
  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${String(env.DISCORD_BOT_TOKEN).trim()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildSubmissionMessage(submission)),
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Discord returned ${response.status}: ${truncate(responseText, 300)}`);
  }

  const message = JSON.parse(responseText);
  if (!message?.id) throw new Error('Discord returned a message without an ID.');
  return { channelId: String(message.channel_id || channelId), messageId: String(message.id) };
}

function decisionFromStatus(status) {
  if (status === 'accepted') return { label: 'Accepted', color: 0x43a047 };
  if (status === 'blocked') return { label: 'Submitter blocked', color: 0xc62828 };
  return { label: 'Declined', color: 0xe53935 };
}

export function buildModeratedInteractionResponse(message, submission, moderator, alreadyHandled) {
  const decision = decisionFromStatus(submission.status);
  const sourceEmbeds = Array.isArray(message?.embeds) ? message.embeds : [];
  const embeds = sourceEmbeds.length
    ? sourceEmbeds.map((embed, index) => {
        if (index !== 0) return embed;
        const fields = Array.isArray(embed.fields)
          ? embed.fields.filter((field) => field.name !== 'Decision')
          : [];
        fields.push({
          name: 'Decision',
          value: `${decision.label} by ${safeDiscordText(
            submission.moderatorDiscordName || moderator.name,
            100
          )}${alreadyHandled ? ' (already handled)' : ''}`,
          inline: false,
        });
        return { ...embed, color: decision.color, fields };
      })
    : [
        {
          title: `Mining submission: ${decision.label}`,
          color: decision.color,
          description: safeDiscordText(submission.clueText, 1000),
        },
      ];

  const components = (message?.components || []).map((row) => ({
    ...row,
    components: (row.components || []).map((component) => ({ ...component, disabled: true })),
  }));

  return {
    type: 7,
    data: {
      allowed_mentions: { parse: [] },
      embeds,
      components,
    },
  };
}

export function ephemeralDiscordResponse(message) {
  return {
    type: 4,
    data: {
      content: truncate(message, 1900),
      flags: 64,
      allowed_mentions: { parse: [] },
    },
  };
}
