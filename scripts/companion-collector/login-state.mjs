const isTwitch = (host) => host === 'twitch.tv' || host.endsWith('.twitch.tv');

// No remote-debugging, automation-hiding, or authentication-bypass flags.
export function manualEdgeArgs(profileDir) {
  return [
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--new-window',
    'https://www.twitch.tv/login',
  ];
}

export function twitchOnlyState(state) {
  return {
    cookies: state.cookies.filter((cookie) => isTwitch(cookie.domain.replace(/^\./, ''))),
    origins: state.origins.filter((origin) => isTwitch(new URL(origin.origin).hostname)),
  };
}

// Presence is a setup check, not proof that Twitch or Oracle will accept the session.
export function hasTwitchSession(cookies, now = Date.now() / 1000) {
  return cookies.some(
    (cookie) =>
      cookie.name === 'auth-token' &&
      cookie.value &&
      isTwitch(cookie.domain.replace(/^\./, '')) &&
      (cookie.expires === -1 || cookie.expires > now)
  );
}
