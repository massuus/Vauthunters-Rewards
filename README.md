# Vault Hunters Rewards Lookup

A lightweight web app to look up a Minecraft player and display their Vault Hunters rewards, sets, and Patreon tiers. It serves a static frontend with Cloudflare Pages and implements API routes as Pages Functions.

## Features

- Username search resolves Mojang UUIDs and fetches Vault Hunters rewards and Patreon tiers.
- Set art with images and descriptions from the wiki when available (`public/set-art.json`).
- Extra Info panel renders a two‑column table (Name, Path) for individual rewards with sensible path mapping (e.g., `the_vault:gear/armor/<set>/<piece>` or `the_vault:gear/<type>/<name>`).
- Responsive tables on mobile: long paths wrap; panel scrolls horizontally as a safety net.
- Recent Searches: clickable head+name chips for the last 4 players you looked up.
- Share link button that copies a direct URL with the username query.
- Service Worker caching with cache‑first images and short‑TTL caching for `/api/profile`.

## Prerequisites

- Node.js 18+ (Node 20+ recommended)
- npm
- Internet access for upstream APIs

## Install & Run (Wrangler Pages dev)

```bash
npm install
npm start
```

This uses `wrangler pages dev public` via `npx` and serves:
- Frontend at `http://127.0.0.1:8788/`
- Functions under `/api/*` and `/img`

Compatibility date is set in `wrangler.toml`.

## Usage

1. Open `http://127.0.0.1:8788/`.
2. Enter a Minecraft username (3–16 characters) and click Search.
3. The result shows the player head, unlocked sets (with art), Patreon tiers, and an Extra Info panel for reward items.
4. Recent Searches appear under the search bar; click any chip to search again.

## API

Route: `GET /api/profile?username={minecraftUsername}`

Response:

```json
{
  "id": "f00538241a8649c4a5199ba93a40ddcf",
  "name": "massuus",
  "head": "https://mc-heads.net/avatar/f00538241a8649c4a5199ba93a40ddcf",
  "rewards": { "shield": ["Golden Kappa", "Spring Shield"], "helmet": ["royale_crown"] },
  "sets": ["golden_kappa", "i85_spring_set"],
  "tier": [{ "name": "Vault Dweller", "id": "9220744" }]
}
```

Errors:
- 400 for missing/invalid username
- 404 when player cannot be resolved
- 500 for unexpected upstream failures

### Mock mode (local testing)

You can bypass upstream calls during development:

- Add `&mock=1` to the request: `GET /api/profile?username=anything&mock=1`
- The frontend forwards `mock` from the page URL to the API, so visiting:
  - `/?username=anything&mock=1&bust=1`
  will render predictable mock data.

### Cache busting and service worker

- The Service Worker caches images and `/api/profile` for a short TTL.
- Add a `bust` query param to the page URL to force a fresh API request (different URL → different cache key), e.g. `&bust=2`.
- To fully reset during dev, clear `Application → Storage` and unregister the Service Worker, then reload.

## Frontend structure

- `public/index.html` – application shell and search form
- `public/app.js` – UI logic:
  - Search flow, rendering sets/tiers/extra info
  - Recent Searches (stored in `localStorage` under `vh.recentUsers`)
  - Reward table (Name/Path) with path derivation for armor and gear
  - Share link handling
  - Accessible disclosure toggles (chevron arrows synchronized with state)
- `public/styles.css` – styling; includes responsive table and recent chips
- `public/set-art.json` – set art metadata (labels, images, descriptions)
- `public/sw.js` – Service Worker with caching strategies

## Functions

- `functions/api/profile.js` – Aggregates PlayerDB (UUID), Vault Hunters rewards, and Patreon tiers. Supports `mock=1` for local dev.
- `functions/img.js` – Image proxy for approved hosts to avoid 3rd‑party cookies and enable caching.

## Customization tips

- Add or adjust set metadata in `public/set-art.json`.
- Tweak path derivation rules for Extra Info in `public/app.js` (`deriveRewardPath`).
- Update styling in `public/styles.css` (e.g., recent chips, table behavior on mobile).

## Troubleshooting

- Nothing loads or stuck on old data:
  - Clear site data and unregister the SW; reload with a new `bust` value.
- `wrangler` not found:
  - The start script uses `npx` to run a pinned Wrangler version; no global install required.
- Images broken when hotlinking:
  - Use `/img?url=...` (the app does this automatically for allowed hosts).

## License

ISC License. See `package.json` for details.

## Disclaimer

This tool is fan‑made and for fun. It uses the [vaulthunters.gg](https://vaulthunters.gg/) APIs and images from [wiki.vaulthunters.gg](https://wiki.vaulthunters.gg/). There’s no guarantee of continued support.

