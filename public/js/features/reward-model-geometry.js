import { BoxGeometry } from 'three';

export const ITEM_DETAIL_THICKNESS = 0.01;

// Midnight Thorn's rose was exported wholly inside-out and needs its bounds
// swapped. Treasure Train also contains negative bounds, but those are
// intentional inward-facing outline shells and must remain untouched.
const REVERSED_EXPORTS = new Set(['Midnight Thorn']);

export function itemElementBounds(element, label) {
  const reversed =
    REVERSED_EXPORTS.has(label) && element.from.every((value, index) => value > element.to[index]);
  return reversed ? { from: element.to, to: element.from } : { from: element.from, to: element.to };
}

export function cubeFaces(block, mirror = false) {
  if (!Array.isArray(block.uv)) return block.uv;
  const [u, v] = block.uv;
  const [x, y, z] = block.size;
  const face = (left, top, width, height) => ({ uv: [left, top], uv_size: [width, height] });
  const faces = {
    west: face(u, v + z, z, y),
    north: face(u + z, v + z, x, y),
    east: face(u + z + x, v + z, z, y),
    south: face(u + 2 * z + x, v + z, x, y),
    up: face(u + z, v, x, z),
    down: face(u + z + x, v + z, x, -z),
  };
  if (block.mirror ?? mirror) {
    [faces.east, faces.west] = [faces.west, faces.east];
    for (const value of Object.values(faces)) {
      value.uv[0] += value.uv_size[0];
      value.uv_size[0] *= -1;
    }
  }
  return faces;
}

export function createCubeGeometry(size, logicalSize = size, flatFace, preserveFlatFaces = false) {
  const geometry = new BoxGeometry(...size);
  // Minecraft uses zero-thickness cubes for details such as blinking eyes.
  // A double-sided material needs only one of the two coincident box faces.
  // BoxGeometry material order: east, west, up, down, south, north.
  const [x, y, z] = logicalSize;
  const areas = [y * z, y * z, x * z, x * z, x * y, x * y];
  geometry.groups = geometry.groups.filter(({ materialIndex: face }) => {
    // Java item models deliberately use opposing faces on zero-thickness
    // planes. Front-side culling selects the correct authored side, whereas
    // companion detail planes need one face removed to prevent z-fighting.
    if (preserveFlatFaces) return areas[face] > 0;
    if (areas[face] === 0) return false;
    if (flatFace !== undefined && (x === 0 || y === 0 || z === 0)) return face === flatFace;
    if (x === 0 && face === 1) return false;
    if (y === 0 && face === 3) return false;
    if (z === 0 && face === 4) return false;
    return true;
  });
  return geometry;
}
