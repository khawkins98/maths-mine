// src/core/mobs.js — Minecraft mob loader with graceful fallback.
//
// Attempts to load GLB models from public/assets/mobs/ (placed there manually
// by downloading from Sketchfab CC-BY). If a file is missing the mob is
// synthesised from voxel geometry so the game always runs.
//
// Sources (all CC-BY 4.0):
//   Villager  — https://sketchfab.com/3d-models/villager-minecraft-sonic-racing-crossworlds-f24d56a793e54d60b4ce9e680e8cbe58
//   Zombie    — https://sketchfab.com/3d-models/zombie-minecraft-sonic-racing-crossworlds-44bec31939524459ad11e48eb7d1396f
//   Ghast     — https://sketchfab.com/3d-models/ghast-minecraft-sonic-racing-crossworlds-5b27f5cfa6034b84b335f696de7e5b64
//   Enderman  — https://sketchfab.com/3d-models/enderman-minecraft-sonic-racing-crossworlds-142aa13b035248879b39288dd16c0c2d
//   Iron Golem— https://sketchfab.com/3d-models/minecraft-iron-golem-a34d28d5761040559d669e77090cbfaf
//   (Collection) https://sketchfab.com/RyanMcKenna/collections/minecraft-1aefafc14433471aa3c21a4003c39bc1

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = `${import.meta.env.BASE_URL}assets/mobs/`;
const loader = new GLTFLoader();

// ── Fallback voxel builders ──────────────────────────────────────────────────

function makeMat(color, emissive = 0x000000, metalness = 0, roughness = 0.9) {
  return new THREE.MeshStandardMaterial({ color, emissive, metalness, roughness });
}

/** Authentic Minecraft Villager — big schnoz, robes, brown hat */
function buildVillagerFallback() {
  const g = new THREE.Group();
  g.name = 'villager-fallback';

  const bodyMat = makeMat(0x8b7355);   // brownish robe
  const skinMat = makeMat(0xd4a574);   // villager beige skin
  const noseMat = makeMat(0xc49060);
  const hatMat  = makeMat(0x4a3728);
  const apronMat = makeMat(0x6b8c3e);  // green apron

  const B = 0.48; // block unit

  // Body / robe
  const body = new THREE.Mesh(new THREE.BoxGeometry(B * 1.2, B * 1.5, B * 0.7), bodyMat);
  body.position.y = B * 1.15;
  g.add(body);

  // Apron stripe
  const apron = new THREE.Mesh(new THREE.BoxGeometry(B * 0.65, B * 1.2, B * 0.72), apronMat);
  apron.position.y = B * 1.1;
  g.add(apron);

  // Head
  const head = new THREE.Mesh(new THREE.BoxGeometry(B * 0.85, B * 0.85, B * 0.85), skinMat);
  head.position.y = B * 2.25;
  head.name = 'villager-head';
  g.add(head);

  // Big villager nose
  const nose = new THREE.Mesh(new THREE.BoxGeometry(B * 0.22, B * 0.45, B * 0.3), noseMat);
  nose.position.set(0, B * 2.2, B * 0.55);
  g.add(nose);

  // Hat (2-layer)
  const hatBrim = new THREE.Mesh(new THREE.BoxGeometry(B * 1.0, B * 0.08, B * 1.0), hatMat);
  hatBrim.position.y = B * 2.72;
  g.add(hatBrim);
  const hatTop = new THREE.Mesh(new THREE.BoxGeometry(B * 0.78, B * 0.55, B * 0.78), hatMat);
  hatTop.position.y = B * 3.05;
  g.add(hatTop);

  // Arms
  const armGeo = new THREE.BoxGeometry(B * 0.35, B * 1.0, B * 0.35);
  const lArm = new THREE.Mesh(armGeo, bodyMat);
  lArm.position.set(-B * 0.78, B * 1.15, 0);
  g.add(lArm);
  const rArm = new THREE.Mesh(armGeo, bodyMat);
  rArm.position.set(B * 0.78, B * 1.15, 0);
  g.add(rArm);

  // Legs
  const legGeo = new THREE.BoxGeometry(B * 0.4, B * 0.8, B * 0.4);
  const lLeg = new THREE.Mesh(legGeo, bodyMat);
  lLeg.position.set(-B * 0.28, B * 0.35, 0);
  g.add(lLeg);
  const rLeg = new THREE.Mesh(legGeo, bodyMat);
  rLeg.position.set(B * 0.28, B * 0.35, 0);
  g.add(rLeg);

  g.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });

  // Expose head joint for animations
  g.userData.joints = { neck: head, shoulders: {}, hips: {}, body, eyes: [] };
  return g;
}

