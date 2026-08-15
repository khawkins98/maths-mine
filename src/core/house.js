// core/house.js — Expanded 3D Voxel House & Animated Iron Golem Guardian.
// Builds a grand multi-story Minecraft Cottage on the island and features an
// animated 2.7m tall Iron Golem with heavy patrol strides, swinging arms, and glowing eyes!

import * as THREE from 'three';
import { localStore, readJSON, writeJSON } from './storage.js';

const SAVE_KEY = 'house_stage.v1';
const BLOCK_SIZE = 0.72;

export const HOUSE_COSTS = [5, 10, 15, 20]; // Costs for Stage 1, 2, 3, 4

export function createHouseManager({ scene, textures, storage = localStore() } = {}) {
  const group = new THREE.Group();
  group.name = 'player-house';
  // Position on back-left corner of island platform
  group.position.set(-6.5, 0, -4.5);
  scene.add(group);

  const saved = readJSON(storage, SAVE_KEY);
  let currentStage = (saved && Number.isFinite(saved.stage)) ? saved.stage : 0;

  let golemGroup = null;

  // Materials
  const logMat = new THREE.MeshStandardMaterial({ map: textures.logTex, roughness: 1, metalness: 0 });
  const birchLogMat = new THREE.MeshStandardMaterial({ map: textures.birchLogTex || textures.logTex, roughness: 1, metalness: 0 });
  const plankMat = new THREE.MeshStandardMaterial({ map: textures.plankTex || textures.woodTex, roughness: 1, metalness: 0 });
  const cobbleMat = new THREE.MeshStandardMaterial({ map: textures.cobbleTex || textures.stoneTex, roughness: 1, metalness: 0 });
  const glassMat = new THREE.MeshStandardMaterial({
    map: textures.glassTex, transparent: true, opacity: 0.65, roughness: 0.2, metalness: 0.1,
  });
  const ironMat = new THREE.MeshStandardMaterial({ map: textures.ironGolemTex || textures.ironBlockTex || textures.platSnowTex, roughness: 0.6, metalness: 0.3 });
  const pumpkinMat = new THREE.MeshStandardMaterial({ map: textures.pumpkinTex, roughness: 0.9, metalness: 0 });
  const roofMat = new THREE.MeshStandardMaterial({ map: textures.logTex, roughness: 1, metalness: 0 });

  const boxGeo = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);

  function clearHouse() {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if (child.geometry) child.geometry.dispose();
    }
    golemGroup = null;
  }

  function addVoxel(x, y, z, mat) {
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.position.set(x * BLOCK_SIZE, y * BLOCK_SIZE + BLOCK_SIZE / 2, z * BLOCK_SIZE);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function buildHouseMesh(stage) {
    clearHouse();

    if (stage <= 0) {
      // Stage 0: 6x6 Plot foundation markers & corner posts
      for (let x = -3; x <= 2; x++) {
        for (let z = -3; z <= 2; z++) {
          const isCorner = (x === -3 || x === 2) && (z === -3 || z === 2);
          if (isCorner) {
            addVoxel(x, 0, z, cobbleMat);
            addVoxel(x, 1, z, logMat);
          }
        }
      }
      return;
    }

    // Grand 6x6 Footprint Cottage
    const X_MIN = -3, X_MAX = 2;
    const Z_MIN = -3, Z_MAX = 2;

    // Ground Floor (Cobble foundation + Oak Plank walls + Log pillars)
    for (let x = X_MIN; x <= X_MAX; x++) {
      for (let z = Z_MIN; z <= Z_MAX; z++) {
        const isCorner = (x === X_MIN || x === X_MAX) && (z === Z_MIN || z === Z_MAX);
        const isEdge = (x === X_MIN || x === X_MAX || z === Z_MIN || z === Z_MAX);

        // Floor
        addVoxel(x, 0, z, cobbleMat);

        if (isEdge) {
          if (isCorner) {
            // Log corner pillars up 3 stories
            addVoxel(x, 1, z, logMat);
            addVoxel(x, 2, z, logMat);
            if (stage >= 2) addVoxel(x, 3, z, logMat);
          } else {
            // Walls & Doorway (Doorway at x=0, z=Z_MAX)
            const isDoor = (x === 0 && z === Z_MAX);
            const isWindow = (stage >= 2 && ((Math.abs(x) === 1 && z === Z_MIN) || (x === X_MIN && Math.abs(z) === 1) || (x === X_MAX && Math.abs(z) === 1)));

            if (!isDoor) {
              addVoxel(x, 1, z, plankMat);
              addVoxel(x, 2, z, isWindow ? glassMat : plankMat);
            }
          }
        }
      }
    }

    // Stage 2+: Second Floor & Slanted Roof
    if (stage >= 2) {
      // Ceiling / 2nd floor base
      for (let x = X_MIN; x <= X_MAX; x++) {
        for (let z = Z_MIN; z <= Z_MAX; z++) {
          addVoxel(x, 3, z, plankMat);
        }
      }

      // Sloping gable roof (3 tiers)
      for (let tier = 0; tier <= 2; tier++) {
        const rMinX = X_MIN + tier;
        const rMaxX = X_MAX - tier;
        const rY = 4 + tier;

        for (let x = rMinX; x <= rMaxX; x++) {
          for (let z = Z_MIN; z <= Z_MAX; z++) {
            addVoxel(x, rY, z, roofMat);
          }
        }
      }

      // Chimney stack on back-right corner
      addVoxel(X_MAX - 1, 4, Z_MIN, cobbleMat);
      addVoxel(X_MAX - 1, 5, Z_MIN, cobbleMat);
      addVoxel(X_MAX - 1, 6, Z_MIN, cobbleMat);
    }

    // Stage 3+: Front Porch, Double Doors & Glowing Lantern Torches
    if (stage >= 3) {
      // Front Porch (z = Z_MAX + 1)
      for (let x = -2; x <= 1; x++) {
        addVoxel(x, 0, Z_MAX + 1, cobbleMat);
      }
      // Fence posts
      addVoxel(-2, 1, Z_MAX + 1, birchLogMat);
      addVoxel(1, 1, Z_MAX + 1, birchLogMat);

      // Glowing Lantern Torches
      const lanternPositions = [
        { x: -2, y: 2, z: Z_MAX + 1 },
        { x: 1, y: 2, z: Z_MAX + 1 },
      ];

      lanternPositions.forEach((pos) => {
        const light = new THREE.PointLight(0xffaa33, 2.2, 14);
        light.position.set(pos.x * BLOCK_SIZE, pos.y * BLOCK_SIZE + 0.4, pos.z * BLOCK_SIZE);
        group.add(light);

        const torchMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff7700, roughness: 0.2 });
        const lanternMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.45, 0.2), torchMat);
        lanternMesh.position.set(pos.x * BLOCK_SIZE, pos.y * BLOCK_SIZE + 0.2, pos.z * BLOCK_SIZE);
        group.add(lanternMesh);
      });
    }

    // Stage 4: Animated Iron Golem Guardian!
    if (stage >= 4) {
      golemGroup = buildArticulatedIronGolem(textures);
      group.add(golemGroup);
    }
  }

  // Helper to build Minecraft BoxGeometry with exact UV mapping into the 128x128 texture atlas
  function makeMinecraftBox(w, h, d, u0, v0, p, texW = 128, texH = 128) {
    const geo = new THREE.BoxGeometry(w * p, h * p, d * p);
    const uvs = geo.attributes.uv;

    function setUV(faceIdx, uLeft, uRight, vTop, vBottom) {
      const x0 = uLeft / texW;
      const x1 = uRight / texW;
      const y0 = 1.0 - (vTop / texH);
      const y1 = 1.0 - (vBottom / texH);

      const base = faceIdx * 4;
      uvs.setXY(base + 0, x0, y0);
      uvs.setXY(base + 1, x1, y0);
      uvs.setXY(base + 2, x0, y1);
      uvs.setXY(base + 3, x1, y1);
    }

    // 0: +X (Right)
    setUV(0, u0, u0 + d, v0 + d, v0 + d + h);
    // 1: -X (Left)
    setUV(1, u0 + d + w + d, u0 + d + w, v0 + d, v0 + d + h);
    // 2: +Y (Top)
    setUV(2, u0 + d, u0 + d + w, v0, v0 + d);
    // 3: -Y (Bottom)
    setUV(3, u0 + d + w, u0 + d + w + w, v0, v0 + d);
    // 4: +Z (Front)
    setUV(4, u0 + d, u0 + d + w, v0 + d, v0 + d + h);
    // 5: -Z (Back)
    setUV(5, u0 + d + w + d + w, u0 + d + w + d, v0 + d, v0 + d + h);

    uvs.needsUpdate = true;
    return geo;
  }

  // Cached Iron Golem material with authentic 128x128 texture
  let golemMaterial = null;
  function getGolemMaterial(textures) {
    if (golemMaterial) return golemMaterial;
    const texLoader = new THREE.TextureLoader();
    const golemTex = texLoader.load(`${import.meta.env.BASE_URL}assets/mobs/iron_golem.png?v=2`);
    golemTex.colorSpace = THREE.SRGBColorSpace;
    golemTex.magFilter = THREE.NearestFilter;
    golemTex.minFilter = THREE.NearestFilter;
    golemTex.generateMipmaps = false;
    golemTex.needsUpdate = true;

    golemMaterial = new THREE.MeshStandardMaterial({
      map: golemTex,
      roughness: 0.85,
      metalness: 0.1,
    });
    return golemMaterial;
  }

  function buildArticulatedIronGolem(textures) {
    const golem = new THREE.Group();
    golem.name = 'iron-golem';
    golem.position.set(2.5 * BLOCK_SIZE, 0, (3 + 1.2) * BLOCK_SIZE);

    const mat = getGolemMaterial(textures);
    // Pixel scale: 1 px = 0.055 units -> total height ~2.4 units (2.7m tall Minecraft Guardian)
    const P = 0.055;

    // ── 1. Left & Right Legs (Hinged at hips) ──
    // Leg size: w=6, h=16, d=5. UVs: Right leg (37, 0), Left leg (60, 0)
    const legH = 16 * P;

    const rLegGeo = makeMinecraftBox(6, 16, 5, 37, 0, P);
    const lLegGeo = makeMinecraftBox(6, 16, 5, 60, 0, P);

    const rLegPivot = new THREE.Group();
    rLegPivot.position.set(4.5 * P, legH, 0);
    const rLegMesh = new THREE.Mesh(rLegGeo, mat);
    rLegMesh.position.set(0, -legH / 2, 0);
    rLegMesh.castShadow = true;
    rLegMesh.receiveShadow = true;
    rLegPivot.add(rLegMesh);

    const lLegPivot = new THREE.Group();
    lLegPivot.position.set(-4.5 * P, legH, 0);
    const lLegMesh = new THREE.Mesh(lLegGeo, mat);
    lLegMesh.position.set(0, -legH / 2, 0);
    lLegMesh.castShadow = true;
    lLegMesh.receiveShadow = true;
    lLegPivot.add(lLegMesh);

    golem.add(rLegPivot, lLegPivot);

    // ── 2. Torso / Waist & Upper Body (Heaves & sways during walk) ──
    const torsoGroup = new THREE.Group();
    torsoGroup.position.set(0, legH, 0);

    // Lower Waist: w=9, h=5, d=6. UV: (0, 70)
    const waistGeo = makeMinecraftBox(9, 5, 6, 0, 70, P);
    const waistMesh = new THREE.Mesh(waistGeo, mat);
    waistMesh.position.set(0, (5 / 2) * P, 0);
    waistMesh.castShadow = true;
    torsoGroup.add(waistMesh);

    // Massive Upper Chest: w=18, h=12, d=11. UV: (0, 40)
    const chestH = 12 * P;
    const chestGeo = makeMinecraftBox(18, 12, 11, 0, 40, P);
    const chestMesh = new THREE.Mesh(chestGeo, mat);
    chestMesh.position.set(0, 5 * P + chestH / 2, 0);
    chestMesh.castShadow = true;
    chestMesh.receiveShadow = true;
    torsoGroup.add(chestMesh);

    // ── 3. Head & Snout (Pivoted on top of chest, looks around) ──
    // Head size: w=8, h=10, d=8. UV: (0, 0). Snout: w=2, h=4, d=2. UV: (24, 0)
    const headPivot = new THREE.Group();
    headPivot.position.set(0, (5 + 12) * P, -2 * P);

    const headGeo = makeMinecraftBox(8, 10, 8, 0, 0, P);
    const headMesh = new THREE.Mesh(headGeo, mat);
    headMesh.position.set(0, 5 * P, 0);
    headMesh.castShadow = true;
    headMesh.receiveShadow = true;
    headPivot.add(headMesh);

    // 3D Villager Snout
    const noseGeo = makeMinecraftBox(2, 4, 2, 24, 0, P);
    const noseMesh = new THREE.Mesh(noseGeo, mat);
    noseMesh.position.set(0, 3 * P, (4 + 1) * P);
    noseMesh.castShadow = true;
    headPivot.add(noseMesh);

    torsoGroup.add(headPivot);

    // ── 4. Long Heavy Arms (Hinged at massive shoulders) ──
    // Arm size: w=4, h=30, d=6. UVs: Right Arm (60, 21), Left Arm (60, 58)
    const armH = 30 * P;
    const shoulderY = (5 + 12 - 2) * P;
    const shoulderX = (9 + 2) * P;

    const rArmGeo = makeMinecraftBox(4, 30, 6, 60, 21, P);
    const rArmPivot = new THREE.Group();
    rArmPivot.position.set(shoulderX, shoulderY, 0);
    const rArmMesh = new THREE.Mesh(rArmGeo, mat);
    rArmMesh.position.set(0, -armH / 2, 0);
    rArmMesh.castShadow = true;
    rArmMesh.receiveShadow = true;
    rArmPivot.add(rArmMesh);

    const lArmGeo = makeMinecraftBox(4, 30, 6, 60, 58, P);
    const lArmPivot = new THREE.Group();
    lArmPivot.position.set(-shoulderX, shoulderY, 0);
    const lArmMesh = new THREE.Mesh(lArmGeo, mat);
    lArmMesh.position.set(0, -armH / 2, 0);
    lArmMesh.castShadow = true;
    lArmMesh.receiveShadow = true;
    lArmPivot.add(lArmMesh);

    torsoGroup.add(rArmPivot, lArmPivot);
    golem.add(torsoGroup);

    golem.userData.anim = {
      lLegPivot,
      rLegPivot,
      lArmPivot,
      rArmPivot,
      headPivot,
      torsoGroup,
    };

    return golem;
  }

  // Initial build
  buildHouseMesh(currentStage);

  function update(dt, nowT) {
    if (!golemGroup || !golemGroup.userData.anim) return;
    const { lLegPivot, rLegPivot, lArmPivot, rArmPivot, headPivot, torsoGroup } = golemGroup.userData.anim;

    // Heavy Iron Golem Patrol Walking Animation
    const speed = 0.65;
    const cycle = (nowT * speed) % 4;
    const walkPhase = Math.sin(nowT * 3.4);

    // Stomping patrol pacing
    const baseX = 2.0 * BLOCK_SIZE;
    const patrolDist = 3.6 * BLOCK_SIZE;

    if (cycle < 2) {
      // Forward patrol
      golemGroup.position.x = baseX + (cycle / 2) * patrolDist;
      golemGroup.rotation.y = Math.PI / 2;

      // Heavy swing gait
      lArmPivot.rotation.x = walkPhase * 0.65;
      rArmPivot.rotation.x = -walkPhase * 0.65;
      lLegPivot.rotation.x = -walkPhase * 0.5;
      rLegPivot.rotation.x = walkPhase * 0.5;
    } else {
      // Return patrol
      golemGroup.position.x = (baseX + patrolDist) - ((cycle - 2) / 2) * patrolDist;
      golemGroup.rotation.y = -Math.PI / 2;

      lArmPivot.rotation.x = -walkPhase * 0.65;
      rArmPivot.rotation.x = walkPhase * 0.65;
      lLegPivot.rotation.x = walkPhase * 0.5;
      rLegPivot.rotation.x = -walkPhase * 0.5;
    }

    // Heavy vertical step bounce
    golemGroup.position.y = Math.abs(Math.sin(nowT * 3.4)) * 0.05;

    // Head searching and body sway
    headPivot.rotation.y = Math.sin(nowT * 1.1) * 0.3;
    torsoGroup.rotation.z = Math.sin(nowT * 3.4) * 0.03;
  }

  function getStage() { return currentStage; }

  function getNextCost() {
    if (currentStage >= 4) return 0;
    return HOUSE_COSTS[currentStage];
  }

  function upgrade(wallet) {
    if (currentStage >= 4) return { success: false, reason: 'max' };
    const cost = getNextCost();
    if (!wallet || wallet.bolts < cost) return { success: false, reason: 'funds' };

    wallet.spend(cost);
    currentStage++;
    writeJSON(storage, SAVE_KEY, { stage: currentStage });
    buildHouseMesh(currentStage);
    return { success: true, newStage: currentStage };
  }

  function reset() {
    currentStage = 0;
    writeJSON(storage, SAVE_KEY, { stage: 0 });
    buildHouseMesh(0);
  }

  return {
    group,
    getStage,
    getNextCost,
    upgrade,
    reset,
    update,
    setStage: (s) => {
      currentStage = s;
      writeJSON(storage, SAVE_KEY, { stage: s });
      buildHouseMesh(s);
    },
  };
}
