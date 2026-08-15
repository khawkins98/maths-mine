// core/trees.js — Biome scenery generation (oak trees, cacti, snow spruce, nether fungi, end pillars).

import * as THREE from 'three';

const BLOCK = 0.72; // scenery scale: readable, but subordinate to the lesson

const _gLog = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);
const _gLeaf = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);

export function makeTree({ trunkHeight = 4, seed = 0, materials } = {}) {
  const g = new THREE.Group();

  let rng = seed * 9301 + 49297;
  const rand = () => { rng = (rng * 9301 + 49297) % 233280; return rng / 233280; };

  for (let i = 0; i < trunkHeight; i++) {
    const log = new THREE.Mesh(_gLog, materials.log);
    log.position.set(0, BLOCK * i + BLOCK / 2, 0);
    log.castShadow = true;
    g.add(log);
  }

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

export function makeCactus({ height = 4, materials }) {
  const g = new THREE.Group();
  for (let i = 0; i < height; i++) {
    const b = new THREE.Mesh(_gLog, materials.cactus);
    b.position.set(0, BLOCK * i + BLOCK / 2, 0);
    b.castShadow = true;
    g.add(b);
  }
  // Side arms
  const arm1 = new THREE.Mesh(_gLog, materials.cactus);
  arm1.position.set(BLOCK, BLOCK * 2 + BLOCK / 2, 0);
  g.add(arm1);
  const arm2 = new THREE.Mesh(_gLog, materials.cactus);
  arm2.position.set(-BLOCK, BLOCK * 1 + BLOCK / 2, 0);
  g.add(arm2);
  return g;
}

export function makeSpruceTree({ height = 5, materials }) {
  const g = new THREE.Group();
  for (let i = 0; i < height; i++) {
    const log = new THREE.Mesh(_gLog, materials.log);
    log.position.set(0, BLOCK * i + BLOCK / 2, 0);
    log.castShadow = true;
    g.add(log);
  }
  // Conical leaf rings
  const layers = [
    { y: 2, radius: 2, mat: materials.leaves[0] },
    { y: 3, radius: 1, mat: materials.snowLeaves || materials.leaves[0] },
    { y: 4, radius: 1, mat: materials.snowCap || materials.leaves[0] },
    { y: 5, radius: 0, mat: materials.snowCap || materials.leaves[0] },
  ];
  for (const { y, radius, mat } of layers) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (Math.abs(dx) + Math.abs(dz) <= radius + 0.5) {
          const leaf = new THREE.Mesh(_gLeaf, mat);
          leaf.position.set(dx * BLOCK, y * BLOCK + BLOCK / 2, dz * BLOCK);
          leaf.castShadow = true;
          g.add(leaf);
        }
      }
    }
  }
  return g;
}

export function makeNetherFungus({ height = 4, materials }) {
  const g = new THREE.Group();
  for (let i = 0; i < height; i++) {
    const stem = new THREE.Mesh(_gLog, materials.stem);
    stem.position.set(0, BLOCK * i + BLOCK / 2, 0);
    stem.castShadow = true;
    g.add(stem);
  }
  // Crimson cap
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const cap = new THREE.Mesh(_gLeaf, materials.cap);
      cap.position.set(dx * BLOCK, height * BLOCK + BLOCK / 2, dz * BLOCK);
      cap.castShadow = true;
      g.add(cap);
    }
  }
  return g;
}

export function makeEndPillar({ height = 5, materials }) {
  const g = new THREE.Group();
  for (let i = 0; i < height; i++) {
    const col = new THREE.Mesh(_gLog, materials.obsidian);
    col.position.set(0, BLOCK * i + BLOCK / 2, 0);
    col.castShadow = true;
    g.add(col);
  }
  // Floating End Crystal on top
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(BLOCK * 0.6),
    materials.crystal,
  );
  crystal.position.set(0, (height + 0.8) * BLOCK, 0);
  g.add(crystal);
  return g;
}

export function plantTrees(scene, positions, textures, treeType = 'oak') {
  if (treeType === 'none') return null;

  const group = new THREE.Group();
  group.name = 'background-grove';

  const logMat = new THREE.MeshStandardMaterial({ map: textures.logTex, roughness: 1, metalness: 0 });
  const leafMats = [0xffffff, 0xd8f0cf, 0xb8dcae].map((color) => new THREE.MeshStandardMaterial({
    map: textures.leafTex, color, roughness: 1, metalness: 0,
  }));
  const cactusMat = new THREE.MeshStandardMaterial({ map: textures.cactusTex, roughness: 1, metalness: 0 });
  const snowCapMat = new THREE.MeshStandardMaterial({ map: textures.platSnowTex, roughness: 1, metalness: 0 });
  const stemMat = new THREE.MeshStandardMaterial({ map: textures.netherStemTex, roughness: 1, metalness: 0 });
  const capMat = new THREE.MeshStandardMaterial({ map: textures.netherCapTex, roughness: 1, metalness: 0 });
  const obsidianMat = new THREE.MeshStandardMaterial({ map: textures.platObsidianTex, roughness: 1, metalness: 0 });
  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0xaa77ff, emissive: 0x7733cc, roughness: 0.2, metalness: 0.8,
  });

  const materials = {
    log: logMat,
    leaves: leafMats,
    cactus: cactusMat,
    snowLeaves: leafMats[1],
    snowCap: snowCapMat,
    stem: stemMat,
    cap: capMat,
    obsidian: obsidianMat,
    crystal: crystalMat,
  };
  group.userData.materials = [logMat, ...leafMats, cactusMat, snowCapMat, stemMat, capMat, obsidianMat, crystalMat];

  positions.forEach(({ x, z, trunkHeight }, i) => {
    let tree;
    if (treeType === 'cactus') {
      tree = makeCactus({ height: 3 + (i % 2), materials });
    } else if (treeType === 'snow_spruce') {
      tree = makeSpruceTree({ height: 4 + (i % 2), materials });
    } else if (treeType === 'nether_fungi') {
      tree = makeNetherFungus({ height: 3 + (i % 2), materials });
    } else if (treeType === 'end_pillar') {
      tree = makeEndPillar({ height: 4 + (i % 2), materials });
    } else {
      tree = makeTree({ trunkHeight: trunkHeight ?? (4 + (i % 2)), seed: i * 137, materials });
    }
    tree.position.set(x, 0, z);
    group.add(tree);
  });

  scene.add(group);
  return group;
}

export function disposeTrees(scene, group) {
  if (!group) return;
  scene.remove(group);
  for (const material of group.userData.materials || []) material.dispose();
  while (group.children.length) group.remove(group.children[0]);
}
