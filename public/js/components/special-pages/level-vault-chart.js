const chartScale = (maximum) => {
  const target = Math.max(1, maximum / 5);
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const step = Math.max(
    1,
    [1, 2, 2.5, 5, 10].find((value) => value * magnitude >= target) * magnitude
  );
  const max = Math.max(step, Math.ceil(maximum / step) * step);
  return { max, ticks: Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step) };
};

export function renderLevelVaultCharts(streamers, escapeHtml, streamerName) {
  if (!streamers.every((row) => Array.isArray(row.levelVaultPoints)))
    return '<p>Level and vault graphs will appear after the next statistics update.</p>';
  const format = (value) => value.toLocaleString();
  return streamers
    .map((row) => {
      const title = `${streamerName(row.login)}: companion level vs vaults joined`;
      if (!row.count)
        return `<article class="streamer-stats__distribution"><h4>${escapeHtml(streamerName(row.login))}</h4><p>No companions in this group.</p></article>`;
      const points = row.levelVaultPoints;
      const levels = chartScale(points.reduce((max, point) => Math.max(max, point.level), 0));
      const vaults = chartScale(points.reduce((max, point) => Math.max(max, point.vaults), 0));
      const x = (level) => 76 + (level / levels.max) * 650;
      const y = (joined) => 326 - (joined / vaults.max) * 300;
      const grid =
        levels.ticks
          .map(
            (value) =>
              `<path class="streamer-stats__grid" d="M${x(value)} 26V326"/><text x="${x(value)}" y="350" text-anchor="middle">${format(value)}</text>`
          )
          .join('') +
        vaults.ticks
          .map(
            (value) =>
              `<path class="streamer-stats__grid" d="M76 ${y(value)}H726"/><text x="64" y="${y(value) + 5}" text-anchor="end">${format(value)}</text>`
          )
          .join('');
      const dots = [...row.levelVaultPoints]
        .sort((a, b) => b.count - a.count)
        .map((point) => {
          const label = `Level ${point.level}, ${point.vaults} vaults joined: ${point.count} companion${point.count === 1 ? '' : 's'}`;
          return `<circle cx="${x(point.level)}" cy="${y(point.vaults)}" r="${Math.min(5.5, 2.5 + Math.log2(point.count + 1) * 0.45)}"><title>${escapeHtml(label)}</title></circle>`;
        })
        .join('');
      return `<article class="streamer-stats__distribution streamer-stats__chart"><h4>${escapeHtml(streamerName(row.login))}<span>${format(row.count)} companions</span></h4><div class="streamer-stats__plot-scroll" tabindex="0" role="region" aria-label="${escapeHtml(title)}"><svg class="streamer-stats__scatter" viewBox="0 0 760 400" role="img" aria-label="${escapeHtml(title)}"><title>${escapeHtml(title)}</title>${grid}<path class="streamer-stats__axis" d="M76 26V326H726"/>${dots}<text class="streamer-stats__axis-label" x="401" y="388" text-anchor="middle">Companion season level</text><text class="streamer-stats__axis-label" transform="translate(22 176) rotate(-90)" text-anchor="middle">Vaults joined</text></svg></div><p class="streamer-stats__chart-key"><span aria-hidden="true">&#9679;</span> Larger dots = more companions at the same level and vault count. Hover a dot for exact values.</p></article>`;
    })
    .join('');
}
