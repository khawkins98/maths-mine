// core/trees.js — Minecraft-style oak tree scene dressing.
//
// makeTree() builds a single voxel oak tree (trunk + leaf canopy) as a
// THREE.Group centred so the trunk base sits at y = 0.
//
// plantTrees(scene, positions) places trees at the given world XZ coords,
// returns the group so the caller can remove + dispose it on teardown.

import * as THREE from 'three';

const BLOCK = 0.9; // voxel size, matching the game's block scale

// Shared geometries — one BoxGeometry per distinct size, reused across all
// trees so we don't create hundreds of identical geometries.
const _gLog  = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);
const _gLeaf = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);

// Oak log: brown bark
const _mLog = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.95, metalness: 0 });

// Leaf colours — a few variations for visual interest; picked randomly per leaf
const LEAF_COLS = [0x4a7a2a, 0x3d6622, 0x548c30, 0x416a24, 0x5c9432];
const _mLeaves = LEAF_COLS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, metalness: 0 }));

/**
 * Create a single oak tree group. Trunk base = y 0.
 * @param {{ trunkHeight?: number, seed?: number }} opts
 */
export function makeTree({ trunkHeight = 4, seed = 0 } = {}) {
  const g = new THREE.Group();

  // Simple seeded-ish random (deterministic per tree so the forest looks
  // consistent across frames — no new geometry on re-renders)
  let rng = seed * 9301 + 49297;
  const rand = () => { rng = (rng * 9301 + 49297) % 233280; return rng / 233280; };

  // Trunk — stack of log blocks
  for (let i = 0; i < trunkHeight; i++) {
    const log = new THREE.Mesh(_gLog, _mLog);
    log.position.set(0, BLOCK * i + BLOCK / 2, 0);
    g.add(log);
  }

  // Canopy — roughly spherical blob of leaf blocks around the top of the trunk.
  // Minecraft oak canopy: a 5×4×5 blob (x/z ±2, y 0..3) with corners removed.
  const cx = 0;
  const cy = (trunkHeight - 1) * BLOCK; // canopy centre y
  const cz = 0;
  const CANOPY = [
    // [dx, dy, dz] in block-grid units — corners of the 5×4×5 box are trimmed
    ...(() => {
      const cells = [];
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = 0; dy <= 3; dy++) {
          for (let dz = -2; dz <= 2; dz++) {
            // trim the four vertical corners of the bounding box
            const cornerX = Math.abs(dx) === 2;
            const cornerZ = Math.abs(dz) === 2;
            if (cornerX && cornerZ) continue; // cut diagonal corners
            // also trim the very top corners at dy=3
            if (dy === 3 && (Math.abs(dx) >= 2 || Math.abs(dz) >= 2)) continue;
            cells.push([dx, dy, dz]);
          }
        }
      }
      return cells;
    })(),
  ];

  for (const [dx, dy, dz] of CANOPY) {
    // Randomly skip a few leaves for a slightly ragged look (about 10%)
    if (rand() < 0.10) continue;
    const mat = _mLeaves[(rand() * _mLeaves.length) | 0];
    const leaf = new THREE.Mesh(_gLeaf, mat);
    leaf.position.set(
      cx + dx * BLOCK,
      cy + dy * BLOCK + BLOCK / 2,
      cz + dz * BLOCK,
    );
    g.add(leaf);
  }

  return g;
}

/**
 * Plant trees at the given XZ positions in the scene.
 * Returns a THREE.Group — add it to the scene, remove + dispose on teardown.
 *
 * @param {THREE.Scene} scene
 * @param {Array<{x: number, z: number, trunkHeight?: number}>} positions
 */
export function plantTrees(scene, positions) {
  const group = new THREE.Group();
  positions.forEach(({ x, z, trunkHeight }, i) => {
    const tree = makeTree({ trunkHeight: trunkHeight ?? (4 + (i % 2)), seed: i * 137 });
    tree.position.set(x, 0, z);
    group.add(tree);
  });
  scene.add(group);
  return group;
}

/** Dispose a tree group returned by plantTrees. */
export function disposeTrees(scene, group) {
  if (!group) return;
  scene.remove(group);
  // Geometries and materials are shared — do NOT dispose them here.
  // Just remove children references so GC can collect the group.
  while (group.children.length) group.remove(group.children[0]);
}
