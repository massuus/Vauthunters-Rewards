import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { companionAnimation } from '../public/js/features/reward-model-animation.js';
import { cubeFaces, createCubeGeometry } from '../public/js/features/reward-model-geometry.js';
import {
  animationNumber,
  sampleChannel,
  companionState,
} from '../public/js/features/reward-model-animation.js';
import { renderRewardModelPreview } from '../public/js/features/reward-model-preview.js';

function pngSize(source) {
  const bytes = Buffer.from(source.split(',', 2)[1], 'base64');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

test('keyframes interpolate and clamp, including zero-scale blinks', () => {
  const blink = {
    0: { vector: [1, 1, 1] },
    0.25: { vector: [1, 0, 1] },
    0.5: { vector: [1, 1, 1] },
  };
  assert.deepEqual(sampleChannel(blink, 0.125, []), [1, 0.5, 1]);
  assert.deepEqual(sampleChannel(blink, 0.25, []), [1, 0, 1]);
  assert.deepEqual(sampleChannel(blink, 5, []), [1, 1, 1]);
  assert.deepEqual(sampleChannel(blink, -1, []), [1, 1, 1]);
  assert.equal(animationNumber('1 + math.sin(q.anim_time * 90) * 0.02', 1), 1.02);
  assert.throws(() => animationNumber('globalThis.alert(1)', 0), /Unsupported/);
});

test('all extracted companion clips can be sampled without unsupported expressions', async () => {
  const data = JSON.parse(
    await readFile(new URL('../public/data/models/golden-baby-creeper.json', import.meta.url))
  );
  const names = new Set(data.geometry.bones.map((bone) => bone.name));
  for (const clip of Object.values(data.animations)) {
    for (const [name, channels] of Object.entries(clip.bones)) {
      assert.ok(names.has(name), `Missing animation bone ${name}`);
      for (const [type, channel] of Object.entries(channels)) {
        for (let time = 0; time <= (clip.animation_length || 4); time += 0.05) {
          const vector = sampleChannel(channel, time, type === 'scale' ? [1, 1, 1] : [0, 0, 0]);
          assert.equal(vector.length, 3);
          assert.ok(vector.every(Number.isFinite));
        }
      }
    }
  }
  assert.equal(companionState(false, 10), 'idle');
  assert.equal(companionState(false, 10, true), 'run');
  assert.equal(companionState(true, 1, true), 'sleep');
  assert.equal(companionState(true, 3, true), 'sleepy');
  assert.equal(companionState(true, 1), 'sleep');
  assert.equal(companionState(true, 3), 'sleepy');
});

test('Slimey keeps its translucent outer shell', async () => {
  const slimey = JSON.parse(
    await readFile(new URL('../public/data/models/patreon-legend-pet.json', import.meta.url))
  );
  assert.equal(slimey.translucent, true);
  assert.ok(slimey.geometry.bones.some((bone) => bone.name === 'OutterSlime'));
  assert.ok(slimey.geometry.bones.some((bone) => bone.name === 'Face'));
});

test('all card previews share one scissored WebGL renderer and animation clock', async () => {
  const source = await readFile(
    new URL('../public/js/features/reward-model-renderer.js', import.meta.url),
    'utf8'
  );
  assert.equal((source.match(/new THREE\.WebGLRenderer/g) || []).length, 1);
  assert.match(source, /renderer\.setScissor\(/);
  assert.match(source, /transferToImageBitmap/);
  assert.match(source, /getContext\('bitmaprenderer'\)/);
  assert.match(source, /elapsed = reduced\.matches \? 0 : now \/ 1000/);
  assert.doesNotMatch(source, /rendererPool|renderCursor/);
});

test('mapped rewards opt into 3D without downloading modeled fallback artwork', () => {
  const fallback = '<img src="fallback.gif">';
  assert.equal(renderRewardModelPreview('other', fallback), fallback);
  assert.match(renderRewardModelPreview('baby_creeper_gold', fallback), /data-companion/);
  assert.doesNotMatch(renderRewardModelPreview('baby_creeper_gold', fallback), /fallback\.gif/);
  assert.doesNotMatch(renderRewardModelPreview('terra_weapons', fallback), /fallback\.gif/);
  assert.doesNotMatch(renderRewardModelPreview('i85_spring_set', fallback), /reward-model-artwork/);
});

test('extracted weapons stay unpublished and retain complete source data', async () => {
  const definitions = JSON.parse(
    await readFile(new URL('../scripts/reward-models/weapons.json', import.meta.url))
  );
  const catalog = JSON.parse(
    await readFile(new URL('../public/data/models/catalog.json', import.meta.url))
  );
  assert.equal(Object.values(catalog).filter((entry) => !entry.companion).length, 50);
  for (const key of Object.keys(definitions)) {
    const entry = { model: key.replaceAll('_', '-') };
    const data = JSON.parse(
      await readFile(new URL(`../public/data/models/${entry.model}.json`, import.meta.url))
    );
    assert.equal(data.kind, 'items');
    for (const entry of data.models) {
      const models = entry.outfit || [entry];
      for (const model of models) {
        if (model.nodes) {
          assert.ok(model.nodes.length > 0);
          assert.ok(model.nodes.some((node) => node.cubes.length > 0));
          assert.equal(model.textureSize.length, 2);
          assert.ok(model.textureSize.every((value) => Number.isFinite(value) && value > 0));
          continue;
        }
        assert.ok(model.elements.length > 0);
        assert.equal(model.textureSize.length, 2);
        assert.ok(model.textureSize.every((value) => Number.isFinite(value) && value > 0));
        assert.equal(model.display.gui.rotation.length, 3);
        assert.equal((model.display.gui.scale || [1, 1, 1]).length, 3);
        // Java item-model UV coordinates are always expressed in Minecraft's
        // standard 0-16 range; textureSize is source-sheet metadata only.
        const coordinates = model.elements.flatMap((element) =>
          Object.values(element.faces).flatMap((face) => face.uv || [])
        );
        assert.ok(coordinates.every((value) => value >= 0 && value <= 16));
        for (const element of model.elements) {
          for (const face of Object.values(element.faces)) {
            const texture = model.textures[face.texture.slice(1)];
            assert.match(texture.source, /^data:image\/png;base64,/);
            assert.ok(Number.isFinite(texture.uvAspect) && texture.uvAspect > 0);
          }
        }
      }
    }
  }
});

test('spring armor uses the same visible body parts as the in-game armor layers', async () => {
  const spring = JSON.parse(
    await readFile(new URL('../public/data/models/i85-spring-set.json', import.meta.url))
  );
  assert.equal(spring.models[0].outfit.length, 4);
  const [helmet, chestplate, leggings, boots] = spring.models[0].outfit;
  assert.ok(
    spring.models[0].outfit.every((piece) => piece.preserveFlatFaces),
    'Flowery Madness must retain both authored sides of its petals, leaves and wings'
  );
  const rootNames = (model) =>
    model.nodes
      .filter((node) => node.parent === 'root')
      .map((node) => node.name)
      .sort();
  assert.deepEqual(rootNames(helmet), ['head']);
  assert.deepEqual(rootNames(chestplate), ['body', 'left_arm', 'right_arm']);
  assert.deepEqual(rootNames(leggings), ['body', 'left_leg', 'right_leg']);
  assert.deepEqual(rootNames(boots), ['left_leg', 'right_leg']);
  assert.deepEqual(leggings.nodes.find((node) => node.name === 'body').cubes[0], {
    from: [-4, 0, -2],
    size: [8, 12, 4],
    inflate: 0,
    uv: [16, 16],
    mirror: false,
  });
});

test('late reward batch retains its exact in-game models and armor layers', async () => {
  const catalog = JSON.parse(
    await readFile(new URL('../public/data/models/catalog.json', import.meta.url))
  );
  const expected = {
    forsaken_set: ['outfit', 4],
    halloween_magnet: ['elements', 1],
    bat_chestplate_transmog: ['nodes', 13],
    bat_axe_transmog: ['elements', 39],
    i85_royale_crown: ['nodes', 3],
    companion_leader_s1: ['outfit', 4],
    dylan_vip: ['outfit', 4],
  };
  for (const [key, [kind, count]] of Object.entries(expected)) {
    const entry = catalog[key];
    assert.ok(entry, `${key} is published in the 3D catalog`);
    const data = JSON.parse(
      await readFile(new URL(`../public/data/models/${entry.model}.json`, import.meta.url))
    );
    const model = data.models[0];
    assert.equal(model[kind].length, count, `${key} keeps its complete ${kind}`);
  }
  const magnet = JSON.parse(
    await readFile(new URL('../public/data/models/halloween-magnet.json', import.meta.url))
  ).models[0];
  assert.deepEqual(pngSize(magnet.textures['0'].source), [16, 16]);
  const dylan = JSON.parse(
    await readFile(new URL('../public/data/models/dylan-vip.json', import.meta.url))
  ).models[0].outfit;
  assert.deepEqual(
    dylan.map((piece) => piece.textureSize),
    [
      [256, 256],
      [256, 256],
      [64, 64],
      [256, 256],
    ]
  );
  assert.equal(dylan[1].preserveFlatFaces, true);
  assert.deepEqual(Object.keys(dylan[1].animations).sort(), ['WingLeft', 'WingRight']);

  const bat = JSON.parse(
    await readFile(new URL('../public/data/models/bat-chestplate-transmog.json', import.meta.url))
  ).models[0];
  assert.deepEqual(bat.textureSize, [128, 128]);
  assert.equal(bat.preserveFlatFaces, true);
  assert.ok(bat.nodes.some((node) => node.name === 'Bat'));

  for (const name of ['green-christmas-hat', 'i85-royale-crown']) {
    const model = JSON.parse(
      await readFile(new URL(`../public/data/models/${name}.json`, import.meta.url))
    ).models[0];
    assert.equal(model.previewScale, 0.6);
  }

  const dylanSet = JSON.parse(
    await readFile(new URL('../public/data/models/dylan-vip.json', import.meta.url))
  );
  assert.equal(dylanSet.models.length, 6);
  assert.ok(dylanSet.models[0].outfit);
  assert.deepEqual(
    dylanSet.models.slice(1).map((model) => model.elements.length),
    [45, 58, 44, 30, 57]
  );

  const lostChristmas = JSON.parse(
    await readFile(new URL('../public/data/models/lost-christmas-axe.json', import.meta.url))
  );
  assert.deepEqual(
    lostChristmas.models.map((model) => model.elements.length),
    [27, 25]
  );
});

test('Patreon rewards use their dedicated in-game geometry and separate bonus gear', async () => {
  const expected = {
    'patreon-dweller-gear': [
      ['outfit', [10]],
      ['item', 15],
      ['item', 13],
    ],
    'patreon-cheeser-gear': [
      ['outfit', [2, 9, 5, 4]],
      ['item', 32],
    ],
    'patreon-goblin-gear': [
      ['outfit', [4, 9, 11, 5]],
      ['item', 8],
    ],
    'patreon-champion-gear': [
      ['outfit', [7, 23, 7, 6]],
      ['item', 57],
      ['item', 6],
    ],
  };
  for (const [name, shapes] of Object.entries(expected)) {
    const data = JSON.parse(
      await readFile(new URL(`../public/data/models/${name}.json`, import.meta.url))
    );
    assert.equal(data.cycleItems, true, `${name} cycles outfit and bonus gear separately`);
    assert.deepEqual(
      data.models.map((model) =>
        model.outfit
          ? ['outfit', model.outfit.map((piece) => piece.nodes.length)]
          : ['item', model.nodes?.length || model.elements.length]
      ),
      shapes
    );
  }
});

test('key item models retain real texture atlases instead of placeholders', async () => {
  const expected = {
    'i85-treasure-train': [128, 128],
    'golden-kappa': [128, 128],
    'golden-club': [128, 128],
    'terra-weapons': [128, 128],
    'i85-server-bingos': [128, 128],
    'iskall85-falcon-helmet': [128, 128],
    'iskall85-falcon-chestplate': [128, 128],
    'iskall85-ancient-scroll': [128, 128],
    doomslayer: [128, 128],
    'sculk-set': [128, 128],
    'essence-of-iskallium': [64, 64],
    'hypefuse-scepter': [64, 64],
  };
  for (const [name, minimum] of Object.entries(expected)) {
    const data = JSON.parse(
      await readFile(new URL(`../public/data/models/${name}.json`, import.meta.url))
    );
    for (const entry of data.models) {
      for (const model of entry.outfit || [entry]) {
        for (const texture of Object.values(model.textures)) {
          const [width, height] = pngSize(texture.source);
          assert.ok(width >= minimum[0], `${name} texture width is ${width}`);
          assert.ok(height >= minimum[1], `${name} texture height is ${height}`);
          assert.ok(Buffer.from(texture.source.split(',', 2)[1], 'base64').length > 256);
        }
      }
    }
  }
});

test('server bingo chestplate retains its in-game body and both arm roots', async () => {
  const bingo = JSON.parse(
    await readFile(new URL('../public/data/models/i85-server-bingos.json', import.meta.url))
  );
  assert.equal(bingo.models.length, 1);
  assert.deepEqual(
    bingo.models[0].nodes
      .filter((node) => node.parent === 'root')
      .map((node) => node.name)
      .sort(),
    ['body', 'left_arm', 'right_arm']
  );
});

test('falcon armor preserves its exact in-game mechanical animations', async () => {
  const helmet = JSON.parse(
    await readFile(new URL('../public/data/models/iskall85-falcon-helmet.json', import.meta.url))
  ).models[0];
  const chestplate = JSON.parse(
    await readFile(
      new URL('../public/data/models/iskall85-falcon-chestplate.json', import.meta.url)
    )
  ).models[0];
  assert.deepEqual(helmet.animations.Propeler, {
    axis: 'y',
    turnsPerSecond: 10 / 3.6,
  });
  assert.equal(helmet.previewTilt, -0.32);
  assert.deepEqual(chestplate.animations.Cog, {
    axis: 'x',
    turnsPerSecond: 2.5 / 3.6,
  });
  const propeller = helmet.nodes.find((node) => node.name === 'Propeler');
  assert.equal(propeller.cubes.length, 2);
  assert.ok(propeller.cubes.every((cube) => cube.size[1] === 0));
});

test('doomslasher culls its hidden coplanar join faces', async () => {
  const doomslasher = JSON.parse(
    await readFile(new URL('../public/data/models/doomslayer.json', import.meta.url))
  ).models[0];
  const removed = {
    0: ['west', 'up', 'down'],
    2: ['east'],
    3: ['down'],
    7: ['west'],
    8: ['east', 'west'],
    9: ['up'],
    12: ['east'],
  };
  for (const [index, faces] of Object.entries(removed)) {
    for (const face of faces) assert.equal(doomslasher.elements[index].faces[face], undefined);
  }
  assert.equal(doomslasher.elements[11].from[2], 8.012);
  assert.equal(doomslasher.elements[11].to[2], 8.012);
});

test('essence outline shells opt into a stable depth bias', async () => {
  const essence = JSON.parse(
    await readFile(new URL('../public/data/models/essence-of-iskallium.json', import.meta.url))
  ).models[0];
  assert.equal(essence.outlineDepthBias, true);
  assert.equal(
    essence.elements.filter((element) =>
      element.from.every((value, index) => value > element.to[index])
    ).length,
    9
  );
});

test('terra and girl boss use their slot-specific in-game atlas sizes', async () => {
  for (const name of ['terra-armor', 'girl-boss']) {
    const outfit = JSON.parse(
      await readFile(new URL(`../public/data/models/${name}.json`, import.meta.url))
    ).models[0].outfit;
    assert.deepEqual(
      outfit.map((piece) => piece.textureSize),
      [
        [128, 128],
        [128, 128],
        [64, 64],
        [128, 128],
      ]
    );
  }
});

test('girl boss chestpiece preserves both authored cape faces', async () => {
  const chestpiece = JSON.parse(
    await readFile(new URL('../public/data/models/girl-boss.json', import.meta.url))
  ).models[0].outfit[1];
  assert.equal(chestpiece.preserveFlatFaces, true);
  const cape = chestpiece.nodes.find((node) => node.name === 'cube_r25');
  assert.ok(cape);
  assert.deepEqual(cape.cubes[0].size, [14, 0, 24]);
});

test('strike reward uses the combat helmet and chestplate atlas', async () => {
  const strike = JSON.parse(
    await readFile(new URL('../public/data/models/striker.json', import.meta.url))
  ).models[0].outfit;
  assert.equal(strike.length, 2);
  assert.deepEqual(
    strike.map((piece) => piece.textureSize),
    [
      [128, 64],
      [128, 64],
    ]
  );
  assert.deepEqual(
    strike.map((piece) =>
      piece.nodes.filter((node) => node.parent === 'root').map((node) => node.name)
    ),
    [['head'], ['body', 'right_arm', 'left_arm']]
  );
});

test('every companion has usable geometry and all idle, movement and sleep frames can be sampled', async () => {
  const catalog = JSON.parse(
    await readFile(new URL('../public/data/models/catalog.json', import.meta.url))
  );
  const companions = Object.values(catalog).filter((entry) => entry.companion);
  assert.equal(companions.length, 23);
  for (const entry of companions) {
    const data = JSON.parse(
      await readFile(new URL(`../public/data/models/${entry.model}.json`, import.meta.url))
    );
    const names = new Set(data.geometry.bones.map((bone) => bone.name));
    assert.ok(data.label);
    assert.match(data.texture, /^data:image\/png;base64,/);
    for (const bone of data.geometry.bones) {
      if (bone.parent) assert.ok(names.has(bone.parent));
      for (const block of bone.cubes || []) {
        const faces = cubeFaces(block, bone.mirror);
        const geometry = createCubeGeometry(block.size);
        assert.ok(faces && geometry.groups.length > 0, `${entry.model}/${bone.name}`);
        for (const face of Object.values(faces)) {
          assert.ok(face.uv.every(Number.isFinite));
        }
        geometry.dispose();
      }
    }
    for (const name of Object.values(data.clips)) {
      const clip = data.animations[name];
      assert.ok(clip, `${entry.model}: ${name}`);
      assert.ok(Object.keys(clip.bones).some((bone) => names.has(bone)));
      for (const channels of Object.values(clip.bones)) {
        for (const [type, channel] of Object.entries(channels)) {
          for (let time = 0; time <= (clip.animation_length || 4); time += 0.1) {
            const vector = sampleChannel(channel, time, type === 'scale' ? [1, 1, 1] : [0, 0, 0]);
            assert.ok(
              vector.length === 3 && vector.every(Number.isFinite),
              `${entry.model}/${name}`
            );
          }
        }
      }
    }
    const duration = data.animations[data.clips.sleep].animation_length;
    assert.equal(
      companionAnimation(data.animations, data.clips, true, duration - 0.01, true).clip,
      data.animations[data.clips.sleep]
    );
    assert.equal(
      companionAnimation(data.animations, data.clips, true, duration + 0.01, true).clip,
      data.animations[data.clips.sleepy]
    );
    assert.equal(
      companionAnimation(data.animations, data.clips, false, 1, true).clip,
      data.animations[data.clips.run]
    );
    assert.equal(companionAnimation(data.animations, data.clips, false, 1, true, true).time, 0);
  }
});

test('nested pre/post keyframes preserve discontinuities and interpolate smooth curves', () => {
  const channel = {
    0: { post: { vector: [0, 0, 0] } },
    1: { pre: { pre: [10, 0, 0] }, post: { post: [20, 0, 0] } },
    2: { vector: [30, 0, 0] },
  };
  assert.deepEqual(sampleChannel(channel, 0.5, []), [5, 0, 0]);
  assert.deepEqual(sampleChannel(channel, 1, []), [20, 0, 0]);
  assert.deepEqual(sampleChannel(channel, 1.5, []), [25, 0, 0]);
  const smooth = { 0: { post: [0, 0, 0], lerp_mode: 'catmullrom' }, 1: [10, 0, 0], 2: [0, 0, 0] };
  assert.ok(sampleChannel(smooth, 0.5, [])[0] > 5);
});

test('mixed rewards preserve the weapon beside their companion', () => {
  const images = ['<img src="companion.gif">', '<img src="sword.png">'];
  const halloween = renderRewardModelPreview('halloween_pumpkin', images.join(''), images);
  assert.match(halloween, /reward-model-mixed/);
  assert.match(halloween, /data-model="halloween-pumpkin-weapon"/);
  assert.doesNotMatch(halloween, /<img src="sword.png">/);
  assert.doesNotMatch(halloween, /<img src="companion.gif">/);

  const dylan = renderRewardModelPreview('i85_xmas_day3', images.join(''), images);
  assert.match(dylan, /reward-model-mixed/);
  assert.match(dylan, /<\/reward-model-preview><img src="sword.png">/);
  assert.doesNotMatch(dylan, /<img src="companion.gif">/);
  assert.equal(renderRewardModelPreview('golden_mini_dweller', 'fallback'), 'fallback');
});
