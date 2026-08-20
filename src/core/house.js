// core/house.js — Expanded 3D Voxel House & Animated Iron Golem Guardian.
// Builds a grand multi-story Minecraft Cottage on the island and features an
// animated 2.7m tall Iron Golem with heavy patrol strides, swinging arms, and glowing eyes!

import * as THREE from 'three';
import { localStore, readJSON, writeJSON } from './storage.js';

const SAVE_KEY = 'house_stage.v1';
const BLOCK_SIZE = 0.72;

export const HOUSE_COSTS = [5, 10, 15, 20, 25, 30, 35, 40]; // Costs for Stages 1 to 8

export function createHouseManager({ scene, textures, storage = localStore() } = {}) {
  const group = new THREE.Group();
  group.name = 'player-house';
  // Position on back-left corner of island platform
  group.position.set(-6.5, 0, -4.5);
  scene.add(group);

  const saved = readJSON(storage, SAVE_KEY);
  let currentStage = (saved && Number.isFinite(saved.stage)) ? saved.stage : 0;

  let golemGroup = null;
  let wolfGroup = null;
  let windmillSails = null;
  let beaconBeam = null;

  // Materials
  const logMat = new THREE.MeshStandardMaterial({ map: textures.logTex, roughness: 1, metalness: 0 });
  const birchLogMat = new THREE.MeshStandardMaterial({ map: textures.birchLogTex || textures.logTex, roughness: 1, metalness: 0 });
  const plankMat = new THREE.MeshStandardMaterial({ map: textures.plankTex || textures.woodTex, roughness: 1, metalness: 0 });
  const cobbleMat = new THREE.MeshStandardMaterial({ map: textures.cobbleTex || textures.stoneTex, roughness: 1, metalness: 0 });
  const brickMat = new THREE.MeshStandardMaterial({ map: textures.brickTex || textures.cobbleTex, roughness: 0.9, metalness: 0 });
  const glassMat = new THREE.MeshStandardMaterial({
    map: textures.glassTex, transparent: true, opacity: 0.65, roughness: 0.2, metalness: 0.1,
  });
  const ironMat = new THREE.MeshStandardMaterial({ map: textures.ironBlockTex || textures.ironGolemTex, roughness: 0.6, metalness: 0.3 });
  const goldMat = new THREE.MeshStandardMaterial({ map: textures.goldTex, roughness: 0.5, metalness: 0.4 });
  const diamondMat = new THREE.MeshStandardMaterial({ map: textures.diamondTex, roughness: 0.4, metalness: 0.2, emissive: 0x113344 });
  const obsidianMat = new THREE.MeshStandardMaterial({ map: textures.obsidianTex, roughness: 0.7, metalness: 0.1 });
  const portalMat = new THREE.MeshStandardMaterial({ map: textures.portalTex, roughness: 0.2, emissive: 0x440066 });
  const lavaMat = new THREE.MeshStandardMaterial({ map: textures.lavaTex, roughness: 0.3, emissive: 0xff4400 });
  const hayMat = new THREE.MeshStandardMaterial({ map: textures.hayTex, roughness: 0.9, metalness: 0 });
  const roofMat = new THREE.MeshStandardMaterial({ map: textures.logTex, roughness: 1, metalness: 0 });

  const boxGeo = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);

  function clearHouse() {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if (child.geometry) child.geometry.dispose();
    }
    golemGroup = null;
    wolfGroup = null;
    windmillSails = null;
    beaconBeam = null;
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

    // Stage 4+: Animated Iron Golem Guardian!
    if (stage >= 4) {
      golemGroup = buildArticulatedIronGolem(textures);
      group.add(golemGroup);
    }

    // ── Stage 5: The Blacksmith's Forge ──
    if (stage >= 5) {
      // Hearth foundation (x = 4..7, z = -3..0)
      for (let fx = 4; fx <= 7; fx++) {
        for (let fz = -3; fz <= 0; fz++) {
          addVoxel(fx, 0, fz, cobbleMat);
        }
      }
      // Brick walls and chimney
      addVoxel(4, 1, -3, brickMat);
      addVoxel(5, 1, -3, brickMat);
      addVoxel(6, 1, -3, brickMat);
      addVoxel(7, 1, -3, brickMat);
      addVoxel(7, 1, -2, brickMat);
      addVoxel(7, 1, -1, brickMat);
      addVoxel(7, 1, 0, brickMat);
      // Chimney
      addVoxel(6, 2, -3, brickMat);
      addVoxel(6, 3, -3, brickMat);
      addVoxel(6, 4, -3, brickMat);
      // Lava Hearth Pool
      addVoxel(5, 1, -2, lavaMat);
      // Anvil (Iron block)
      addVoxel(5, 1, 0, ironMat);

      const lavaLight = new THREE.PointLight(0xff5500, 2.5, 10);
      lavaLight.position.set(5 * BLOCK_SIZE, 1.5 * BLOCK_SIZE, -2 * BLOCK_SIZE);
      group.add(lavaLight);
    }

    // ── Stage 6: Village Farmland & Windmill ──
    if (stage >= 6) {
      // Farmland crops
      for (let cx = 4; cx <= 7; cx++) {
        for (let cz = 2; cz <= 4; cz++) {
          addVoxel(cx, 0, cz, cobbleMat);
          addVoxel(cx, 1, cz, hayMat);
        }
      }
      // Windmill Tower Base
      addVoxel(6, 2, 3, plankMat);
      addVoxel(6, 3, 3, plankMat);
      addVoxel(6, 4, 3, logMat);

      // Spinning Windmill Sails
      windmillSails = new THREE.Group();
      windmillSails.position.set(6 * BLOCK_SIZE, 4.2 * BLOCK_SIZE, 3.6 * BLOCK_SIZE);
      for (let blade = 0; blade < 4; blade++) {
        const bladeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.8, 0.05), plankMat);
        bladeMesh.rotation.z = (blade * Math.PI) / 2;
        bladeMesh.position.set(0, 0.9 * Math.cos((blade * Math.PI) / 2), 0);
        windmillSails.add(bladeMesh);
      }
      group.add(windmillSails);
    }

    // ── Stage 7: Tamed Wolf Companion ──
    if (stage >= 7) {
      // Cozy doghouse kennel
      addVoxel(-5, 0, 1, plankMat);
      addVoxel(-5, 1, 1, plankMat);
      addVoxel(-5, 0, 2, cobbleMat);

      // Animated 3D Voxel Wolf
      wolfGroup = buildVoxelWolf();
      wolfGroup.position.set(-4.2 * BLOCK_SIZE, 0, 2.2 * BLOCK_SIZE);
      group.add(wolfGroup);
    }

    // ── Stage 8: Nether Portal & Celestial Beacon ──
    if (stage >= 8) {
      // Obsidian Nether Portal Frame (4x5) at x = -6, z = -3..-1
      addVoxel(-6, 0, -3, obsidianMat);
      addVoxel(-6, 0, -2, obsidianMat);
      addVoxel(-6, 0, -1, obsidianMat);
      addVoxel(-6, 0, 0, obsidianMat);

      addVoxel(-6, 1, -3, obsidianMat);
      addVoxel(-6, 2, -3, obsidianMat);
      addVoxel(-6, 3, -3, obsidianMat);

      addVoxel(-6, 1, 0, obsidianMat);
      addVoxel(-6, 2, 0, obsidianMat);
      addVoxel(-6, 3, 0, obsidianMat);

      addVoxel(-6, 4, -3, obsidianMat);
      addVoxel(-6, 4, -2, obsidianMat);
      addVoxel(-6, 4, -1, obsidianMat);
      addVoxel(-6, 4, 0, obsidianMat);

      // Glowing Portal Vortex
      addVoxel(-6, 1, -2, portalMat);
      addVoxel(-6, 1, -1, portalMat);
      addVoxel(-6, 2, -2, portalMat);
      addVoxel(-6, 2, -1, portalMat);
      addVoxel(-6, 3, -2, portalMat);
      addVoxel(-6, 3, -1, portalMat);

      const portalLight = new THREE.PointLight(0xa832ff, 3.0, 12);
      portalLight.position.set(-6 * BLOCK_SIZE, 2.5 * BLOCK_SIZE, -1.5 * BLOCK_SIZE);
      group.add(portalLight);

      // Diamond Beacon Base
      addVoxel(0, 0, -5, diamondMat);
      addVoxel(-1, 0, -5, diamondMat);
      addVoxel(1, 0, -5, diamondMat);
      addVoxel(0, 1, -5, glassMat);

      // Soaring Celestial Beacon Beam
      const beamGeo = new THREE.CylinderGeometry(0.18, 0.18, 40, 16);
      const beamMat = new THREE.MeshBasicMaterial({
        color: 0x4dedf4,
        transparent: true,
        opacity: 0.65,
      });
      beaconBeam = new THREE.Mesh(beamGeo, beamMat);
      beaconBeam.userData.ignoreProjectionBounds = true; // sky effect, not an interaction silhouette
      beaconBeam.position.set(0, 20, -5 * BLOCK_SIZE);
      group.add(beaconBeam);
    }
  }

  // ── Helper: 3D Voxel Tamed Wolf Model ──
  function buildVoxelWolf() {
    const w = new THREE.Group();
    w.name = 'tamed-wolf';

    const furMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.9 });
    const collarMat = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.6 });
    const muzzleMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });

    // Body (sitting)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 0.45), furMat);
    body.position.set(0, 0.35, 0);
    w.add(body);

    // Collar
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.36), collarMat);
    collar.position.set(0, 0.58, 0.15);
    w.add(collar);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), furMat);
    head.position.set(0, 0.76, 0.2);
    w.add(head);

    // Snout / Muzzle
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.15, 0.22), furMat);
    snout.position.set(0, 0.72, 0.42);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.06), muzzleMat);
    nose.position.set(0, 0.76, 0.54);
    w.add(snout, nose);

    // Ears
    const rEar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.08), furMat);
    rEar.position.set(0.14, 0.98, 0.16);
    const lEar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.08), furMat);
    lEar.position.set(-0.14, 0.98, 0.16);
    w.add(rEar, lEar);

    // Wagging Tail Pivot
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.22, -0.22);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 0.1), furMat);
    tail.position.set(0, 0.15, -0.1);
    tail.rotation.x = -0.6;
    tailPivot.add(tail);
    w.add(tailPivot);

    w.userData.tailPivot = tailPivot;
    return w;
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

    // ── 3. Head & Snout (Pivoted forward on front of chest) ──
    // Head size: w=8, h=10, d=8. UV: (0, 0). Snout: w=2, h=4, d=2. UV: (24, 0)
    const headPivot = new THREE.Group();
    headPivot.position.set(0, (5 + 12 - 2) * P, 3.5 * P);

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

    // Windmill sails animation
    if (windmillSails) {
      windmillSails.rotation.z += (dt || 0.016) * 1.5;
    }

    // Tamed wolf tail wagging animation
    if (wolfGroup && wolfGroup.userData.tailPivot) {
      wolfGroup.userData.tailPivot.rotation.y = Math.sin(nowT * 9.0) * 0.45;
    }

    // Beacon skyward beam pulse
    if (beaconBeam) {
      beaconBeam.material.opacity = 0.55 + 0.2 * Math.sin(nowT * 3.5);
    }
  }

  function getStage() { return currentStage; }

  function getNextCost() {
    if (currentStage >= 8) return 0;
    return HOUSE_COSTS[currentStage];
  }

  function upgrade(wallet) {
    if (currentStage >= 8) return { success: false, reason: 'max' };
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
