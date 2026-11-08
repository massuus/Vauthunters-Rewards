import * as THREE from 'three';
import { companionAnimation, sampleChannel } from './reward-model-animation.js';
import {
  createCubeGeometry,
  cubeFaces,
  itemElementBounds,
  ITEM_DETAIL_THICKNESS,
} from './reward-model-geometry.js';

const active = new Set();
let frame;
let sharedRenderer;
let lastRenderedAt = 0;
const MODEL_TARGET_FPS = 30;
const MODEL_FRAME_INTERVAL = 1000 / MODEL_TARGET_FPS;
const MODEL_PIXEL_RATIO_CAP = 1;
const radians = (degrees) => (degrees * Math.PI) / 180;
const zero = [0, 0, 0];
const one = [1, 1, 1];

function getSharedRenderer() {
  if (sharedRenderer) return sharedRenderer;
  const canvas =
    typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(1, 1)
      : document.createElement('canvas');
  if (canvas instanceof HTMLCanvasElement) {
    canvas.className = 'reward-model-render-source';
    canvas.setAttribute('aria-hidden', 'true');
  }
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  sharedRenderer = { canvas, renderer, width: 0, height: 0 };
  return sharedRenderer;
}

function destroySharedRenderer() {
  if (!sharedRenderer || active.size) return;
  sharedRenderer.renderer.dispose();
  sharedRenderer.renderer.forceContextLoss();
  sharedRenderer.canvas.remove?.();
  sharedRenderer = undefined;
  lastRenderedAt = 0;
}

function schedule() {
  if (!frame && !document.hidden && [...active].some((view) => view.visible)) {
    frame = requestAnimationFrame(tick);
  }
}

function tick(now) {
  frame = null;
  const visible = [...active].filter((view) => view.visible);
  if (!visible.length) return;
  const dirty = visible.some((view) => view.needsDraw());
  if (!dirty && now - lastRenderedAt < MODEL_FRAME_INTERVAL) {
    schedule();
    return;
  }
  lastRenderedAt = now;
  const entry = getSharedRenderer();
  const ratio = Math.min(window.devicePixelRatio || 1, MODEL_PIXEL_RATIO_CAP);
  for (const view of visible) {
    try {
      view.draw(now, entry, ratio);
    } catch {
      view.dispose();
    }
  }
  if ([...active].some((view) => view.visible && (!view.reduced.matches || view.needsDraw())))
    schedule();
}

document.addEventListener('visibilitychange', schedule);
const invalidateViewports = () => {
  for (const view of active) view.invalidate();
  schedule();
};
window.addEventListener('scroll', invalidateViewports, { passive: true });
window.addEventListener('resize', invalidateViewports, { passive: true });

function cube(
  from,
  size,
  faces,
  materials,
  uvWidth,
  uvHeight,
  preferredFlatFace,
  preserveFlatFaces = false,
  flatThickness = 0.04
) {
  // Keep flat facial details just above the underlying cube so depth testing
  // does not swallow eyes, mouths, or markings.
  const renderSize = size.map((value) => (value === 0 ? flatThickness : value));
  let flatFace = preferredFlatFace;
  if (flatFace === undefined && size[0] === 0) flatFace = from[0] < 0 ? 1 : 0;
  else if (flatFace === undefined && size[1] === 0) flatFace = from[1] < 0 ? 3 : 2;
  else if (flatFace === undefined && size[2] === 0) flatFace = from[2] < 0 ? 5 : 4;
  const geometry = createCubeGeometry(renderSize, size, flatFace, preserveFlatFaces);
  const uv = geometry.attributes.uv;
  const names = ['east', 'west', 'up', 'down', 'south', 'north'];
  const faceMaterials = names.map((name, index) => {
    // Bedrock stores the artwork for zero-width X planes on the opposite UV
    // face. Keep the plane on the outward side for depth, but use that authored
    // opposite face's pixels (notably Dino and Muddy Elephant eyes).
    const sourceName = size[0] === 0 && index === flatFace ? names[flatFace === 0 ? 1 : 0] : name;
    const face = faces[sourceName];
    if (!face) return new THREE.MeshBasicMaterial({ visible: false });
    const coords = face.uv;
    const rect = face.uv_size
      ? [coords[0], coords[1], coords[0] + face.uv_size[0], coords[1] + face.uv_size[1]]
      : coords;
    const [u0, v0, u1, v1] = rect;
    const materialEntry = materials[face.texture] || materials.default;
    const uvAspect = materialEntry?.uvAspect || 1;
    [
      [u0, v0],
      [u1, v0],
      [u0, v1],
      [u1, v1],
    ].forEach(([u, v], vertex) => {
      uv.setXY(index * 4 + vertex, u / uvWidth, (1 - v / uvHeight) / uvAspect);
    });
    return materialEntry?.material || materialEntry;
  });
  const mesh = new THREE.Mesh(geometry, faceMaterials);
  mesh.position.fromArray(from.map((n, axis) => n + size[axis] / 2));
  return mesh;
}

