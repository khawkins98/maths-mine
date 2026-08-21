// core/trees.js — Biome scenery generation (oak trees, birch trees, cacti, snow spruce, nether fungi, end pillars).

import * as THREE from 'three';

const BLOCK = 0.72; // scenery scale: readable, but subordinate to the lesson

const _gLog = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);
const _gLeaf = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);
const _gEndCrystal = new THREE.OctahedronGeometry(BLOCK * 0.6);

export function makeTree({ trunkHeight = 4, seed = 0, materials, isBirch = false } = {}) {
  const g = new THREE.Group();

  let rng = seed * 9301 + 49297;
  const rand = () => { rng = (rng * 9301 + 49297) % 233280; return rng / 233280; };

  const logMaterial = isBirch ? (materials.birchLog || materials.log) : materials.log;
  const leafMaterials = isBirch ? (materials.birchLeaves || materials.leaves) : materials.leaves;

  // Trunk
  for (let i = 0; i < trunkHeight; i++) {
    const log = new THREE.Mesh(_gLog, logMaterial);
    log.position.set(0, BLOCK * i + BLOCK / 2, 0);
    log.castShadow = true;
    g.add(log);
  }

  // Classic Minecraft layered leaf canopy
  const CANOPY = [];

  // Bottom 5x5 layer (with random corner cutouts)
  const yStart = trunkHeight - 2;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && rand() > 0.4) continue;
      CANOPY.push([dx, yStart, dz]);
    }
  }

  // Mid 5x5 layer
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && rand() > 0.6) continue;
      CANOPY.push([dx, yStart + 1, dz]);
    }
  }

  // Upper 3x3 layer
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      CANOPY.push([dx, yStart + 2, dz]);
    }
  }

  // Top cap (plus shape)
  CANOPY.push([0, yStart + 3, 0], [-1, yStart + 3, 0], [1, yStart + 3, 0], [0, yStart + 3, -1], [0, yStart + 3, 1]);

  for (const [dx, dy, dz] of CANOPY) {
    const mat = leafMaterials[(rand() * leafMaterials.length) | 0];
    const leaf = new THREE.Mesh(_gLeaf, mat);
    leaf.position.set(
      dx * BLOCK,
      dy * BLOCK + BLOCK / 2,
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
    _gEndCrystal,
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

  const logSideMat = new THREE.MeshStandardMaterial({ map: textures.logTex, roughness: 1, metalness: 0 });
  const logEndMat = new THREE.MeshStandardMaterial({ map: textures.logTopTex || textures.logTex, roughness: 1, metalness: 0 });
  const logMat = [logSideMat, logSideMat, logEndMat, logEndMat, logSideMat, logSideMat];
  const birchLogMat = new THREE.MeshStandardMaterial({ map: textures.birchLogTex || textures.logTex, roughness: 1, metalness: 0 });

  const leafMats = [0xffffff, 0xd8f0cf, 0xb8dcae].map((color) => new THREE.MeshStandardMaterial({
    map: textures.leafTex, color, roughness: 1, metalness: 0,
  }));
  const birchLeafMats = [0x9be887, 0x73d45d, 0xbbf0ac].map((color) => new THREE.MeshStandardMaterial({
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
    birchLog: birchLogMat,
    leaves: leafMats,
    birchLeaves: birchLeafMats,
    cactus: cactusMat,
    snowLeaves: leafMats[1],
    snowCap: snowCapMat,
    stem: stemMat,
    cap: capMat,
    obsidian: obsidianMat,
    crystal: crystalMat,
  };
  group.userData.materials = [logSideMat, logEndMat, birchLogMat, ...leafMats, ...birchLeafMats, cactusMat, snowCapMat, stemMat, capMat, obsidianMat, crystalMat];

  const activePositions = treeType === 'home_oak' ? positions.slice(0, 2) : positions;

  activePositions.forEach(({ x, y = 0, z, trunkHeight }, i) => {
    let tree;
    if (treeType === 'cactus') {
      tree = makeCactus({ height: 3 + (i % 2), materials });
    } else if (treeType === 'snow_spruce') {
      tree = makeSpruceTree({ height: 4 + (i % 2), materials });
    } else if (treeType === 'nether_fungi') {
      tree = makeNetherFungus({ height: 3 + (i % 2), materials });
    } else if (treeType === 'end_pillar') {
      tree = makeEndPillar({ height: 4 + (i % 2), materials });
    } else if (treeType === 'dense_oak') {
      // Forest biome: alternate between Lush Oak, Birch, and Spruce trees!
      const variant = i % 3;
      if (variant === 1) {
        tree = makeTree({ trunkHeight: trunkHeight ?? (4 + (i % 2)), seed: i * 137, materials, isBirch: true });
      } else if (variant === 2) {
        tree = makeSpruceTree({ height: 4 + (i % 2), materials });
      } else {
        tree = makeTree({ trunkHeight: trunkHeight ?? (5 + (i % 2)), seed: i * 137, materials, isBirch: false });
      }
    } else {
      tree = makeTree({ trunkHeight: trunkHeight ?? (4 + (i % 2)), seed: i * 137, materials });
    }
    tree.position.set(x, y, z);
    tree.userData.decorationRadius = treeType === 'end_pillar' ? BLOCK
      : treeType === 'cactus' ? BLOCK * 1.5 : BLOCK * 2.5;
    tree.userData.decorationType = treeType;
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
