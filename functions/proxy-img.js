const REQUEST_HEADERS = {
  "user-agent": "Vauthunters Rewards/1.0 (+https://vh-rewards.massuus.com)"
};

const ALLOWED_IMAGE_HOSTS = new Set(["wiki.vaulthunters.gg", "mc-heads.net"]);

export async function onRequest({ request }) {
  try {
    const url = new URL(request.url);
    const raw = (url.searchParams.get("url") || "").toString();

    if (!raw) {
      return new Response("Missing url parameter", { status: 400 });
    }

    let target;
    try {
      target = new URL(raw);
    } catch {
      return new Response("Invalid URL", { status: 400 });
    }

    if (target.protocol !== "https:" || !ALLOWED_IMAGE_HOSTS.has(target.hostname)) {
      return new Response("URL not allowed", { status: 400 });
    }

    const headers = {
      "user-agent": REQUEST_HEADERS["user-agent"],
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      referer: `${target.origin}/`
    };

    // Pass through conditional headers
    const reqIfNoneMatch = request.headers.get("if-none-match");
    const reqIfModifiedSince = request.headers.get("if-modified-since");
    if (reqIfNoneMatch) headers["if-none-match"] = reqIfNoneMatch;
    if (reqIfModifiedSince) headers["if-modified-since"] = reqIfModifiedSince;

    const upstream = await fetch(target.href, {
      redirect: "follow",
      headers
    });

    // Pass through status and headers, but ensure caching sensible
    const respHeaders = new Headers(upstream.headers);
    // Add small cache TTL if none provided
    if (!respHeaders.get("cache-control")) {
      respHeaders.set("cache-control", "public, max-age=300, s-maxage=600");
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: respHeaders
    });
  } catch {
    return new Response("Proxy error", { status: 502 });
  }
}