/** Minecraft Zombie — rotting green skin, outstretched arms */
function buildZombieFallback() {
  const g = new THREE.Group();
  g.name = 'zombie-fallback';

  const skinMat  = makeMat(0x4a7a4a);  // zombified green skin
  const shirtMat = makeMat(0x3d5a7a);  // torn blue shirt
  const hairMat  = makeMat(0x1c2e0c);
  const B = 0.48;

  const body = new THREE.Mesh(new THREE.BoxGeometry(B * 1.1, B * 1.4, B * 0.65), shirtMat);
  body.position.y = B * 1.1;
  g.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(B * 0.88, B * 0.88, B * 0.88), skinMat);
  head.position.y = B * 2.25;
  head.name = 'zombie-head';
  g.add(head);

  // Hair patches (zombie dishevelled look)
  [-0.25, 0.25].forEach(xOff => {
    const hair = new THREE.Mesh(new THREE.BoxGeometry(B * 0.22, B * 0.18, B * 0.22), hairMat);
    hair.position.set(xOff, B * 2.74, 0);
    g.add(hair);
  });

  // Outstretched arms (iconic zombie pose, rotated forward)
  const armGeo = new THREE.BoxGeometry(B * 0.38, B * 1.05, B * 0.38);
  const lArm = new THREE.Mesh(armGeo, skinMat);
  lArm.position.set(-B * 0.78, B * 1.55, B * 0.38);
  lArm.rotation.x = -Math.PI / 2.8;
  g.add(lArm);
  const rArm = new THREE.Mesh(armGeo, skinMat);
  rArm.position.set(B * 0.78, B * 1.55, B * 0.38);
  rArm.rotation.x = -Math.PI / 2.8;
  g.add(rArm);

  const legGeo = new THREE.BoxGeometry(B * 0.42, B * 0.85, B * 0.42);
  const lLeg = new THREE.Mesh(legGeo, shirtMat);
  lLeg.position.set(-B * 0.27, B * 0.38, 0);
  g.add(lLeg);
  const rLeg = new THREE.Mesh(legGeo, shirtMat);
  rLeg.position.set(B * 0.27, B * 0.38, 0);
  g.add(rLeg);

  g.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
  g.userData.joints = { neck: head, shoulders: {}, hips: {}, body, eyes: [] };
  return g;
}

/** Minecraft Ghast — large white floating cube with tentacles */
function buildGhastFallback() {
  const g = new THREE.Group();
  g.name = 'ghast-fallback';

  const bodyMat = makeMat(0xffffff, 0xffffff, 0, 0.15);
  const eyeMat  = makeMat(0xff2222, 0xff0000, 0, 0.3);
  const tentMat = makeMat(0xeeeeee);

  const B = 0.9; // Ghast is bigger

  // Large boxy body
  const body = new THREE.Mesh(new THREE.BoxGeometry(B * 2.8, B * 2.8, B * 2.8), bodyMat);
  body.position.y = B * 2.8;
  g.add(body);

  // 3 red squinting eyes
  [[-0.5, 0.2], [0, 0.25], [0.5, 0.2]].forEach(([x, y], i) => {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.05), eyeMat);
    eye.position.set(x, B * 2.8 + y, B * 1.41);
    g.add(eye);
  });

  // 9 dangling tentacles
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      const len = 0.6 + Math.random() * 0.6;
      const tent = new THREE.Mesh(new THREE.BoxGeometry(0.15, len, 0.15), tentMat);
      tent.position.set((col - 1) * 0.55, B * 2.8 - B * 1.4 - len / 2, (row - 1) * 0.55);
      g.add(tent);
    }
  }

  g.traverse((n) => { if (n.isMesh) { n.castShadow = true; } });
  g.userData.joints = { neck: body, shoulders: {}, hips: {}, body, eyes: [] };
  return g;
}

