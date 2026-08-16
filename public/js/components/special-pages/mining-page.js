const MINING_QUERY_KEYWORDS = ['mining', 'mining clues', 'clues', 'mine'];
const ANSWERS = ['surface', 'mineshaft', 'cave'];

let renderGeneration = 0;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    const replacements = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return replacements[character];
  });
}

function answerLabel(answer) {
  return answer === 'mineshaft'
    ? 'Mineshaft'
    : String(answer || '').replace(/^./, (letter) => letter.toUpperCase());
}

function formatDate(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value)
    );
  } catch {
    return value;
  }
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  let body = {};
  try {
    body = await response.json();
  } catch {}
  if (!response.ok) throw new Error(body.error || 'The request failed.');
  return { body, status: response.status };
}

async function loadAllClues() {
  const clues = [];
  let offset = 0;
  let total = 0;
  do {
    const { body } = await apiRequest(`/api/mining/clues?limit=250&offset=${offset}`);
    const page = Array.isArray(body.clues) ? body.clues : [];
    clues.push(...page);
    total = Number(body.total || clues.length);
    offset += page.length;
    if (!body.hasMore || page.length === 0 || clues.length >= 2000) break;
  } while (offset < total);
  return { clues, total };
}

function renderAnswerOptions(selected = '') {
  return ANSWERS.map(
    (answer) =>
      `<option value="${answer}"${answer === selected ? ' selected' : ''}>${answerLabel(answer)}</option>`
  ).join('');
}

function renderIntro() {
  return `
    <header class="mining-page__intro">
      <p class="mining-page__eyebrow">Stream event helper</p>
      <h2>Mining Clues</h2>
      <p>Search the clue from the stream and find its correct mining location.</p>
      <div class="mining-page__rewards" aria-label="Mining event rewards">
        <span><strong>3 gems</strong> correct</span>
        <span><strong>2 gems</strong> close</span>
        <span><strong>1 gem</strong> wrong</span>
      </div>
    </header>`;
}

function renderAuth(auth) {
  if (!auth?.authenticated) {
    return `
      <section class="mining-panel mining-auth">
        <div>
          <h3>Help improve this list</h3>
          <p>Log in with Twitch before submitting a clue. Your Twitch identity is only shown to moderators.</p>
        </div>
        ${
          auth?.twitchConfigured === false
            ? '<p class="mining-feedback mining-feedback--error">Twitch login has not been configured yet.</p>'
            : '<a class="mining-button mining-button--twitch" href="/api/auth/twitch/login?returnTo=%2F%3Fmining">Log in with Twitch</a>'
        }
      </section>`;
  }

  return `
    <section class="mining-panel mining-auth">
      <div>
        <h3>Logged in as ${escapeHtml(auth.user.displayName)}</h3>
        <p>@${escapeHtml(auth.user.login)}${auth.user.isAdmin ? ' · Site administrator' : ''}</p>
      </div>
      <button class="mining-button mining-button--secondary" type="button" data-mining-logout>Log out</button>
    </section>`;
}

