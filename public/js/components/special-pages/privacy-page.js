export function isPrivacyQuery(value) {
  return ['privacy', 'cookies', 'privacy & cookies'].includes(
    String(value || '')
      .trim()
      .toLowerCase()
  );
}

export function renderPrivacyPage(
  container,
  setFavicon,
  setMetaDescription,
  closeOpenModal,
  updateQueryString,
  defaultFavicon
) {
  closeOpenModal();
  updateQueryString('privacy');
  setFavicon(defaultFavicon);
  document.title = 'Privacy & cookies · Vault Hunters Rewards';
  setMetaDescription(
    'How VH Rewards uses player data, cookies, browser storage, and external services.'
  );
  container.classList.remove('hidden');
  container.innerHTML = `<article class="privacy-page" aria-labelledby="privacy-title">
    <header><h2 id="privacy-title">Privacy & cookies</h2><p class="privacy-page__updated">Last updated: 15 October 2026</p><p>VH Rewards is an unofficial community project maintained by massuus. For questions about your data, contact <a href="mailto:info@massuus.com">info@massuus.com</a>.</p></header>
    <section><h3>What information the site uses</h3>
      <p>Player searches use Minecraft usernames and UUIDs, Twitch usernames, linked account information, reward unlocks, and supporter tiers. Companion leaderboards also contain public companion names and aliases, season levels, vaults joined, and update times. This information comes from Vault Hunters services, PlayerDB, Twitch, and the companion extension, and is saved to provide player pages, leaderboards, and streamer comparisons.</p>
      <p>A companion’s chosen skin or alias is not treated as proof that it belongs to a particular Minecraft account. Streamer overlap is matched using Twitch account names.</p>
      <p>Twitch sign-in is restricted to the configured site administrator. Administrator account records contain the Twitch account ID, username, display name, profile image, and session information. Login tokens are encrypted on the server. Visitors do not need an account to browse rewards, leaderboards, or streamer statistics.</p>
    </section>
    <section><h3>Why this information is used</h3>
      <p>The site uses administrator account information to secure administration features. Public player information is used to operate the rewards lookup and community statistics. Security and operational information is used to prevent abuse and keep the site working. These community, security, and operational purposes are based on legitimate interests; you can contact us to object to use of your personal data.</p>
      <p>The application does not use advertising cookies or sell player data.</p>
    </section>
    <section><h3>Cookies</h3><p>Cookies are small values your browser sends back to the site. The application uses the following cookies for login and security:</p>
      <div class="privacy-page__table" tabindex="0" role="region" aria-label="Cookies and lifetimes"><table><thead><tr><th scope="col">Cookie</th><th scope="col">Purpose</th><th scope="col">Lifetime</th></tr></thead><tbody>
        <tr><th scope="row"><code>vhr_session</code></th><td>Keeps the administrator signed in after Twitch login.</td><td>Up to 7 days; cleared on logout.</td></tr>
        <tr><th scope="row"><code>vhr_oauth_state</code></th><td>Checks that a Twitch login callback belongs to the login you started.</td><td>Up to 10 minutes; cleared when the login callback completes.</td></tr>
        <tr><th scope="row"><code>cf_clearance</code> and other Cloudflare security cookies</th><td>Remember security checks and help protect the site from automated abuse. Which cookies appear depends on the checks applied to your visit.</td><td>Controlled by Cloudflare and the applicable security settings.</td></tr>
      </tbody></table></div>
      <p>Login and necessary security cookies do not require an advertising-cookie acceptance step. See <a href="https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/" target="_blank" rel="noopener noreferrer">Cloudflare’s cookie documentation</a> for its cookie names and purposes.</p>
    </section>
    <section><h3>Other storage on your device</h3><p>The site also uses localStorage, sessionStorage, and a service worker’s browser cache. These are separate from cookies:</p>
      <ul>
        <li><strong>Recent searches:</strong> up to four recently viewed players, including their names, avatars, and displayed tiers, are remembered in this browser.</li>
        <li><strong>Seen rewards:</strong> reward IDs are saved per searched player so newly seen unlocks can be highlighted on later visits.</li>
        <li><strong>Preferences:</strong> your theme, effects choice, and dismissal of the community support message are remembered.</li>
        <li><strong>Temporary session information:</strong> recent application errors and whether a seasonal animation has appeared are kept in sessionStorage.</li>
        <li><strong>Cached content:</strong> leaderboard results are reused for up to five minutes and the server list for up to twelve hours. The service worker also caches site files, images, reward data, and some public API responses to improve loading and offline access.</li>
      </ul>
      <p>Recent searches, seen rewards, preferences, and support-message dismissal have no automatic expiry. They remain until replaced, cleared by you, or removed by your browser. Session storage normally lasts for the browser tab’s session. Expired cached data can remain on disk until it is replaced or removed; offline fallbacks may use an older cached response.</p>
      <p>Recent-search and seen-reward information is used locally by these features, rather than sent as a browsing-history feed. A player search itself is sent to the site to retrieve that player’s data. Browser storage is not the same as anonymous data, and clearing it does not remove records held on the server.</p>
    </section>
    <section><h3>Hosting, analytics, and external services</h3>
      <p>Cloudflare hosts and protects the website and stores its database and leaderboard snapshots. Requests involve technical information such as your IP address, request URL, browser information, and timestamps. Cloudflare Web Analytics is enabled for page-usage and performance measurement; Cloudflare states that this service does not use cookies or localStorage to track visitors.</p>
      <p>The site requests player data from Vault Hunters and PlayerDB and stream information from Twitch. Fonts load from Google Fonts. Images can load from MC Heads, Vault Hunters, and Twitch, sometimes through the site’s image proxy. When your browser contacts an external provider directly, that provider receives your IP address and normal request information. Following an external link takes you to a service with its own privacy practices.</p>
      <p>These providers operate internationally and may process information outside the European Economic Area. Their privacy notices describe their processing and applicable transfer safeguards: <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">Cloudflare</a>, <a href="https://www.twitch.tv/p/en/legal/privacy-notice/" target="_blank" rel="noopener noreferrer">Twitch</a>, and <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google</a>.</p>
    </section>
    <section><h3>How long server records are kept</h3>
      <p>Login sessions expire after seven days. Expired login-flow and session records are cleaned up during subsequent login activity; expiry does not mean immediate physical deletion of every database record. Logout deletes the corresponding site session.</p>
      <p>Current leaderboard records, Twitch account records, contributions, and moderation records do not currently have an automatic deletion deadline. Leaderboards are updated as new data is collected. Older leaderboard snapshot files become eligible for cleanup after 24 hours; the active snapshot is retained. Provider logs, caches, and backups can have separate retention arrangements.</p>
      <p>Contact us if you want your information corrected or removed. Removing information from this site does not remove it from Twitch, Vault Hunters, or another source service.</p>
    </section>
    <section><h3>Your choices and privacy rights</h3>
      <p>You can clear this site’s cookies, local storage, and cached data using your browser’s website-data settings. This resets remembered searches and preferences and can sign you out. You can also revoke the site’s Twitch authorization in your <a href="https://www.twitch.tv/settings/connections" target="_blank" rel="noopener noreferrer">Twitch connection settings</a>.</p>
      <p>To request access, correction, deletion, restriction, or to object to processing, email <a href="mailto:info@massuus.com">info@massuus.com</a>. Where applicable, you can also request data portability or withdraw consent. We may need to verify that a request relates to your account. You can complain to the <a href="https://autoriteitpersoonsgegevens.nl/" target="_blank" rel="noopener noreferrer">Autoriteit Persoonsgegevens</a> or your local data-protection authority.</p>
    </section>
  </article>`;
}
