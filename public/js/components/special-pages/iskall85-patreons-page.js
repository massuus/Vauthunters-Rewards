import { renderPatreonTierGroups, renderPatreonRosterPage } from '../patreon-roster.js';

const TIERS = [
  ['Emerald', '/img/badge/emerald.webp'],
  ['Iskallium Diamond', '/img/badge/iskallium-diamond.webp'],
  ['Diamond', '/img/badge/diamond.webp'],
  ['Gold', '/img/badge/gold.webp'],
  ['Iron', '/img/badge/iron.webp'],
];

export function isIskall85PatreonsQuery(value) {
  return [
    'iskall85-patreons',
    'iskall85 patreon',
    'iskall85 patreons',
    'iskall patreon',
    'iskall patreons',
  ].includes(
    String(value || '')
      .trim()
      .toLowerCase()
  );
}

const PAGE_CONFIG = {
  title: 'Iskall85 Patreons',
  requestName: 'Iskall85 Patreons',
  rosterName: 'Iskall85 Patreon',
  description: 'Browse Iskall85 Patreons by tier and open their reward profiles.',
  lead: 'Select an Iskall85 Patreon supporter to view their rewards.',
  query: 'iskall85-patreons',
  endpoint: '/api/iskall85-patreons',
  tiers: TIERS,
};

export function renderIskall85PatreonGroups(patreons, proxiedImageUrl, escapeHtml) {
  return renderPatreonTierGroups(TIERS, patreons, proxiedImageUrl, escapeHtml);
}

export async function renderIskall85PatreonsPage(...args) {
  return renderPatreonRosterPage(PAGE_CONFIG, ...args);
}