function rotate(group, values = zero, bedrock = false) {
  // These Bedrock exports share Three.js' X/Y convention, but their front-view
  // Z rotations run in the opposite direction.
  const translated = bedrock ? [-values[0], values[1], -values[2]] : values;
  group.rotation.set(...translated.map(radians), 'ZYX');
}

function addCube(parent, mesh, pivot, rotation, bedrock = false) {
  const group = new THREE.Group();
  group.position.fromArray(pivot);
  mesh.position.sub(group.position);
  rotate(group, rotation, bedrock);
  group.add(mesh);
  parent.add(group);
}

async function material(source, logicalSize, translucent = false) {
  const texture = await new THREE.TextureLoader().loadAsync(source);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  if (logicalSize && texture.image) {
    const [logicalWidth, logicalHeight] = logicalSize;
    const imageWidth = texture.image.naturalWidth || texture.image.width;
    const imageHeight = texture.image.naturalHeight || texture.image.height;
    const scale = imageWidth / logicalWidth;
    const frameHeight = logicalHeight * scale;
    // Animated Minecraft textures are vertical frame strips. Show the first
    // complete frame instead of squeezing the entire strip onto each face.
    if (frameHeight > 0 && imageHeight > frameHeight + 0.5) {
      texture.repeat.y = frameHeight / imageHeight;
      texture.offset.y = 0;
    }
  }
  return new THREE.MeshLambertMaterial({
    map: texture,
    transparent: translucent,
    depthWrite: !translucent,
    alphaTest: translucent ? 0.01 : 0.1,
    side: THREE.DoubleSide,
  });
}

async function itemMaterial(textureData, unlit = false) {
  const texture = await new THREE.TextureLoader().loadAsync(textureData.source);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  // Minecraft item textures are authored in sRGB. Without this declaration,
  // Three.js treats them as linear data and the lit models look gray/bleached.
  texture.colorSpace = THREE.SRGBColorSpace;
  return {
    material: new (unlit ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial)({
      map: texture,
      color: 0xffffff,
      transparent: true,
      // Match Minecraft's cutout rendering. Requiring fully opaque alpha made
      // valid textured pixels disappear on several item atlases.
      alphaTest: 0.1,
      side: unlit ? THREE.DoubleSide : THREE.FrontSide,
    }),
    uvAspect: textureData.uvAspect || 1,
  };
}

function javaCubeFaces([u, v], [dx, dy, dz], mirror = false) {
  const rect = (x0, y0, x1, y1) => ({
    uv: mirror ? [x1, y0, x0, y1] : [x0, y0, x1, y1],
    texture: '#default',
  });
  return {
    west: rect(u, v + dz, u + dz, v + dz + dy),
    north: rect(u + dz, v + dz, u + dz + dx, v + dz + dy),
    east: rect(u + dz + dx, v + dz, u + dz + dx + dz, v + dz + dy),
    south: rect(u + dz * 2 + dx, v + dz, u + dz * 2 + dx * 2, v + dz + dy),
    up: rect(u + dz, v, u + dz + dx, v + dz),
    down: rect(u + dz + dx, v, u + dz + dx * 2, v + dz),
  };
}

async function buildArmorModel(model) {
  const root = new THREE.Group();
  const groups = new Map([['root', root]]);
  const textureData = model.textures.default;
  const materials = { '#default': await itemMaterial(textureData, true) };
  const [textureWidth, textureHeight] = model.textureSize;
  for (const node of model.nodes) {
    const group = new THREE.Group();
    group.name = node.name;
    group.position.set(node.pivot[0], -node.pivot[1], node.pivot[2]);
    group.rotation.set(-node.rotation[0], node.rotation[1], -node.rotation[2], 'ZYX');
    group.userData.baseRotation = group.rotation.clone();
    group.userData.spin = model.animations?.[node.name];
    groups.set(node.id, group);
    (groups.get(node.parent) || root).add(group);
    for (const block of node.cubes) {
      const inflate = block.inflate || 0;
      const size = block.size.map((value) => value + inflate * 2);
      const from = [
        block.from[0] - inflate,
        -(block.from[1] + block.size[1]) - inflate,
        block.from[2] - inflate,
      ];
      group.add(
        cube(
          from,
          size,
          javaCubeFaces(block.uv, block.size, block.mirror),
          materials,
          textureWidth,
          textureHeight,
          undefined,
          Boolean(model.preserveFlatFaces)
        )
      );
    }
  }
  return root;
}

