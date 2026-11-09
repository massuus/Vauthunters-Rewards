import { renderPatreonTierGroups, renderPatreonRosterPage } from '../patreon-roster.js';

const TIERS = [
  ['Vault Legend', '/img/badge/legend.webp'],
  ['Vault Champion', '/img/badge/champion.webp'],
  ['Vault Goblin', '/img/badge/goblin.webp'],
  ['Vault Cheeser', '/img/badge/cheeser.webp'],
  ['Vault Dweller', '/img/badge/dweller.webp'],
];

export function isPatreonsQuery(value) {
  return ['patreon', 'patreons', 'patrons'].includes(
    String(value || '')
      .trim()
      .toLowerCase()
  );
}

const PAGE_CONFIG = {
  title: 'Vault Hunters Patreons',
  requestName: 'Patreons',
  rosterName: 'Patreon',
  description: 'Browse Vault Hunters Patreons by tier and open their reward profiles.',
  lead: 'Select a Patreon supporter to view their rewards.',
  query: 'patreons',
  endpoint: '/api/patreons',
  tiers: TIERS,
};

export function renderPatreonGroups(patreons, proxiedImageUrl, escapeHtml) {
  return renderPatreonTierGroups(TIERS, patreons, proxiedImageUrl, escapeHtml);
}

export async function renderPatreonsPage(...args) {
  return renderPatreonRosterPage(PAGE_CONFIG, ...args);
}
