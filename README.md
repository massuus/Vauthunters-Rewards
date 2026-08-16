# Vault Hunters Rewards Lookup

A lightweight web app to look up a Minecraft player and display their Vault Hunters rewards, sets, and Patreon tiers. It serves a static frontend with Cloudflare Pages and implements API routes as Pages Functions.

Live site: https://vh-rewards.massuus.com/

## Features

- **Username Search**: Resolves Mojang UUIDs and fetches Vault Hunters rewards and Patreon tiers.
- **Set Art & Details**: Set images and descriptions from the wiki when available (`public/set-art.json`); modals support multiple images per set.
- **Extra Info Panel**: Two‑column table (Name, Path) for individual rewards with sensible path mapping (e.g., `the_vault:gear/armor/<set>/<piece>` or `the_vault:gear/<type>/<name>`).
- **Responsive Design**: Long paths wrap on mobile; panels scroll horizontally as a safety net.
- **Recent Searches**: Clickable head+name chips for the last 4 players you've looked up, persisted in localStorage.
- **Share Link**: Copy a direct URL with the username query and share with others.
- **Reward Codes Page**: Browse all unlockable reward codes with descriptions, VOD links, and reveal buttons (access via search: "codes").
- **All Rewards Browse**: Browse every unlockable reward in the game with images and descriptions (access via search: "all").
- **Unlock Leaderboard**: Browse players ranked by total unlocked sets with Vault Hunters + Iskall85 tier columns (access via search: "leaderboard").
- **Mining Clue Database**: Search approved mining clues and answers, submit new evidence while signed in with Twitch, and moderate submissions from Discord or the site (access via search: "mining").
- **Patreon Tier Badges**: Visual badges for each Patreon tier (Dweller, Cheeser, Goblin, Champion, Legend) with color coding.
- **Service Worker Caching**: Cache‑first images and short‑TTL caching for `/api/profile`.
- **New Unlock Detection**: Highlights newly obtained sets with a "New" badge per player.
- **Rate Limiting**: API endpoints are rate-limited to prevent abuse (60 requests/minute).
- **Retry Logic**: Failed API requests automatically retry with exponential backoff.
- **Offline Support**: Custom offline page with graceful degradation.
- **Lazy Image Loading**: Images load lazily with skeleton loaders for better UX.

## Prerequisites

- Node.js 20.x LTS (recommended for Wrangler Pages local dev)
- npm
- Internet access for upstream APIs

## Install & Run (Wrangler Pages dev)

```bash
npm install
npm start
```

This uses `wrangler pages dev dist` via `npx` (after a production build) and serves:

- Frontend at `http://127.0.0.1:8788/`
- Functions under `/api/*` and `/img`

Compatibility date is set in `wrangler.toml`.

### Local API key setup

Rewards requests use the `REWARDS_API_KEY` secret in Pages Functions.

For local development with `wrangler pages dev`, add it to `.dev.vars`:

```bash
cp .dev.vars.example .dev.vars
```

Then edit `.dev.vars` and set:

```dotenv
REWARDS_API_KEY=your-real-key
```

Notes:

- `.env` is not used as a Pages Function binding source in this setup.
- `.dev.vars` is gitignored to avoid leaking secrets.

### Leaderboard DB setup (Cloudflare D1)

The leaderboard uses a D1 binding named `LEADERBOARD_DB`.

1. Create a D1 database:

```bash
npx wrangler d1 create vh-leaderboard
```

2. Add the returned binding details to `wrangler.toml`:

```toml
[[d1_databases]]
binding = "LEADERBOARD_DB"
database_name = "vh-leaderboard"
database_id = "<your-d1-database-id>"
```

3. (Recommended) protect batch refresh calls with a secret token in Pages environment variables:

- `LEADERBOARD_SYNC_TOKEN` = a long random value

The schema is created automatically by the functions on first leaderboard read/write.

### Mining clues setup

The mining feature uses the existing `LEADERBOARD_DB` D1 binding. Apply the checked-in migrations before starting the feature locally or deploying it:

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

