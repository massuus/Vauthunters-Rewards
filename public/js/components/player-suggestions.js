import { getRecentUsers } from '../utils/storage-manager.js';

export function rankPlayerSuggestions(query, players) {
  const needle = query.trim().toLowerCase();
  const unique = new Map();
  const terms = (player) =>
    [player.name, player.minecraftName, player.twitchName, player.alias]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());
  for (const player of players) {
    const name = String(player?.name || '').trim();
    const searchValue = String(player?.searchValue || name);
    const key = searchValue.toLowerCase();
    if (
      /^(?:[a-z0-9_]{3,16}|twitch:[a-z0-9_]{1,25})$/i.test(searchValue) &&
      terms(player).some((value) => value.includes(needle)) &&
      !unique.has(key)
    ) {
      unique.set(key, { ...player, name });
    }
  }
  const score = (player) =>
    Math.min(
      ...terms(player).map((value) => (value === needle ? 0 : value.startsWith(needle) ? 1 : 2))
    );
  return [...unique.values()]
    .sort((a, b) => score(a) - score(b) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
    .slice(0, 6);
}

export function initPlayerSuggestions() {
  const input = document.getElementById('username');
  const form = document.getElementById('search-form');
  const list = document.getElementById('player-suggestions');
  const status = document.getElementById('player-suggestions-status');
  if (!input || !form || !list || !status) return;

  let timer;
  let controller;
  let revision = 0;
  let players = [];
  let active = -1;
  const cache = new Map();

  function close() {
    clearTimeout(timer);
    controller?.abort();
    revision += 1;
    players = [];
    active = -1;
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    status.textContent = '';
  }

  function choose(index) {
    const player = players[index];
    if (!player) return;
    input.value = player.searchValue || player.name;
    close();
    form.requestSubmit();
  }

  function render(query, matches, unavailable = false) {
    players = rankPlayerSuggestions(query, [...matches, ...getRecentUsers()]);
    active = -1;
    input.removeAttribute('aria-activedescendant');
    list.replaceChildren();
    players.forEach((player, index) => {
      const option = document.createElement('div');
      option.id = `player-suggestion-${index}`;
      option.className = 'search__suggestion';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      const head = document.createElement('img');
      head.className = 'search__suggestion-head';
      head.src = `/proxy-img?url=${encodeURIComponent(`https://mc-heads.net/avatar/${encodeURIComponent(player.avatar || player.name)}/32`)}`;
      head.alt = '';
      head.width = 28;
      head.height = 28;
      head.decoding = 'async';
      head.addEventListener(
        'error',
        () => {
          head.src = '/img/unknown_item.png';
        },
        { once: true }
      );
      const name = document.createElement('span');
      name.textContent = player.name;
      option.append(head);
      option.append(name);
      option.addEventListener('pointerdown', (event) => event.preventDefault());
      option.addEventListener('click', () => choose(index));
      list.append(option);
    });
    list.hidden = !players.length;
    input.setAttribute('aria-expanded', String(players.length > 0));
    status.textContent = players.length
      ? 'Select a player above, or press Enter to search the name you typed. Arrow keys select suggestions.'
      : unavailable
        ? 'Suggestions unavailable. You can still search normally.'
        : 'No known players match. Press Enter to search this name.';
  }

  function update() {
    close();
    const query = input.value.trim();
    if (!/^[a-z0-9_ ]{2,32}$/i.test(query)) return;
    status.textContent = 'Finding known players…';
    const current = revision;
    timer = setTimeout(async () => {
      const key = query.toLowerCase();
      const cached = cache.get(key);
      if (cached && Date.now() - cached.time < 60000) {
        render(query, cached.players);
        return;
      }
      controller = new AbortController();
      const requestController = controller;
      const timeout = setTimeout(() => requestController.abort(), 4000);
      try {
        const response = await fetch(`/api/players?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Suggestions unavailable');
        const payload = await response.json();
        if (current !== revision || document.activeElement !== input) return;
        const matches = Array.isArray(payload.players) ? payload.players : [];
        if (cache.size >= 40) cache.delete(cache.keys().next().value);
        cache.set(key, { players: matches, time: Date.now() });
        render(query, matches);
      } catch {
        if (current === revision && document.activeElement === input) render(query, [], true);
      } finally {
        clearTimeout(timeout);
      }
    }, 200);
  }

  input.addEventListener('input', (event) => {
    if (!event.isComposing) update();
  });
  input.addEventListener('compositionstart', close);
  input.addEventListener('compositionend', update);
  input.addEventListener('focus', update);
  input.addEventListener('blur', close);
  form.addEventListener('submit', close);
  input.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    if (event.key === 'Escape') {
      close();
      return;
    }
    if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      choose(active);
      return;
    }
    if (!players.length || !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    active =
      event.key === 'ArrowDown'
        ? (active + 1) % players.length
        : active <= 0
          ? players.length - 1
          : active - 1;
    [...list.children].forEach((option, index) =>
      option.setAttribute('aria-selected', String(index === active))
    );
    input.setAttribute('aria-activedescendant', list.children[active].id);
    list.children[active].scrollIntoView({ block: 'nearest' });
  });
}
