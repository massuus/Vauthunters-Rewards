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

    if (upstream.status === 304) {
      const h = new Headers();
      h.set("cache-control", "public, max-age=31536000, immutable");
      const etag = upstream.headers.get("etag");
      const lastMod = upstream.headers.get("last-modified");
      if (etag) h.set("etag", etag);
      if (lastMod) h.set("last-modified", lastMod);
      h.set("vary", "Accept");
      return new Response(null, { status: 304, headers: h });
    }

    if (!upstream.ok) {
      return new Response("Upstream error", { status: upstream.status });
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (!/^image\//i.test(contentType)) {
      return new Response("Unsupported content type", { status: 415 });
    }

    const body = await upstream.arrayBuffer();
    const outHeaders = new Headers({
      "content-type": contentType,
      "cache-control": "public, max-age=31536000, immutable",
      "vary": "Accept"
    });
    const etag = upstream.headers.get("etag");
    const lastMod = upstream.headers.get("last-modified");
    if (etag) outHeaders.set("etag", etag);
    if (lastMod) outHeaders.set("last-modified", lastMod);

    return new Response(body, { status: 200, headers: outHeaders });
  } catch (err) {
    console.error("Image proxy error:", err);
    return new Response("Image fetch failed", { status: 502 });
  }
}
