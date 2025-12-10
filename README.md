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
- **Patreon Tier Badges**: Visual badges for each Patreon tier (Dweller, Cheeser, Goblin, Champion, Legend) with color coding.
- **Service Worker Caching**: Cache‑first images and short‑TTL caching for `/api/profile`.
- **New Unlock Detection**: Highlights newly obtained sets with a "New" badge per player.

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
- `public/styles.css` – Comprehensive styling; responsive grid, modal, codes page, and rewards browsing styles
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

## Customization tips

- **Set Metadata**: Add or adjust set data in `public/set-art.json`, including labels, single/multiple images, descriptions, and alt text.
- **Codes Data**: Manage reward codes in `public/codes.json` with VOD links, expiry dates, and multi-image support.
- **Path Derivation**: Customize reward path rules in `public/reward-utils.js` (`deriveRewardPath` and `deriveRewardName` functions).
- **Styling**: Update `public/styles.css` for responsive grids, modal appearance, and special pages layout.
- **Templates**: Modify template fragments in `public/templates/` for structural changes to cards, modals, and sections.

## Troubleshooting

- **Nothing loads or stuck on old data**:
  - Clear site data and unregister the SW; reload with a new `bust` value.
  - Open DevTools → Application → Storage, then unregister the Service Worker and clear all storage.
- **`wrangler` not found**:
  - The start script uses `npx` to run a pinned Wrangler version; no global install required.
- **Images broken when hotlinking**:
  - Use `/img?url=...` (the app does this automatically for allowed hosts).
- **Modal or special pages not rendering**:
  - Ensure template files exist in `public/templates/`.
  - Check browser console for template loading errors.

## Support

If this project helped you, you can support it here:

- Buy Me a Coffee: https://buymeacoffee.com/massuus

## License

ISC License. See `package.json` for details.

## Disclaimer

This tool is fan‑made and for fun. It uses the [vaulthunters.gg](https://vaulthunters.gg/) APIs and images from [wiki.vaulthunters.gg](https://wiki.vaulthunters.gg/). There’s no guarantee of continued support.
