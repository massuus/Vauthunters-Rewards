import { randomToken } from './crypto.js';
import { ApiError } from './http.js';

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 250;

export function getMiningDb(env) {
  return env?.MINING_DB || env?.LEADERBOARD_DB || null;
}

export function requireMiningDb(env) {
  const db = getMiningDb(env);
  if (!db) {
    throw new ApiError(503, 'Mining clues are not configured yet.');
  }
  return db;
}

export function createId() {
  return randomToken(18);
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function escapeLike(value) {
  return String(value || '').replace(/[\\%_]/g, '\\$&');
}

function rowChanges(result) {
  return Number(result?.meta?.changes || result?.meta?.rows_written || 0);
}

export function mapClue(row) {
  if (!row) return null;
  return {
    id: row.id,
    clueText: row.clue_text,
    answer: row.answer,
    version: Number(row.version || 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSubmission(row) {
  if (!row) return null;
  return {
    id: row.id,
    clueText: row.clue_text,
    clueKey: row.clue_key,
    answer: row.answer,
    submissionType: row.submission_type,
    targetClueId: row.target_clue_id || null,
    targetClueVersion:
      row.target_clue_version === null || row.target_clue_version === undefined
        ? null
        : Number(row.target_clue_version),
    currentAnswer: row.current_answer || null,
    note: row.note || null,
    proof: row.proof_streamer_login
      ? {
          streamerLogin: row.proof_streamer_login,
          date: row.proof_date,
          time: row.proof_time,
          timezone: row.proof_timezone,
          vodUrl: row.proof_vod_url || null,
          vodTimestamp: row.proof_vod_timestamp || null,
          clipUrl: row.proof_clip_url || null,
        }
      : null,
    possibleDuplicate: row.possible_duplicate_clue_id
      ? {
          clueId: row.possible_duplicate_clue_id,
          clueText: row.possible_duplicate_clue_text,
        }
      : null,
    status: row.status,
    discordDeliveryStatus: row.discord_delivery_status,
    discordDeliveryError: row.discord_delivery_error || null,
    discordChannelId: row.discord_channel_id || null,
    discordMessageId: row.discord_message_id || null,
    submitterTwitchUserId: row.submitter_twitch_user_id,
    submitterLogin: row.submitter_login || null,
    submitterDisplayName: row.submitter_display_name || null,
    moderatorDiscordUserId: row.moderator_discord_user_id || null,
    moderatorDiscordName: row.moderator_discord_name || null,
    createdAt: row.created_at,
    moderatedAt: row.moderated_at || null,
  };
}

export async function listMiningClues(env, searchParams) {
  const db = requireMiningDb(env);
  const limit = clampInteger(searchParams.get('limit'), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const offset = clampInteger(searchParams.get('offset'), 0, 0, 100_000);
  const answer = String(searchParams.get('answer') || '')
    .trim()
    .toLowerCase();
  const query = String(searchParams.get('q') || '')
    .trim()
    .slice(0, 200);

  const conditions = ['archived_at IS NULL'];
  const bindings = [];
  if (['surface', 'mineshaft', 'cave'].includes(answer)) {
    conditions.push('answer = ?');
    bindings.push(answer);
  }
  if (query) {
    conditions.push("clue_text LIKE ? ESCAPE '\\' COLLATE NOCASE");
    bindings.push(`%${escapeLike(query)}%`);
  }

  const where = conditions.join(' AND ');
  const [countResult, listResult] = await db.batch([
    db.prepare(`SELECT COUNT(1) AS total FROM mining_clues WHERE ${where}`).bind(...bindings),
    db
      .prepare(
        `SELECT id, clue_text, answer, version, created_at, updated_at
         FROM mining_clues
         WHERE ${where}
         ORDER BY clue_text COLLATE NOCASE ASC
         LIMIT ? OFFSET ?`
      )
      .bind(...bindings, limit, offset),
  ]);

  const total = Number(countResult.results?.[0]?.total || 0);
  return {
    clues: (listResult.results || []).map(mapClue),
    total,
    limit,
    offset,
    hasMore: offset + (listResult.results?.length || 0) < total,
  };
}

function makeBigrams(value) {
  const normalized = String(value || '').replace(/\s+/g, ' ');
  if (normalized.length < 2) return new Set([normalized]);
  const result = new Set();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    result.add(normalized.slice(index, index + 2));
  }
  return result;
}

function diceSimilarity(left, right) {
  const leftParts = makeBigrams(left);
  const rightParts = makeBigrams(right);
  let overlap = 0;
  leftParts.forEach((part) => {
    if (rightParts.has(part)) overlap += 1;
  });
  return (2 * overlap) / Math.max(1, leftParts.size + rightParts.size);
}

async function findPossibleDuplicate(db, clueKey) {
  if (clueKey.length < 12) return null;
  const result = await db
    .prepare(
      `SELECT id, clue_text, clue_key
       FROM mining_clues
       WHERE archived_at IS NULL AND clue_key <> ?
       ORDER BY updated_at DESC
       LIMIT 200`
    )
    .bind(clueKey)
    .all();

  let best = null;
  for (const row of result.results || []) {
    const score = diceSimilarity(clueKey, row.clue_key);
    if (score >= 0.88 && (!best || score > best.score)) {
      best = { clueId: row.id, clueText: row.clue_text, score };
    }
  }
  return best;
}

export async function createMiningSubmission(env, user, payload) {
  const db = requireMiningDb(env);
  const now = new Date();
  const nowIso = now.toISOString();
  const dayAgoIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const cooldownSeconds = clampInteger(env?.MINING_SUBMISSION_COOLDOWN_SECONDS, 60, 0, 3600);
  const dailyLimit = clampInteger(env?.MINING_DAILY_SUBMISSION_LIMIT, 10, 1, 100);
  const pendingLimit = clampInteger(env?.MINING_PENDING_SUBMISSION_LIMIT, 5, 1, 25);

  const [userRow, pendingCount, dailyCount, latestSubmission, existingClue, pendingMatch] =
    await db.batch([
      db
        .prepare('SELECT blocked_at FROM twitch_users WHERE twitch_user_id = ?')
        .bind(user.twitchUserId),
      db
        .prepare(
          "SELECT COUNT(1) AS total FROM mining_submissions WHERE submitter_twitch_user_id = ? AND status IN ('pending', 'processing')"
        )
        .bind(user.twitchUserId),
      db
        .prepare(
          'SELECT COUNT(1) AS total FROM mining_submissions WHERE submitter_twitch_user_id = ? AND created_at >= ?'
        )
        .bind(user.twitchUserId, dayAgoIso),
      db
        .prepare(
          'SELECT created_at FROM mining_submissions WHERE submitter_twitch_user_id = ? ORDER BY created_at DESC LIMIT 1'
        )
        .bind(user.twitchUserId),
      db
        .prepare(
          'SELECT id, clue_text, answer, version FROM mining_clues WHERE clue_key = ? AND archived_at IS NULL LIMIT 1'
        )
        .bind(payload.clueKey),
      db
        .prepare(
          "SELECT id FROM mining_submissions WHERE clue_key = ? AND status IN ('pending', 'processing') LIMIT 1"
        )
        .bind(payload.clueKey),
    ]);

  if (userRow.results?.[0]?.blocked_at) {
    throw new ApiError(403, 'This Twitch account is blocked from submitting clues.');
  }
  if (Number(pendingCount.results?.[0]?.total || 0) >= pendingLimit) {
    throw new ApiError(429, 'You already have several clues waiting for review.');
  }
  if (Number(dailyCount.results?.[0]?.total || 0) >= dailyLimit) {
    throw new ApiError(429, 'You have reached today’s clue submission limit.');
  }

  const latestCreatedAt = latestSubmission.results?.[0]?.created_at;
  if (latestCreatedAt && cooldownSeconds > 0) {
    const elapsedSeconds = (now.getTime() - Date.parse(latestCreatedAt)) / 1000;
    if (Number.isFinite(elapsedSeconds) && elapsedSeconds < cooldownSeconds) {
      throw new ApiError(
        429,
        `Please wait ${Math.ceil(cooldownSeconds - elapsedSeconds)} seconds before submitting again.`
      );
    }
  }

  const current = existingClue.results?.[0] || null;
  if (current && current.answer === payload.answer) {
    throw new ApiError(409, 'That clue and answer are already on the site.');
  }
  if (pendingMatch.results?.length) {
    throw new ApiError(409, 'That clue is already waiting for moderator review.');
  }

  const possibleDuplicate = current ? null : await findPossibleDuplicate(db, payload.clueKey);
  const id = createId();
  const type = current ? 'answer_change' : 'new';
  const proof = payload.proof || {};

  try {
    await db
      .prepare(
        `INSERT INTO mining_submissions (
          id, submitter_twitch_user_id, clue_text, clue_key, answer, submission_type,
          target_clue_id, target_clue_version, current_answer, note,
          proof_streamer_login, proof_date, proof_time, proof_timezone,
          proof_vod_url, proof_vod_timestamp, proof_clip_url,
          possible_duplicate_clue_id, possible_duplicate_clue_text,
          status, discord_delivery_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', ?)`
      )
      .bind(
        id,
        user.twitchUserId,
        payload.clueText,
        payload.clueKey,
        payload.answer,
        type,
        current?.id || null,
        current?.version || null,
        current?.answer || null,
        payload.note,
        proof.streamerLogin || null,
        proof.date || null,
        proof.time || null,
        proof.timezone || null,
        proof.vodUrl || null,
        proof.vodTimestamp || null,
        proof.clipUrl || null,
        possibleDuplicate?.clueId || null,
        possibleDuplicate?.clueText || null,
        nowIso
      )
      .run();
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE constraint failed')) {
      throw new ApiError(409, 'That clue is already waiting for moderator review.');
    }
    throw error;
  }

  return getMiningSubmission(env, id);
}

export async function getMiningSubmission(env, id) {
  const db = requireMiningDb(env);
  const row = await db
    .prepare(
      `SELECT s.*, u.login AS submitter_login, u.display_name AS submitter_display_name
       FROM mining_submissions s
       JOIN twitch_users u ON u.twitch_user_id = s.submitter_twitch_user_id
       WHERE s.id = ?`
    )
    .bind(id)
    .first();
  return mapSubmission(row);
}

export async function setDiscordDelivery(env, submissionId, delivery) {
  const db = requireMiningDb(env);
  await db
    .prepare(
      `UPDATE mining_submissions
       SET discord_delivery_status = ?, discord_delivery_error = ?,
           discord_channel_id = ?, discord_message_id = ?
       WHERE id = ? AND status = 'pending'`
    )
    .bind(
      delivery.status,
      delivery.error || null,
      delivery.channelId || null,
      delivery.messageId || null,
      submissionId
    )
    .run();
}

export async function listUserSubmissions(env, twitchUserId, limitValue = 10) {
  const db = requireMiningDb(env);
  const limit = clampInteger(limitValue, 10, 1, 25);
  const result = await db
    .prepare(
      `SELECT s.*, u.login AS submitter_login, u.display_name AS submitter_display_name
       FROM mining_submissions s
       JOIN twitch_users u ON u.twitch_user_id = s.submitter_twitch_user_id
       WHERE s.submitter_twitch_user_id = ?
       ORDER BY s.created_at DESC
       LIMIT ?`
    )
    .bind(twitchUserId, limit)
    .all();
  return (result.results || []).map(mapSubmission);
}

export async function listAdminSubmissions(env, { limit = 50 } = {}) {
  const db = requireMiningDb(env);
  const safeLimit = clampInteger(limit, 50, 1, 100);
  const result = await db
    .prepare(
      `SELECT s.*, u.login AS submitter_login, u.display_name AS submitter_display_name
       FROM mining_submissions s
       JOIN twitch_users u ON u.twitch_user_id = s.submitter_twitch_user_id
       WHERE s.status = 'pending' OR s.discord_delivery_status = 'failed'
       ORDER BY s.created_at ASC
       LIMIT ?`
    )
    .bind(safeLimit)
    .all();
  return (result.results || []).map(mapSubmission);
}

export async function createAdminClue(env, admin, payload) {
  const db = requireMiningDb(env);
  const id = createId();
  const auditId = createId();
  const now = new Date().toISOString();

  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO mining_clues (
            id, clue_text, clue_key, answer, version, created_by_twitch_user_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 1, ?, ?, ?)`
        )
        .bind(id, payload.clueText, payload.clueKey, payload.answer, admin.twitchUserId, now, now),
      db
        .prepare(
          `INSERT INTO mining_audit_log (
            id, entity_type, entity_id, action, actor_type, actor_id, details_json, created_at
          ) VALUES (?, 'clue', ?, 'create', 'twitch_admin', ?, ?, ?)`
        )
        .bind(
          auditId,
          id,
          admin.twitchUserId,
          JSON.stringify({ clueText: payload.clueText, answer: payload.answer }),
          now
        ),
    ]);
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE constraint failed')) {
      throw new ApiError(409, 'A clue with that wording already exists.');
    }
    throw error;
  }

  return mapClue(
    await db
      .prepare(
        'SELECT id, clue_text, answer, version, created_at, updated_at FROM mining_clues WHERE id = ?'
      )
      .bind(id)
      .first()
  );
}

export async function updateAdminClue(env, admin, clueId, payload) {
  const db = requireMiningDb(env);
  const current = await db
    .prepare('SELECT * FROM mining_clues WHERE id = ? AND archived_at IS NULL')
    .bind(clueId)
    .first();
  if (!current) throw new ApiError(404, 'Clue not found.');

  const now = new Date().toISOString();
  const auditId = createId();
  const expectedVersion = Number(payload.expectedVersion || current.version);

  try {
    const [updateResult] = await db.batch([
      db
        .prepare(
          `UPDATE mining_clues
           SET clue_text = ?, clue_key = ?, answer = ?, version = version + 1, updated_at = ?
           WHERE id = ? AND archived_at IS NULL AND version = ?`
        )
        .bind(payload.clueText, payload.clueKey, payload.answer, now, clueId, expectedVersion),
      db
        .prepare(
          `INSERT INTO mining_audit_log (
            id, entity_type, entity_id, action, actor_type, actor_id, details_json, created_at
          )
          SELECT ?, 'clue', ?, 'update', 'twitch_admin', ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM mining_clues WHERE id = ? AND version = ? AND updated_at = ?
          )`
        )
        .bind(
          auditId,
          clueId,
          admin.twitchUserId,
          JSON.stringify({
            before: { clueText: current.clue_text, answer: current.answer },
            after: { clueText: payload.clueText, answer: payload.answer },
          }),
          now,
          clueId,
          expectedVersion + 1,
          now
        ),
    ]);

    if (rowChanges(updateResult) < 1) {
      throw new ApiError(
        409,
        'This clue changed while you were editing it. Refresh and try again.'
      );
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (String(error?.message || '').includes('UNIQUE constraint failed')) {
      throw new ApiError(409, 'A clue with that wording already exists.');
    }
    throw error;
  }

  return mapClue(
    await db
      .prepare(
        'SELECT id, clue_text, answer, version, created_at, updated_at FROM mining_clues WHERE id = ?'
      )
      .bind(clueId)
      .first()
  );
}

export async function archiveAdminClue(env, admin, clueId, expectedVersion) {
  const db = requireMiningDb(env);
  const current = await db
    .prepare('SELECT * FROM mining_clues WHERE id = ? AND archived_at IS NULL')
    .bind(clueId)
    .first();
  if (!current) throw new ApiError(404, 'Clue not found.');

  const version = Number(expectedVersion || current.version);
  const now = new Date().toISOString();
  const auditId = createId();
  const [updateResult] = await db.batch([
    db
      .prepare(
        `UPDATE mining_clues
         SET archived_at = ?, archived_by_twitch_user_id = ?, version = version + 1, updated_at = ?
         WHERE id = ? AND archived_at IS NULL AND version = ?`
      )
      .bind(now, admin.twitchUserId, now, clueId, version),
    db
      .prepare(
        `INSERT INTO mining_audit_log (
          id, entity_type, entity_id, action, actor_type, actor_id, details_json, created_at
        )
        SELECT ?, 'clue', ?, 'archive', 'twitch_admin', ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM mining_clues WHERE id = ? AND archived_at = ?)`
      )
      .bind(
        auditId,
        clueId,
        admin.twitchUserId,
        JSON.stringify({ clueText: current.clue_text, answer: current.answer }),
        now,
        clueId,
        now
      ),
  ]);

  if (rowChanges(updateResult) < 1) {
    throw new ApiError(409, 'This clue changed before it could be archived.');
  }
}

function moderatorLabel(moderator) {
  return String(moderator.name || moderator.id || 'Discord moderator').slice(0, 100);
}

export async function moderateMiningSubmission(env, submissionId, action, moderator) {
  const db = requireMiningDb(env);
  const submission = await getMiningSubmission(env, submissionId);
  if (!submission) throw new ApiError(404, 'Submission not found.');
  if (submission.status !== 'pending') {
    return { submission, alreadyHandled: true };
  }

  const now = new Date().toISOString();
  const actorName = moderatorLabel(moderator);
  const auditId = createId();

  if (action === 'decline') {
    const [decision] = await db.batch([
      db
        .prepare(
          `UPDATE mining_submissions
           SET status = 'declined', moderator_discord_user_id = ?, moderator_discord_name = ?, moderated_at = ?
           WHERE id = ? AND status = 'pending'`
        )
        .bind(moderator.id, actorName, now, submissionId),
      db
        .prepare(
          `INSERT INTO mining_audit_log (
            id, entity_type, entity_id, action, actor_type, actor_id, details_json, created_at
          )
          SELECT ?, 'submission', ?, 'decline', 'discord_moderator', ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM mining_submissions
            WHERE id = ? AND status = 'declined' AND moderated_at = ?
          )`
        )
        .bind(
          auditId,
          submissionId,
          moderator.id,
          JSON.stringify({ actorName }),
          now,
          submissionId,
          now
        ),
    ]);
    if (rowChanges(decision) < 1) {
      return { submission: await getMiningSubmission(env, submissionId), alreadyHandled: true };
    }
    return { submission: await getMiningSubmission(env, submissionId), alreadyHandled: false };
  }

  if (action === 'block') {
    const results = await db.batch([
      db
        .prepare(
          `UPDATE twitch_users
           SET blocked_at = ?, blocked_reason = 'Blocked from Discord moderation',
               blocked_by_discord_user_id = ?, updated_at = ?
           WHERE twitch_user_id = ?`
        )
        .bind(now, moderator.id, now, submission.submitterTwitchUserId),
      db
        .prepare(
          `UPDATE mining_submissions
           SET status = 'blocked', moderator_discord_user_id = ?, moderator_discord_name = ?,
               decision_reason = 'Submitter blocked', moderated_at = ?
           WHERE submitter_twitch_user_id = ? AND status = 'pending'`
        )
        .bind(moderator.id, actorName, now, submission.submitterTwitchUserId),
      db
        .prepare(
          `INSERT INTO mining_audit_log (
            id, entity_type, entity_id, action, actor_type, actor_id, details_json, created_at
          ) VALUES (?, 'twitch_user', ?, 'block', 'discord_moderator', ?, ?, ?)`
        )
        .bind(
          auditId,
          submission.submitterTwitchUserId,
          moderator.id,
          JSON.stringify({ actorName, triggeringSubmissionId: submissionId }),
          now
        ),
    ]);
    if (rowChanges(results[1]) < 1) {
      return { submission: await getMiningSubmission(env, submissionId), alreadyHandled: true };
    }
    return { submission: await getMiningSubmission(env, submissionId), alreadyHandled: false };
  }

  if (action !== 'accept') {
    throw new ApiError(400, 'Unknown moderation action.');
  }

  if (submission.submissionType === 'answer_change') {
    const target = await db
      .prepare('SELECT id, answer, version, archived_at FROM mining_clues WHERE id = ?')
      .bind(submission.targetClueId)
      .first();
    if (
      !target ||
      target.archived_at ||
      Number(target.version) !== Number(submission.targetClueVersion)
    ) {
      throw new ApiError(
        409,
        'The clue changed after this submission was created. Review it on the site before accepting.'
      );
    }

    const results = await db.batch([
      db
        .prepare(
          `UPDATE mining_submissions
           SET status = 'processing', moderator_discord_user_id = ?, moderator_discord_name = ?, moderated_at = ?
           WHERE id = ? AND status = 'pending'
             AND EXISTS (
               SELECT 1 FROM mining_clues c
               WHERE c.id = target_clue_id AND c.version = target_clue_version AND c.archived_at IS NULL
             )`
        )
        .bind(moderator.id, actorName, now, submissionId),
      db
        .prepare(
          `UPDATE mining_clues
           SET answer = (
                 SELECT answer FROM mining_submissions WHERE id = ? AND status = 'processing' AND moderated_at = ?
               ),
               version = version + 1,
               updated_at = ?
           WHERE id = ? AND version = ?
             AND EXISTS (
               SELECT 1 FROM mining_submissions WHERE id = ? AND status = 'processing' AND moderated_at = ?
             )`
        )
        .bind(
          submissionId,
          now,
          now,
          submission.targetClueId,
          submission.targetClueVersion,
          submissionId,
          now
        ),
      db
        .prepare(
          `UPDATE mining_submissions SET status = 'accepted'
           WHERE id = ? AND status = 'processing' AND moderated_at = ?`
        )
        .bind(submissionId, now),
      db
        .prepare(
          `INSERT INTO mining_audit_log (
            id, entity_type, entity_id, action, actor_type, actor_id, details_json, created_at
          )
          SELECT ?, 'clue', ?, 'accept_answer_change', 'discord_moderator', ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM mining_submissions WHERE id = ? AND status = 'accepted' AND moderated_at = ?
          )`
        )
        .bind(
          auditId,
          submission.targetClueId,
          moderator.id,
          JSON.stringify({
            actorName,
            submissionId,
            oldAnswer: submission.currentAnswer,
            newAnswer: submission.answer,
          }),
          now,
          submissionId,
          now
        ),
    ]);

    if (rowChanges(results[0]) < 1 || rowChanges(results[1]) < 1) {
      throw new ApiError(409, 'The submission was already handled or the clue changed.');
    }
    return { submission: await getMiningSubmission(env, submissionId), alreadyHandled: false };
  }

  const existing = await db
    .prepare('SELECT id, answer FROM mining_clues WHERE clue_key = ? AND archived_at IS NULL')
    .bind(submission.clueKey)
    .first();
  if (existing && existing.answer !== submission.answer) {
    throw new ApiError(
      409,
      'A clue with this wording now exists with a different answer. Review it on the site.'
    );
  }

  if (existing) {
    await db.batch([
      db
        .prepare(
          `UPDATE mining_submissions
           SET status = 'accepted', target_clue_id = ?, moderator_discord_user_id = ?,
               moderator_discord_name = ?, decision_reason = 'Already added while pending', moderated_at = ?
           WHERE id = ? AND status = 'pending'`
        )
        .bind(existing.id, moderator.id, actorName, now, submissionId),
      db
        .prepare(
          `INSERT INTO mining_audit_log (
            id, entity_type, entity_id, action, actor_type, actor_id, details_json, created_at
          ) VALUES (?, 'submission', ?, 'accept_existing', 'discord_moderator', ?, ?, ?)`
        )
        .bind(
          auditId,
          submissionId,
          moderator.id,
          JSON.stringify({ actorName, clueId: existing.id }),
          now
        ),
    ]);
    return { submission: await getMiningSubmission(env, submissionId), alreadyHandled: false };
  }

  const clueId = createId();
  try {
    const results = await db.batch([
      db
        .prepare(
          `UPDATE mining_submissions
           SET status = 'processing', moderator_discord_user_id = ?, moderator_discord_name = ?, moderated_at = ?
           WHERE id = ? AND status = 'pending' AND submission_type = 'new'`
        )
        .bind(moderator.id, actorName, now, submissionId),
      db
        .prepare(
          `INSERT INTO mining_clues (
            id, clue_text, clue_key, answer, version, source_submission_id,
            created_by_twitch_user_id, created_at, updated_at
          )
          SELECT ?, clue_text, clue_key, answer, 1, id, submitter_twitch_user_id, ?, ?
          FROM mining_submissions
          WHERE id = ? AND status = 'processing' AND moderated_at = ?`
        )
        .bind(clueId, now, now, submissionId, now),
      db
        .prepare(
          `UPDATE mining_submissions SET status = 'accepted', target_clue_id = ?
           WHERE id = ? AND status = 'processing' AND moderated_at = ?`
        )
        .bind(clueId, submissionId, now),
      db
        .prepare(
          `INSERT INTO mining_audit_log (
            id, entity_type, entity_id, action, actor_type, actor_id, details_json, created_at
          )
          SELECT ?, 'clue', ?, 'accept_new', 'discord_moderator', ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM mining_submissions WHERE id = ? AND status = 'accepted' AND moderated_at = ?
          )`
        )
        .bind(
          auditId,
          clueId,
          moderator.id,
          JSON.stringify({ actorName, submissionId }),
          now,
          submissionId,
          now
        ),
    ]);
    if (rowChanges(results[0]) < 1 || rowChanges(results[1]) < 1) {
      throw new ApiError(409, 'The submission was already handled.');
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (String(error?.message || '').includes('UNIQUE constraint failed')) {
      throw new ApiError(409, 'A clue with this wording was added while you were reviewing.');
    }
    throw error;
  }

  return { submission: await getMiningSubmission(env, submissionId), alreadyHandled: false };
}

export async function listBlockedUsers(env) {
  const db = requireMiningDb(env);
  const result = await db
    .prepare(
      `SELECT twitch_user_id, login, display_name, blocked_at, blocked_reason,
              blocked_by_discord_user_id
       FROM twitch_users
       WHERE blocked_at IS NOT NULL
       ORDER BY blocked_at DESC
       LIMIT 100`
    )
    .all();
  return (result.results || []).map((row) => ({
    twitchUserId: row.twitch_user_id,
    login: row.login,
    displayName: row.display_name,
    blockedAt: row.blocked_at,
    reason: row.blocked_reason,
    blockedByDiscordUserId: row.blocked_by_discord_user_id,
  }));
}

export async function unblockUser(env, admin, twitchUserId) {
  const db = requireMiningDb(env);
  const now = new Date().toISOString();
  const auditId = createId();
  const [result] = await db.batch([
    db
      .prepare(
        `UPDATE twitch_users
         SET blocked_at = NULL, blocked_reason = NULL, blocked_by_discord_user_id = NULL, updated_at = ?
         WHERE twitch_user_id = ? AND blocked_at IS NOT NULL`
      )
      .bind(now, twitchUserId),
    db
      .prepare(
        `INSERT INTO mining_audit_log (
          id, entity_type, entity_id, action, actor_type, actor_id, details_json, created_at
        )
        SELECT ?, 'twitch_user', ?, 'unblock', 'twitch_admin', ?, NULL, ?
        WHERE EXISTS (SELECT 1 FROM twitch_users WHERE twitch_user_id = ? AND blocked_at IS NULL)`
      )
      .bind(auditId, twitchUserId, admin.twitchUserId, now, twitchUserId),
  ]);
  if (rowChanges(result) < 1) throw new ApiError(404, 'Blocked Twitch user not found.');
}
