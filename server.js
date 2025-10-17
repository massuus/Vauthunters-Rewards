const express = require('express');

const app = express();

// Security headers including CSP with frame-ancestors (not supported in <meta>)
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https://mc-heads.net https://wiki.vaulthunters.gg",
  "connect-src 'self' https://cloudflareinsights.com https://static.cloudflareinsights.com",
  "base-uri 'self'",
  "frame-ancestors 'none'"
].join('; ');

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});
const PORT = process.env.PORT || 3000;

const PLAYERDB_PROFILE_URL = 'https://playerdb.co/api/player/minecraft/';
const REWARDS_URL = 'https://rewards.vaulthunters.gg/rewards?minecraft=';
const TIER_URL = 'https://api.vaulthunters.gg/users/reward?uuid=';

const INVALID_UUID_LENGTH = 32;
const REQUEST_HEADERS = {
  'user-agent': 'Vauthunters Rewards/1.0 (+https://vh-rewards.massuus.com)',
  accept: 'application/json'
};

app.use(express.static('public', {
  setHeaders: (res, filePath) => {
    if (/\.(?:css|js|json)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (/\.(?:png|jpg|jpeg|gif|webp|svg|ico)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (/\.(?:html)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    }
  }
}));

// Avoid 404 noise for default favicon requests during local dev
app.get('/favicon.ico', (_req, res) => {
  res.status(204).end();
});

// First-party image proxy to avoid third-party cookies from external hosts
const ALLOWED_IMAGE_HOSTS = new Set(['wiki.vaulthunters.gg', 'mc-heads.net']);

app.get('/img', async (req, res) => {
  const raw = (req.query.url || '').toString();

  if (!raw) {
    return res.status(400).send('Missing url parameter');
  }

  let target;
  try {
    target = new URL(raw);
  } catch {
    return res.status(400).send('Invalid URL');
  }

  if (target.protocol !== 'https:' || !ALLOWED_IMAGE_HOSTS.has(target.hostname)) {
    return res.status(400).send('URL not allowed');
  }

  try {
    // Forward basic conditional headers for better caching
    const forwardHeaders = {
      'user-agent': REQUEST_HEADERS['user-agent'],
      accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      referer: target.origin + '/',
    };
    if (req.headers['if-none-match']) forwardHeaders['if-none-match'] = req.headers['if-none-match'];
    if (req.headers['if-modified-since']) forwardHeaders['if-modified-since'] = req.headers['if-modified-since'];

    const upstream = await fetch(target.href, {
      redirect: 'follow',
      headers: forwardHeaders
    });

    // Handle 304 Not Modified pass-through
    if (upstream.status === 304) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      const etag = upstream.headers.get('etag');
      const lastMod = upstream.headers.get('last-modified');
      if (etag) res.setHeader('ETag', etag);
      if (lastMod) res.setHeader('Last-Modified', lastMod);
      res.setHeader('Vary', 'Accept');
      return res.status(304).end();
    }

    if (!upstream.ok) {
      return res.status(upstream.status).send('Upstream error');
    }

    const contentType = upstream.headers.get('content-type') || '';
    if (!/^image\//i.test(contentType)) {
      return res.status(415).send('Unsupported content type');
    }

    // Stream the response body to the client
    const { Readable } = require('stream');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Vary', 'Accept');
    res.removeHeader('Set-Cookie');

    const etag = upstream.headers.get('etag');
    const lastMod = upstream.headers.get('last-modified');
    if (etag) res.setHeader('ETag', etag);
    if (lastMod) res.setHeader('Last-Modified', lastMod);

    const nodeStream = Readable.fromWeb(upstream.body);
    nodeStream.on('error', () => {
      if (!res.headersSent) res.status(502);
      res.end();
    });
    nodeStream.pipe(res);
  } catch (err) {
    console.error('Image proxy error:', err);
    res.status(502).send('Image fetch failed');
  }
});

function formatUuid(hexId) {
  if (!hexId || hexId.length !== INVALID_UUID_LENGTH) {
    return null;
  }

  return `${hexId.slice(0, 8)}-${hexId.slice(8, 12)}-${hexId.slice(12, 16)}-${hexId.slice(16, 20)}-${hexId.slice(20)}`;
}

app.get('/api/profile', async (req, res) => {
  const username = (req.query.username || '').trim();

  if (!username) {
    return res.status(400).json({ error: 'Username query parameter is required.' });
  }

  try {
    const profile = await fetchProfile(username);

    if (!profile) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    const { rawId, name, head } = profile;
    const formattedId = formatUuid(rawId);

    if (!rawId || !formattedId) {
      return res.status(502).json({ error: 'Unable to resolve player UUID.' });
    }

    const [rewardsData, tier] = await Promise.all([
      fetchRewards(formattedId),
      fetchTiers(formattedId)
    ]);

    const { rewards, sets } = rewardsData;

    res.json({
      id: rawId,
      name,
      head,
      rewards,
      sets,
      tier
    });
  } catch (error) {
    console.error('Profile lookup error:', error);
    res.status(500).json({
      error: 'Failed to retrieve player data.',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

async function fetchProfile(username) {
  const response = await fetch(`${PLAYERDB_PROFILE_URL}${encodeURIComponent(username)}`, {
    headers: REQUEST_HEADERS
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Profile API error: ${response.status}`);
  }

  const data = await response.json();

  if (!data?.success || !data?.data?.player?.raw_id) {
    return null;
  }

  const player = data.data.player;
  const rawId = player.raw_id;

  if (typeof rawId !== 'string' || rawId.length !== INVALID_UUID_LENGTH) {
    return null;
  }

  return {
    rawId,
    name: player.username || username,
    head: `https://mc-heads.net/avatar/${rawId}`
  };
}

async function fetchRewards(formattedId) {
  try {
    const response = await fetch(`${REWARDS_URL}${encodeURIComponent(formattedId)}`, {
      headers: REQUEST_HEADERS
    });

    if (response.status === 404) {
      return { rewards: {}, sets: [] };
    }

    if (!response.ok) {
      console.error('Rewards API error status:', response.status);
      return { rewards: {}, sets: [] };
    }

    const data = await response.json();
    const rewards = Array.isArray(data.rewards) ? {} : data.rewards || {};
    const sets = Array.isArray(data.sets) ? data.sets : data.sets || [];

    return { rewards, sets };
  } catch (error) {
    console.error('Rewards fetch error:', error);
    return { rewards: {}, sets: [] };
  }
}

async function fetchTiers(formattedId) {
  try {
    const response = await fetch(`${TIER_URL}${encodeURIComponent(formattedId)}`, {
      headers: REQUEST_HEADERS
    });

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      console.error('Tier API error status:', response.status);
      return [];
    }

    const data = await response.json();
    return Array.isArray(data.tier) ? data.tier : [];
  } catch (error) {
    console.error('Tier fetch error:', error);
    return [];
  }
}

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
