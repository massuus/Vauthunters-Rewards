function when(value) {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Not yet';
}
export function healthIssue(code) {
  if (code === 'socket-closed-early')
    return 'The extension connection closed before every leaderboard page arrived. No partial data was uploaded.';
  if (
    [
      'invalid-pagination',
      'pagination-changed',
      'invalid-page-json',
      'empty-intermediate-page',
      'invalid-companion-response',
    ].includes(code)
  )
    return 'The extension returned incomplete or unexpected data. Existing website data was kept; repeated failures may need a collector update.';
  if (
    [
      'run-time-limit',
      'socket-time-limit',
      'socket-idle-timeout',
      'request-limit',
      'browser-byte-limit',
      'socket-byte-limit',
    ].includes(code)
  )
    return 'Collection hit a time or resource limit. Existing website data was kept; a later eligible attempt can try again.';
  if (['login-or-extension-access-required', 'extension-access-rejected'].includes(code))
    return 'Twitch login or extension access is required. Use the “Renew VH Twitch Login” desktop shortcut. If this persists, check extension access on that channel.';
  if (code === 'empty-result')
    return 'The extension returned no players. A missing companion may be the reason. Existing website data was kept.';
  if (['upload-http-401', 'upload-http-403'].includes(code))
    return 'The website rejected the upload key. Ask for the Oracle upload configuration to be checked; renewing Twitch alone will not fix this.';
  if (code === 'upload-http-409')
    return 'This upload was older than, or conflicted with, data already received by the website.';
  if (code?.startsWith('upload-'))
    return 'The website upload failed. Delivery is retried up to three times; the existing leaderboard is preserved.';
  if (code === 'companion-socket-not-found')
    return 'The Vault Hunters extension did not connect. The stream may have ended or the extension may be unavailable.';
  return 'Collection did not finish. The existing leaderboard was kept; a later eligible attempt can try again.';
}

