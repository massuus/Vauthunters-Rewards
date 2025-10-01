const form = document.getElementById('search-form');
const usernameInput = document.getElementById('username');
const feedback = document.getElementById('feedback');
const resultContainer = document.getElementById('result');

const SET_ART = {
  baby_creeper_gold: {
    label: 'Golden Creeper',
    image: 'https://wiki.vaulthunters.gg/images/c/c9/Invicon_Companion_Golden_Creeper.gif',
    alt: 'Golden Creeper companion icon'
  },
  baby_creeper_pog: {
    label: 'POG Creeper',
    image: 'https://wiki.vaulthunters.gg/images/e/e4/Invicon_Companion_POG_Creeper.gif',
    alt: 'POG Creeper companion icon'
  },
  golden_kappa: {
    label: 'Golden Kappa',
    image: 'https://wiki.vaulthunters.gg/images/8/8e/Invicon_Golden_Kappa_Shield.png.webp',
    alt: 'Golden Kappa icon'
  },
  dylan_vip: {
    label: 'Dylan VIP',
    image: 'https://wiki.vaulthunters.gg/images/7/78/Invicon_Dylan_Armour.webp',
    alt: 'Dylan armour icon'
  },
  companion_leader_s1: {
    label: 'Companion Leader S1',
    image: 'https://wiki.vaulthunters.gg/images/d/d5/Invicon_PartyLeader.gif',
    alt: 'Companion party leader icon'
  },
  i85_royale_crown: {
    label: 'Royale Crown',
    image: 'https://wiki.vaulthunters.gg/images/9/9c/Invicon_Royale_Crown.png.webp',
    alt: 'Royale Crown icon'
  },
  i85_spring_set: {
    label: 'Spring Set',
    image: 'https://wiki.vaulthunters.gg/images/f/f2/Spring_focus.png',
    alt: 'Spring set icon'
  },
  i85_treasure_train: {
    label: 'Treasure Train',
    image: 'https://wiki.vaulthunters.gg/images/5/50/Invicon_Golden_Kappa_Train.webp',
    alt: 'Golden Kappa Train icon'
  }
};

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = usernameInput.value.trim();

  clearFeedback();

  if (!username) {
    showFeedback('Please enter a Minecraft username.', 'error');
    return;
  }

  setLoadingState(true);

  try {
    const response = await fetch(`/api/profile?username=${encodeURIComponent(username)}`);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Player not found. Double-check the spelling and try again.');
      }

      if (response.status === 400) {
        throw new Error('Invalid Minecraft username. Usernames are 3-16 characters without spaces.');
      }

      throw new Error('Something went wrong while retrieving the profile.');
    }

    const data = await response.json();
    renderProfile(data);
    showFeedback(`Profile loaded for ${data.name}.`, 'success');
  } catch (error) {
    clearResult();
    showFeedback(error.message, 'error');
  } finally {
    setLoadingState(false);
  }
});

function setLoadingState(isLoading) {
  const button = form.querySelector('button');
  button.disabled = isLoading;
  button.textContent = isLoading ? 'Searching...' : 'Search';
}

function clearFeedback() {
  feedback.textContent = '';
  feedback.classList.remove('error', 'success');
}

function showFeedback(message, type) {
  feedback.textContent = message;
  feedback.classList.remove('error', 'success');

  if (type) {
    feedback.classList.add(type);
  }
}

function clearResult() {
  resultContainer.innerHTML = '';
  resultContainer.classList.add('hidden');
}

function renderProfile(data) {
  const sets = Array.isArray(data.sets) ? data.sets : [];
  const tiers = Array.isArray(data.tier) ? data.tier : [];
  const rewards = data.rewards && typeof data.rewards === 'object' ? data.rewards : {};

  const setsSection = renderSetsSection(sets);
  const tiersSection = renderTiersSection(tiers);
  const extraSection = renderExtraSection(rewards);

  resultContainer.innerHTML = `
    <article class="player-card">
      <img src="${data.head}" alt="${data.name}'s Minecraft head" loading="lazy">
      <div class="player-details">
        <h2>${data.name}</h2>
        <p class="player-subtitle">Latest Vault Hunters reward data.</p>
      </div>
    </article>
    ${setsSection}
    ${tiersSection}
    ${extraSection}
  `;

  resultContainer.classList.remove('hidden');

  const toggle = document.getElementById('extra-toggle');
  const panel = document.getElementById('extra-panel');
  if (toggle && panel) {
    toggle.addEventListener('click', () => {
      const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!isExpanded));
      panel.classList.toggle('hidden');
    });
  }
}

