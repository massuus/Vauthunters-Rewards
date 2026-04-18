import {
  fetchOfficialServers,
  getVisibleServers,
  getServerById,
} from '../../features/official-servers.js';

const SERVERS_QUERY_KEYWORDS = ['servers', 'official servers', 'server list'];

export function isServersQuery(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return SERVERS_QUERY_KEYWORDS.includes(normalized);
}

export function getServerQueryTarget(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const match = raw.match(/^server\s*:\s*(.+)$/i);
  if (!match) return '';

  return String(match[1] || '').trim();
}

function renderServerTypeBadges(server, escapeHtml) {
  const tags = [];

  if (server?.isArcade) {
    tags.push('Arcade');
  } else if (server?.isSky) {
    tags.push('Sky');
  } else if (server?.isCasual) {
    tags.push('Casual');
  } else {
    tags.push('Normal');
  }

  return tags.map((tag) => `<span class="server-card__tag">${escapeHtml(tag)}</span>`).join('');
}

function renderServerCard(server, escapeHtml) {
  const serverNameRaw = String(server?.name || '').trim();
  const safeName = escapeHtml(server?.name || 'Unknown Server');
  const safeRegion = escapeHtml(server?.region || 'Unknown Region');
  const serverNumber = Number(server?.number || 0);
  const regionLabel = serverNumber > 0 ? `${safeRegion}: ${serverNumber}` : safeRegion;
  const safePlayers = Array.isArray(server?.players) ? server.players.length : 0;
  const maxPlayers = Number(server?.maxPlayers || 0);
  const occupancy = maxPlayers > 0 ? `${safePlayers}/${maxPlayers}` : `${safePlayers}`;

  return `
    <button class="server-card" type="button" data-server-query="${escapeHtml(serverNameRaw)}">
      <div class="server-card__head">
        <h3>${safeName}</h3>
        <span class="server-card__occupancy">${occupancy}</span>
      </div>
      <div class="server-card__region-row">
        <p class="server-card__region">${regionLabel}</p>
        <div class="server-card__tags">${renderServerTypeBadges(server, escapeHtml)}</div>
      </div>
    </button>
  `;
}

function groupServersByRegion(servers) {
  const groups = new Map();

  servers.forEach((server) => {
    const region = String(server?.region || 'Unknown Region').trim() || 'Unknown Region';
    if (!groups.has(region)) {
      groups.set(region, []);
    }
    groups.get(region).push(server);
  });

  return Array.from(groups.entries());
}

function renderServerPlayerButton(player, proxiedImageUrl, escapeHtml) {
  const ign = String(player?.ign || '').trim();
  if (!ign) return '';

  const safeIgn = escapeHtml(ign);
  const avatarUrl = proxiedImageUrl(`https://mc-heads.net/avatar/${encodeURIComponent(ign)}/64`);

  return `
    <button class="recent-item server-player" type="button" data-player-name="${safeIgn}">
      <img src="${avatarUrl}" alt="${safeIgn}'s head" width="28" height="28">
      <span>${safeIgn}</span>
    </button>
  `;
}

