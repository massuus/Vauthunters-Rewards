import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';

const CLIENT = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const EXTENSION = 'o8bt9pw89m6ycsmdgp4evjezdlmyvl';
export class JoinError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

async function boundedJson(response) {
  if (!response.ok) {
    await response.body?.cancel();
    throw new JoinError(response.status === 401 ? 'login-required' : 'token-request-failed');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 128 * 1024) {
      await reader.cancel();
      throw new JoinError('response-limit');
    }
    chunks.push(Buffer.from(value));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new JoinError('token-request-failed');
  }
}

// These are the website's observed read-only extension authorization queries.
// No browser, invented tokens, identity grants, or chat OAuth token refreshes.
export function createTokenProvider({
  storageStatePath,
  username,
  fetchImpl = fetch,
  now = Date.now,
}) {
  const channelIds = new Map();
  return async function authorize(streamer) {
    try {
      const saved = JSON.parse(await readFile(storageStatePath, 'utf8'));
      const cookie = saved.cookies?.find(
        (c) => c.name === 'auth-token' && /(^|\.)twitch\.tv$/.test(c.domain)
      );
      if (!cookie?.value || (cookie.expires > 0 && cookie.expires * 1000 <= now()))
        throw new JoinError('login-required');
      const query = async (body) => {
        const result = await boundedJson(
          await fetchImpl('https://gql.twitch.tv/gql', {
            method: 'POST',
            redirect: 'error',
            signal: AbortSignal.timeout(12_000),
            headers: {
              'Client-ID': CLIENT,
              Authorization: `OAuth ${cookie.value}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify(body),
          })
        );
        if (result.errors?.length) throw new JoinError('token-request-failed');
        return result.data;
      };
      const identity = (
        await query({ query: 'query AutoJoinIdentity { currentUser { id login } }' })
      )?.currentUser;
      if (!identity?.id) throw new JoinError('login-required');
      if (identity.login?.toLowerCase() !== username.toLowerCase())
        throw new JoinError('wrong-account');
      const persisted = (operationName, variables, sha256Hash) =>
        query({
          operationName,
          variables,
          extensions: { persistedQuery: { version: 1, sha256Hash } },
        });
      if (!channelIds.has(streamer)) {
        const data = await persisted(
          'ExtensionsUIContext_ChannelID',
          { channelLogin: streamer },
          'aaa9870965b55ecb88e01a4d73b5427e8ff9397eea16b9adbd08cad86d3b9d25'
        );
        if (!/^\d+$/.test(data?.user?.id || '')) throw new JoinError('extension-unavailable');
        channelIds.set(streamer, data.user.id);
      }
      const channelID = channelIds.get(streamer);
      const data = await persisted(
        'ExtensionsForChannel',
        { channelID },
        'b2287425cbca13557bbfbee9e8725680ab613c77de39eaa991e97e0e69e71db1'
      );
      const extension = data?.user?.channel?.selfInstalledExtensions?.find(
        (x) => x.installation?.extension?.clientID === EXTENSION
      );
      if (!extension?.token?.jwt || !extension?.helixToken?.jwt)
        throw new JoinError('extension-unavailable');
      const claims = JSON.parse(
        Buffer.from(extension.token.jwt.split('.')[1], 'base64url').toString()
      );
      if (
        claims.user_id !== identity.id ||
        claims.channel_id !== channelID ||
        claims.role !== 'viewer'
      )
        throw new JoinError('extension-access-required');
      if (!Number.isFinite(claims.exp) || claims.exp * 1000 < now() + 120_000)
        throw new JoinError('token-request-failed');
      const url = new URL('wss://ebs.vaulthunters.gg/socket.io/');
      for (const [key, value] of Object.entries({
        streamer,
        viewer: username,
        extensionToken: extension.token.jwt,
        helixToken: extension.helixToken.jwt,
        EIO: '4',
        transport: 'websocket',
      }))
        url.searchParams.set(key, value);
      return { url: url.toString(), expiresAt: claims.exp * 1000 };
    } catch (error) {
      throw error instanceof JoinError ? error : new JoinError('token-request-failed');
    }
  };
}