function renderSubmissionForm(auth, timezone) {
  if (!auth?.authenticated) return '';
  if (auth.user.blocked) {
    return `
      <section class="mining-panel">
        <h3>Submissions blocked</h3>
        <p class="mining-feedback mining-feedback--error">This Twitch account cannot submit mining clues.</p>
      </section>`;
  }

  return `
    <section class="mining-panel">
      <div class="mining-panel__heading">
        <div>
          <h3>Submit a clue</h3>
          <p>Submissions are reviewed in a private Discord server before appearing here.</p>
        </div>
      </div>
      <form class="mining-form" data-mining-submit-form>
        <label class="mining-field mining-field--wide">
          <span>Clue</span>
          <textarea name="clueText" minlength="3" maxlength="500" rows="3" required placeholder="Enter the clue exactly as it appeared"></textarea>
        </label>
        <label class="mining-field">
          <span>Correct answer</span>
          <select name="answer" required>
            <option value="">Choose a location</option>
            ${renderAnswerOptions()}
          </select>
        </label>
        <label class="mining-field mining-field--wide">
          <span>Note <small>(optional)</small></span>
          <input type="text" name="note" maxlength="500" placeholder="Anything the moderators should know">
        </label>
        <details class="mining-proof mining-field--wide">
          <summary>Add stream proof <span>optional</span></summary>
          <div class="mining-proof__grid">
            <label class="mining-field">
              <span>Streamer name</span>
              <input type="text" name="proofStreamer" maxlength="25" pattern="[A-Za-z0-9_]+" placeholder="Streamer name">
            </label>
            <label class="mining-field">
              <span>Date</span>
              <input type="date" name="proofDate">
            </label>
            <label class="mining-field">
              <span>Time</span>
              <input type="time" name="proofTime">
            </label>
            <label class="mining-field">
              <span>Timezone</span>
              <input type="text" name="proofTimezone" maxlength="64" value="${escapeHtml(timezone)}" placeholder="Europe/Amsterdam">
            </label>
            <label class="mining-field mining-field--wide">
              <span>Twitch VOD URL <small>(optional)</small></span>
              <input type="url" name="proofVodUrl" maxlength="300" placeholder="https://www.twitch.tv/videos/123456">
            </label>
            <label class="mining-field">
              <span>VOD timestamp <small>(optional)</small></span>
              <input type="text" name="proofVodTimestamp" maxlength="24" placeholder="1h23m45s">
            </label>
            <label class="mining-field mining-field--wide">
              <span>Twitch clip URL <small>(optional)</small></span>
              <input type="url" name="proofClipUrl" maxlength="300" placeholder="https://clips.twitch.tv/ClipSlug">
            </label>
          </div>
        </details>
        <button class="mining-button" type="submit">Send for review</button>
      </form>
    </section>`;
}

function renderAdminAddForm(auth) {
  if (!auth?.authenticated || !auth.user.isAdmin) return '';
  return `
    <section class="mining-panel mining-panel--admin">
      <div class="mining-panel__heading">
        <div>
          <p class="mining-page__eyebrow">Administrator</p>
          <h3>Add a clue directly</h3>
          <p>This publishes immediately and does not send anything to Discord.</p>
        </div>
      </div>
      <form class="mining-form mining-form--compact" data-mining-admin-add>
        <label class="mining-field mining-field--wide">
          <span>Clue</span>
          <textarea name="clueText" minlength="3" maxlength="500" rows="2" required></textarea>
        </label>
        <label class="mining-field">
          <span>Answer</span>
          <select name="answer" required>
            <option value="">Choose a location</option>
            ${renderAnswerOptions()}
          </select>
        </label>
        <button class="mining-button mining-button--small mining-button--admin-publish" type="submit">Publish clue</button>
      </form>
    </section>`;
}

function renderClueCard(clue, state) {
  const isEditing = state.editingId === clue.id;
  if (isEditing) {
    return `
      <article class="mining-clue mining-clue--editing">
        <form class="mining-form mining-form--compact" data-mining-edit-form data-clue-id="${escapeHtml(clue.id)}">
          <label class="mining-field mining-field--wide">
            <span>Clue</span>
            <textarea name="clueText" minlength="3" maxlength="500" rows="3" required>${escapeHtml(clue.clueText)}</textarea>
          </label>
          <label class="mining-field">
            <span>Answer</span>
            <select name="answer" required>${renderAnswerOptions(clue.answer)}</select>
          </label>
          <input type="hidden" name="expectedVersion" value="${clue.version}">
          <div class="mining-form__actions">
            <button class="mining-button" type="submit">Save</button>
            <button class="mining-button mining-button--secondary" type="button" data-mining-cancel-edit>Cancel</button>
          </div>
        </form>
      </article>`;
  }

  return `
    <article class="mining-clue">
      <div class="mining-clue__content">
        <p>${escapeHtml(clue.clueText)}</p>
        <span class="mining-answer mining-answer--${escapeHtml(clue.answer)}">${answerLabel(clue.answer)}</span>
      </div>
      ${
        state.auth?.user?.isAdmin
          ? `<div class="mining-clue__admin">
               <button type="button" data-mining-edit="${escapeHtml(clue.id)}">Edit</button>
               <button type="button" data-mining-archive="${escapeHtml(clue.id)}" data-version="${clue.version}">Archive</button>
             </div>`
          : ''
      }
    </article>`;
}

