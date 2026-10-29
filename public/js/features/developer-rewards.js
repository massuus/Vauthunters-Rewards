export function getDefaultDeveloperOverride(data) {
  const uuid = String(data.id || '')
    .replaceAll('-', '')
    .toLowerCase();
  return uuid !== '18f179ee3dba4ce286508ef714f44e80';
}

export function getDeveloperRewardView(data, showOverride = getDefaultDeveloperOverride(data)) {
  const showApi = data.isDeveloper === true && !showOverride && data.apiRewards;
  return showApi ? data.apiRewards : { sets: data.sets, rewards: data.rewards };
}

export function renderDeveloperBadge(data, showOverride = getDefaultDeveloperOverride(data)) {
  if (data.isDeveloper !== true) return '';
  const action = showOverride ? 'Show actual API rewards' : 'Show developer override rewards';
  return `<button type="button" class="player-dev-badge" data-dev-toggle aria-pressed="${showOverride}" aria-label="${action}" title="${action}"><span class="player-dev-badge__icon" aria-hidden="true">&lt;/&gt;</span>Dev</button>`;
}
