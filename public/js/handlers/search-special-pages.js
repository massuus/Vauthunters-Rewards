import {
  form,
  usernameInput,
  resultContainer,
  DEFAULT_FAVICON,
  setFavicon,
  setMetaDescription,
  proxiedImageUrl,
} from '../utils/dom-utils.js';
import {
  setLoadingState as updateLoadingState,
  showFeedback as displayFeedback,
} from '../features/ui-feedback.js';
import {
  isCodesQuery,
  isDevelopersQuery,
  renderDevelopersPage,
  isPatreonsQuery,
  renderPatreonsPage,
  isIskall85PatreonsQuery,
  renderIskall85PatreonsPage,
  isPrivacyQuery,
  renderPrivacyPage,
  isAllQuery,
  isServersQuery,
  isLeaderboardQuery,
  isMiningQuery,
  isLiveQuery,
  isBadgesQuery,
  isStreamerStatsQuery,
  renderStreamerStatsPage,
  renderBadgesPage,
  getLeaderboardQueryTarget,
  getServerQueryTarget,
  renderCodesPage,
  renderAllRewardsPage,
  renderOfficialServersPage,
  renderOfficialServerDetailPage,
  renderLeaderboardPage,
  isAdminQuery,
  renderAdminPage,
  renderMiningPage,
  renderLivePage,
  teardownLivePage,
  teardownLeaderboardPage,
} from '../components/special-pages.js';
import { escapeHtml, formatLabel } from '../features/reward-utils.js';
import { syncActiveNavigation } from '../components/navigation.js';
import {
  fetchOfficialServers,
  getCachedOfficialServers,
  getVisibleServers,
  findServerByQuery,
} from '../features/official-servers.js';

function writeQueryString(qs) {
  if (!qs) {
    window.history.replaceState({}, '', window.location.pathname);
  } else {
    window.history.replaceState({}, '', `${window.location.pathname}?${qs}`);
  }
  syncActiveNavigation();
}

