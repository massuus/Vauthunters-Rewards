const SPECIAL_ROUTES = new Set([
  'codes',
  'all',
  'servers',
  'leaderboard',
  'mining',
  'admin',
  'live',
  'badges',
  'stats',
]);

function getActiveRoute() {
  if (/^\/admin\/?$/i.test(window.location.pathname)) return 'admin';
  const rawQuery = window.location.search.slice(1);
  if (!rawQuery) return 'home';

  const firstPart = rawQuery.split('&')[0] || '';
  const [rawKey] = firstPart.split('=');
  let key = (rawKey || '').toLowerCase();
  try {
    key = decodeURIComponent(key);
  } catch {
    // Keep the raw key when a hand-edited URL contains invalid encoding.
  }

  if (key === 'server') return 'servers';
  if (SPECIAL_ROUTES.has(key)) return key;
  return 'home';
}

export function syncActiveNavigation() {
  const activeRoute = getActiveRoute();
  const routeLinks = document.querySelectorAll('[data-nav-route]');

  routeLinks.forEach((link) => {
    if (link.dataset.navRoute === activeRoute) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

export function initNavigation() {
  const navigation = document.getElementById('primary-navigation');
  if (!navigation) return;

  initLiveIndicator(navigation);

  const toggle = navigation.querySelector('.site-nav__toggle');
  syncActiveNavigation();
  window.addEventListener('popstate', syncActiveNavigation);

  const syncToggleState = () => {
    const isOpen = navigation.classList.contains('site-nav__menu--open');
    toggle?.setAttribute('aria-expanded', String(isOpen));
    if (toggle) {
      toggle.setAttribute('aria-label', `${isOpen ? 'Close' : 'Open'} navigation menu`);
    }
  };

  toggle?.addEventListener('click', () => {
    navigation.classList.toggle('site-nav__menu--open');
    syncToggleState();
  });

  navigation.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !navigation.classList.contains('site-nav__menu--open')) return;
    navigation.classList.remove('site-nav__menu--open');
    syncToggleState();
    toggle?.focus();
  });

  document.addEventListener('click', (event) => {
    if (
      navigation.classList.contains('site-nav__menu--open') &&
      !navigation.contains(event.target)
    ) {
      navigation.classList.remove('site-nav__menu--open');
      syncToggleState();
    }
  });

  syncToggleState();
}

function initLiveIndicator(navigation) {
  const link = navigation.querySelector('[data-nav-route="live"]');
  if (!link) return;
  const dot = document.createElement('span');
  dot.className = 'site-nav__live-dot';
  dot.hidden = true;
  dot.setAttribute('aria-hidden', 'true');
  link.append(dot);
  let checking = false;
  const refresh = async () => {
    if (document.hidden || checking) return;
    checking = true;
    try {
      const results = await Promise.allSettled(
        ['/api/live-status', '/api/community-live'].map(async (url) => {
          const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
          if (!response.ok) throw new Error('Live status unavailable');
          const payload = await response.json();
          return (
            !payload.stale &&
            Array.isArray(payload.streamers) &&
            payload.streamers.some((streamer) => url === '/api/community-live' || streamer.live)
          );
        })
      );
      const live = results.some((result) => result.status === 'fulfilled' && result.value);
      dot.hidden = !live;
      link.setAttribute('aria-label', live ? 'Live — someone is streaming' : 'Live');
      link.title = live ? 'Someone is live now' : '';
    } finally {
      checking = false;
    }
  };
  void refresh();
  window.setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', refresh);
}
