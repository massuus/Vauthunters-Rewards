import { ApiError } from './http.js';

export const MINING_ANSWERS = Object.freeze(['surface', 'mineshaft', 'cave']);

export function normalizeClue(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/g, '')
    .trim();
}

function optionalText(value, maxLength, fieldName) {
  const text = String(value || '').trim();
  if (text.length > maxLength) {
    throw new ApiError(400, `${fieldName} must be ${maxLength} characters or fewer.`);
  }
  return text || null;
}

function validateTimezone(value) {
  const timezone = String(value || '').trim();
  if (!timezone || timezone.length > 64) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    throw new ApiError(400, 'Proof timezone is not valid.');
  }
}

function validateVodUrl(value) {
  const text = optionalText(value, 300, 'VOD URL');
  if (!text) return null;

  let url;
  try {
    url = new URL(text);
  } catch {
    throw new ApiError(400, 'VOD URL must be a valid Twitch video URL.');
  }

  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    !['twitch.tv', 'www.twitch.tv'].includes(host) ||
    !/^\/videos\/\d+\/?$/.test(url.pathname)
  ) {
    throw new ApiError(400, 'VOD URL must look like https://www.twitch.tv/videos/123456.');
  }
  return url.toString();
}

function validateClipUrl(value) {
  const text = optionalText(value, 300, 'Clip URL');
  if (!text) return null;

  let url;
  try {
    url = new URL(text);
  } catch {
    throw new ApiError(400, 'Clip URL must be a valid Twitch clip URL.');
  }

  const host = url.hostname.toLowerCase();
  const isClipsHost = host === 'clips.twitch.tv' && /^\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname);
  const isChannelClip =
    ['twitch.tv', 'www.twitch.tv'].includes(host) &&
    /^\/[a-zA-Z0-9_]+\/clip\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname);

  if (url.protocol !== 'https:' || (!isClipsHost && !isChannelClip)) {
    throw new ApiError(400, 'Twitch clip URL must look like https://clips.twitch.tv/ClipSlug.');
  }
  return url.toString();
}

export function validateMiningSubmission(input, { proofOptional = true } = {}) {
  const clueText = String(input?.clueText || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (clueText.length < 3 || clueText.length > 500) {
    throw new ApiError(400, 'Clue text must be between 3 and 500 characters.');
  }

  const clueKey = normalizeClue(clueText);
  if (clueKey.length < 3) {
    throw new ApiError(400, 'Clue text must contain at least 3 useful characters.');
  }

  const answer = String(input?.answer || '')
    .trim()
    .toLowerCase();
  if (!MINING_ANSWERS.includes(answer)) {
    throw new ApiError(400, 'Answer must be Surface, Mineshaft, or Cave.');
  }

  const note = optionalText(input?.note, 500, 'Note');
  const streamer = optionalText(input?.proof?.streamerLogin, 25, 'Streamer name');
  const date = optionalText(input?.proof?.date, 10, 'Proof date');
  const time = optionalText(input?.proof?.time, 5, 'Proof time');
  const timezone = input?.proof?.timezone ? validateTimezone(input.proof.timezone) : null;
  const vodUrl = validateVodUrl(input?.proof?.vodUrl);
  const vodTimestamp = optionalText(input?.proof?.vodTimestamp, 24, 'VOD timestamp');
  const clipUrl = validateClipUrl(input?.proof?.clipUrl);

  const proofStarted = Boolean(
    streamer || date || time || timezone || vodUrl || vodTimestamp || clipUrl
  );
  if (proofStarted || !proofOptional) {
    if (!streamer || !date || !time || !timezone) {
      throw new ApiError(
        400,
        'Proof must include the streamer, date, time, and timezone together.'
      );
    }
    if (!/^[a-zA-Z0-9_]{1,25}$/.test(streamer)) {
      throw new ApiError(400, 'Streamer name may only contain letters, numbers, and underscores.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
      throw new ApiError(400, 'Proof date must be a valid date.');
    }
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      throw new ApiError(400, 'Proof time must use the 24-hour HH:MM format.');
    }
  }

  if (vodTimestamp && !/^(?:(?:\d+)h)?(?:(?:[0-5]?\d)m)?(?:(?:[0-5]?\d)s)?$/i.test(vodTimestamp)) {
    throw new ApiError(400, 'VOD timestamp must look like 1h23m45s.');
  }

  return {
    clueText,
    clueKey,
    answer,
    note,
    proof: proofStarted
      ? {
          streamerLogin: streamer.toLowerCase(),
          date,
          time,
          timezone,
          vodUrl,
          vodTimestamp,
          clipUrl,
        }
      : null,
  };
}

export function answerLabel(answer) {
  if (answer === 'mineshaft') return 'Mineshaft';
  return String(answer || '').replace(/^./, (letter) => letter.toUpperCase());
}