function renderSetsSection(sets) {
  if (!sets.length) {
    return `
      <section>
        <h3 class="section-title">Vault Sets</h3>
        <p class="muted">No sets recorded yet.</p>
      </section>
    `;
  }

  const items = sets.map((setKey) => renderSetCard(setKey)).join('');

  return `
    <section>
      <h3 class="section-title">Vault Sets</h3>
      <div class="sets-grid">${items}</div>
    </section>
  `;
}

function renderSetCard(setKey) {
  const asset = SET_ART[setKey];
  const label = asset?.label || formatLabel(setKey);

  if (asset?.image) {
    return `
      <div class="set-card">
        <img src="${asset.image}" alt="${asset.alt || label}" loading="lazy">
        <span>${label}</span>
      </div>
    `;
  }

  return `
    <div class="set-card">
      <span>${label}</span>
    </div>
  `;
}

function renderTiersSection(tiers) {
  const title = 'Patreon Sets Unlocked';

  if (!tiers.length) {
    return `
      <section>
        <h3 class="section-title">${title}</h3>
        <p class="muted">No Patreon tiers unlocked yet.</p>
      </section>
    `;
  }

  const items = tiers
    .map((tier) => {
      const label = tier && typeof tier === 'object'
        ? tier.name || formatLabel(tier.id)
        : formatLabel(tier);
      return `<li>${label}</li>`;
    })
    .join('');

  return `
    <section>
      <h3 class="section-title">${title}</h3>
      <ul class="tiers-list">${items}</ul>
    </section>
  `;
}

function renderExtraSection(rewards) {
  const hasRewards = Object.keys(rewards).length > 0;
  const panelContent = hasRewards ? renderRewardsList(rewards) : '<p class="muted">No individual rewards recorded.</p>';

  return `
    <section>
      <button id="extra-toggle" class="extra-toggle" type="button" aria-expanded="false">Extra Info</button>
      <div id="extra-panel" class="rewards-panel hidden">${panelContent}</div>
    </section>
  `;
}

function renderRewardsList(rewards) {
  return Object.entries(rewards)
    .map(([group, items]) => {
      const normalizedItems = Array.isArray(items) ? items : [];
      const listItems = normalizedItems
        .map((item) => `<li>${formatLabel(item)}</li>`)
        .join('');

      return `
        <div class="reward-group">
          <h3>${formatLabel(group)}</h3>
          <ul>${listItems}</ul>
        </div>
      `;
    })
    .join('');
}

function getUsernameFromQuery() {
  const { search } = window.location;

  if (!search || search.length <= 1) {
    return '';
  }

  const rawQuery = search.slice(1);
  if (!rawQuery) {
    return '';
  }

  const params = new URLSearchParams(rawQuery);
  const candidate =
    params.get('username') ||
    params.get('user') ||
    params.get('name');

  const decode = (value) => {
    try {
      return decodeURIComponent(value.replace(/\+/g, ' '));
    } catch (error) {
      return value;
    }
  };

  if (candidate) {
    return decode(candidate).trim();
  }

  const firstSegment = rawQuery.split('&')[0] || '';

  if (!firstSegment) {
    return '';
  }

  if (firstSegment.includes('=')) {
    const [, value = ''] = firstSegment.split('=');
    return decode(value).trim();
  }

  return decode(firstSegment).trim();
}

function formatLabel(value) {
  if (!value && value !== 0) {
    return '';
  }

  const cleaned = String(value)
    .replace(/^[^:]*:/, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\//g, ' / ')
    .trim();

  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}


const presetUsername = getUsernameFromQuery();
if (presetUsername) {
  usernameInput.value = presetUsername;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}