function bindOfficialServersHandlers(resultContainer, usernameInput, form) {
  resultContainer.querySelectorAll('[data-server-query]').forEach((button) => {
    button.addEventListener('click', () => {
      const serverQuery = button.getAttribute('data-server-query') || '';
      if (!serverQuery) return;
      usernameInput.value = serverQuery;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  });

  resultContainer.querySelectorAll('[data-player-name]').forEach((button) => {
    button.addEventListener('click', () => {
      const name = button.getAttribute('data-player-name') || '';
      if (!name) return;
      usernameInput.value = name;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  });

  const backButton = resultContainer.querySelector('[data-open-servers]');
  if (backButton) {
    backButton.addEventListener('click', () => {
      usernameInput.value = SERVERS_QUERY_KEYWORDS[0];
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  }
}

export async function renderOfficialServersPage(
  resultContainer,
  setFavicon,
  setMetaDescription,
  closeSetDetailModal,
  updateQueryString,
  escapeHtml,
  DEFAULT_FAVICON,
  usernameInput,
  form
) {
  resultContainer.classList.remove('hidden');
  resultContainer.innerHTML = `
    <section class="official-servers-page">
      <div class="official-servers-page__loading">Loading official servers...</div>
    </section>
  `;

  setFavicon(DEFAULT_FAVICON);
  document.title = 'Official Vault Hunters Servers';
  setMetaDescription('Browse all official Vault Hunters servers and view who is currently listed.');
  closeSetDetailModal();

  try {
    const servers = getVisibleServers(await fetchOfficialServers());
    const serversWithPlayers = servers.filter(
      (server) => Array.isArray(server?.players) && server.players.length > 0
    );
    const groupedServers = groupServersByRegion(serversWithPlayers);

    const groupedCards = groupedServers.length
      ? groupedServers
          .map(([region, items]) => {
            const safeRegion = escapeHtml(region);
            const cards = items.map((server) => renderServerCard(server, escapeHtml)).join('');
            return `
              <section class="server-region-group" aria-label="${safeRegion} servers">
                <h3 class="server-region-group__title">${safeRegion}</h3>
                <div class="server-grid">${cards}</div>
              </section>
            `;
          })
          .join('')
      : '';

    resultContainer.innerHTML = `
      <section class="official-servers-page" aria-live="polite">
        <header class="official-servers-page__intro">
          <h2 class="official-servers-page__title">Official Servers</h2>
          <p class="official-servers-page__lead">Browse official Vault Hunters servers!</p>
          <p class="official-servers-page__subtext">${serversWithPlayers.length} active server${serversWithPlayers.length !== 1 ? 's' : ''} across ${groupedServers.length} region${groupedServers.length !== 1 ? 's' : ''}</p>
        </header>
        ${
          groupedCards
            ? `<div class="official-servers-page__groups">${groupedCards}</div>`
            : '<p class="official-servers-page__empty">No official servers with listed players are available right now.</p>'
        }
      </section>
    `;

    bindOfficialServersHandlers(resultContainer, usernameInput, form);
    updateQueryString(SERVERS_QUERY_KEYWORDS[0]);
  } catch (error) {
    resultContainer.innerHTML = `
      <section class="official-servers-page">
        <p class="official-servers-page__error">We couldn't load official servers right now. Please refresh and try again.</p>
      </section>
    `;
    updateQueryString('');
    throw error;
  }
}

export async function renderOfficialServerDetailPage(
  serverTarget,
  resultContainer,
  setFavicon,
  setMetaDescription,
  closeSetDetailModal,
  updateQueryString,
  proxiedImageUrl,
  escapeHtml,
  DEFAULT_FAVICON,
  usernameInput,
  form
) {
  resultContainer.classList.remove('hidden');
  resultContainer.innerHTML = `
    <section class="official-servers-page">
      <div class="official-servers-page__loading">Loading server players...</div>
    </section>
  `;

  setFavicon(DEFAULT_FAVICON);
  closeSetDetailModal();

  try {
    const servers = getVisibleServers(await fetchOfficialServers());
    const server = getServerById(serverTarget, servers);

    if (!server) {
      resultContainer.innerHTML = `
        <section class="official-servers-page">
          <header class="official-servers-page__intro">
            <h2 class="official-servers-page__title">Server Not Found</h2>
            <p class="official-servers-page__lead">That server is not currently available in the official list.</p>
          </header>
          <div class="official-servers-page__actions">
            <button class="recent-item" type="button" data-open-servers>Back to servers</button>
          </div>
        </section>
      `;
      bindOfficialServersHandlers(resultContainer, usernameInput, form);
      updateQueryString(SERVERS_QUERY_KEYWORDS[0]);
      return;
    }

    const players = Array.isArray(server.players)
      ? [...server.players].sort((left, right) => {
          const leftIgn = String(left?.ign || '').trim();
          const rightIgn = String(right?.ign || '').trim();
          return leftIgn.localeCompare(rightIgn, undefined, { sensitivity: 'base' });
        })
      : [];
    const playerButtons = players
      .map((player) => renderServerPlayerButton(player, proxiedImageUrl, escapeHtml))
      .join('');
    const serverName = escapeHtml(server.name);
    const serverRegion = escapeHtml(server.region || 'Unknown Region');
    const maxPlayers = Number(server.maxPlayers || 0);

    document.title = `${serverName} - Official Server`;
    setMetaDescription(`Players listed on ${serverName}, an official Vault Hunters server.`);

    resultContainer.innerHTML = `
      <section class="official-servers-page" aria-live="polite">
        <header class="official-servers-page__intro official-servers-page__intro--detail">
          <div class="official-servers-page__header-row">
            <h2 class="official-servers-page__title">${serverName}</h2>
            <button class="official-servers-page__back" type="button" data-open-servers>All servers</button>
          </div>
          <p class="official-servers-page__lead">${serverRegion}</p>
          <p class="official-servers-page__subtext">${players.length}/${maxPlayers || '?'} players listed</p>
        </header>
        ${
          playerButtons
            ? `<div class="recent-grid official-servers-page__players">${playerButtons}</div>`
            : '<p class="official-servers-page__empty">No players are currently listed for this server.</p>'
        }
      </section>
    `;

    bindOfficialServersHandlers(resultContainer, usernameInput, form);
    const serverQueryName = String(server.name || server._id || '').trim();
    updateQueryString(`server=${encodeURIComponent(serverQueryName)}`);
  } catch (error) {
    resultContainer.innerHTML = `
      <section class="official-servers-page">
        <p class="official-servers-page__error">We couldn't load that server right now. Please refresh and try again.</p>
      </section>
    `;
    updateQueryString('');
    throw error;
  }
}