export function renderCollectorHealth(data, escapeHtml) {
  const report = data.report;
  if (!report)
    return '<p class="companion-health__alert">No collector check-in has been received yet. Check that the Oracle collector is running and can reach this website.</p>';
  const now = Date.parse(data.serverTime);
  const expires = Date.parse(report.cookieExpiresAt);
  const loginNeeded = report.sessionFile === 'missing' || expires <= now;
  const expiring = !loginNeeded && expires - now <= 7 * 86400_000;
  const failures = report.channels.some(
    (c) => c.lastCollection?.status === 'failed' || c.lastUpload?.status === 'failed'
  );
  const join = report.autoJoin;
  const joinStale = join && now - Date.parse(join.checkedAt) > 3 * 60_000;
  const joinProblems =
    !join ||
    joinStale ||
    join.state === 'stopped' ||
    join.mode !== 'active' ||
    join.liveCheck === 'failed' ||
    join.channels.some((c) => c.issue || (c.live && !c.connected));
  const attention =
    data.stale ||
    loginNeeded ||
    expiring ||
    failures ||
    report.collectorState === 'stopped' ||
    report.liveCheck === 'failed' ||
    joinProblems;
  const title = data.stale
    ? 'Collector has stopped checking in'
    : attention
      ? 'Needs attention'
      : 'Collector is checking in';
  const warnings = [];
  if (data.stale)
    warnings.push(
      'No check-in for more than 45 minutes. Oracle may be stopped, offline, or unable to authenticate with the website. These are the last known results.'
    );
  if (report.collectorState === 'stopped')
    warnings.push(
      'The collector reported that it stopped. Ask for its saved state and configuration to be checked.'
    );
  if (report.liveCheck === 'failed')
    warnings.push(
      'Twitch live-status checks failed. This can be a network or Twitch app-credential problem; it does not necessarily mean the browser login expired.'
    );
  if (loginNeeded)
    warnings.push(
      'The saved Twitch login is missing or its cookie has expired. Run “Renew VH Twitch Login” on your PC.'
    );
  else if (expiring)
    warnings.push(
      'The saved Twitch cookie expires within seven days. Renew it using the desktop shortcut when convenient.'
    );
  if (!join)
    warnings.push(
      'Automatic joining has not reported a status yet. Chat detection remains the fallback.'
    );
  else if (joinStale || join.state === 'stopped')
    warnings.push(
      'Automatic joining is not checking in. Chat detection remains available, but the socket process needs attention.'
    );
  else if (join.mode !== 'active')
    warnings.push('Automatic joining is in passive test mode and will not send a WebSocket join.');
  else if (join.liveCheck === 'failed')
    warnings.push('Automatic joining could not check which Twitch channels are live.');
  const joinText = (c) => {
    if (c.outcome === 'confirmed')
      return `Joined and confirmed via ${c.method === 'socket' ? 'WebSocket' : 'chat'}`;
    if (c.outcome === 'unconfirmed')
      return 'A join was sent but could not be confirmed; it will not be repeated blindly';
    if (c.outcome === 'chat-sent') return 'Joined using chat fallback';
    if (c.outcome === 'chat-failed') return 'Chat fallback failed';
    if (c.live && c.connected) return c.windowOpen ? 'Join window detected' : 'WebSocket connected';
    if (c.live && c.status === 'connecting') return 'Connecting';
    if (c.live) return 'Chat fallback available; socket retries after ten minutes';
    return 'Offline';
  };
  const joinRows = join
    ? join.channels
        .map(
          (c) =>
            `<li class="companion-health__channel"><div class="companion-health__channel-heading"><strong>${escapeHtml(c.streamer)}</strong><span>${escapeHtml(joinText(c))}</span></div><p>Last join window: ${escapeHtml(when(c.lastWindowAt))} · Last action: ${escapeHtml(when(c.lastActionAt))}${c.notificationFailed ? ' · Discord notification failed' : ''}</p></li>`
        )
        .join('')
    : '';
  const cards = report.channels
    .map((c) => {
      const stored = data.imports?.find((item) => item.streamer === c.streamer);
      const collection = c.lastCollection;
      const upload = c.lastUpload;
      const issues = [];
      if (collection?.status === 'failed') {
        const newerLogin =
          ['login-or-extension-access-required', 'extension-access-rejected'].includes(
            collection.code
          ) && Date.parse(report.sessionSavedAt) > Date.parse(collection.time);
        issues.push(
          newerLogin
            ? 'The last attempt needed login access. A newer saved login is present; waiting for another collection to confirm recovery.'
            : healthIssue(collection.code)
        );
      }
      if (upload?.status === 'failed') issues.push(healthIssue(upload.code));
      const result = c.pending
        ? 'Waiting for upload'
        : collection?.status === 'failed'
          ? 'Collection failed'
          : upload?.status === 'failed'
            ? 'Upload failed'
            : stored
              ? 'Data received'
              : collection?.status === 'collected'
                ? 'Collected'
                : 'Waiting for a live stream';
      return `<li class="companion-health__channel">
      <div class="companion-health__channel-heading"><strong>${escapeHtml(c.streamer)}</strong><span>${escapeHtml(result)}</span></div>
      <p>${c.live ? 'Live at last check' : report.liveCheck === 'ok' ? 'Offline at last check' : 'Live status unknown'} · Last attempt: ${escapeHtml(when(collection?.time))}</p>
      <p>Website received: ${escapeHtml(when(stored?.importedAt || c.lastUploadedAt))}${stored ? ` · ${Number(stored.players).toLocaleString()} players` : ''}</p>
      ${stored ? `<p>Data collected: ${escapeHtml(when(stored.collectedAt))}</p>` : ''}
      ${c.nextAttempt ? `<p>Next eligible collection: ${escapeHtml(when(c.nextAttempt))} (when live and within the daily limit)</p>` : ''}
      ${issues.map((message) => `<p class="companion-health__alert">${escapeHtml(message)}</p>`).join('')}
    </li>`;
    })
    .join('');
  return `<p class="companion-health__summary${attention ? ' companion-health__summary--warning' : ''}">${escapeHtml(title)}</p>
    <p>Last check-in: ${escapeHtml(when(data.receivedAt))} · ${Number(report.attemptsToday)} / 14 attempts today (UTC)</p>
    ${warnings.map((message) => `<p class="companion-health__alert">${escapeHtml(message)}</p>`).join('')}
    <p>Saved Twitch cookie expires: ${escapeHtml(report.cookieExpiresAt ? when(report.cookieExpiresAt) : 'Unknown')}. Twitch can invalidate it earlier; this date does not guarantee login access.</p>
    <details class="companion-health__help"><summary>How to renew the login</summary><p>On your PC, open “Renew VH Twitch Login” on the desktop, sign in, close the dedicated Edge window, then press Enter and wait for the green completion message.</p></details>
    <h4>Automatic joining</h4>
    ${join ? `<p>${join.mode === 'active' ? 'Active' : 'Passive'} · ${Number(join.connectionsToday)} socket connections today · ${(Number(join.socketBytesToday) / 1024).toFixed(0)} KiB received</p><ul class="companion-health__channels">${joinRows}</ul>` : '<p>Status unavailable; chat detection remains enabled.</p>'}
    <h4>Leaderboard collection</h4>
    <ul class="companion-health__channels">${cards}</ul>`;
}

export function mountCollectorHealth(element, { apiRequest, escapeHtml, isActive }) {
  let disposed = false;
  let timer;
  let busy = false;
  element.innerHTML = `<div class="companion-health__heading"><h3>Automatic leaderboard updates</h3><button type="button" class="leaderboard-admin__button" data-health-refresh>Refresh status</button></div><div data-health-content aria-live="polite"><p>Loading collector status…</p></div><p class="companion-health__footnote">Only administrators can see this panel. Refreshes every minute while this page is visible.</p>`;
  const content = element.querySelector('[data-health-content]');
  const button = element.querySelector('[data-health-refresh]');
  const refresh = async () => {
    if (disposed || !isActive() || busy) return;
    busy = true;
    button.disabled = true;
    try {
      const data = await apiRequest('/api/admin/companion-health', { cache: 'no-store' });
      if (!disposed && isActive()) content.innerHTML = renderCollectorHealth(data, escapeHtml);
    } catch {
      if (!disposed && isActive())
        content.innerHTML =
          '<p class="companion-health__alert">Status could not be loaded. Check your connection and that you are still signed in as an administrator, then refresh.</p>';
    } finally {
      busy = false;
      button.disabled = false;
    }
  };
  const schedule = () => {
    timer = setTimeout(async () => {
      if (disposed || !isActive()) return;
      if (!document.hidden) await refresh();
      schedule();
    }, 60000);
  };
  button.addEventListener('click', refresh);
  void refresh();
  schedule();
  return () => {
    disposed = true;
    clearTimeout(timer);
    button.removeEventListener('click', refresh);
  };
}
