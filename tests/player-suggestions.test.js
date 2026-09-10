import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initPlayerSuggestions,
  rankPlayerSuggestions,
} from '../public/js/components/player-suggestions.js';
import { onRequest } from '../functions/api/players.js';
import { searchKnownPlayers } from '../functions/utils/leaderboard.js';

test('suggestions rank exact, prefix, then substring matches and deduplicate names', () => {
  const names = ['TheMassuus', 'MassuusTwo', 'massuus', 'MASSUUS', 'Other', '<script>'];
  assert.deepEqual(
    rankPlayerSuggestions(
      ' MASSUUS ',
      names.map((name) => ({ name }))
    ),
    [{ name: 'massuus' }, { name: 'MassuusTwo' }, { name: 'TheMassuus' }]
  );
});

test('suggestions are bounded and treat underscores literally', () => {
  assert.equal(
    rankPlayerSuggestions(
      'player',
      Array.from({ length: 20 }, (_, i) => ({ name: `Player${i}` }))
    ).length,
    6
  );
  assert.deepEqual(rankPlayerSuggestions('a_', [{ name: 'a_b' }, { name: 'axb' }]), [
    { name: 'a_b' },
  ]);
  assert.deepEqual(rankPlayerSuggestions('unknown', [{ name: 'KnownPlayer' }]), []);
});

test('merges linked and unlinked Twitch records and case variants from recent searches', () => {
  const linked = {
    name: 'YoMummaClaire',
    searchValue: 'YoMummaClaire',
    minecraftName: 'YoMummaClaire',
    twitchName: 'yomummaclaire',
  };
  const unlinked = {
    name: 'YoMummaClaire',
    searchValue: 'twitch:yomummaclaire',
    twitchName: 'yomummaclaire',
  };
  assert.deepEqual(rankPlayerSuggestions('yom', [unlinked, linked, { name: 'YOMUMMACLAIRE' }]), [
    linked,
  ]);
  const twitch = {
    name: 'masato_gaming',
    searchValue: 'twitch:masato_gaming',
    twitchName: 'masato_gaming',
  };
  assert.deepEqual(rankPlayerSuggestions('masa', [{ name: 'Masato_Gaming' }, twitch]), [twitch]);
});

test('matches companion aliases and Twitch names while keeping the correct lookup identity', () => {
  const companion = {
    name: 'Vault Friend',
    alias: 'Vault Friend',
    twitchName: 'long_twitch_player_name',
    minecraftName: '',
    searchValue: 'twitch:long_twitch_player_name',
    avatar: 'SkinExample',
  };
  assert.deepEqual(rankPlayerSuggestions('vault friend', [companion]), [companion]);
  assert.deepEqual(rankPlayerSuggestions('long_twitch_player', [companion]), [companion]);
  assert.deepEqual(rankPlayerSuggestions('skinexample', [companion]), []);
  const linked = { ...companion, minecraftName: 'LinkedPlayer', searchValue: 'LinkedPlayer' };
  assert.deepEqual(rankPlayerSuggestions('linked', [linked, { name: 'LinkedPlayer' }]), [linked]);
});

test('suggestion endpoint rejects writes and ignores short, invalid, or special queries', async () => {
  const env = {
    LEADERBOARD_DB: {
      prepare() {
        throw new Error('Must not query');
      },
    },
  };
  assert.equal(
    (await onRequest({ request: new Request('https://test/api/players', { method: 'POST' }), env }))
      .status,
    405
  );
  for (const q of ['', 'a', 'a'.repeat(33), "x' OR 1=1", 'twitch:massuus', 'server:eu']) {
    const response = await onRequest({
      request: new Request(`https://test/api/players?q=${encodeURIComponent(q)}`),
      env,
    });
    assert.deepEqual(await response.json(), { players: [] });
  }
});