function getVisibleClues(state) {
  const query = state.query.trim().toLowerCase();
  return state.clues.filter((clue) => {
    if (state.answerFilter && clue.answer !== state.answerFilter) return false;
    return !query || clue.clueText.toLowerCase().includes(query);
  });
}

function renderClueList(state) {
  const clues = getVisibleClues(state);
  if (!clues.length) {
    return '<p class="mining-empty">No clues match those filters.</p>';
  }
  return clues.map((clue) => renderClueCard(clue, state)).join('');
}

function renderSubmissionHistory(state) {
  if (!state.auth?.authenticated) return '';
  const items = state.mySubmissions || [];
  if (!items.length) return '';
  return `
    <details class="mining-panel mining-history">
      <summary>Your recent submissions</summary>
      <div class="mining-history__list">
        ${items
          .map(
            (item) => `
              <div class="mining-history__item">
                <span class="mining-status mining-status--${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>
                <strong>${answerLabel(item.answer)}</strong>
                <span>${escapeHtml(item.clueText)}</span>
                <small>${formatDate(item.createdAt)}</small>
              </div>`
          )
          .join('')}
      </div>
    </details>`;
}

function renderAdminOperations(state) {
  if (!state.auth?.user?.isAdmin) return '';
  const submissions = state.adminSubmissions || [];
  const blockedUsers = state.blockedUsers || [];
  return `
    <details class="mining-panel mining-admin-operations">
      <summary>Moderation operations</summary>
      <div class="mining-admin-operations__section">
        <h4>Pending or failed Discord deliveries</h4>
        ${
          submissions.length
            ? submissions
                .map(
                  (item) => `
                    <div class="mining-admin-row">
                      <div>
                        <strong>${escapeHtml(item.submitterDisplayName || item.submitterLogin)}</strong>
                        <p>${escapeHtml(item.clueText)}</p>
                        <small>${escapeHtml(item.discordDeliveryStatus)} · ${escapeHtml(item.status)}</small>
                      </div>
                      ${
                        item.status === 'pending' && item.discordDeliveryStatus !== 'sent'
                          ? `<button class="mining-button mining-button--small" type="button" data-mining-retry="${escapeHtml(item.id)}">Retry Discord</button>`
                          : ''
                      }
                    </div>`
                )
                .join('')
            : '<p class="mining-empty">No pending delivery problems.</p>'
        }
      </div>
      <div class="mining-admin-operations__section">
        <h4>Blocked Twitch users</h4>
        ${
          blockedUsers.length
            ? blockedUsers
                .map(
                  (user) => `
                    <div class="mining-admin-row">
                      <div><strong>${escapeHtml(user.displayName)}</strong><small>@${escapeHtml(user.login)} · ${formatDate(user.blockedAt)}</small></div>
                      <button class="mining-button mining-button--small" type="button" data-mining-unblock="${escapeHtml(user.twitchUserId)}">Unblock</button>
                    </div>`
                )
                .join('')
            : '<p class="mining-empty">No blocked users.</p>'
        }
      </div>
    </details>`;
}

function renderPage(state) {
  return `
    ${renderIntro()}
    ${renderAuth(state.auth)}
    ${
      state.feedback
        ? `<p class="mining-feedback mining-feedback--${state.feedback.type}" role="status">${escapeHtml(state.feedback.message)}</p>`
        : ''
    }
    ${renderSubmissionForm(state.auth, state.timezone)}
    ${renderSubmissionHistory(state)}
    ${renderAdminAddForm(state.auth)}
    ${renderAdminOperations(state)}
    <section class="mining-lookup" aria-labelledby="mining-list-title">
      <div class="mining-lookup__heading">
        <div>
          <h3 id="mining-list-title">Approved clues</h3>
          <p><span data-mining-visible-count>${getVisibleClues(state).length}</span> of ${state.total} clues shown</p>
        </div>
        <label class="mining-search">
          <span class="sr-only">Search mining clues</span>
          <input type="search" value="${escapeHtml(state.query)}" placeholder="Search a clue…" data-mining-search>
        </label>
      </div>
      <div class="mining-filters" aria-label="Filter by answer">
        <button type="button" data-answer-filter="" aria-pressed="${state.answerFilter === ''}">All</button>
        ${ANSWERS.map(
          (answer) =>
            `<button type="button" data-answer-filter="${answer}" aria-pressed="${state.answerFilter === answer}">${answerLabel(answer)}</button>`
        ).join('')}
      </div>
      <div class="mining-clues" data-mining-clue-list>${renderClueList(state)}</div>
      <p class="mining-credit">Thanks CsaBa (aka Abbes / xabbes) for coming up with the idea for this mining event page!💚</p>
    </section>`;
}