async function buildCompanion(data) {
  const root = new THREE.Group();
  const bones = new Map();
  const mat = await material(data.texture, undefined, data.translucent === true);
  const { bones: definitions, description } = data.geometry;
  for (const definition of definitions) {
    const group = new THREE.Group();
    group.name = definition.name;
    bones.set(definition.name, { group, definition });
  }
  for (const { group, definition } of bones.values()) {
    const parent = bones.get(definition.parent);
    const pivot = definition.pivot || zero;
    group.position
      .fromArray(pivot)
      .sub(new THREE.Vector3().fromArray(parent?.definition.pivot || zero));
    rotate(group, definition.rotation, true);
    group.userData.basePosition = group.position.clone();
    group.userData.baseRotation = definition.rotation || zero;
    (parent?.group || root).add(group);
    let blocks = definition.cubes || [];
    // This model stores the two pupil textures on the opposite eye cubes.
    // Swapping only their positions preserves the authored inward gaze.
    if (data.label === 'Mini Dweller' && definition.name === 'Eyes' && blocks.length === 2) {
      blocks = blocks.map((block, index) => ({ ...block, origin: blocks[1 - index].origin }));
    }
    for (const block of blocks) {
      const inflate = block.inflate || 0;
      const center = block.origin.map((value, axis) => value + block.size[axis] / 2);
      let flatFace;
      if (block.size[0] === 0) flatFace = center[0] < 0 ? 1 : 0;
      else if (block.size[1] === 0) flatFace = center[1] < 0 ? 3 : 2;
      else if (block.size[2] === 0) flatFace = center[2] < 0 ? 5 : 4;
      const mesh = cube(
        block.origin.map((n, i) => n - pivot[i] - inflate),
        block.size.map((n) => n + inflate * 2),
        cubeFaces(block, definition.mirror),
        { default: mat },
        description.texture_width,
        description.texture_height,
        flatFace
      );
      addCube(
        group,
        mesh,
        (block.pivot || pivot).map((n, i) => n - pivot[i]),
        block.rotation,
        true
      );
    }
  }
  return { root, bones };
}

