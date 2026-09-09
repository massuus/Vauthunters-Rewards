const SPECIAL_ROUTES = new Set(['codes', 'all', 'servers', 'leaderboard', 'mining']);

function getActiveRoute() {
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

export function initNavigation() {
  const navigation = document.getElementById('primary-navigation');
  if (!navigation) return;

  const toggle = navigation.querySelector('.site-nav__toggle');
  const activeRoute = getActiveRoute();
  const routeLinks = document.querySelectorAll('[data-nav-route]');

  routeLinks.forEach((link) => {
    if (link.dataset.navRoute === activeRoute) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });

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
