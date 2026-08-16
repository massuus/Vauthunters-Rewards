export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export function json(body, status = 200, headers = {}) {
  const responseHeaders = new Headers(headers);
  if (!responseHeaders.has('content-type')) {
    responseHeaders.set('content-type', 'application/json; charset=utf-8');
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

export function noStoreJson(body, status = 200, headers = {}) {
  const responseHeaders = new Headers(headers);
  if (!responseHeaders.has('cache-control')) {
    responseHeaders.set('cache-control', 'no-store');
  }
  return json(body, status, responseHeaders);
}

export function methodNotAllowed(methods) {
  const allowed = Array.isArray(methods) ? methods : [methods];
  return noStoreJson({ error: `Method not allowed. Use ${allowed.join(' or ')}.` }, 405, {
    Allow: allowed.join(', '),
  });
}

export async function readJson(request, maxBytes = 16_384) {
  const contentType = String(request.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    throw new ApiError(415, 'Content-Type must be application/json.');
  }

  const declaredLength = Number.parseInt(request.headers.get('content-length') || '0', 10);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ApiError(413, 'Request body is too large.');
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new ApiError(413, 'Request body is too large.');
  }

  try {
    const body = JSON.parse(raw || '{}');
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('Expected an object');
    }
    return body;
  } catch {
    throw new ApiError(400, 'Request body must contain valid JSON.');
  }
}

export function handleApiError(error, fallback = 'Something went wrong. Please try again.') {
  if (error instanceof ApiError) {
    return noStoreJson({ error: error.message, details: error.details || undefined }, error.status);
  }

  console.error('API request failed', {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  return noStoreJson({ error: fallback }, 500);
}

export function parseCookies(request) {
  const header = request.headers.get('cookie') || '';
  const cookies = {};

  header.split(';').forEach((part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name) return;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  });

  return cookies;
}

export function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, options.maxAge)}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join('; ');
}

export function getExpectedOrigin(request, env) {
  const configured = String(env?.APP_ORIGIN || '')
    .trim()
    .replace(/\/$/, '');
  return configured || new URL(request.url).origin;
}

export function assertSameOrigin(request, env) {
  const origin = String(request.headers.get('origin') || '').replace(/\/$/, '');
  const expected = getExpectedOrigin(request, env);
  if (!origin || origin !== expected) {
    throw new ApiError(403, 'This request did not come from the site.');
  }
}

export function isSecureRequest(request) {
  const url = new URL(request.url);
  return url.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
}
