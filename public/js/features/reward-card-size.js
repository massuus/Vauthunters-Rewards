const STORAGE_KEY = 'vh.rewardCardSize';
const SIZES = ['regular', 'compact', 'small'];
let selectedSize = 'regular';

export function bindRewardCardSize(root) {
  const select = root.querySelector('[data-card-size-control]');
  if (!select) return;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (SIZES.includes(saved)) selectedSize = saved;
  } catch {}

  const apply = (value) => {
    selectedSize = SIZES.includes(value) ? value : 'regular';
    select.value = selectedSize;
    root.setAttribute('data-reward-card-size', selectedSize);
  };
  apply(selectedSize);
  select.addEventListener('change', () => {
    apply(select.value);
    try {
      localStorage.setItem(STORAGE_KEY, selectedSize);
    } catch {}
  });
}
