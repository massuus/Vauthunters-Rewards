import { decryptSecret, encryptSecret, randomToken, sha256 } from './crypto.js';
import {
  ApiError,
  assertSameOrigin,
  getExpectedOrigin,
  isSecureRequest,
  parseCookies,
  serializeCookie,
} from './http.js';
import { createId, requireMiningDb } from './mining-db.js';

export const SESSION_COOKIE = 'vhr_session';
export const OAUTH_STATE_COOKIE = 'vhr_oauth_state';

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const OAUTH_FLOW_TTL_SECONDS = 10 * 60;
const TWITCH_VALIDATION_INTERVAL_MS = 60 * 60 * 1000;

function requireTwitchConfig(env) {
  const config = {
    clientId: String(env?.TWITCH_CLIENT_ID || '').trim(),
    clientSecret: String(env?.TWITCH_CLIENT_SECRET || '').trim(),
    encryptionKey: String(env?.TWITCH_TOKEN_ENCRYPTION_KEY || '').trim(),
  };

  if (!config.clientId || !config.clientSecret || config.encryptionKey.length < 24) {
    throw new ApiError(503, 'Twitch login is not configured yet.');
  }
  return config;
}

export function getTwitchRedirectUri(request, env) {
  const configured = String(env?.TWITCH_REDIRECT_URI || '').trim();
  return configured || `${getExpectedOrigin(request, env)}/api/auth/twitch/callback`;
}

export function sanitizeReturnPath(value) {
  const candidate = String(value || '/?mining').trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\n')) {
    return '/?mining';
  }
  return candidate.slice(0, 300);
}

export function isAdminUser(env, twitchUserId) {
  const allowed = String(env?.ADMIN_TWITCH_USER_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return allowed.includes(String(twitchUserId || ''));
}

export async function createOauthFlow(env, returnPath) {
  const db = requireMiningDb(env);
  const state = randomToken(32);
  const stateHash = await sha256(state);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OAUTH_FLOW_TTL_SECONDS * 1000).toISOString();

  await db.batch([
    db
      .prepare(
        'INSERT INTO oauth_flows (state_hash, return_path, created_at, expires_at) VALUES (?, ?, ?, ?)'
      )
      .bind(stateHash, sanitizeReturnPath(returnPath), now.toISOString(), expiresAt),
    db.prepare('DELETE FROM oauth_flows WHERE expires_at < ?').bind(now.toISOString()),
  ]);

  return state;
}

export async function consumeOauthFlow(env, state) {
  const db = requireMiningDb(env);
  const stateHash = await sha256(state);
  const flow = await db
    .prepare('SELECT return_path, expires_at FROM oauth_flows WHERE state_hash = ?')
    .bind(stateHash)
    .first();

  await db.prepare('DELETE FROM oauth_flows WHERE state_hash = ?').bind(stateHash).run();
  if (!flow || Date.parse(flow.expires_at) <= Date.now()) {
    throw new ApiError(400, 'The Twitch login request expired. Please start again.');
  }
  return { returnPath: sanitizeReturnPath(flow.return_path) };
}

export function oauthStateCookie(request, state) {
  return serializeCookie(OAUTH_STATE_COOKIE, state, {
    maxAge: OAUTH_FLOW_TTL_SECONDS,
    path: '/api/auth/twitch/callback',
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: 'Lax',
  });
}

export function clearOauthStateCookie(request) {
  return serializeCookie(OAUTH_STATE_COOKIE, '', {
    maxAge: 0,
    path: '/api/auth/twitch/callback',
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: 'Lax',
  });
}

export function sessionCookie(request, token) {
  return serializeCookie(SESSION_COOKIE, token, {
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: 'Lax',
  });
}

export function clearSessionCookie(request) {
  return serializeCookie(SESSION_COOKIE, '', {
    maxAge: 0,
    path: '/',
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: 'Lax',
  });
}

export async function exchangeTwitchCode(request, env, code) {
  const config = requireTwitchConfig(env);
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: getTwitchRedirectUri(request, env),
  });
  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    throw new ApiError(502, 'Twitch did not accept the login code. Please try again.');
  }

  const tokens = await response.json();
  if (!tokens?.access_token || !tokens?.refresh_token) {
    throw new ApiError(502, 'Twitch returned an incomplete login response.');
  }
  return tokens;
}

