# Vault Hunters Rewards Lookup

A lightweight web application that lets you look up a Minecraft player and display their Vault Hunters rewards, sets, Patreon tiers, and head render in a single view. The backend proxies Mojang and Vault Hunters APIs so the client avoids CORS issues and receives a tidy payload.

## Features

- Search by Minecraft username and resolve Mojang UUIDs automatically.
- Aggregates data from Mojang, Vault Hunters rewards, and Patreon tier APIs.
- Automatically formats UUIDs with dashes for Vault Hunters endpoints.
- Displays special set art (Golden Creeper, Dylan VIP, Treasure Train, etc.) where available.
- Toggleable "Extra Info" panel listing grouped item rewards.
- Dark, Vault Hunters-inspired design built with vanilla HTML/CSS/JS.

## Prerequisites

- Node.js 18 or later (Node 20+ recommended).
- npm (bundled with Node.js).
- Internet access so the server can reach Mojang and Vault Hunters APIs.

## Install & Run

```bash
npm install
npm start
```

The server starts on `http://localhost:3000` and serves both the API (`/api/profile`) and static frontend.

## Usage

1. Open `http://localhost:3000` in your browser.
2. Enter a Minecraft username (3–16 characters) and click **Search**.
3. If the player exists, you will see their head, set badges, Patreon tier list, and an expandable rewards panel.
4. If the username is invalid or not found, the UI displays an appropriate message.

## API Route

`GET /api/profile?username={minecraftUsername}`

Response structure:

```json
{
  "id": "f00538241a8649c4a5199ba93a40ddcf",
  "name": "massuus",
  "head": "https://mc-heads.net/avatar/f00538241a8649c4a5199ba93a40ddcf",
  "rewards": { "the_vault:shield": ["..."] },
  "sets": ["golden_kappa", "..."] ,
  "tier": [{ "name": "Vault Dweller", "id": "9220744" }]
}
```

Errors:
- `400` for missing/invalid usernames.
- `404` when Mojang cannot find the player.
- `500` for unexpected upstream failures.

## Customization

- Frontend files live in `public/`. Adjust `styles.css` or `app.js` to tweak the UX.
- Expand the `SET_ART` map in `public/app.js` to add icons for additional set keys.
- Backend logic is in `server.js`; you can add caching, rate limiting, or more routes there.

## Troubleshooting

- **Player not found:** Double-check the spelling. Mojang trims usernames larger than 16 characters.
- **Blank rewards/tiers:** That player may not have any recorded data yet; the UI will note this.
- **API rate limits:** Mojang enforces rate limits; try again after a short wait if you hit them.

## License

ISC License. See `package.json` for details.