/** Minecraft Enderman — tall, black, purple eyes, long limbs */
function buildEndermanFallback() {
  const g = new THREE.Group();
  g.name = 'enderman-fallback';

  const bodyMat = makeMat(0x111111);
  const eyeMat  = makeMat(0x9b59ff, 0x7b35ff, 0, 0.2);
  const B = 0.36; // narrower block unit — enderman is slender

  // Very tall slim body
  const body = new THREE.Mesh(new THREE.BoxGeometry(B * 1.1, B * 3.2, B * 0.6), bodyMat);
  body.position.y = B * 3.2;
  g.add(body);

  // Head
  const head = new THREE.Mesh(new THREE.BoxGeometry(B * 0.9, B * 0.9, B * 0.9), bodyMat);
  head.position.y = B * 7.0;
  head.name = 'enderman-head';
  g.add(head);

  // Glowing purple eyes
  const eyeGeo = new THREE.BoxGeometry(0.06, 0.06, 0.04);
  [-0.12, 0.12].forEach(xOff => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(xOff, B * 7.05, B * 0.47);
    g.add(eye);
  });
  const eyeLight = new THREE.PointLight(0x9b59ff, 1.2, 6);
  eyeLight.position.set(0, B * 7.0, B * 0.5);
  g.add(eyeLight);

  // Very long arms
  const armGeo = new THREE.BoxGeometry(B * 0.3, B * 4.0, B * 0.3);
  const lArm = new THREE.Mesh(armGeo, bodyMat);
  lArm.position.set(-B * 0.75, B * 2.8, 0);
  g.add(lArm);
  const rArm = new THREE.Mesh(armGeo, bodyMat);
  rArm.position.set(B * 0.75, B * 2.8, 0);
  g.add(rArm);

  // Long legs
  const legGeo = new THREE.BoxGeometry(B * 0.3, B * 3.8, B * 0.3);
  const lLeg = new THREE.Mesh(legGeo, bodyMat);
  lLeg.position.set(-B * 0.25, B * 1.65, 0);
  g.add(lLeg);
  const rLeg = new THREE.Mesh(legGeo, bodyMat);
  rLeg.position.set(B * 0.25, B * 1.65, 0);
  g.add(rLeg);

  g.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
  g.userData.joints = { neck: head, shoulders: {}, hips: {}, body, eyes: [] };
  return g;
}

// ── GLTF loader with graceful fallback ──────────────────────────────────────

async function tryLoadGLTF(filename) {
  try {
    const gltf = await loader.loadAsync(BASE + filename);
    // normalise textures
    gltf.scene.traverse((n) => {
      if (n.isMesh) {
        n.castShadow = true;
        n.receiveShadow = true;
        if (n.material && n.material.map) {
          n.material.map.magFilter = THREE.NearestFilter;
          n.material.map.minFilter = THREE.NearestFilter;
          n.material.map.generateMipmaps = false;
        }
      }
    });
    return gltf.scene;
  } catch {
    return null; // file not present — caller uses fallback
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export const MOB_TYPES = ['villager', 'zombie', 'ghast', 'enderman'];

const FALLBACKS = {
  villager: buildVillagerFallback,
  zombie:   buildZombieFallback,
  ghast:    buildGhastFallback,
  enderman: buildEndermanFallback,
};

const FILENAMES = {
  villager: 'villager.glb',
  zombie:   'zombie.glb',
  ghast:    'ghast.glb',
  enderman: 'enderman.glb',
};

/**
 * Load all mobs. Returns a map { villager, zombie, ghast, enderman }
 * where each value is a factory function: `() => THREE.Group`
 */
export async function loadMobs() {
  // Attempt parallel loads — failures silently become null
  const results = await Promise.all(
    MOB_TYPES.map(type => tryLoadGLTF(FILENAMES[type]))
  );

  const factories = {};
  MOB_TYPES.forEach((type, i) => {
    const gltfScene = results[i];
    if (gltfScene) {
      // GLB loaded — clone on each call so the scene can hold multiple instances
      factories[type] = () => {
        const clone = gltfScene.clone(true);
        clone.name = `${type}-gltf`;
        return clone;
      };
      console.log(`[mobs] ✅ Loaded ${type}.glb`);
    } else {
      // Fallback procedural mesh
      factories[type] = FALLBACKS[type];
      console.log(`[mobs] ⚠️  ${type}.glb not found — using procedural fallback`);
    }
  });

  return factories;
}

/**
 * Convenience: create a single mob clone by type name.
 * Pass the factories object returned by loadMobs().
 */
export function createMob(factories, type) {
  const factory = factories[type] || factories.villager;
  return factory ? factory() : buildVillagerFallback();
}

/**
 * Simple idle float animation for Ghast.
 * Call each frame with dt and elapsed time.
 */
export function animateGhast(ghastGroup, nowT) {
  if (!ghastGroup) return;
  ghastGroup.position.y += Math.sin(nowT * 1.8) * 0.003;
  ghastGroup.rotation.y = Math.sin(nowT * 0.5) * 0.12;
}

/**
 * Enderman idle sway — slight lean and arm droop.
 */
export function animateEnderman(endermanGroup, nowT) {
  if (!endermanGroup) return;
  endermanGroup.rotation.z = Math.sin(nowT * 0.9) * 0.04;
  const neck = endermanGroup.userData.joints && endermanGroup.userData.joints.neck;
  if (neck) neck.rotation.y = Math.sin(nowT * 1.3) * 0.25;
}
