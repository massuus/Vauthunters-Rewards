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
  const isJanitor =
    String(data.id || '')
      .replaceAll('-', '')
      .toLowerCase() === '7f618dfe4ca14d9a87130958b7fc3cf9';
  const label = isJanitor ? 'Janitor' : 'Dev';
  const icon = isJanitor
    ? '<img class="player-dev-badge__image" src="/img/badge/Janitor.png" alt="" aria-hidden="true" width="20" height="20">'
    : '<span class="player-dev-badge__icon" aria-hidden="true">&lt;/&gt;</span>';
  const action = showOverride ? 'Show actual API rewards' : 'Show developer override rewards';
  return `<button type="button" class="player-dev-badge" data-dev-toggle aria-pressed="${showOverride}" aria-label="${label}: ${action}" title="${action}">${icon}${label}</button>`;
}