async function validateTwitchToken(accessToken) {
  const response = await fetch('https://id.twitch.tv/oauth2/validate', {
    headers: { Authorization: `OAuth ${accessToken}` },
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Twitch validation failed with ${response.status}`);
  return response.json();
}

export async function getTwitchIdentity(env, accessToken) {
  const config = requireTwitchConfig(env);
  const validation = await validateTwitchToken(accessToken);
  if (!validation?.user_id || validation.client_id !== config.clientId) {
    throw new ApiError(502, 'Twitch could not verify this account.');
  }

  const response = await fetch('https://api.twitch.tv/helix/users', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Client-Id': config.clientId,
    },
  });
  if (!response.ok) {
    throw new ApiError(502, 'Twitch account details could not be loaded.');
  }
  const body = await response.json();
  const profile = body?.data?.[0];
  if (!profile?.id || String(profile.id) !== String(validation.user_id)) {
    throw new ApiError(502, 'Twitch returned an unexpected account.');
  }

  return {
    twitchUserId: String(profile.id),
    login: String(profile.login || validation.login || '').toLowerCase(),
    displayName: String(profile.display_name || profile.login || validation.login || ''),
    profileImageUrl: String(profile.profile_image_url || ''),
  };
}

export async function createAuthSession(env, identity, tokens) {
  const db = requireMiningDb(env);
  const config = requireTwitchConfig(env);
  const sessionToken = randomToken(32);
  const sessionHash = await sha256(sessionToken);
  const csrfToken = randomToken(24);
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString();
  const tokenExpiresAt = Number(tokens.expires_in)
    ? new Date(now.getTime() + Number(tokens.expires_in) * 1000).toISOString()
    : null;
  const [accessCiphertext, refreshCiphertext] = await Promise.all([
    encryptSecret(tokens.access_token, config.encryptionKey),
    encryptSecret(tokens.refresh_token, config.encryptionKey),
  ]);

  await db.batch([
    db
      .prepare(
        `INSERT INTO twitch_users (
          twitch_user_id, login, display_name, profile_image_url, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(twitch_user_id) DO UPDATE SET
          login = excluded.login,
          display_name = excluded.display_name,
          profile_image_url = excluded.profile_image_url,
          updated_at = excluded.updated_at`
      )
      .bind(
        identity.twitchUserId,
        identity.login,
        identity.displayName,
        identity.profileImageUrl || null,
        nowIso,
        nowIso
      ),
    db
      .prepare(
        `INSERT INTO auth_sessions (
          session_hash, twitch_user_id, csrf_token, access_token_ciphertext,
          refresh_token_ciphertext, token_expires_at, last_twitch_validation_at,
          created_at, last_seen_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        sessionHash,
        identity.twitchUserId,
        csrfToken,
        accessCiphertext,
        refreshCiphertext,
        tokenExpiresAt,
        nowIso,
        nowIso,
        nowIso,
        expiresAt
      ),
    db.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').bind(nowIso),
  ]);

  return { sessionToken, csrfToken };
}

async function refreshTwitchSession(env, row) {
  const config = requireTwitchConfig(env);
  const refreshToken = await decryptSecret(row.refresh_token_ciphertext, config.encryptionKey);
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) return null;
  const tokens = await response.json();
  if (!tokens?.access_token || !tokens?.refresh_token) return null;
  return tokens;
}