function formPayload(form) {
  const data = new FormData(form);
  return {
    clueText: data.get('clueText'),
    answer: data.get('answer'),
    note: data.get('note'),
    proof: {
      streamerLogin: data.get('proofStreamer'),
      date: data.get('proofDate'),
      time: data.get('proofTime'),
      timezone: data.get('proofTimezone'),
      vodUrl: data.get('proofVodUrl'),
      vodTimestamp: data.get('proofVodTimestamp'),
      clipUrl: data.get('proofClipUrl'),
    },
  };
}

async function mutate(state, url, method, body) {
  return apiRequest(url, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': state.auth.user.csrfToken,
    },
    body: JSON.stringify(body || {}),
  });
}

async function refreshClues(state) {
  const data = await loadAllClues();
  state.clues = data.clues;
  state.total = data.total;
}

async function refreshPrivateData(state) {
  if (!state.auth?.authenticated) return;
  const tasks = [apiRequest('/api/mining/submissions/mine')];
  if (state.auth.user.isAdmin) {
    tasks.push(
      apiRequest('/api/admin/mining/submissions?limit=50'),
      apiRequest('/api/admin/mining/blocked-users')
    );
  }
  const results = await Promise.allSettled(tasks);
  state.mySubmissions =
    results[0].status === 'fulfilled' ? results[0].value.body.submissions || [] : [];
  if (state.auth.user.isAdmin) {
    state.adminSubmissions =
      results[1]?.status === 'fulfilled' ? results[1].value.body.submissions || [] : [];
    state.blockedUsers =
      results[2]?.status === 'fulfilled' ? results[2].value.body.users || [] : [];
  }
}

function paint(state) {
  state.root.innerHTML = renderPage(state);
}

function updateClueResults(state) {
  const list = state.root.querySelector('[data-mining-clue-list]');
  if (list) list.innerHTML = renderClueList(state);
  const count = state.root.querySelector('[data-mining-visible-count]');
  if (count) count.textContent = String(getVisibleClues(state).length);
}

