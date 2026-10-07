export const EXTENSION_HOST = 'o8bt9pw89m6ycsmdgp4evjezdlmyvl.ext-twitch.tv';

export function shouldBlockRequest(value, resourceType) {
  const url = new URL(value);
  return (
    ['media', 'image', 'font'].includes(resourceType) ||
    /(^|\.)(ttvnw\.net|twitchads\.com|scorecardresearch\.com|doubleclick\.net|tangia\.co)$/.test(
      url.hostname
    ) ||
    /\.(m3u8|mpd|mp4|m4s|ts|aac)$/i.test(url.pathname) ||
    (url.hostname.endsWith('.ext-twitch.tv') &&
      ![EXTENSION_HOST, 'supervisor.ext-twitch.tv'].includes(url.hostname))
  );
}
