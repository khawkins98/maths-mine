// core/house.js — Voxel House Builder & Iron Golem Guardian reward loop.
// Fills the Bolts economy (spending earned 🔩) by unlocking 3D house stages
// on the home island, culminating in an Iron Golem guardian & night mode!

import * as THREE from 'three';
import { localStore, readJSON, writeJSON } from './storage.js';

const SAVE_KEY = 'house_stage.v1';
const BLOCK_SIZE = 0.72;

export const HOUSE_COSTS = [5, 10, 15, 20]; // Costs for Stage 1, 2, 3, 4

export function createHouseManager({ scene, textures, storage = localStore() } = {}) {
  const group = new THREE.Group();
  group.name = 'player-house';
  // Position on back-left of island platform
  group.position.set(-7, 0, -4);
  scene.add(group);

  const saved = readJSON(storage, SAVE_KEY);
  let currentStage = (saved && Number.isFinite(saved.stage)) ? saved.stage : 0;

  // Materials
  const logMat = new THREE.MeshStandardMaterial({ map: textures.logTex, roughness: 1, metalness: 0 });
  const plankMat = new THREE.MeshStandardMaterial({ map: textures.plankTex || textures.woodTex, roughness: 1, metalness: 0 });
  const cobbleMat = new THREE.MeshStandardMaterial({ map: textures.cobbleTex || textures.stoneTex, roughness: 1, metalness: 0 });
  const glassMat = new THREE.MeshStandardMaterial({
    map: textures.glassTex, transparent: true, opacity: 0.65, roughness: 0.2, metalness: 0.1,
  });
  const ironMat = new THREE.MeshStandardMaterial({ map: textures.ironBlockTex, roughness: 0.6, metalness: 0.4 });
  const pumpkinMat = new THREE.MeshStandardMaterial({ map: textures.pumpkinTex, roughness: 0.9, metalness: 0 });

  const boxGeo = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);

  function clearHouse() {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if (child.geometry) child.geometry.dispose();
    }
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
      // Stage 0: Foundation plot markers
      addVoxel(-2, 0, -2, cobbleMat);
      addVoxel(2, 0, -2, cobbleMat);
      addVoxel(-2, 0, 2, cobbleMat);
      addVoxel(2, 0, 2, cobbleMat);
      return;
    }

    // Stage 1: Base & Walls (4x4 footprint)
    for (let x = -2; x <= 2; x++) {
      for (let z = -2; z <= 2; z++) {
        const isCorner = (Math.abs(x) === 2 && Math.abs(z) === 2);
        const isEdge = (Math.abs(x) === 2 || Math.abs(z) === 2);

        // Floor
        addVoxel(x, 0, z, cobbleMat);

        if (isEdge) {
          if (isCorner) {
            // Log corner pillars
            addVoxel(x, 1, z, logMat);
            addVoxel(x, 2, z, logMat);
          } else {
            // Wood plank walls (leave doorway at front: x=0, z=2)
            if (!(x === 0 && z === 2)) {
              addVoxel(x, 1, z, plankMat);
              if (stage >= 2 && Math.abs(x) === 1 && Math.abs(z) === 2) {
                addVoxel(x, 2, z, glassMat); // Glass windows at Stage 2+
              } else {
                addVoxel(x, 2, z, plankMat);
              }
            }
          }
        }
      }
    }

    // Stage 2+: Roof & Gables
    if (stage >= 2) {
      for (let x = -2; x <= 2; x++) {
        for (let z = -2; z <= 2; z++) {
          addVoxel(x, 3, z, plankMat);
        }
      }
      // Top peak roof ridge
      for (let z = -1; z <= 1; z++) {
        addVoxel(0, 4, z, logMat);
      }
    }

    // Stage 3+: Torch Lights & Doorway
    if (stage >= 3) {
      // Doorway arch
      addVoxel(0, 2, 2, logMat);

      // Glowing Wall Torch lights
      const torchLight = new THREE.PointLight(0xffaa33, 1.8, 12);
      torchLight.position.set(0, 2.5 * BLOCK_SIZE, 2.3 * BLOCK_SIZE);
      group.add(torchLight);

      // Torch visual mesh
      const torchMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff6600, roughness: 0.2 });
      const torchMesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.15), torchMat);
      torchMesh.position.set(0, 2.2 * BLOCK_SIZE, 2.2 * BLOCK_SIZE);
      group.add(torchMesh);
    }

    // Stage 4: Iron Golem Guardian!
    if (stage >= 4) {
      buildIronGolem();
    }
  }

  function buildIronGolem() {
    const golem = new THREE.Group();
    golem.name = 'iron-golem';
    golem.position.set(3.0 * BLOCK_SIZE, 0, 1.5 * BLOCK_SIZE); // Standing by house entrance

    // Legs
    const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.9, 0.35), ironMat);
    lLeg.position.set(-0.25, 0.45, 0);
    const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.9, 0.35), ironMat);
    rLeg.position.set(0.25, 0.45, 0);

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.2, 0.6), ironMat);
    torso.position.set(0, 1.4, 0);

    // Arms
    const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.3, 0.3), ironMat);
    lArm.position.set(-0.65, 1.3, 0);
    const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.3, 0.3), ironMat);
    rArm.position.set(0.65, 1.3, 0);

    // Pumpkin Head with glowing eyes
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), pumpkinMat);
    head.position.set(0, 2.2, 0);

    // Glowing eyes light
    const eyeLight = new THREE.PointLight(0xffcc00, 1.2, 5);
    eyeLight.position.set(0, 2.2, 0.3);

    lLeg.castShadow = rLeg.castShadow = torso.castShadow = lArm.castShadow = rArm.castShadow = head.castShadow = true;

    golem.add(lLeg, rLeg, torso, lArm, rArm, head, eyeLight);
    group.add(golem);
  }

  // Initial build
  buildHouseMesh(currentStage);

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
    setStage: (s) => {
      currentStage = s;
      writeJSON(storage, SAVE_KEY, { stage: s });
      buildHouseMesh(s);
    },
  };
}