Copy `.dev.vars.example` to `.dev.vars` for local development. The mining feature needs the following configuration.

#### Twitch login

1. Create a Twitch application in the [Twitch developer console](https://dev.twitch.tv/console/apps).
2. Add `http://127.0.0.1:8788/api/auth/twitch/callback` as a local OAuth redirect URL and `https://your-domain.example/api/auth/twitch/callback` for production.
3. Set `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, and `TWITCH_REDIRECT_URI`.
4. Generate a long random `TWITCH_TOKEN_ENCRYPTION_KEY` (at least 32 characters). It encrypts stored Twitch tokens.
5. Set `ADMIN_TWITCH_USER_IDS` to the numeric Twitch user IDs that may edit clues directly. Multiple IDs are comma-separated.
6. Set `APP_ORIGIN` to the exact public origin, without a trailing slash.

Twitch users who are not in `ADMIN_TWITCH_USER_IDS` may submit suggestions but cannot access the site administration API.

#### Discord moderation

1. Create a Discord application and bot in the [Discord developer portal](https://discord.com/developers/applications).
2. Add the bot to the private server with permission to view the review channel, send messages, and embed links.
3. Set the application's Interactions Endpoint URL to `https://your-domain.example/api/discord/interactions`.
4. Set `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, and `DISCORD_CHANNEL_ID`.
5. Set `DISCORD_MODERATOR_ROLE_IDS` and/or `DISCORD_MODERATOR_USER_IDS` to comma-separated IDs allowed to use Accept, Decline, and Block.

The bot posts each pending submission with moderation buttons. Discord requests are verified with the application's public key, and the configured guild/channel/moderator allowlists are checked before a decision is applied. A Gateway connection is not required.

Keep `TWITCH_CLIENT_SECRET`, `TWITCH_TOKEN_ENCRYPTION_KEY`, and `DISCORD_BOT_TOKEN` in Cloudflare Pages secrets. The IDs, public key, redirect URI, origin, admin list, and rate-limit settings can be regular environment variables. For example:

```bash
npx wrangler pages secret put TWITCH_CLIENT_SECRET --project-name vauthunters-rewards
npx wrangler pages secret put TWITCH_TOKEN_ENCRYPTION_KEY --project-name vauthunters-rewards
npx wrangler pages secret put DISCORD_BOT_TOKEN --project-name vauthunters-rewards
```

Optional abuse limits are `MINING_SUBMISSION_COOLDOWN_SECONDS`, `MINING_DAILY_SUBMISSION_LIMIT`, and `MINING_PENDING_SUBMISSION_LIMIT`.

## Build for Production

For production deployment with optimized assets:

```bash
# Install dependencies (includes esbuild, PostCSS, autoprefixer, cssnano)
npm install

# Build optimized production bundle
npm run build:prod

# Or deploy directly to Cloudflare Pages
npm run deploy
```

The build process:

- Minifies JavaScript with esbuild
- Minifies and autoprefixes CSS with PostCSS
- Enables code splitting for optimal loading
- Removes console.log/debug statements in production
- Generates bundle size analysis in `dist/meta.json`

For development builds with sourcemaps:

```bash
npm run build:dev
```

## Usage

1. Open `http://127.0.0.1:8788/`.
2. Enter a Minecraft username (3–16 characters) and click Search.
3. The result shows the player head, unlocked sets (with art), Patreon tiers, and an Extra Info panel for reward items.
4. Recent Searches appear under the search bar; click any chip to search again.
5. Search for `leaderboard` to open the unlock leaderboard with infinite scrolling (10 players per page).
6. Search for `mining`, `mining clues`, `clues`, or `mine` to open the mining clue database.

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

### Leaderboard API

Route: `GET /api/leaderboard?limit=10&offset=0`

Ranking notes:

- Players with the same `setsUnlocked` share the same rank position.

Response:

```json
{
  "total": 312,
  "limit": 10,
  "offset": 0,
  "nextOffset": 10,
  "hasMore": true,
  "players": [
    {
      "rank": 1,
      "playerUUID": "49b6ec8c-d319-4eb0-b9de-a72823abdfd4",
      "playerNickname": "19Null7",
      "setsUnlocked": 14,
      "vaultHuntersTier": "Vault Goblin",
      "iskall85Tier": "Gold",
      "updatedAt": "2026-04-26T10:21:43.111Z"
    }
  ]
}
```

Route: `POST /api/leaderboard-refresh`

Purpose:

- Pull a batch of players from `https://api.vaulthunters.gg/armory/player/search`
- Fetch unlock/tier data for each player
- Upsert players with at least 1 unlocked set into D1

Body options:

- `offset` (default `0`)
- `limit` (default `100`, max `300`)
- `concurrency` (default `6`, max `20`)
- `source` (optional label)

Auth:

- If `LEADERBOARD_SYNC_TOKEN` is configured, send either:
  - header `x-leaderboard-sync-token: <token>`
  - or `Authorization: Bearer <token>`

Example:

```bash
curl -X POST https://your-site.example/api/leaderboard-refresh \
  -H "content-type: application/json" \
  -H "x-leaderboard-sync-token: $LEADERBOARD_SYNC_TOKEN" \
  -d '{"offset":0,"limit":200,"concurrency":8}'
```

Run this multiple times (e.g. offsets `0`, `200`, `400`) to seed ~500 players.

### Mining clues API

Public routes:

- `GET /api/mining/clues?q=&answer=&limit=&offset=` lists approved clues.
- `GET /api/auth/me` returns the current Twitch session and CSRF token.
- `GET /api/auth/twitch/login?returnTo=/?mining` starts Twitch login.

Signed-in routes:

- `POST /api/mining/submissions` submits a clue, answer, and optional proof date/time/streamer/VOD or clip URL.
- `GET /api/mining/submissions/mine` lists the current user's recent submissions.
- `POST /api/auth/logout` signs out.

Admin routes under `/api/admin/mining/*` support direct clue creation, editing, archival, failed Discord delivery retries, and unblocking users. Mutating authenticated requests require the CSRF token returned by `/api/auth/me` in the `x-csrf-token` header.

Submission behavior:

- An exact clue-and-answer duplicate is rejected immediately.
- A clue with a different answer is sent for review as an answer change and updates the existing clue when accepted.
- Similar wording is flagged as a possible duplicate for the moderator.
- Proof fields are optional, but date, time, time zone, and streamer must be supplied together when proof is included.

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

- `public/pages/index.html` – application shell and search form
- `public/app.js` – Main application initialization and exports for modular functions
- `public/dom-utils.js` – DOM element caching, utility functions, and image proxying
- `public/search-handler.js` – Search form submission, API calls, and special page routing (codes, all rewards)
- `public/profile-renderer.js` – Rendering of player profile, sets, tiers, and rewards; disclosure toggles
- `public/recent-section.js` – Recent users list rendering and event handling
- `public/set-art-manager.js` – Set art loading, modal management, and modal focus handling
- `public/reward-utils.js` – Reward processing, formatting, HTML escaping, and path derivation
- `public/storage-manager.js` – localStorage management for recent users and per-player seen sets
- `public/url-state.js` – URL query string parsing, sharing, and modal focus state
- `public/ui-feedback.js` – Loading states, feedback messages, and result clearing
- `public/special-pages.js` – Codes page and all rewards page rendering and event binding
- `public/template-loader.js` – Template loading with caching and rendering with data interpolation
- `public/clipboard-utils.js` – Copy-to-clipboard functionality for share links and codes
- `public/main.css` – Root stylesheet importing modular CSS (variables, base, utilities, components)
- `public/set-art.json` – set metadata (labels, images, descriptions); supports both single and multiple images per set
- `public/codes.json` – Reward codes data (name, description, vodUrl, code, expires, images)
- `public/sw.js` – Service Worker with cache‑first images and short‑TTL API caching
- `public/templates/` – HTML template fragments:
  - `player-card.html` – Player head, name, and share button
  - `recent-section.html` – Recent searches container
  - `sets-section.html` – Vault sets grid and CTA buttons
  - `set-card.html` – Individual set card with optional "New" badge
  - `set-modal.html` – Set detail modal with images and description
  - `tiers-section.html` – Patreon tiers list with badges
  - `extra-section.html` – Extra info toggle and panel
  - `sets-help.html` – Help text toggle about seeing all unlocks
  - `reward-group.html` – Table structure for reward groups
  - `loading-skeleton.html` – Loading placeholder

## Functions

- `functions/api/profile.js` – Aggregates PlayerDB (UUID), Vault Hunters rewards, and Patreon tiers. Supports `mock=1` for local dev.
- `functions/api/auth/` – Twitch login, callback, session lookup, and logout routes.
- `functions/api/mining/` – Public clue lookup and authenticated submission routes.
- `functions/api/admin/mining/` – Twitch-admin clue, submission, and blocked-user management routes.
- `functions/api/discord/interactions.js` – Verified Discord button interaction handler.
- `functions/utils/` – Shared authentication, Discord, D1, validation, cryptography, and HTTP helpers.
- `functions/img.js` – Image proxy for approved hosts to avoid 3rd‑party cookies and enable caching.

## Special Pages

### Codes Page

Search for **"codes"** to view all unlockable reward codes:

- Each code card displays name, description, VOD link, and reveal button
- Support for multiple images per reward
- Expiry dates shown when available
- Direct link to the official redeem page

### All Rewards Browse

Search for **"all"** or **"rewards"** to browse every unlockable reward:

- Grid view of all rewards with images and descriptions
- Shows total count of available rewards
- Multi-image support for rewards with multiple items

### Unlock Leaderboard

Search for **"leaderboard"** to view ranked players by unlocked set count:

- Loads players in chunks of 10 as you scroll
- Uses API + browser caching to reduce repeated requests
- Clicking a row searches that player profile immediately

### Mining Clues

Search for **"mining"** to open the community mining clue database:

- Search and filter approved answers by Surface, Mineshaft, or Cave
- Sign in with Twitch to submit a clue and optional VOD or clip proof details
- Track whether your submissions are pending, accepted, declined, or blocked
- Admins can add, edit, or archive clues immediately after Twitch login
- Admins can retry failed Discord notifications and unblock submitters

## Verification

```bash
npm test
npm run lint
npm run build:prod
```

To verify that all Pages Functions compile as a Worker bundle:

```bash
npx wrangler pages functions build
```

## Customization tips

- **Set Metadata**: Add or adjust set data in `public/set-art.json`, including labels, single/multiple images, descriptions, and alt text.
- **Codes Data**: Manage reward codes in `public/codes.json` with VOD links, expiry dates, and multi-image support.
- **Path Derivation**: Customize reward path rules in `public/reward-utils.js` (`deriveRewardPath` and `deriveRewardName` functions).
- **Styling**: Update `public/main.css` (and its imported modules) for responsive grids, modal appearance, and special pages layout.
- **Templates**: Modify template fragments in `public/templates/` for structural changes to cards, modals, and sections.

## Troubleshooting

- **Nothing loads or stuck on old data**:
  - Clear site data and unregister the SW; reload with a new `bust` value.
  - Open DevTools → Application → Storage, then unregister the Service Worker and clear all storage.
- **`wrangler` not found**:
  - The start script uses `npx` to run Wrangler; no global install required.
- **`std::terminate()` / `The Workers runtime failed to start` on `pages dev`**:
  - Use Node 20 LTS for local development (`node -v` should show `v20.x`).
  - This project includes `.nvmrc` with `20` and an `engines.node` range in `package.json` to make this explicit.
- **Images broken when hotlinking**:
  - Use `/img?url=...` (the app does this automatically for allowed hosts).
- **Modal or special pages not rendering**:
  - Ensure template files exist in `public/templates/`.
  - Check browser console for template loading errors.

## License

ISC License. See `package.json` for details.

## Disclaimer

This tool is fan‑made and for fun. It uses the [vaulthunters.gg](https://vaulthunters.gg/) APIs and images from [wiki.vaulthunters.gg](https://wiki.vaulthunters.gg/). There’s no guarantee of continued support.
