const validAmount = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function getRewardShop(item) {
  // A zero/negative base cost is used for rewards that are not sold.
  if (!(validAmount(item?.cost) && item.cost > 0) || typeof item.unavailable !== 'boolean') {
    return null;
  }
  const discount = validAmount(item.discount) && item.discount <= 1 ? item.discount : 0;
  return {
    available: !item.unavailable,
    cost: item.cost,
    price: validAmount(item.price) ? item.price : Math.round(item.cost * (1 - discount)),
    discount,
    featured: item.featured === true,
    description: typeof item.description === 'string' ? item.description : '',
  };
}

export function mergeApiSets(localSets, apiSets) {
  const merged = { ...localSets };
  for (const item of Array.isArray(apiSets) ? apiSets : []) {
    if (
      typeof item?.id !== 'string' ||
      !item.id ||
      ['__proto__', 'constructor', 'prototype'].includes(item.id)
    )
      continue;
    const local = Object.hasOwn(merged, item.id) ? merged[item.id] : null;
    const shop = getRewardShop(item);
    merged[item.id] = {
      label: item.displayName,
      description: item.description || undefined,
      obtainable: typeof item.unavailable === 'boolean' ? !item.unavailable : undefined,
      ...local,
      shop,
      ...(shop?.available ? { obtainable: true, upcoming: false } : {}),
    };
  }
  return merged;
}

export function getLockedRewardDescription(asset, fallback = 'Unlockable reward') {
  return asset?.descriptionLocked || asset?.description || asset?.shop?.description || fallback;
}

export function renderRewardShop(asset, isOwned = false) {
  const shop = asset?.shop;
  if (isOwned || !shop?.available) return '';
  const number = (value) => value.toLocaleString('en-US');
  const onSale = shop.discount > 0 && shop.price < shop.cost;
  return `<div class="reward-shop">
    <details class="reward-shop__info">
      <summary class="reward-shop__badge" title="Purchase in the official Vault Hunters companion extension.">Available in shop</summary>
      <span class="reward-shop__hint">Purchase in the official Vault Hunters companion extension.</span>
    </details>
    <span class="reward-shop__price">${onSale ? `<s>${number(shop.cost)}</s> ` : ''}<strong>${number(shop.price)}</strong><img class="reward-shop__gem" src="/img/gemstone.png" alt="Gemstone" width="20" height="20"></span>
    ${onSale ? `<span class="reward-shop__discount">${Math.round(shop.discount * 100)}% off</span>` : ''}
  </div>`;
}
