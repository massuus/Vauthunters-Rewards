import test from 'node:test';
import assert from 'node:assert/strict';
import { bindRewardCardSize } from '../public/js/features/reward-card-size.js';

function controls() {
  let change;
  const select = {
    value: '',
    addEventListener(type, handler) {
      change = handler;
    },
  };
  const root = {
    size: null,
    querySelector() {
      return select;
    },
    setAttribute(name, value) {
      assert.equal(name, 'data-reward-card-size');
      this.size = value;
    },
  };
  return {
    root,
    select,
    change(value) {
      select.value = value;
      change();
    },
  };
}

test('card size applies saved settings, switches layouts, and survives profile rerenders', () => {
  const original = globalThis.localStorage;
  const storage = new Map([['vh.rewardCardSize', 'compact']]);
  globalThis.localStorage = {
    getItem: (key) => storage.get(key),
    setItem: (key, value) => storage.set(key, value),
  };
  try {
    const first = controls();
    bindRewardCardSize(first.root);
    assert.equal(first.root.size, 'compact');
    assert.equal(first.select.value, 'compact');
    first.change('small');
    assert.equal(first.root.size, 'small');
    assert.equal(storage.get('vh.rewardCardSize'), 'small');
    const nextProfile = controls();
    bindRewardCardSize(nextProfile.root);
    assert.equal(nextProfile.root.size, 'small');
    nextProfile.change('unexpected');
    assert.equal(nextProfile.root.size, 'regular');
    globalThis.localStorage = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
    };
    const privateProfile = controls();
    assert.doesNotThrow(() => bindRewardCardSize(privateProfile.root));
    assert.doesNotThrow(() => privateProfile.change('compact'));
    assert.equal(privateProfile.root.size, 'compact');
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
});
