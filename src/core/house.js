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
      golemGroup = buildIronGolem();
      group.add(golemGroup);
    }
  }

  function buildIronGolem() {
    const golem = new THREE.Group();
    golem.name = 'iron-golem';
    golem.position.set(2.5 * BLOCK_SIZE, 0, (3 + 1) * BLOCK_SIZE);

    // Scaling: 2.7m tall Minecraft Iron Golem
    const SCALE = 1.35;

    // Torso
    const torsoMat = ironMat;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.2 * SCALE, 1.2 * SCALE, 0.65 * SCALE), torsoMat);
    torso.position.y = 1.5 * SCALE;
    torso.castShadow = true;
    golem.add(torso);

    // Head with Villager Snout/Nose & Glowing Eyes
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 2.3 * SCALE, 0);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55 * SCALE, 0.65 * SCALE, 0.55 * SCALE), pumpkinMat);
    head.castShadow = true;
    headGroup.add(head);

    // 3D Villager Snout
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.18 * SCALE, 0.32 * SCALE, 0.22 * SCALE), ironMat);
    nose.position.set(0, -0.1 * SCALE, 0.34 * SCALE);
    nose.castShadow = true;
    headGroup.add(nose);

    // Eye glow light
    const eyeLight = new THREE.PointLight(0xffaa00, 1.8, 8);
    eyeLight.position.set(0, 0.1, 0.35 * SCALE);
    headGroup.add(eyeLight);

    golem.add(headGroup);

    // Jointed Arms (pivoted from shoulder)
    const lArmPivot = new THREE.Group();
    lArmPivot.position.set(-0.75 * SCALE, 1.9 * SCALE, 0);
    const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.35 * SCALE, 1.6 * SCALE, 0.35 * SCALE), ironMat);
    lArm.position.set(0, -0.7 * SCALE, 0);
    lArm.castShadow = true;
    lArmPivot.add(lArm);

    const rArmPivot = new THREE.Group();
    rArmPivot.position.set(0.75 * SCALE, 1.9 * SCALE, 0);
    const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.35 * SCALE, 1.6 * SCALE, 0.35 * SCALE), ironMat);
    rArm.position.set(0, -0.7 * SCALE, 0);
    rArm.castShadow = true;
    rArmPivot.add(rArm);

    golem.add(lArmPivot, rArmPivot);

    // Jointed Legs (pivoted from hips)
    const lLegPivot = new THREE.Group();
    lLegPivot.position.set(-0.35 * SCALE, 0.8 * SCALE, 0);
    const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.38 * SCALE, 0.8 * SCALE, 0.38 * SCALE), ironMat);
    lLeg.position.set(0, -0.4 * SCALE, 0);
    lLeg.castShadow = true;
    lLegPivot.add(lLeg);

    const rLegPivot = new THREE.Group();
    rLegPivot.position.set(0.35 * SCALE, 0.8 * SCALE, 0);
    const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.38 * SCALE, 0.8 * SCALE, 0.38 * SCALE), ironMat);
    rLeg.position.set(0, -0.4 * SCALE, 0);
    rLeg.castShadow = true;
    rLegPivot.add(rLeg);

    golem.add(lLegPivot, rLegPivot);

    golem.userData.anim = {
      headGroup, lArmPivot, rArmPivot, lLegPivot, rLegPivot, torso,
    };

    return golem;
  }

  // Initial build
  buildHouseMesh(currentStage);

  function update(dt, nowT) {
    if (!golemGroup || !golemGroup.userData.anim) return;
    const { headGroup, lArmPivot, rArmPivot, lLegPivot, rLegPivot, torso } = golemGroup.userData.anim;

    // Heavy Iron Golem Patrol Walking Animation
    const speed = 0.6;
    const cycle = (nowT * speed) % 4;
    const walkPhase = Math.sin(nowT * 3.2);

    if (cycle < 2) {
      // Patrol forward
      golemGroup.position.x = 2.0 * BLOCK_SIZE + (cycle / 2) * (3.5 * BLOCK_SIZE);
      golemGroup.rotation.y = Math.PI / 2;

      lArmPivot.rotation.x = walkPhase * 0.45;
      rArmPivot.rotation.x = -walkPhase * 0.45;
      lLegPivot.rotation.x = -walkPhase * 0.35;
      rLegPivot.rotation.x = walkPhase * 0.35;
    } else {
      // Patrol backward
      golemGroup.position.x = 5.5 * BLOCK_SIZE - ((cycle - 2) / 2) * (3.5 * BLOCK_SIZE);
      golemGroup.rotation.y = -Math.PI / 2;

      lArmPivot.rotation.x = -walkPhase * 0.45;
      rArmPivot.rotation.x = walkPhase * 0.45;
      lLegPivot.rotation.x = walkPhase * 0.35;
      rLegPivot.rotation.x = -walkPhase * 0.35;
    }

    // Head turning & torso heavy breathing
    headGroup.rotation.y = Math.sin(nowT * 1.1) * 0.3;
    torso.position.y = (1.5 * 1.35) + Math.sin(nowT * 2.0) * 0.04;
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
