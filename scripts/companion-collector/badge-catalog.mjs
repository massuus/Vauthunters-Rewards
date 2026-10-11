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
  const category = season
    ? `season-${season[1]}`
    : /tier_|patreon/i.test(text)
      ? 'patreon'
      : /streak/i.test(text)
        ? 'streaks'
        : /halloween|christmas|valentine|event|hytale|pubg|corrupted|chicken_dinner|hallo_bomb|\d[,_]?000 companions|100th|treasure.train|jackpot/i.test(
              text
            )
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
