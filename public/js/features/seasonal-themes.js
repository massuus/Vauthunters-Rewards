const THEME_KEY = 'vh-seasonal-theme';
const EFFECTS_KEY = 'vh-seasonal-effects';
const SPIDER_KEY = 'vh-halloween-spider-seen';
const THEMES = new Set(['auto', 'standard', 'halloween', 'winter', 'pride']);

export function automaticTheme(date = new Date()) {
  const month = date.getMonth() + 1;
  if (month === 10) return 'halloween';
  if (month === 12) return 'winter';
  if (month === 6) return 'pride';
  return 'standard';
}

function stored(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* The selection still works without storage. */
  }
}

function sessionSeen() {
  try {
    return sessionStorage.getItem(SPIDER_KEY) === 'yes';
  } catch {
    return false;
  }
}

function markSessionSeen() {
  try {
    sessionStorage.setItem(SPIDER_KEY, 'yes');
  } catch {
    /* The animation can still run. */
  }
}

function effectsEnabled() {
  return stored(EFFECTS_KEY, 'on') !== 'off';
}

function selectedTheme() {
  const value = stored(THEME_KEY, 'auto');
  return THEMES.has(value) ? value : 'auto';
}

function decorations(theme) {
  if (!effectsEnabled() || theme === 'standard' || theme === 'halloween') return '';
  const content = {
    winter: ['❄', '❅', '❆', '❄', '❅', '❆', '❄'],
    pride: ['✦', '✧', '✦', '✧', '✦', '✧'],
  }[theme];
  return (content || [])
    .map((item, index) => `<span style="--season-index:${index}" aria-hidden="true">${item}</span>`)
    .join('');
}

function updateSpiderPreview(theme) {
  const preview = document.querySelector('[data-spider-preview]');
  if (preview) preview.hidden = theme !== 'halloween' || !effectsEnabled();
}

export function applySeasonalTheme(value = selectedTheme(), date = new Date()) {
  const selection = THEMES.has(value) ? value : 'auto';
  const theme = selection === 'auto' ? automaticTheme(date) : selection;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.seasonalEffects = effectsEnabled() ? 'on' : 'off';
  const layer = document.querySelector('[data-seasonal-decor]');
  if (layer) layer.innerHTML = decorations(theme);
  updateSpiderPreview(theme);
  return theme;
}

export function initSeasonalThemes() {
  const select = document.querySelector('[data-theme-select]');
  const toggle = document.querySelector('[data-theme-effects]');
  const spiderPreview = document.querySelector('[data-spider-preview]');
  if (select) {
    select.value = selectedTheme();
    select.addEventListener('change', () => {
      save(THEME_KEY, select.value);
      applySeasonalTheme(select.value);
    });
  }
  const updateToggle = () => {
    if (!toggle) return;
    const enabled = effectsEnabled();
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.textContent = enabled ? 'Effects on' : 'Effects off';
  };
  toggle?.addEventListener('click', () => {
    save(EFFECTS_KEY, effectsEnabled() ? 'off' : 'on');
    updateToggle();
    applySeasonalTheme(select?.value || selectedTheme());
  });
  spiderPreview?.addEventListener('click', () => maybeShowSpiderSurprise({ force: true }));
  updateToggle();
  applySeasonalTheme(select?.value || selectedTheme());
}

export function maybeShowSpiderSurprise({ force = false, random = Math.random } = {}) {
  if (
    document.documentElement.dataset.theme !== 'halloween' ||
    !effectsEnabled() ||
    matchMedia('(prefers-reduced-motion: reduce)').matches ||
    (!force && (sessionSeen() || random() >= 0.1))
  )
    return false;
  if (!force) markSessionSeen();
  document.querySelector('.seasonal-spider-scare')?.remove();
  const scare = document.createElement('div');
  scare.className = 'seasonal-spider-scare';
  scare.setAttribute('aria-hidden', 'true');
  scare.innerHTML =
    '<span class="seasonal-spider-scare__thread"></span><span class="seasonal-spider-scare__spider">🕷️</span>';
  document.body.append(scare);
  scare.addEventListener('animationend', (event) => {
    if (event.target === scare) scare.remove();
  });
  setTimeout(() => scare.remove(), 4000);
  return true;
}
