# Oracle companion collector experiment

**Ongoing automation is now enabled (7 October 2026).** See [AUTOMATION.md](AUTOMATION.md)
for current scheduling, delivery, cost controls, status and recovery. The sections
below retain the historical trial setup and results.

This is an isolated, **read-only prototype**, not an enabled synchronization service.
It loads one Twitch channel, discovers the VH extension's current WebSocket URL in
memory, and requests companion search pages using the site's existing protocol.
It does not send chat, join vaults, click game actions, send Discord notifications,
or upload to the production leaderboard. A bounded multi-streamer trial was enabled
on 5 October 2026; it is not an ongoing synchronization service.

## Current 48-hour trial

Service: `vh-companion-trial.service`. Checks every 15 minutes for up to 48 hours,
with one attempt per configured streamer (seven total), one browser at a time.
An individual collection failure does not stop the other streamers. Three consecutive
live-status API failures stop the trial. There is no restart policy or boot enablement.
The same 1 GB RAM, 50% CPU, request, traffic, and per-attempt time limits apply.

`results/latest-trial.json` points to the trial directory. That directory contains
`watch-start.json` with the exact expiry, `watch-status.json`, `history.jsonl`, and
individual `<streamer>-status.json` reports. Successful collections also save
`<streamer>.json`; they do not update the public leaderboard.

Diagnostics record whether this account has a companion and the shape of pagination
responses, without storing socket credentials or raw responses. A missing companion
does not prevent the collector from trying the read-only leaderboard search; whether
it explains the previous failure remains unconfirmed. All 31 tests passed locally
and on Oracle before starting this trial.

The earlier one-shot stopped after Linahun returned `invalid-pagination` at
2026-10-04 23:07:36 UTC (5 October, 01:07 Amsterdam), so it could not test Hellfire
later. Its reports are preserved. Previous collector code is backed up at
`backups/20261005T181415Z-before-multistream.tar.gz`. To revert code, first stop the
trial, then extract that archive inside the experiment directory; login and results
are not part of that archive and remain in place.

Stop this trial with `sudo systemctl stop vh-companion-trial.service`.

## Verified on 4 October 2026

Tested on the existing Oracle VM (Ubuntu 24.04 ARM64, one CPU, approximately 6 GB RAM)
against `hoy_82`, who was live. Chromium loaded Twitch and the actual Vault Hunters
SMP extension even with stream video requests blocked.

The extension displayed `ACCESS REQUIRED`. Its published frontend also explicitly
requires a linked Twitch identity before opening the companion socket. Therefore
anonymous collection does not work. A normal Twitch login and extension username
permission are required; the bot's chat OAuth token does not provide an already
authenticated browser session. No tokens were fabricated or permission checks bypassed.

The final bounded anonymous test returned:

```json
{
  "streamer": "hoy_82",
  "status": "failed",
  "code": "login-or-extension-access-required",
  "uploaded": false,
  "requests": 391,
  "blocked": 41,
  "browserBytes": 5983317,
  "elapsedMs": 25192
}
```

It took 26.28 seconds including startup, used 4.29 CPU seconds, and reported 165,596
KB maximum RSS for an individual process (not aggregate browser memory). Browser
response traffic was approximately 6 MB. The separate cgroup imposed the aggregate
1 GB memory limit. The bot remained online with the same PID (817737), zero restarts,
and identical source, configuration, and package-file hashes before and after.

At 20:43 UTC, the user's saved login was securely transferred and a collection was
attempted. No companion socket appeared. A separate official Helix live-status
check confirmed all seven configured streamers were offline. A bounded browser
diagnostic then verified the session on Oracle: Twitch returned a non-null signed-in
`currentUser.id` in its normal page responses, the login button was absent, and no
extension frames were loaded. Only booleans and counts were logged, never the account
ID or credentials. This confirms browser login, **not companion collection**.

The updated offline preflight completed in 736 ms and launched no browser. It reads
only the existing bot's app credentials for public live-status checks, without
changing the bot's environment or refreshing its user OAuth token. Failures stop the
run instead of falling through to an unnecessary browser launch.

