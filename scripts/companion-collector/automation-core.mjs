export const STREAMERS = [
  'hoy_82',
  'iskall85',
  'therealhellfirem4ge',
  'linahun',
  'master_cwg',
  'mayaicefire',
  'stressmonstah',
];
const HOUR = 3600_000;

export function validateState(state) {
  if (
    !state ||
    !state.channels ||
    typeof state.channels !== 'object' ||
    Array.isArray(state.channels)
  )
    throw new Error('Invalid budget state.');
  if (
    state.day !== undefined &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(state.day) ||
      !Number.isSafeInteger(state.attempts) ||
      state.attempts < 0 ||
      !state.byStreamer ||
      typeof state.byStreamer !== 'object' ||
      Array.isArray(state.byStreamer) ||
      Object.values(state.byStreamer).some((n) => !Number.isSafeInteger(n) || n < 0))
  )
    throw new Error('Invalid budget state.');
  for (const channel of Object.values(state.channels)) {
    if (!channel || typeof channel !== 'object' || Array.isArray(channel))
      throw new Error('Invalid channel state.');
    for (const key of ['nextAttempt', 'uploadAfter', 'uploadAttempts']) {
      if (channel[key] !== undefined && (!Number.isSafeInteger(channel[key]) || channel[key] < 0))
        throw new Error('Invalid channel budget.');
    }
  }
}

export function dailyState(state, now) {
  const day = new Date(now).toISOString().slice(0, 10);
  if (state.day !== day) {
    state.day = day;
    state.attempts = 0;
    state.byStreamer = {};
  }
  state.channels ??= {};
  return state;
}

// State is saved BEFORE opening a browser, so a crash/restart cannot reset the budget.
export async function automationTick({
  state,
  live,
  collect,
  upload,
  save,
  report,
  now = Date.now,
  signal,
}) {
  dailyState(state, now());
  for (const streamer of STREAMERS) {
    if (signal?.aborted) break;
    const channel = (state.channels[streamer] ??= {});
    if (channel.pending && now() >= (channel.uploadAfter || 0)) {
      channel.uploadAttempts = (channel.uploadAttempts || 0) + 1;
      channel.uploadAfter = now() + HOUR;
      await save(state);
      let outcome;
      try {
        outcome = await upload(streamer);
      } catch {
        outcome = { status: 'failed', code: 'upload-unavailable' };
      }
      if (['imported', 'already-imported'].includes(outcome.status)) {
        channel.pending = false;
        channel.lastUploadedAt = new Date(now()).toISOString();
      } else if (channel.uploadAttempts >= 3 || outcome.permanent) {
        channel.pending = false;
        channel.nextAttempt = Math.max(channel.nextAttempt || 0, now() + 12 * HOUR);
      }
      channel.lastUpload = outcome;
      await save(state);
      await report({ streamer, ...outcome, phase: 'upload' });
    }
    dailyState(state, now());
    if (
      !live.includes(streamer) ||
      channel.pending ||
      now() < (channel.nextAttempt || 0) ||
      state.attempts >= 14 ||
      (state.byStreamer[streamer] || 0) >= 2
    )
      continue;
    state.attempts++;
    state.byStreamer[streamer] = (state.byStreamer[streamer] || 0) + 1;
    channel.nextAttempt = now() + 6 * HOUR;
    await save(state);
    let outcome;
    try {
      outcome = await collect(streamer);
    } catch {
      outcome = { status: 'failed', code: 'collector-failed' };
    }
    if (outcome.status === 'collected') {
      channel.pending = true;
      channel.uploadAttempts = 0;
      channel.uploadAfter = 0;
    } else if (outcome.code === 'empty-result') channel.nextAttempt = now() + 12 * HOUR;
    else if (outcome.code === 'login-or-extension-access-required')
      channel.nextAttempt = now() + 24 * HOUR;
    channel.lastCollection = { ...outcome, time: new Date(now()).toISOString() };
    await save(state);
    await report({ streamer, ...outcome, phase: 'collection' });
    // Delivery starts on the following tick, preserving the collected file on any failure.
  }
}
