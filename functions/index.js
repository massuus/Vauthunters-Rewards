/**
 * Catch-all route handler for serving index.html from the new /pages directory
 * This function handles:
 * - Root path (/) -> serves /pages/index.html
 * - Direct /pages paths -> serves appropriate files
 */

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // If requesting root, serve pages/index.html
  if (pathname === '/') {
    const indexRequest = new Request(new URL('/pages/index.html', url.origin), {
      method: request.method,
      headers: request.headers,
    });
    return context.env.ASSETS.fetch(indexRequest);
  }

  // For all other requests, let the normal static file serving handle it
  return context.env.ASSETS.fetch(request);
}