function setFeedback(state, message, type = 'success') {
  state.feedback = { message, type };
  paint(state);
  state.root
    .querySelector('.mining-feedback')
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function bindMiningPage(state) {
  state.root.addEventListener('input', (event) => {
    if (!event.target.matches('[data-mining-search]')) return;
    state.query = event.target.value;
    updateClueResults(state);
  });

  state.root.addEventListener('click', async (event) => {
    const filter = event.target.closest('[data-answer-filter]');
    if (filter) {
      state.answerFilter = filter.dataset.answerFilter || '';
      paint(state);
      state.root.querySelector('[data-mining-search]')?.focus();
      return;
    }

    if (event.target.closest('[data-mining-logout]')) {
      try {
        await mutate(state, '/api/auth/logout', 'POST', {});
        window.location.href = '/?mining';
      } catch (error) {
        setFeedback(state, error.message, 'error');
      }
      return;
    }

    const edit = event.target.closest('[data-mining-edit]');
    if (edit) {
      state.editingId = edit.dataset.miningEdit;
      paint(state);
      return;
    }
    if (event.target.closest('[data-mining-cancel-edit]')) {
      state.editingId = null;
      paint(state);
      return;
    }

    const archive = event.target.closest('[data-mining-archive]');
    if (archive) {
      const clue = state.clues.find((item) => item.id === archive.dataset.miningArchive);
      if (!clue || !window.confirm(`Archive this clue?\n\n${clue.clueText}`)) return;
      try {
        await mutate(state, `/api/admin/mining/clues/${encodeURIComponent(clue.id)}`, 'DELETE', {
          expectedVersion: Number(archive.dataset.version),
        });
        await refreshClues(state);
        setFeedback(state, 'Clue archived.', 'success');
      } catch (error) {
        setFeedback(state, error.message, 'error');
      }
      return;
    }

    const retry = event.target.closest('[data-mining-retry]');
    if (retry) {
      retry.disabled = true;
      try {
        const { body } = await mutate(
          state,
          `/api/admin/mining/submissions/${encodeURIComponent(retry.dataset.miningRetry)}/retry-discord`,
          'POST',
          {}
        );
        await refreshPrivateData(state);
        setFeedback(state, body.message || 'Submission sent to Discord.', 'success');
      } catch (error) {
        setFeedback(state, error.message, 'error');
      }
      return;
    }

    const unblock = event.target.closest('[data-mining-unblock]');
    if (unblock) {
      unblock.disabled = true;
      try {
        await mutate(
          state,
          `/api/admin/mining/blocked-users/${encodeURIComponent(unblock.dataset.miningUnblock)}/unblock`,
          'POST',
          {}
        );
        await refreshPrivateData(state);
        setFeedback(state, 'Twitch user unblocked.', 'success');
      } catch (error) {
        setFeedback(state, error.message, 'error');
      }
    }
  });

  state.root.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
      if (form.matches('[data-mining-submit-form]')) {
        const { body } = await mutate(state, '/api/mining/submissions', 'POST', formPayload(form));
        form.reset();
        await refreshPrivateData(state);
        setFeedback(state, body.message || 'Clue submitted for review.', 'success');
        return;
      }

      if (form.matches('[data-mining-admin-add]')) {
        const payload = formPayload(form);
        await mutate(state, '/api/admin/mining/clues', 'POST', payload);
        await refreshClues(state);
        setFeedback(state, 'Clue published directly.', 'success');
        return;
      }

      if (form.matches('[data-mining-edit-form]')) {
        const data = new FormData(form);
        await mutate(
          state,
          `/api/admin/mining/clues/${encodeURIComponent(form.dataset.clueId)}`,
          'PATCH',
          {
            clueText: data.get('clueText'),
            answer: data.get('answer'),
            expectedVersion: Number(data.get('expectedVersion')),
          }
        );
        state.editingId = null;
        await refreshClues(state);
        setFeedback(state, 'Clue updated.', 'success');
      }
    } catch (error) {
      setFeedback(state, error.message, 'error');
    } finally {
      if (submitButton?.isConnected) submitButton.disabled = false;
    }
  });
}

export function isMiningQuery(value) {
  return MINING_QUERY_KEYWORDS.includes(
    String(value || '')
      .trim()
      .toLowerCase()
  );
}

export async function renderMiningPage(
  resultContainer,
  setFavicon,
  setMetaDescription,
  closeOpenModal,
  updateQueryString,
  DEFAULT_FAVICON
) {
  const generation = ++renderGeneration;
  resultContainer.classList.remove('hidden');
  resultContainer.innerHTML = `
    <section class="mining-page">
      ${renderIntro()}
      <p class="mining-page__loading">Loading mining clues…</p>
    </section>`;
  setFavicon(DEFAULT_FAVICON);
  document.title = 'Vault Hunters Mining Clues';
  setMetaDescription('Search Vault Hunters mining event clues and their correct locations.');
  closeOpenModal();

  try {
    const [clueData, authData] = await Promise.all([
      loadAllClues(),
      apiRequest('/api/auth/me').then(({ body }) => body),
    ]);
    if (generation !== renderGeneration) return;

    const root = document.createElement('section');
    root.className = 'mining-page';
    const state = {
      root,
      clues: clueData.clues,
      total: clueData.total,
      auth: authData,
      query: '',
      answerFilter: '',
      editingId: null,
      feedback: null,
      mySubmissions: [],
      adminSubmissions: [],
      blockedUsers: [],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    };
    await refreshPrivateData(state);
    if (generation !== renderGeneration) return;
    paint(state);
    bindMiningPage(state);
    resultContainer.replaceChildren(root);
    updateQueryString(MINING_QUERY_KEYWORDS[0]);
  } catch (error) {
    resultContainer.innerHTML = `
      <section class="mining-page">
        ${renderIntro()}
        <p class="mining-feedback mining-feedback--error">${escapeHtml(error.message || 'Mining clues could not be loaded.')}</p>
      </section>`;
    updateQueryString(MINING_QUERY_KEYWORDS[0]);
  }
}
