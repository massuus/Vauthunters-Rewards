// Public metadata only. Texture paths are restricted to the official badge sprite directory.
export function sanitizeBadgeCatalog(value) {
  if (
    !value ||
    !Number.isFinite(Date.parse(value.checkedAt)) ||
    !Array.isArray(value.badges) ||
    !value.badges.length ||
    value.badges.length > 250
  )
    return null;
  const badges = value.badges.map((badge) => {
    const display = badge?.display;
    if (
      !/^vhcompanions:[a-z0-9_]+$/.test(badge?.id || '') ||
      typeof display?.displayName !== 'string' ||
      !display.displayName ||
      typeof display?.description !== 'string' ||
      !/^vhcompanions:gui\/badges\/[a-z0-9_]+$/.test(display?.texture || '')
    )
      return null;
    return {
      id: badge.id,
      display: {
        displayName: display.displayName.slice(0, 128),
        description: display.description.slice(0, 512),
        texture: display.texture,
      },
    };
  });
  if (
    badges.some((badge) => !badge) ||
    new Set(badges.map((badge) => badge.id)).size !== badges.length
  )
    return null;
  return { checkedAt: new Date(value.checkedAt).toISOString(), badges };
}

export function catalogBadge(badge) {
  const { display } = badge;
  const season = display.description.match(/season\s+([123])/i);
  const text = `${badge.id} ${display.displayName} ${display.description} ${display.texture}`;
  const category =
    badge.id === 'vhcompanions:hallo_bomb'
      ? 'special'
      : /jackpot/i.test(text)
        ? 'jackpot'
        : /\b\d+(?:[.,]\d+)?\s*k\s+companions\b/i.test(display.displayName)
          ? 'companion-milestones'
          : /halloween|christmas|valentine/i.test(text)
            ? 'seasonal'
            : season
              ? `season-${season[1]}`
              : /tier_|patreon/i.test(text)
                ? 'patreon'
                : /streak/i.test(text)
                  ? 'streaks'
                  : /event|hytale|pubg|corrupted|chicken_dinner|100th|treasure.train/i.test(text)
                    ? 'events'
                    : 'special';
  return {
    id: badge.id,
    name: display.displayName,
    description: display.description,
    category,
    image: `https://ebs.vaulthunters.gg/assets/sprites/badges/${display.texture.split('/').at(-1)}.png`,
  };
}