async function revalidateSession(env, row) {
  const db = requireMiningDb(env);
  const config = requireTwitchConfig(env);
  let accessToken = await decryptSecret(row.access_token_ciphertext, config.encryptionKey);
  let validation;

  try {
    validation = await validateTwitchToken(accessToken);
  } catch (error) {
    console.error('Twitch session validation temporarily failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return true;
  }

  let refreshedTokens = null;
  if (!validation) {
    refreshedTokens = await refreshTwitchSession(env, row);
    if (!refreshedTokens) return false;
    accessToken = refreshedTokens.access_token;
    validation = await validateTwitchToken(accessToken);
  }

  if (
    !validation ||
    String(validation.user_id) !== String(row.twitch_user_id) ||
    validation.client_id !== config.clientId
  ) {
    return false;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  if (refreshedTokens) {
    const [accessCiphertext, refreshCiphertext] = await Promise.all([
      encryptSecret(refreshedTokens.access_token, config.encryptionKey),
      encryptSecret(refreshedTokens.refresh_token, config.encryptionKey),
    ]);
    const tokenExpiresAt = Number(refreshedTokens.expires_in)
      ? new Date(now.getTime() + Number(refreshedTokens.expires_in) * 1000).toISOString()
      : null;
    await db
      .prepare(
        `UPDATE auth_sessions
         SET access_token_ciphertext = ?, refresh_token_ciphertext = ?, token_expires_at = ?,
             last_twitch_validation_at = ?, last_seen_at = ?
         WHERE session_hash = ?`
      )
      .bind(accessCiphertext, refreshCiphertext, tokenExpiresAt, nowIso, nowIso, row.session_hash)
      .run();
  } else {
    await db
      .prepare(
        'UPDATE auth_sessions SET last_twitch_validation_at = ?, last_seen_at = ? WHERE session_hash = ?'
      )
      .bind(nowIso, nowIso, row.session_hash)
      .run();
  }
  return true;
}

function mapAuthUser(env, row) {
  return {
    twitchUserId: row.twitch_user_id,
    login: row.login,
    displayName: row.display_name,
    profileImageUrl: row.profile_image_url || null,
    blocked: Boolean(row.blocked_at),
    blockedAt: row.blocked_at || null,
    isAdmin: isAdminUser(env, row.twitch_user_id),
    csrfToken: row.csrf_token,
  };
}

export async function getAuthSession(request, env) {
  const db = requireMiningDb(env);
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const sessionHash = await sha256(token);
  const row = await db
    .prepare(
      `SELECT s.*, u.login, u.display_name, u.profile_image_url, u.blocked_at
       FROM auth_sessions s
       JOIN twitch_users u ON u.twitch_user_id = s.twitch_user_id
       WHERE s.session_hash = ?`
    )
    .bind(sessionHash)
    .first();
  if (!row) return null;

  if (Date.parse(row.expires_at) <= Date.now()) {
    await db.prepare('DELETE FROM auth_sessions WHERE session_hash = ?').bind(sessionHash).run();
    return null;
  }

  const lastValidation = Date.parse(row.last_twitch_validation_at);
  if (
    !Number.isFinite(lastValidation) ||
    Date.now() - lastValidation >= TWITCH_VALIDATION_INTERVAL_MS
  ) {
    const valid = await revalidateSession(env, row);
    if (!valid) {
      await db.prepare('DELETE FROM auth_sessions WHERE session_hash = ?').bind(sessionHash).run();
      return null;
    }
  }

  return {
    sessionHash,
    user: mapAuthUser(env, row),
  };
}

export async function requireAuth(context, { admin = false, csrf = false } = {}) {
  if (csrf) assertSameOrigin(context.request, context.env);
  const session = await getAuthSession(context.request, context.env);
  if (!session) throw new ApiError(401, 'Log in with Twitch to continue.');
  if (admin && !session.user.isAdmin) {
    throw new ApiError(403, 'This action is only available to site administrators.');
  }
  if (csrf) {
    const provided = String(context.request.headers.get('x-csrf-token') || '');
    if (!provided || provided !== session.user.csrfToken) {
      throw new ApiError(403, 'Your session security token is missing or expired.');
    }
  }
  return session;
}

export async function deleteAuthSession(request, env) {
  const db = requireMiningDb(env);
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return;
  await db
    .prepare('DELETE FROM auth_sessions WHERE session_hash = ?')
    .bind(await sha256(token))
    .run();
}

export function buildTwitchAuthorizationUrl(request, env, state) {
  const config = requireTwitchConfig(env);
  const url = new URL('https://id.twitch.tv/oauth2/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', getTwitchRedirectUri(request, env));
  url.searchParams.set('scope', 'openid');
  url.searchParams.set('state', state);
  return url.toString();
}

export async function writeSystemAudit(env, entityType, entityId, action, details = null) {
  const db = requireMiningDb(env);
  await db
    .prepare(
      `INSERT INTO mining_audit_log (
        id, entity_type, entity_id, action, actor_type, actor_id, details_json, created_at
      ) VALUES (?, ?, ?, ?, 'system', NULL, ?, ?)`
    )
    .bind(
      createId(),
      entityType,
      entityId,
      action,
      details ? JSON.stringify(details) : null,
      new Date().toISOString()
    )
    .run();
}
