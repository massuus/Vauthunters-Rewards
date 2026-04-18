import {
  form,
  usernameInput,
  resultContainer,
  DEFAULT_FAVICON,
  setFavicon,
  setMetaDescription,
  proxiedImageUrl,
} from '../utils/dom-utils.js';
import { setLoadingState, showFeedback } from '../features/ui-feedback.js';
import {
  isCodesQuery,
  isAllQuery,
  isServersQuery,
  getServerQueryTarget,
  renderCodesPage,
  renderAllRewardsPage,
  renderOfficialServersPage,
  renderOfficialServerDetailPage,
} from '../components/special-pages.js';
import { escapeHtml, formatLabel } from '../features/reward-utils.js';
import {
  fetchOfficialServers,
  getVisibleServers,
  findServerByQuery,
} from '../features/official-servers.js';

function closeOpenModal() {
  const modal = document.querySelector('dialog[open]');
  if (modal) modal.close();
}

function updateQueryString(qs) {
  if (!qs) {
    window.history.replaceState({}, '', window.location.pathname);
  } else {
    window.history.replaceState({}, '', `${window.location.pathname}?${qs}`);
  }
}

function scrollToResults() {
  resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function resolveServerFromSearchValue(value) {
  try {
    const servers = getVisibleServers(await fetchOfficialServers());
    return findServerByQuery(value, servers);
  } catch {
    return null;
  }
}

export async function handleSpecialPageSearch(username) {
  if (isCodesQuery(username)) {
    setLoadingState(true);
    try {
      await renderCodesPage(
        resultContainer,
        setFavicon,
        setMetaDescription,
        closeOpenModal,
        updateQueryString,
        proxiedImageUrl,
        escapeHtml,
        DEFAULT_FAVICON
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
        closeOpenModal,
        updateQueryString,
        proxiedImageUrl,
        escapeHtml,
        formatLabel,
        DEFAULT_FAVICON
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
        closeOpenModal,
        updateQueryString,
        escapeHtml,
        DEFAULT_FAVICON,
        usernameInput,
        form
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

  const serverTarget = getServerQueryTarget(username);
  if (serverTarget) {
    setLoadingState(true);
    try {
      await renderOfficialServerDetailPage(
        serverTarget,
        resultContainer,
        setFavicon,
        setMetaDescription,
        closeOpenModal,
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
        'Unable to load server details right now. Please try again in a moment.',
        'error'
      );
    } finally {
      setLoadingState(false);
    }
    return true;
  }

  const matchedServer = await resolveServerFromSearchValue(username);
  if (matchedServer?._id) {
    setLoadingState(true);
    try {
      await renderOfficialServerDetailPage(
        matchedServer._id,
        resultContainer,
        setFavicon,
        setMetaDescription,
        closeOpenModal,
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
