# Ongoing companion automation

Enabled on Oracle on 7 October 2026 as `vh-companion-automation.service`.
It starts at boot and restarts after a crash with a 15-minute delay. The existing
`vault-pinger` PM2 process, source files and credentials are unchanged.

## How updates reach the website

1. The service checks seven channels through Twitch Helix every 15 minutes,
   reusing its own app token. Offline checks launch no browser.
2. Live channels are collected sequentially with the saved Twitch browser session.
   Video is blocked. The extension supplies fresh connection credentials in memory.
3. Completed snapshots are saved under `results/automation/<streamer>.json`.
4. On the next check, the snapshot is POSTed over HTTPS to
   `https://vh-rewards.massuus.com/api/companion-sync`. A dedicated random secret
   authenticates this endpoint; it does not use an admin cookie or chat user token.
5. The endpoint validates the whole snapshot, backs up the previous channel rows,
   then upserts the new stats and import watermark in one D1 transaction. Empty,
   malformed, expired, conflicting and older snapshots are rejected. Retries of an
   identical import are idempotent. Existing Minecraft account links and players
   absent from a collection are preserved; newer manual edits take precedence.
6. The existing snapshot publisher runs every 15 minutes and picks up changed rows.
   Existing public caches can add several minutes. A new live stream is therefore
   not an instant update: discovery, delivery and publishing can span roughly
   45 minutes plus browser runtime and cache time.

## Limits

- At most two browser attempts per channel per UTC calendar day, 14 total.
- At least six hours between attempts for a channel. Empty results wait 12 hours;
  a login/extension-permission error waits 24 hours. No immediate browser retries.
- Budgets are saved before opening a browser and survive service restarts.
- Upload retries are independent of collection: at most three attempts per snapshot,
  one hour apart after a failure. Permanent HTTP errors stop delivery retries.
- One browser at a time; aggregate 1 GB RAM, 50% of one CPU, 128 tasks.
- Each browser has a two-minute internal deadline and 150-second external timeout
  with five seconds to kill. Up to 800 browser requests and a 30 MiB response-data
  stop threshold; in-flight traffic can overshoot. Socket reads stop at 500 pages
  (10,000 players), 8 MiB or 90 seconds. No partial snapshot is imported.
- Upload body maximum 2 MiB; only the seven configured channels are accepted.
- Keeps 14 daily log files, one current snapshot per channel, and budget/status files.
  D1 retains one pre-import backup per channel. It does not accumulate all imports.
- Uses the existing Oracle VM/disk and existing Cloudflare resources. No VM resize,
  extra volumes, browser services, or new paid resources. Usage still counts toward
  the account's normal network/database allowances; billing has not been inspected.

The browser session can eventually expire and require the manual login helper again.
Use the desktop shortcut **Renew VH Twitch Login** on this PC:

1. Double-click it. The helper checks the Oracle connection first.
2. Sign in in the dedicated Edge window (complete Twitch verification if asked).
3. Close that Edge window and press Enter in the renewal window.
4. Wait for the green completion message, then press Enter to close.

The shortcut runs `renew-login.ps1`. It saves a separate candidate session, sends it
over SSH, and checks Twitch on Oracle with one bounded browser (video blocked).
Only an accepted session replaces the current login. The previous local and Oracle
sessions are kept as `.auth/state.previous.json`. If restarting the collector fails,
the remote helper restores the previous session. Existing daily budgets remain in
place, and a deliberately disabled collector stays disabled. No WSS copy/paste or
assistant involvement is needed. Don't close the renewal window before completion.

A password/session is never embedded in the shortcut. SSH still uses the existing
private key in the user's `.ssh` directory. The desktop shortcut depends on this
repository staying at its current location. Renewal does not test a full leaderboard
when all streamers are offline; it verifies Twitch login and collector startup.

A missing companion currently produces empty results for Linahun; the old website
data is preserved in this case. Other channels continue independently.

## Status and stop

### Admin website panel

Sign in as an administrator and open the leaderboard (`/?leaderboard`). The
**Automatic leaderboard updates** panel appears above the manual import controls.
It shows the last Oracle check-in, current problems, saved cookie expiry, per-channel
collection/upload results, and when data last reached the website. It refreshes every
minute while the page is visible and has a manual refresh button.

Oracle sends a small authenticated health report when live, connection, join-window or
vault state changes, with a five-minute fallback heartbeat, using the existing upload secret.
Leaderboard collection keeps its separate bounded schedule. Only allowlisted dates,
counts, status values and error codes are sent; no cookies, credentials or raw logs.
The latest report occupies one D1 row, independent of public leaderboard snapshots.

The panel warns when no heartbeat has arrived for 45 minutes, even if Oracle has
stopped or cannot authenticate with the website. It also warns seven days before the
saved cookie's expiry. That date is not a guarantee that Twitch still accepts the
session: actual login/extension-access failures are shown separately. Only logged-in
administrators can read the health endpoint; responses are never cached.

