const CHANNEL_FIELDS = [
  'streamer',
  'live',
  'connected',
  'status',
  'issue',
  'windowOpen',
  'vaultRunning',
  'vaultStartedAt',
];

// Ignore counters and timestamps that change on every status write. Only changes
// which affect the public live page or indicate a connection problem trigger a push.
export function healthEventFingerprint(value) {
  if (!value || !Array.isArray(value.channels)) return null;
  return JSON.stringify({
    state: value.state,
    mode: value.mode,
    liveCheck: value.liveCheck,
    channels: value.channels.map((channel) =>
      Object.fromEntries(CHANNEL_FIELDS.map((field) => [field, channel?.[field] ?? null]))
    ),
  });
}