function scrollResultsIntoView() {
  resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function resolveServerFromSearchValue(value, cachedOnly) {
  try {
    const servers = getVisibleServers(
      cachedOnly ? getCachedOfficialServers() : await fetchOfficialServers()
    );
    return findServerByQuery(value, servers);
  } catch {
    return null;
  }
}

export async function handleSpecialPageSearch(
  username,
  { cachedServersOnly = false, signal } = {}
) {
  if (signal?.aborted) return true;
  const setLoadingState = (value) => {
    if (!signal?.aborted) updateLoadingState(value);
  };
  const showFeedback = (...args) => {
    if (!signal?.aborted) displayFeedback(...args);
  };
  const updateQueryString = (value) => {
    if (!signal?.aborted) writeQueryString(value);
  };
  const scrollToResults = () => {
    if (!signal?.aborted) scrollResultsIntoView();
  };
  teardownLeaderboardPage();
  teardownLivePage();

  if (isDevelopersQuery(username)) {
    setLoadingState(true);
    try {
      await renderDevelopersPage(
        resultContainer,
        setFavicon,
        setMetaDescription,
        updateQueryString,
        proxiedImageUrl,
        escapeHtml,
        DEFAULT_FAVICON,
        usernameInput,
        form,
        { signal }
      );
      scrollToResults();
    } catch {
      showFeedback('Unable to load developers right now. Please try again.', 'error');
    } finally {
      setLoadingState(false);
    }
    return true;
  }

  if (isPatreonsQuery(username)) {
    setLoadingState(true);
    try {
      await renderPatreonsPage(
        resultContainer,
        setFavicon,
        setMetaDescription,
        updateQueryString,
        proxiedImageUrl,
        escapeHtml,
        DEFAULT_FAVICON,
        usernameInput,
        form,
        { signal }
      );
      scrollToResults();
    } catch {
      showFeedback('Unable to load Patreons right now. Please try again.', 'error');
    } finally {
      setLoadingState(false);
    }
    return true;
  }

  if (isIskall85PatreonsQuery(username)) {
    setLoadingState(true);
    try {
      await renderIskall85PatreonsPage(
        resultContainer,
        setFavicon,
        setMetaDescription,
        updateQueryString,
        proxiedImageUrl,
        escapeHtml,
        DEFAULT_FAVICON,
        usernameInput,
        form,
        { signal }
      );
      scrollToResults();
    } catch {
      showFeedback('Unable to load Iskall85 Patreons right now. Please try again.', 'error');
    } finally {
      setLoadingState(false);
    }
    return true;
  }

  if (isPrivacyQuery(username)) {
    renderPrivacyPage(
      resultContainer,
      setFavicon,
      setMetaDescription,
      updateQueryString,
      DEFAULT_FAVICON
    );
    scrollToResults();
    return true;
  }

  if (isStreamerStatsQuery(username)) {
    setLoadingState(true);
    try {
      await renderStreamerStatsPage(
        resultContainer,
        setFavicon,
        setMetaDescription,
        updateQueryString,
        escapeHtml,
        DEFAULT_FAVICON,
        { signal }
      );
    } finally {
      setLoadingState(false);
    }
    return true;
  }

  if (isBadgesQuery(username)) {
    setLoadingState(true);
    try {
      await renderBadgesPage(
        resultContainer,
        setFavicon,
        setMetaDescription,
        updateQueryString,
        escapeHtml,
        DEFAULT_FAVICON,
        { signal }
      );
      if (!signal?.aborted)
        resultContainer
          .querySelector('.badges-page')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } finally {
      setLoadingState(false);
    }
    return true;
  }

  if (isLiveQuery(username)) {
    setLoadingState(true);
    try {
      await renderLivePage(
        resultContainer,
        setFavicon,
        setMetaDescription,
        updateQueryString,
        escapeHtml,
        DEFAULT_FAVICON
      );
    } catch {
      showFeedback('Unable to load live Vault Hunters right now. Please try again soon.', 'error');
    } finally {
      setLoadingState(false);
    }
    return true;
  }

  if (isCodesQuery(username)) {
    setLoadingState(true);
    try {
      await renderCodesPage(
        resultContainer,
        setFavicon,
        setMetaDescription,
        updateQueryString,
        proxiedImageUrl,
        escapeHtml,
        DEFAULT_FAVICON,
        { signal }
      );
      scrollToResults();
    } catch {
      showFeedback(
        'Unable to load the reward codes right now. Please try again in a moment.',
        'error'
      );
    } finally {
      setLoadingState(false);
    }
    return true;
  }

  if (isAllQuery(username)) {
    setLoadingState(true);
    try {
      await renderAllRewardsPage(
        resultContainer,
        setFavicon,
        setMetaDescription,
        updateQueryString,
        proxiedImageUrl,
        escapeHtml,
        formatLabel,
        DEFAULT_FAVICON,
        { signal }
      );
      scrollToResults();
    } catch {
      showFeedback('Unable to load all rewards right now. Please try again in a moment.', 'error');
    } finally {
      setLoadingState(false);
    }
    return true;
  }

  if (isServersQuery(username)) {
    setLoadingState(true);
    try {
      await renderOfficialServersPage(
        resultContainer,
        setFavicon,
        setMetaDescription,
        updateQueryString,
        escapeHtml,
        DEFAULT_FAVICON,
        usernameInput,
        form,
        { signal }
      );
      scrollToResults();
    } catch {
      showFeedback(
        'Unable to load official servers right now. Please try again in a moment.',
        'error'
      );
    } finally {
      setLoadingState(false);
    }
    return true;
  }

  if (isLeaderboardQuery(username)) {
    const targetPlayer = getLeaderboardQueryTarget(username);
    setLoadingState(true);
    try {
      await renderLeaderboardPage(
        resultContainer,
        setFavicon,
        setMetaDescription,
        updateQueryString,
        proxiedImageUrl,
        escapeHtml,
        DEFAULT_FAVICON,
        usernameInput,
        form,
        targetPlayer
      );
      scrollToResults();
    } catch {
      showFeedback(
        'Unable to load the leaderboard right now. Please try again in a moment.',
        'error'
      );
    } finally {
      setLoadingState(false);
    }
    return true;
  }

  if (isAdminQuery(username)) {
    setLoadingState(true);
    try {
      await renderAdminPage(
        resultContainer,
        setFavicon,
        setMetaDescription,
        updateQueryString,
        proxiedImageUrl,
        escapeHtml,
        DEFAULT_FAVICON,
        usernameInput,
        form
      );
      scrollToResults();
    } catch {
      showFeedback(
        'Unable to load the admin page right now. Please try again in a moment.',
        'error'
      );
    } finally {
      setLoadingState(false);
    }
    return true;
  }

  if (isMiningQuery(username)) {
    setLoadingState(true);
    try {
      await renderMiningPage(
        resultContainer,
        setFavicon,
        setMetaDescription,
        updateQueryString,
        DEFAULT_FAVICON
      );
      scrollToResults();
    } catch {
      showFeedback('Unable to load mining clues right now. Please try again in a moment.', 'error');
    } finally {
      setLoadingState(false);
    }
    return true;
  }

  const serverTarget = getServerQueryTarget(username);
  if (serverTarget) {
    setLoadingState(true);
    try {
      await renderOfficialServerDetailPage(
        serverTarget,
        resultContainer,
        setFavicon,
        setMetaDescription,
        updateQueryString,
        proxiedImageUrl,
        escapeHtml,
        DEFAULT_FAVICON,
        usernameInput,
        form,
        { signal }
      );
      scrollToResults();
    } catch {
      showFeedback(
        'Unable to load server details right now. Please try again in a moment.',
        'error'
      );
    } finally {
      setLoadingState(false);
    }
    return true;
  }

  const matchedServer = await resolveServerFromSearchValue(username, cachedServersOnly);
  if (signal?.aborted) return true;
  if (matchedServer?._id) {
    setLoadingState(true);
    try {
      await renderOfficialServerDetailPage(
        matchedServer._id,
        resultContainer,
        setFavicon,
        setMetaDescription,
        updateQueryString,
        proxiedImageUrl,
        escapeHtml,
        DEFAULT_FAVICON,
        usernameInput,
        form,
        { signal }
      );
      scrollToResults();
    } catch {
      showFeedback(
        'Unable to load server details right now. Please try again in a moment.',
        'error'
      );
    } finally {
      setLoadingState(false);
    }
    return true;
  }

  return false;
}
