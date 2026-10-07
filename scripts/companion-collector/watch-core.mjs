import { setTimeout as delay } from 'node:timers/promises';

// Each streamer is attempted at most once per trial. All attempts are sequential.
export async function watchOnce({
  streamers,
  checkLive,
  collect,
  onStatus = async () => {},
  now = Date.now,
  sleep = delay,
  signal,
  maxChecks = 96,
  intervalMs = 15 * 60_000,
  durationMs = 24 * 60 * 60_000,
  maxAttempts = 1,
}) {
  const deadline = now() + durationMs;
  const attempted = new Set();
  let failures = 0;
  for (let check = 1; check <= maxChecks && now() < deadline && !signal?.aborted; check++) {
    let live;
    try {
      live = await checkLive(streamers);
      failures = 0;
    } catch {
      failures++;
      await onStatus({ status: 'waiting', code: 'live-check-failed', check, failures });
      if (failures >= 3) return { status: 'stopped', code: 'repeated-live-check-failure', check };
    }
    if (signal?.aborted) return { status: 'stopped', code: 'interrupted', check };
    if (now() >= deadline) break;
    for (const streamer of streamers.filter(
      (name) => live?.includes(name) && !attempted.has(name)
    )) {
      if (signal?.aborted || now() >= deadline) break;
      attempted.add(streamer);
      await onStatus({ status: 'collecting', streamer, check });
      let outcome;
      try {
        outcome = await collect(streamer);
      } catch {
        outcome = { status: 'failed', code: 'collector-failed' };
      }
      const result = { ...outcome, streamer, check, attemptFinished: true };
      await onStatus(result);
      if (attempted.size >= Math.min(maxAttempts, streamers.length)) return result;
    }
    if (live)
      await onStatus({
        status: 'waiting',
        code: live.length ? 'waiting-for-untested-streamer' : 'all-offline',
        check,
        attempts: attempted.size,
      });
    if (check < maxChecks && now() < deadline) {
      try {
        await sleep(Math.min(intervalMs, deadline - now()), undefined, { signal });
      } catch {
        return { status: 'stopped', code: 'interrupted', check };
      }
    }
  }
  return { status: 'stopped', code: signal?.aborted ? 'interrupted' : 'watch-expired' };
}