test('missing player database leaves normal search usable', async () => {
  const response = await onRequest({
    request: new Request('https://test/api/players?q=mass'),
    env: {},
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { players: [] });
});

test('known-player query uses a bound literal and includes players with no unlocked sets', async () => {
  let query;
  let bound;
  const env = {
    LEADERBOARD_DB: {
      prepare(sql) {
        return {
          async run() {},
          bind(value) {
            query = sql;
            bound = value;
            return this;
          },
          async all() {
            return { results: [{ name: 'Mass_uus' }] };
          },
        };
      },
    },
  };
  assert.deepEqual(await searchKnownPlayers(env, 'MASS_'), [{ name: 'Mass_uus' }]);
  assert.equal(bound, 'mass_');
  assert.match(query, /FROM companion_leaderboard_players/);
  assert.match(query, /instr\(lower\(twitchName\), \?1\)/);
  assert.doesNotMatch(query, /sets_unlocked\s*>/);
});

test('dropdown preserves normal Enter, supports selection, and ignores stale responses', async (t) => {
  class Element extends EventTarget {
    children = [];
    attributes = new Map();
    value = '';
    hidden = true;
    setAttribute(key, value) {
      this.attributes.set(key, value);
    }
    removeAttribute(key) {
      this.attributes.delete(key);
    }
    replaceChildren() {
      this.children = [];
    }
    append(child) {
      this.children.push(child);
    }
    scrollIntoView() {}
  }
  const input = new Element();
  const form = new Element();
  const list = new Element();
  const status = new Element();
  const elements = {
    username: input,
    'search-form': form,
    'player-suggestions': list,
    'player-suggestions-status': status,
  };
  const originalDocument = globalThis.document;
  globalThis.document = {
    activeElement: input,
    getElementById: (id) => elements[id],
    createElement: () => new Element(),
  };
  t.after(() => {
    input.dispatchEvent(new Event('blur'));
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  });
  const pending = [];
  t.mock.method(globalThis, 'fetch', () => new Promise((resolve) => pending.push(resolve)));
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const submitted = [];
  form.requestSubmit = () => {
    submitted.push(input.value);
    form.dispatchEvent(new Event('submit'));
  };
  const key = (name) => {
    const event = new Event('keydown', { cancelable: true });
    Object.defineProperty(event, 'key', { value: name });
    input.dispatchEvent(event);
    return event;
  };
  const type = (value) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    t.mock.timers.tick(200);
  };
  const respond = async (resolve, names) => {
    resolve({ ok: true, json: async () => ({ players: names.map((name) => ({ name })) }) });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };
  initPlayerSuggestions();
  type('mas');
  await respond(pending.shift(), ['Massuus']);
  assert.equal(list.hidden, false);
  assert.equal(key('Enter').defaultPrevented, false);
  assert.equal(input.value, 'mas');
  assert.equal(key('ArrowDown').defaultPrevented, true);
  assert.equal(input.attributes.get('aria-activedescendant'), 'player-suggestion-0');
  assert.equal(key('Enter').defaultPrevented, true);
  assert.deepEqual(submitted, ['Massuus']);
  assert.equal(list.hidden, true);

  type('old');
  const old = pending.shift();
  type('new');
  await respond(pending.shift(), ['NewPlayer']);
  await respond(old, ['OldPlayer']);
  assert.equal(list.children[0].children[1].textContent, 'NewPlayer');
  assert.equal(
    list.children[0].children[0].src,
    '/proxy-img?url=https%3A%2F%2Fmc-heads.net%2Favatar%2FNewPlayer%2F32'
  );
  list.children[0].dispatchEvent(new Event('click'));
  assert.deepEqual(submitted, ['Massuus', 'NewPlayer']);

  const pointer = (target, type, y = 10) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerType: 'touch', clientX: 10, clientY: y });
    target.dispatchEvent(event);
  };
  type('touch');
  await respond(pending.shift(), ['TouchPlayer']);
  const touchOption = list.children[0];
  pointer(touchOption, 'pointerdown');
  globalThis.document.activeElement = null;
  input.dispatchEvent(new Event('blur'));
  assert.equal(list.hidden, false, 'keep suggestion available through touch blur');
  pointer(touchOption, 'pointerup');
  touchOption.dispatchEvent(new Event('click'));
  assert.deepEqual(submitted, ['Massuus', 'NewPlayer', 'TouchPlayer'], 'tap submits exactly once');
  assert.equal(list.hidden, true);
  globalThis.document.activeElement = input;

  type('scroll');
  await respond(pending.shift(), ['ScrollPlayer']);
  const scrollOption = list.children[0];
  pointer(scrollOption, 'pointerdown');
  pointer(scrollOption, 'pointermove', 50);
  pointer(scrollOption, 'pointerup', 50);
  scrollOption.dispatchEvent(new Event('click'));
  assert.equal(submitted.length, 3, 'scrolling must not select a player');
  pointer(scrollOption, 'pointerdown');
  pointer(scrollOption, 'pointercancel');
  scrollOption.dispatchEvent(new Event('click'));
  assert.equal(submitted.length, 3, 'cancelled touches must not select a player');

  type('nobody');
  await respond(pending.shift(), []);
  assert.equal(list.hidden, true);
  assert.equal(key('Enter').defaultPrevented, false);
  assert.equal(input.value, 'nobody');

  type('pending');
  key('Escape');
  await respond(pending.shift(), ['PendingPlayer']);
  assert.equal(list.hidden, true);
});