The missing test is **authenticated companion collection and fresh authorization
across browser restarts/token expiry**. Do not enable ongoing collection or production
writes until that passes. Pagination has only been exercised with mock sockets.

### Previous bounded one-shot trial (finished)

Service: `vh-companion-one-shot.service`. Started: **2026-10-04 20:51:52 UTC**.
Expiry: no later than **2026-10-05 20:51:52 UTC** (22:51:52 Europe/Amsterdam).

- Checks the seven configured streamers every 15 minutes, at most 96 checks.
- Reuses a separate app access token in memory. Does not use the bot's user token.
- On the first live result, tries **one** read-only collection, then exits regardless
  of success. Hoy has priority when multiple streamers are live at a check.
- Also stops after three consecutive live-check failures, or at its time/check limit.
- No restart policy, boot enablement, cron entry, PM2 change, or production upload.
- Systemd limits the entire process group to 1 GB RAM, 50% of one CPU, and 128 tasks.
  The service runs as `ubuntu`, can write only the experiment directory and its
  private temporary files, and has read-only access to the chat bot directory.
- Initial waiting memory was about 30 MB; no browser was running. Unit and shell
  hard deadlines also stop the browser if its internal timeout fails.
- `results/watch-start.json` prevents accidentally restarting the 24-hour budget.
  Inspect the outcome before explicitly authorizing another trial.

Read the result without exposing credentials:

```bash
cat /home/ubuntu/companion-collector-test/results/watch-status.json
systemctl status vh-companion-one-shot.service --no-pager
```

Status `collected` means a complete **local** snapshot under `results/<streamer>.json`;
it never means the public leaderboard was updated. While waiting the status is
`waiting` / `all-offline`. The bot was still online with PID 817737 and zero restarts
after the service started. All 26 standalone tests passed both locally and on ARM.

## Limits and cost controls

- Uses the existing VM; no VM resize, extra volume, paid browser service, or cloud
  resource was created. Actual Oracle billing has not been inspected.
- `run-on-oracle.sh` limits the entire run to 1 GB RAM, 50% of one CPU, and 128 tasks.
- Each browser attempt has an internal two-minute deadline and an external timeout
  of 150 seconds plus a five-second kill grace period. One channel, one browser,
  no browser retry loop. The one-shot watcher only polls live status before that attempt.
- Video, images, fonts, and other Twitch extensions are blocked during collection.
- Stops after 800 browser requests or 30 MiB of reported response data. This is a
  stop threshold, not a strict network quota; concurrent requests can overshoot it.
- Companion reads are capped at 250 pages of 20, 8 MiB of socket frames, and 90
  seconds; each page has a 15-second response deadline. Partial runs are discarded.
- `--output` writes a completed, filtered result atomically. It never saves socket
  URLs, extension tokens, full browser logs, or raw upstream errors.

The remote test directory occupies about 294 MB, principally the browser. Initial
browser downloads were about 117 MiB, plus small npm and Ubuntu library downloads.
The missing system libraries and a font were downloaded and extracted into that
directory, without installing/upgrading OS packages or using sudo.

## Files and installation

Source: `scripts/companion-collector/` in the rewards repository.
Remote experiment: `/home/ubuntu/companion-collector-test/`.
Existing bot: `/home/ubuntu/vault-pinger/` (untouched).

The remote `run-report.json` holds the redacted anonymous probe report;
`authenticated-run-report.json` records the later offline attempt. Saved browser
state is now present at `.auth/state.json` on Oracle (file mode 600, directory 700).
The browser and libraries are already present. The wrappers include paths for this
specific VM's Node 24 installation. The collector package is separate from the bot.

Locally, Node 22+ is required. This package is separate from the website's Node 20
deployment and does not change its dependencies or runtime.

```powershell
cd 'E:\source\Vauthunters Rewards\scripts\companion-collector'
npm ci --ignore-scripts --no-audit --no-fund
npm test
```

## One-time interactive login (revised after unsupported-browser error)

