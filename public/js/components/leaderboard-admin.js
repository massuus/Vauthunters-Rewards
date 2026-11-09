import {
  apiRequest,
  describeIdentityUpdate,
  normalizeStreamer,
  resolvePlayerIdentities,
  retrieveCompanions,
  uploadPlayers,
} from '../features/companion-admin.js';
import { mountCollectorHealth } from './companion-health.js';

function setAdminFeedback(root, message, type = 'success') {
  const element = root.querySelector('[data-companion-admin-feedback]');
  if (!element) return;
  element.hidden = false;
  element.textContent = message;
  element.classList.toggle('leaderboard-admin__feedback--error', type === 'error');
}

export function mountLeaderboardAdmin({
  root,
  auth,
  escapeHtml,
  isActive,
  updateStreamerMenus,
  onSaved,
}) {
  const slot = root.querySelector('[data-leaderboard-admin-slot]');
  if (!slot) return;
  if (!auth?.authenticated) {
    root.innerHTML = `
      <section class="leaderboard-admin leaderboard-admin--login">
        <h3>Administrator sign in</h3>
        <p>Sign in with the configured administrator Twitch account to view automation health and manage companion data.</p>
        <a class="leaderboard-admin__login" href="/login?returnTo=/admin">Sign in with Twitch</a>
      </section>`;
    return;
  }
  if (!auth.user?.isAdmin) {
    root.innerHTML = `
      <section class="leaderboard-admin leaderboard-admin--login">
        <h3>Administrator access required</h3>
        <p>You are signed in, but this Twitch account is not configured as a site administrator.</p>
      </section>`;
    return;
  }

  slot.innerHTML = `
    <section class="leaderboard-admin companion-health" data-collector-health></section>
    <details class="leaderboard-admin">
      <summary>Update companion leaderboards</summary>
      <div class="leaderboard-admin__body">
        <p class="leaderboard-admin__privacy"><strong>Private by design:</strong> the WSS URL is opened by this browser only. Its tokens are never uploaded or saved.</p>
        <form class="leaderboard-admin__form" data-companion-wss-form>
          <label class="leaderboard-admin__field leaderboard-admin__field--wide">
            <span>Socket.IO WSS URL</span>
            <textarea name="wssUrl" rows="3" placeholder="wss://ebs.vaulthunters.gg/socket.io/?streamer=iskall85&amp;…" required></textarea>
          </label>
          <button class="leaderboard-admin__button" type="submit">Retrieve and update</button>
        </form>
        <div class="leaderboard-admin__divider"><span>or add one player</span></div>
        <form class="leaderboard-admin__form leaderboard-admin__form--manual" data-companion-manual-form>
          <label class="leaderboard-admin__field"><span>Streamer</span><select name="streamer" data-companion-streamer-select required></select></label>
          <label class="leaderboard-admin__field"><span>Twitch username <small>(optional)</small></span><input name="twitchName" pattern="[A-Za-z0-9_]{1,25}" placeholder="massuus"></label>
          <label class="leaderboard-admin__field"><span>Selected skin username</span><input name="playerName" pattern="[A-Za-z0-9_]{1,16}" required placeholder="Skin username"></label>
          <label class="leaderboard-admin__field"><span>Display alias <small>(optional)</small></span><input name="alias" maxlength="64"></label>
          <label class="leaderboard-admin__field"><span>Season level</span><input name="seasonLevel" type="number" min="0" max="1000000" value="0" required></label>
          <label class="leaderboard-admin__field"><span>Vaults joined</span><input name="vaultsJoined" type="number" min="0" max="1000000" value="0" required></label>
          <button class="leaderboard-admin__button" type="submit">Add or update player</button>
        </form>
        <p class="leaderboard-admin__feedback" data-companion-admin-feedback hidden></p>
      </div>
    </details>`;
  updateStreamerMenus();
  const disposeHealth = mountCollectorHealth(slot.querySelector('[data-collector-health]'), {
    apiRequest,
    escapeHtml,
    isActive,
  });
  const handleSubmit = async (event) => {
    if (!isActive()) return;
    const submittedForm = event.target;
    if (!submittedForm.matches('[data-companion-wss-form], [data-companion-manual-form]')) return;
    event.preventDefault();
    const submit = submittedForm.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;

    try {
      if (submittedForm.matches('[data-companion-wss-form]')) {
        const wssUrl = new FormData(submittedForm).get('wssUrl');
        const result = await retrieveCompanions(wssUrl, (message) =>
          setAdminFeedback(root, message)
        );
        setAdminFeedback(root, `Retrieved ${result.players.length} players. Starting upload…`);
        const stats = await uploadPlayers(
          auth.user.csrfToken,
          result.streamer,
          result.players,
          (message) => setAdminFeedback(root, message)
        );
        let identityStats;
        try {
          identityStats = await resolvePlayerIdentities(
            auth.user.csrfToken,
            result.players,
            (message) => setAdminFeedback(root, message)
          );
        } catch (error) {
          await onSaved(result.streamer);
          throw new Error(
            `The player stats were saved, but Minecraft name resolution stopped. ${
              error instanceof Error ? error.message : 'Please run the update again.'
            }`
          );
        }
        await onSaved(result.streamer);
        setAdminFeedback(
          root,
          `Updated ${stats.updated} players for ${result.streamer}.${
            stats.skipped ? ` Skipped ${stats.skipped} invalid rows.` : ''
          } ${describeIdentityUpdate(identityStats)}`
        );
        return;
      }

      const data = new FormData(submittedForm);
      const streamer = normalizeStreamer(data.get('streamer'), '');
      const player = {
        twitchName: data.get('twitchName'),
        playerName: data.get('playerName'),
        alias: data.get('alias'),
        seasonLevel: Number(data.get('seasonLevel')),
        vaultsJoined: Number(data.get('vaultsJoined')),
      };
      await apiRequest('/api/admin/companion-leaderboard', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': auth.user.csrfToken,
        },
        body: JSON.stringify({ streamer, players: [player], source: 'manual-admin' }),
      });
      const twitchName = String(player.twitchName || '').trim();
      let identityStats = null;
      if (twitchName) {
        try {
          identityStats = await resolvePlayerIdentities(
            auth.user.csrfToken,
            [{ twitchName }],
            (message) => setAdminFeedback(root, message)
          );
        } catch (error) {
          await onSaved(streamer);
          throw new Error(
            `${player.playerName} was saved, but the Minecraft name could not be resolved. ${
              error instanceof Error ? error.message : 'Please try again.'
            }`
          );
        }
      }
      await onSaved(streamer);
      setAdminFeedback(
        root,
        `${player.playerName} was added or updated.${
          identityStats ? ` ${describeIdentityUpdate(identityStats)}` : ''
        }`
      );
    } catch (error) {
      setAdminFeedback(
        root,
        error instanceof Error ? error.message : 'The update failed.',
        'error'
      );
    } finally {
      if (submit) submit.disabled = false;
    }
  };

  root.addEventListener('submit', handleSubmit);
  return () => {
    root.removeEventListener('submit', handleSubmit);
    disposeHealth();
  };
}