Collection and delivery errors remain visible until a later result replaces them.
Live-check failures clear on the next successful live check. The dashboard does not
send email/Discord notifications or run additional browser probes. A fatal collector
error sends a best-effort stopped report; if reporting also fails, the stale-heartbeat
warning is the fallback. A renewed session does not reset collection budgets.

Monitoring rollback: stop the collector, restore code from
`backups/20261008T094627Z-before-health.tar.gz`, then restart it. The previous Pages
deployment was `91771b14-5a9c-496f-91ea-a3747a8ee7df`. Migration 0010 is additive;
leaving its one-row table in place is safe when rolling back code.

### Server commands

```bash
systemctl status vh-companion-automation.service --no-pager
cat /home/ubuntu/companion-collector-test/results/automation/status.json
cat /home/ubuntu/companion-collector-test/results/automation/state.json
```

`status.json` is the heartbeat; per-channel last collection/upload results and next
attempt times are in `state.json`. Daily history files retain the individual events.
The state file is created on the first attempt; it may not exist while all channels
have remained offline. Never print `.auth/state.json`, `.auth/sync.json` or bot `.env`.

Stop and disable future automatic starts:

```bash
sudo systemctl disable --now vh-companion-automation.service
```

Resume: `sudo systemctl enable --now vh-companion-automation.service`. Do not delete
the budget state to force retries. Do not run the old one-shot watcher concurrently.

## Credentials and deployment

Cloudflare Pages production secret: `COMPANION_SYNC_TOKEN` (32 random bytes as hex).
Oracle configuration: `.auth/sync.json`, mode 600, in the mode-700 `.auth` directory.
It contains `token` and `endpoint`. Saved login remains in `.auth/state.json`.
Both are excluded from Git. `wrangler pages secret bulk` reads the credential from
an ignored private JSON file rather than a command argument.

Migrations 0007–0009 add import metadata and rollback rows. Migration 0009 preserves
the initial JSON backup made while the first deployment was propagating. New imports
use `companion_sync_backup`; the legacy JSON column is not used for new backups.

The production deployment before this change was
`f8635cfa-a9f8-46df-b3f8-2a8ef0da3896`; the enabled implementation deployment is
`982f2b78.vauthunters-rewards.pages.dev`. Rolling Pages back does not roll data back.

## Recovery

Stop the Oracle service first. Preserve/export the current affected channel before
restoring anything, and check for manual edits made after the import.

- Initial full companion-table export (local, ignored):
  `.wrangler/companion-before-automation-20261007.sql`.
- Collector code backup on Oracle:
  `backups/20261007T190604Z-before-automation.tar.gz`.
- Each successful import stores the immediately preceding channel rows in
  `companion_sync_backup`, including account links and original timestamps.
  `companion_sync_state.collected_at` identifies the import being undone;
  `previous_collected_at` identifies its previous watermark.

To restore a channel, restore its rows from `companion_sync_backup` and remove rows
introduced by that import, within a D1 batch transaction. Keep the import watermark
at the rejected collection time so delayed delivery cannot immediately reapply it.
Do not restore the entire table over other channels' newer data. Exact backup/restore
round-tripping is covered by SQLite tests. Leave the additive metadata tables in
place during a code rollback. A tested statement builder is in
`functions/utils/companion-sync-rollback.js`; it requires the expected collection time
and refuses to overwrite later edits.

## Validation record

- Website test suite: 53 passed, including rollback and legacy-backup migration;
  collection/scheduler tests: 36 passed locally and on ARM.
- Local Cloudflare runtime: authenticated import, repeat-delivery idempotency,
  and a 10,000-player import succeeded without touching production test data.
- Oracle to production: Mayaicefire's 6 October snapshot validated, imported 780
  players (366 changed), and repeated delivery returned `already-imported`.
- All 780 pre-import Maya rows were verified in backup storage.
- A production SQL comparison checked all 780 collected players: zero mismatches
  in names, aliases, skins, season levels or vault counts.
- At 19:16 UTC on 7 October, the public leaderboard API showed Maya's collection
  timestamp (`2026-10-06T10:16:29.797Z`), confirming scheduled publication. It had
  781 rows because imports preserve previously stored players absent from the new
  780-player collection.
- Bot retained PID 817737, zero restarts, and matching source/config hashes.

# WebSocket auto-joining

The chat bot now opens authenticated Vault Hunters extension sockets for live channels. It uses
`showPresenceCheck` as the join-window signal, sends only `requestTriggerPresence`, and confirms
`activeThisVault` before recording success. Chat thresholds remain the fallback. If opening the
extension displaces a socket, it reconnects after ten minutes. Vault-end or companion XP changes
request a leaderboard refresh, subject to the one-hour interval, six-per-streamer and fourteen-total
daily browser limits.