async function buildItems(data) {
  const root = new THREE.Group();
  const groups = [];
  for (const model of data.models) {
    if (model.outfit) {
      const outfit = new THREE.Group();
      for (const piece of model.outfit) outfit.add(await buildArmorModel(piece));
      const box = new THREE.Box3().setFromObject(outfit);
      const height = box.getSize(new THREE.Vector3()).y;
      const center = box.getCenter(new THREE.Vector3());
      outfit.position.copy(center).multiplyScalar(-1);
      const wrapper = new THREE.Group();
      wrapper.add(outfit);
      wrapper.scale.setScalar(20 / height);
      root.add(wrapper);
      groups.push(wrapper);
      continue;
    }
    if (model.nodes) {
      const group = await buildArmorModel(model);
      const box = new THREE.Box3().setFromObject(group);
      const height = box.getSize(new THREE.Vector3()).y;
      const center = box.getCenter(new THREE.Vector3());
      group.position.copy(center).multiplyScalar(-1);
      const wrapper = new THREE.Group();
      wrapper.add(group);
      wrapper.scale.setScalar(20 / height);
      wrapper.userData.previewTilt = model.previewTilt || 0;
      root.add(wrapper);
      groups.push(wrapper);
      continue;
    }
    const group = new THREE.Group();
    const materials = {};
    for (const [key, textureData] of Object.entries(model.textures)) {
      materials[`#${key}`] = await itemMaterial(textureData, data.label === 'Midnight Thorn');
    }
    const [textureWidth, textureHeight] = [16, 16];
    for (const element of model.elements) {
      // Only two known Blockbench exports encode complete outline cubes in
      // reverse. Other reward models deliberately use their authored bounds.
      const { from, to } = itemElementBounds(element, data.label);
      let elementMaterials = materials;
      if (
        model.outlineDepthBias &&
        element.from.every((value, index) => value > element.to[index])
      ) {
        elementMaterials = Object.fromEntries(
          Object.entries(materials).map(([key, entry]) => {
            const biased = entry.material.clone();
            biased.polygonOffset = true;
            biased.polygonOffsetFactor = 1;
            biased.polygonOffsetUnits = 1;
            return [key, { ...entry, material: biased }];
          })
        );
      }
      const mesh = cube(
        from.map((value) => value - 8),
        to.map((value, index) => value - from[index]),
        element.faces,
        elementMaterials,
        textureWidth,
        textureHeight,
        undefined,
        true,
        ITEM_DETAIL_THICKNESS
      );
      const rotation = element.rotation;
      const angles = [...zero];
      if (rotation) angles['xyz'.indexOf(rotation.axis)] = rotation.angle;
      addCube(
        group,
        mesh,
        (rotation?.origin || [8, 8, 8]).map((value) => value - 8),
        angles
      );
    }
    const gui = model.display?.gui;
    if (gui) {
      group.rotation.set(...(gui.rotation || zero).map(radians), 'XYZ');
      group.scale.fromArray(gui.scale || one);
      group.position.fromArray(gui.translation || zero);
    }
    const box = new THREE.Box3().setFromObject(group);
    const height = box.getSize(new THREE.Vector3()).y;
    const center = box.getCenter(new THREE.Vector3());
    group.position.copy(center).multiplyScalar(-1);
    const wrapper = new THREE.Group();
    wrapper.add(group);
    wrapper.scale.setScalar(20 / height);
    root.add(wrapper);
    groups.push(wrapper);
  }
  const spacing = groups.length > 3 ? 0 : 15;
  groups.forEach((group, index) => {
    group.position.x = (index - (groups.length - 1) / 2) * spacing;
    const frame = new THREE.Box3().setFromObject(group);
    group.userData.frameCenter = frame.getCenter(new THREE.Vector3());
    group.userData.frameSize = frame.getSize(new THREE.Vector3());
  });
  return { root, bones: new Map(), items: groups };
}

function pose(bones, clip, time, neutralClip, neutralTime = 0) {
  for (const [name, { group }] of bones) {
    const channels = clip?.bones?.[name];
    const neutral = neutralClip?.bones?.[name];
    const position = sampleChannel(
      channels?.position || neutral?.position,
      channels?.position ? time : neutralTime,
      zero
    );
    group.position.copy(group.userData.basePosition).add(new THREE.Vector3(...position));
    const rotation = sampleChannel(
      channels?.rotation || neutral?.rotation,
      channels?.rotation ? time : neutralTime,
      zero
    );
    rotate(
      group,
      rotation.map((n, i) => n + group.userData.baseRotation[i]),
      true
    );
    group.scale.fromArray(
      sampleChannel(channels?.scale || neutral?.scale, channels?.scale ? time : neutralTime, one)
    );
  }
}

function disposeModel(root) {
  const materials = new Set();
  root.traverse((object) => {
    object.geometry?.dispose();
    for (const mat of object.material ? [].concat(object.material) : []) materials.add(mat);
  });
  for (const mat of materials) {
    mat.map?.dispose();
    mat.dispose();
  }
}

