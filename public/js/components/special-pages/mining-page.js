const MINING_QUERY_KEYWORDS = ['mining', 'mining clues', 'clues', 'mine'];

export function isMiningQuery(value) {
  return MINING_QUERY_KEYWORDS.includes(
    String(value || '')
      .trim()
      .toLowerCase()
  );
}

export async function renderMiningPage(
  container,
  setFavicon,
  setMetaDescription,
  closeOpenModal,
  updateQueryString,
  defaultFavicon
) {
  closeOpenModal();
  updateQueryString('mining');
  setFavicon(defaultFavicon);
  document.title = 'Mining event ended ? Vault Hunters Rewards';
  setMetaDescription('The mining event has ended and clue submissions are closed.');
  container.classList.remove('hidden');
  container.innerHTML = `<section class="mining-page"><h2>The mining event has ended</h2><p>Mining clues and submissions are now closed. Thanks to everyone who took part!</p><p><a href="/?all">Browse rewards</a></p></section>`;
}