The original helper asked for login inside an automated Edge session. The user
reported Twitch's unsupported-browser error, while their normal browser remained
signed in. That does not prove the exact cause, but the automated login path is
not usable as tested. The revised helper separates manual sign-in from session
export. The user completed this revised flow and Oracle accepted the saved login.
These instructions are retained for a future session renewal; no new login is needed now.

Run this on your PC when available:

```powershell
npm run login
```

On Windows it opens the installed Microsoft Edge normally, without Playwright
attached during sign-in. The dedicated profile is `.auth/manual-edge/`; your
regular browser profile and its existing login are never read or modified.

1. Close the old automated helper window and stop its command with Ctrl+C if it
   is still running. Start `npm run login` again.
2. Sign in to Twitch in the newly opened collector Edge window. This step has no
   request blocking, so normal video playback is possible on your PC.
3. Close that collector window when signed in. Leave your usual browser alone.
4. Return to PowerShell and press Enter. The helper reopens only the dedicated
   profile in the background and exports Twitch-only state to `.auth/state.json`.

The presence of an unexpired login cookie is checked before export; this is **not**
a validation of the live companion connection. Login no longer depends on Hoy
being live. If the collector later requests extension permission, open its manual
profile again and grant **Vault Hunters SMP** access to your Twitch username on
an active channel. If Twitch also rejects the ordinary manual login, stop and
report that error instead of repeatedly retrying.

Both the profile and exported state are credentials: do not paste them into chat,
commit them, or publish them. `.auth/` is gitignored. An existing state file is
never overwritten. The revised helper currently supports Windows with Edge only.

Transfer the state over SSH to a private `.auth/` directory in the remote experiment
(directory mode 700, file mode 600). The SSH identity already available locally is
`C:\Users\samva\.ssh\oracle-vault-pinger.key`; remote user/host is
`ubuntu@158.101.218.82`. Avoid sending the browser credential through logs or tools'
text output. The next bounded test on Oracle is:

```bash
cd /home/ubuntu/companion-collector-test
bash run-on-oracle.sh --streamer hoy_82 --storage-state .auth/state.json --output results/hoy_82.json
```

Exit code 0 means either a complete local collection (`status: collected`) or a
confirmed offline skip (`status: skipped`). Exit code 2 means login/extension
permission is needed; 1 means another failure. No exit code implies a production upload.
The saved session may eventually require another interactive login.

## Before enabling ongoing sync

1. Verify a real full collection against the existing manual import, then repeat
   from a fresh browser after extension token expiry. Confirm the bot remains healthy.
2. Add a dedicated authenticated companion ingestion endpoint and identity-resolution
   flow. The current browser-admin endpoint requires a user session and CSRF token;
   the existing armory refresh endpoint does not ingest companion results.
3. Back up affected production rows before any write trial, and verify rollback.
4. Introduce conservative live-only scheduling, no overlapping runs, bounded retries,
   daily run/traffic ceilings, and failure backoff. Measure a short trial before
   expanding to more streamers. Keep it separate from the chat bot's PM2 process.

## Revert or disable

Stop the transient watcher and all its test browser children immediately with:

```bash
sudo systemctl stop vh-companion-trial.service
```

It has no boot enablement, timer, PM2 entry, or OS package changes. If a separate
manual test is currently running, this command stops only that isolated scope:

```bash
systemctl --user stop vh-companion-test.scope
```

For a reversible removal, verify the path and rename the test directory:

```bash
if [ "$(realpath /home/ubuntu/companion-collector-test)" = /home/ubuntu/companion-collector-test ] &&
   [ ! -e /home/ubuntu/companion-collector-test.disabled ]; then
  mv -T -- /home/ubuntu/companion-collector-test /home/ubuntu/companion-collector-test.disabled
else
  echo 'Path check failed or disabled directory already exists; nothing moved.'
fi
```

Use that rename only if the `.disabled` destination does not already exist; renaming
it back restores the test. Never remove or restart `vault-pinger` for this work.

References: [Playwright WebSocket events](https://playwright.dev/docs/network#websockets),
[Twitch extension authorization](https://dev.twitch.tv/docs/extensions/reference/#onauthorized).