export async function mountRewardModel(host, signal) {
  const response = await fetch(`/data/models/${host.dataset.model}.json`, { signal });
  if (!response.ok) throw new Error('Model unavailable');
  const data = await response.json();
  if (data.kind === 'items' && host.dataset.modelIndex !== undefined) {
    const modelIndex = Number.parseInt(host.dataset.modelIndex, 10);
    const selected = data.models?.[Number.isFinite(modelIndex) ? modelIndex : 0];
    if (!selected) throw new Error('Individual model unavailable');
    if (selected.outfit && host.dataset.outfitPiece !== undefined) {
      const pieceIndex = Number.parseInt(host.dataset.outfitPiece, 10);
      const piece = selected.outfit[Number.isFinite(pieceIndex) ? pieceIndex : 0];
      if (!piece) throw new Error('Armor piece unavailable');
      data.models = [{ outfit: [piece] }];
    } else {
      data.models = [selected];
    }
  }
  const model = await (data.kind === 'companion' ? buildCompanion(data) : buildItems(data));
  if (!host.isConnected || signal?.aborted) {
    disposeModel(model.root);
    return () => {};
  }
  const outputCanvas = document.createElement('canvas');
  outputCanvas.className = 'reward-model-output-canvas';
  outputCanvas.setAttribute('aria-hidden', 'true');
  const bitmapContext = outputCanvas.getContext('bitmaprenderer');
  const outputContext = bitmapContext ? null : outputCanvas.getContext('2d', { alpha: true });
  host.append(outputCanvas);
  const scene = new THREE.Scene();
  if (data.kind === 'companion') {
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9dacc1, 2.3));
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(-20, 40, -30);
    scene.add(light);
  } else {
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    for (const [position, intensity] of [
      [[10, 15, 10], 1.5],
      [[-8, -5, 5], 0.5],
      [[-5, 10, -8], 0.7],
    ]) {
      const light = new THREE.DirectionalLight(0xffffff, intensity);
      light.position.fromArray(position);
      scene.add(light);
    }
    const point = new THREE.PointLight(0xffffff, 0.4, 50);
    point.position.set(0, 15, 15);
    scene.add(point);
  }
  scene.add(model.root);
  const bounds = new THREE.Box3().setFromObject(model.root);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  // Model scaling is normally cancelled by the automatic bounds-based camera
  // fit. Apply previewScale to the framing instead so smaller previews remain
  // visibly smaller inside the same card.
  const previewScale =
    data.kind === 'items' && data.models.length === 1 ? data.models[0].previewScale || 1 : 1;
  const camera =
    data.kind === 'companion'
      ? new THREE.PerspectiveCamera(32, 1, 0.1, 1000)
      : new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let asleep = false;
  let stateStart = 0;
  let hovered = false;
  let elapsed = 0;
  let drawn = false;
  let dirty = true;
  let dimensionsReady = false;
  const controller = new AbortController();
  const card = host.closest('article') || host;
  const label = data.label || 'Terraxe and Terra’s Wrath';
  host.setAttribute('role', data.kind === 'companion' ? 'button' : 'img');
  host.setAttribute('aria-label', label);
  const updateLabel = () => {
    const hint = asleep ? 'Wake companion' : 'Put companion to sleep';
    host.setAttribute('aria-label', `${label}. ${hint}`);
    host.setAttribute('aria-pressed', String(asleep));
    host.title = `${hint} · Hover to run`;
  };
  const listen = (target, event, handler) =>
    target.addEventListener(event, handler, { signal: controller.signal });
  if (data.kind === 'companion') {
    host.tabIndex = 0;
    updateLabel();
    const setHovered = (value) => {
      hovered = value;
      if (!asleep) stateStart = elapsed;
      dirty = true;
      schedule();
    };
    listen(card, 'pointerenter', (event) => {
      if (event.pointerType !== 'touch') setHovered(true);
    });
    listen(card, 'pointerleave', () => setHovered(false));
    listen(card, 'pointercancel', () => setHovered(false));
    listen(card, 'click', (event) => {
      if (event.target.closest('a, details, button')) return;
      asleep = !asleep;
      stateStart = elapsed;
      dirty = true;
      updateLabel();
      schedule();
    });
    listen(host, 'keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        host.click();
      }
    });
  }
  const view = {
    visible: false,
    reduced,
    invalidate: () => {
      dirty = true;
    },
    needsDraw: () => !drawn || dirty,
    draw(now, rendererEntry, ratio) {
      if (!dimensionsReady) return false;
      elapsed = reduced.matches ? 0 : now / 1000;
      if (data.kind === 'companion') {
        const stateElapsed = elapsed - stateStart;
        const { clip, time } = companionAnimation(
          data.animations,
          data.clips,
          asleep,
          stateElapsed,
          hovered,
          reduced.matches
        );
        pose(model.bones, clip, time);
        model.root.rotation.y = 0.35;
      } else {
        model.root.traverse((part) => {
          const spin = part.userData.spin;
          if (!spin) return;
          if (spin.oscillations) {
            for (const [axis, wave] of Object.entries(spin.oscillations)) {
              const value = reduced.matches
                ? wave.offset
                : wave.offset + Math.sin(elapsed * wave.speed) * wave.amplitude;
              part.rotation[axis] = part.userData.baseRotation[axis] + value;
            }
          } else {
            const axis = spin.axis;
            part.rotation[axis] =
              part.userData.baseRotation[axis] +
              (reduced.matches ? 0 : elapsed * spin.turnsPerSecond * Math.PI * 2);
          }
        });
        const cyclesItems = data.cycleItems === true || model.items.length > 3;
        // Give dense reward sets enough time for each model to be inspected.
        // This used to switch every 2.4 seconds.
        const visibleItem = cyclesItems ? Math.floor(elapsed / 4.8) % model.items.length : -1;
        model.items.forEach((item, index) => {
          item.visible = !cyclesItems || index === visibleItem;
          // The exported GUI transform faces Minecraft's negative-Z camera.
          // Our orthographic camera sits on positive Z, so turn the model once
          // to make the authored front the initial/front-facing view.
          item.rotation.y = Math.PI + (reduced.matches ? 0 : elapsed * 0.45);
          item.rotation.x = item.userData.previewTilt || 0;
          item.rotation.z = 0;
        });
      }
      const rect = host.getBoundingClientRect();
      const pixelsWide = Math.max(0, Math.round(rect.width * ratio));
      const pixelsHigh = Math.max(0, Math.round(rect.height * ratio));
      if (!pixelsWide || !pixelsHigh) return false;
      const aspect = rect.width / rect.height;
      if (camera.isPerspectiveCamera) {
        camera.aspect = aspect;
        const distance =
          (Math.max(size.y, size.x / camera.aspect) / (2 * Math.tan(radians(16)))) * 1.3;
        camera.position.set(center.x, center.y + distance * 0.4, center.z - distance);
      } else {
        const cyclesItems = data.cycleItems === true || model.items.length > 3;
        const visibleItem = cyclesItems
          ? model.items[Math.floor(elapsed / 4.8) % model.items.length]
          : null;
        // Each cycled model gets its own frame. Hidden siblings must not reserve
        // horizontal space or pull the visible reward away from the card centre.
        const frameSize = visibleItem?.userData.frameSize || size;
        const frameCenter = visibleItem?.userData.frameCenter || center;
        const halfHeight = (Math.max(frameSize.y, frameSize.x / aspect) * 0.65) / previewScale;
        camera.left = -halfHeight * aspect;
        camera.right = halfHeight * aspect;
        camera.top = halfHeight;
        camera.bottom = -halfHeight;
        camera.position.set(frameCenter.x, frameCenter.y, frameCenter.z + 100);
        camera.lookAt(frameCenter);
      }
      if (camera.isPerspectiveCamera) camera.lookAt(center);
      camera.updateProjectionMatrix();
      if (pixelsWide !== rendererEntry.width || pixelsHigh !== rendererEntry.height) {
        rendererEntry.renderer.setSize(pixelsWide, pixelsHigh, false);
        rendererEntry.width = pixelsWide;
        rendererEntry.height = pixelsHigh;
      }
      const renderer = rendererEntry.renderer;
      renderer.setScissorTest(true);
      renderer.setViewport(0, 0, pixelsWide, pixelsHigh);
      renderer.setScissor(0, 0, pixelsWide, pixelsHigh);
      renderer.clear(true, true, true);
      renderer.render(scene, camera);
      if (outputCanvas.width !== pixelsWide || outputCanvas.height !== pixelsHigh) {
        outputCanvas.width = pixelsWide;
        outputCanvas.height = pixelsHigh;
      }
      if (bitmapContext && typeof rendererEntry.canvas.transferToImageBitmap === 'function') {
        bitmapContext.transferFromImageBitmap(rendererEntry.canvas.transferToImageBitmap());
      } else {
        outputContext.clearRect(0, 0, pixelsWide, pixelsHigh);
        outputContext.drawImage(
          rendererEntry.canvas,
          0,
          0,
          pixelsWide,
          pixelsHigh,
          0,
          0,
          pixelsWide,
          pixelsHigh
        );
      }
      host.classList.add('model-ready');
      drawn = true;
      dirty = false;
      return true;
    },
  };
  const visibility = new IntersectionObserver(([entry]) => {
    view.visible = entry.isIntersecting;
    if (view.visible) dirty = true;
    schedule();
  });
  visibility.observe(host);
  const resize = new ResizeObserver(() => {
    dimensionsReady = true;
    dirty = true;
    schedule();
  });
  resize.observe(host);
  listen(reduced, 'change', () => {
    dirty = true;
    schedule();
  });
  active.add(view);
  view.dispose = () => {
    controller.abort();
    visibility.disconnect();
    resize.disconnect();
    active.delete(view);
    host.classList.remove('model-ready');
    host.removeAttribute('role');
    host.removeAttribute('aria-label');
    host.removeAttribute('aria-pressed');
    host.removeAttribute('tabindex');
    host.removeAttribute('title');
    outputCanvas.remove();
    disposeModel(model.root);
    destroySharedRenderer();
    if (!active.size && frame) {
      cancelAnimationFrame(frame);
      frame = null;
    }
  };
  return view.dispose;
}
