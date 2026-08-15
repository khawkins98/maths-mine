// core/trees.js — Minecraft-style oak tree scene dressing.
//
// makeTree() builds a single voxel oak tree (trunk + leaf canopy) as a
// THREE.Group centred so the trunk base sits at y = 0.
//
// plantTrees(scene, positions) places trees at the given world XZ coords,
// returns the group so the caller can remove + dispose it on teardown.

import * as THREE from 'three';

const BLOCK = 0.72; // scenery scale: readable, but subordinate to the lesson

// Shared geometries — one BoxGeometry per distinct size, reused across all
// trees so we don't create hundreds of identical geometries.
const _gLog  = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);
const _gLeaf = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);

/**
 * Create a single oak tree group. Trunk base = y 0.
 * @param {{ trunkHeight?: number, seed?: number, materials: { log: THREE.Material, leaves: THREE.Material[] } }} opts
 */
export function makeTree({ trunkHeight = 4, seed = 0, materials } = {}) {
  const g = new THREE.Group();

  // Simple seeded-ish random (deterministic per tree so the forest looks
  // consistent across frames — no new geometry on re-renders)
  let rng = seed * 9301 + 49297;
  const rand = () => { rng = (rng * 9301 + 49297) % 233280; return rng / 233280; };

  // Trunk — stacked cubes retain the block rhythm without becoming a giant
  // foreground wall when the camera uses a low frontal angle.
  for (let i = 0; i < trunkHeight; i++) {
    const log = new THREE.Mesh(_gLog, materials.log);
    log.position.set(0, BLOCK * i + BLOCK / 2, 0);
    log.castShadow = true;
    g.add(log);
  }

  // A compact three-layer oak crown. The old 5×4×5 solid blob was over a
  // hundred cubes per tree and filled the frame; this silhouette stays airy.
  const CANOPY = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      if (Math.abs(dx) + Math.abs(dz) < 2 || rand() > 0.34) CANOPY.push([dx, 0, dz]);
      if (Math.abs(dx) + Math.abs(dz) < 2 || rand() > 0.58) CANOPY.push([dx, 1, dz]);
    }
  }
  CANOPY.push([0, 2, 0], [-1, 2, 0], [1, 2, 0], [0, 2, -1], [0, 2, 1]);

  for (const [dx, dy, dz] of CANOPY) {
    const mat = materials.leaves[(rand() * materials.leaves.length) | 0];
    const leaf = new THREE.Mesh(_gLeaf, mat);
    leaf.position.set(
      dx * BLOCK,
      (trunkHeight - 1 + dy) * BLOCK + BLOCK / 2,
      dz * BLOCK,
    );
    leaf.castShadow = true;
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
export function plantTrees(scene, positions, textures) {
  const group = new THREE.Group();
  group.name = 'background-grove';
  const log = new THREE.MeshStandardMaterial({ map: textures.logTex, color: 0xffffff, roughness: 1, metalness: 0 });
  const leaves = [0xffffff, 0xd8f0cf, 0xb8dcae].map((color) => new THREE.MeshStandardMaterial({
    map: textures.leafTex, color, roughness: 1, metalness: 0,
  }));
  group.userData.materials = [log, ...leaves];
  positions.forEach(({ x, z, trunkHeight }, i) => {
    const tree = makeTree({ trunkHeight: trunkHeight ?? (4 + (i % 2)), seed: i * 137, materials: { log, leaves } });
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
  for (const material of group.userData.materials || []) material.dispose();
  while (group.children.length) group.remove(group.children[0]);
}
