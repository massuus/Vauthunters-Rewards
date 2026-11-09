export function renderPlayerButton(player, proxiedImageUrl, escapeHtml) {
  const ign = String(player?.ign || '').trim();
  if (!ign) return '';

  const safeIgn = escapeHtml(ign);
  const avatarUrl = proxiedImageUrl(
    `https://mc-heads.net/avatar/${encodeURIComponent(player?.uuid || ign)}/64`
  );

  return `
    <button class="recent-item server-player" type="button" data-player-name="${safeIgn}">
      <img src="${avatarUrl}" alt="${safeIgn}'s head" width="28" height="28">
      <span>${safeIgn}</span>
    </button>
  `;
}

export function bindPlayerButtons(resultContainer, usernameInput, form) {
  resultContainer.querySelectorAll('[data-player-name]').forEach((button) => {
    button.addEventListener('click', () => {
      const name = button.getAttribute('data-player-name') || '';
      if (!name) return;
      usernameInput.value = name;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  });
}
