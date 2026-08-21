// src/core/mobs.js — Minecraft mob loader with graceful fallback.
//
// Attempts to load GLB models from public/assets/mobs/ (placed there manually
// by downloading from Sketchfab CC-BY). If a file is missing the mob is
// synthesised from voxel geometry so the game always runs.
//
// Sources: the .glb files are CC-BY 4.0 downloads from Sketchfab, kept as
// downloaded. Each file carries its own author/licence/source in its glTF
// asset.extras block; THIRD_PARTY_NOTICES.md mirrors that and is the list to
// keep in step.
//
//   Creeper    - keithandmarchant
//   Enderman   - Guilherme Navarro
//   Ghast      - Guilherme Navarro
//   Iron Golem - Vincent Yanez
//   Steve      - Cheese
//   Villager   - Guilherme Navarro
//   Zombie     - Guilherme Navarro
//
// The sibling .png atlases are a mixed bag: enderman/ghast/villager/zombie are
// the textures out of their own models, but creeper/iron_golem/steve match
// nothing here and have no recorded source. See THIRD_PARTY_NOTICES.md.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import {
  buildSteveModel,
  buildZombieModel,
  buildVillagerModel,
  buildCreeperModel,
  buildEndermanModel,
  buildGhastModel,
} from './minecraftMobRig.js';

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

  // Expose joints matching the Kenney rig interface used by judge.js / imposter.js
  g.userData.joints = {
    neck: head,
    shoulders: { '-1': rArm, '1': lArm },
    hips: { '-1': rLeg, '1': lLeg },
    body,
    eyes: [],
  };
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
  g.userData.joints = {
    neck: head,
    shoulders: { '-1': rArm, '1': lArm },
    hips: { '-1': rLeg, '1': lLeg },
    body,
    eyes: [],
  };
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
  [[-0.5, 0.2], [0, 0.25], [0.5, 0.2]].forEach(([x, y]) => {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.05), eyeMat);
    eye.position.set(x, B * 2.8 + y, B * 1.41);
    g.add(eye);
  });

  // 9 dangling tentacles — use Two as stand-ins for arm/leg joints
  const tentacles = [];
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      const len = 0.6 + Math.random() * 0.6;
      const tent = new THREE.Mesh(new THREE.BoxGeometry(0.15, len, 0.15), tentMat);
      tent.position.set((col - 1) * 0.55, B * 2.8 - B * 1.4 - len / 2, (row - 1) * 0.55);
      g.add(tent);
      tentacles.push(tent);
    }
  }

  g.traverse((n) => { if (n.isMesh) { n.castShadow = true; } });
  // Ghast has no arms/legs — use tentacle stubs so the animation read doesn't crash
  const t0 = tentacles[0] || body;
  const t1 = tentacles[1] || body;
  const t2 = tentacles[2] || body;
  const t3 = tentacles[3] || body;
  g.userData.joints = {
    neck: body,
    shoulders: { '-1': t0, '1': t1 },
    hips: { '-1': t2, '1': t3 },
    body,
    eyes: [],
  };
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
  g.userData.joints = {
    neck: head,
    shoulders: { '-1': rArm, '1': lArm },
    hips: { '-1': rLeg, '1': lLeg },
    body,
    eyes: [],
  };
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

export const MOB_TYPES = ['villager', 'zombie', 'creeper', 'ghast', 'enderman', 'steve'];

const FALLBACKS = {
  villager: () => buildVillagerModel(0.055),
  zombie:   () => buildZombieModel(0.055),
  creeper:  () => buildCreeperModel(0.055),
  ghast:    () => buildGhastModel(0.055),
  enderman: () => buildEndermanModel(0.055),
  steve:    () => buildSteveModel(0.055),
};

const FILENAMES = {
  villager: 'villager.glb',
  zombie:   'zombie.glb',
  creeper:  'creeper.glb',
  ghast:    'ghast.glb',
  enderman: 'enderman.glb',
  steve:    'steve.glb',
};

const TARGET_HEIGHTS = {
  villager: 1.95,
  zombie:   1.95,
  creeper:  1.7,
  ghast:    2.5,
  enderman: 2.8,
  steve:    1.8,
};

function normalizeAndScaleModel(model, targetHeight = 1.8, isFloating = false) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);

  if (size.y > 0.001) {
    const scaleFactor = targetHeight / size.y;
    model.scale.setScalar(scaleFactor);
    model.updateMatrixWorld(true);
  }

  const scaledBox = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  scaledBox.getCenter(center);
  model.position.x -= center.x;
  model.position.z -= center.z;
  if (!isFloating) {
    model.position.y -= scaledBox.min.y;
  } else {
    model.position.y = 0.5;
  }
}

function bindMobJoints(model, type) {
  const head = model.getObjectByName('Head_04') || model.getObjectByName('Head_03') || model.getObjectByName('Head_05') || model.getObjectByName('Head_01') || model.getObjectByName('head_02') || model.getObjectByName('head') || model;
  const spine = model.getObjectByName('Spine_02') || model.getObjectByName('Body_04') || model.getObjectByName('Body_01') || model.getObjectByName('Body_02') || model.getObjectByName('body_01') || model;
  const rArm = model.getObjectByName('RightArm_04') || model.getObjectByName('RightArm_08') || model.getObjectByName('armR_04') || model.getObjectByName('Arm_03');
  const lArm = model.getObjectByName('LeftArm_05') || model.getObjectByName('LeftArm_07') || model.getObjectByName('armL_03') || model.getObjectByName('Arm_03');
  const rLeg = model.getObjectByName('RightLeg_05') || model.getObjectByName('RightLeg_06') || model.getObjectByName('RightLeg_03') || model.getObjectByName('legR_06') || model.getObjectByName('LegFrontR_04') || model.getObjectByName('RightLeg_02');
  const lLeg = model.getObjectByName('LeftLeg_06') || model.getObjectByName('LeftLeg_07') || model.getObjectByName('LeftLeg_02') || model.getObjectByName('legL_05') || model.getObjectByName('LegFrontL_03') || model.getObjectByName('LeftLeg_03');
  const rBackLeg = model.getObjectByName('LegBackR_06');
  const lBackLeg = model.getObjectByName('LegBackL_05');

  // Cache rest rotations on all bones for clean relative delta animations
  model.traverse((n) => {
    if (n.isBone) {
      n.userData.restRotation = n.rotation.clone();
    }
  });

  model.userData.joints = {
    neck: head,
    shoulders: { '-1': rArm || spine, '1': lArm || spine },
    hips: { '-1': rLeg || spine, '1': lLeg || spine },
    backHips: { '-1': rBackLeg, '1': lBackLeg },
    body: spine,
    eyes: [],
  };
}

/**
 * Load all mobs. Returns a map { villager, zombie, creeper, ghast, enderman, steve }
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
    if (type === 'creeper') {
      factories[type] = () => buildCreeperModel(0.055);
      console.log(`[mobs] ✅ Loaded Creeper with canonical 4-legged Minecraft rig`);
    } else if (gltfScene) {
      // Normalize root GLB scene
      normalizeAndScaleModel(gltfScene, TARGET_HEIGHTS[type] || 1.8, type === 'ghast');
      factories[type] = () => {
        const clone = cloneSkeleton(gltfScene);
        clone.name = `${type}-gltf`;
        bindMobJoints(clone, type);
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
 * Triggers an authentic Minecraft attack/action sequence on any mob instance.
 * Call this from any game mode when a mob attacks, takes damage, or gets revealed.
 */
export function triggerMobAttack(mobGroup, type) {
  if (!mobGroup) return;
  const durations = {
    golem: 0.9,
    creeper: 1.4,
    zombie: 0.75,
    enderman: 1.1,
    ghast: 1.2,
    steve: 0.6,
    villager: 1.2,
  };

  const j = mobGroup.userData.joints;
  mobGroup.userData.attackState = {
    active: true,
    type,
    timer: 0,
    duration: durations[type] || 0.8,
    initialScale: mobGroup.scale.clone(),
    initialPos: mobGroup.position.clone(),
    initialBodyPos: j && j.body ? j.body.position.clone() : new THREE.Vector3(),
    initialBodyRot: j && j.body ? j.body.rotation.clone() : new THREE.Euler(),
  };
}

/**
 * Update tick for mob attack state machine. Call in game animation loop.
 */
export function updateMobAttack(mobGroup, dt) {
  if (!mobGroup || !mobGroup.userData.attackState || !mobGroup.userData.attackState.active) return;
  const s = mobGroup.userData.attackState;
  s.timer += dt;
  const p = Math.min(s.timer / s.duration, 1.0);
  const j = mobGroup.userData.joints;

  if (s.type === 'creeper') {
    if (p < 0.8) {
      const swell = 1.0 + Math.pow(p / 0.8, 1.8) * 0.35;
      mobGroup.scale.copy(s.initialScale).multiply(new THREE.Vector3(swell, 1.0 + (swell - 1) * 0.6, swell));
      if (j && j.neck) j.neck.rotation.x = -(p / 0.8) * 0.35;
      const flash = Math.sin(p * 30) > 0;
      mobGroup.traverse(n => {
        if (n.isMesh && n.material) n.material.emissive.setHex(flash ? 0xffffff : 0x000000);
      });
    } else {
      const sub = (p - 0.8) / 0.2;
      mobGroup.scale.lerpVectors(mobGroup.scale, s.initialScale, sub);
      mobGroup.traverse(n => {
        if (n.isMesh && n.material) n.material.emissive.setHex(0x000000);
      });
      if (j && j.neck) j.neck.rotation.x = 0;
    }
  } else if (s.type === 'zombie' && j) {
    if (p < 0.3) {
      const sub = p / 0.3;
      if (j.shoulders['-1']) j.shoulders['-1'].rotation.x = -Math.PI * 0.5 - sub * Math.PI * 0.45;
      if (j.shoulders['1']) j.shoulders['1'].rotation.x = -Math.PI * 0.5 - sub * Math.PI * 0.45;
      if (j.body) j.body.rotation.x = -sub * 0.25;
      if (j.neck) j.neck.rotation.x = -sub * 0.35;
    } else if (p < 0.65) {
      const sub = (p - 0.3) / 0.35;
      if (j.shoulders['-1']) j.shoulders['-1'].rotation.x = -Math.PI * 0.95 + sub * Math.PI * 1.1;
      if (j.shoulders['1']) j.shoulders['1'].rotation.x = -Math.PI * 0.95 + sub * Math.PI * 1.1;
      if (j.body) {
        j.body.rotation.x = -0.25 + sub * 0.6;
        j.body.position.z = s.initialBodyPos.z + sub * 0.25;
      }
      if (j.neck) j.neck.rotation.x = -0.35 + sub * 0.7;
    } else {
      const sub = (p - 0.65) / 0.35;
      if (j.shoulders['-1']) j.shoulders['-1'].rotation.x = THREE.MathUtils.lerp(0.15, -Math.PI * 0.5, sub);
      if (j.shoulders['1']) j.shoulders['1'].rotation.x = THREE.MathUtils.lerp(0.15, -Math.PI * 0.5, sub);
      if (j.body) {
        j.body.rotation.x = THREE.MathUtils.lerp(0.35, 0, sub);
        j.body.position.z = THREE.MathUtils.lerp(s.initialBodyPos.z + 0.25, s.initialBodyPos.z, sub);
      }
      if (j.neck) j.neck.rotation.x = THREE.MathUtils.lerp(0.35, 0, sub);
    }
  } else if (s.type === 'golem' && j) {
    const baseY = s.initialBodyPos.y;
    // Canonical Minecraft Iron Golem double-arm uppercut swing
    if (p < 0.25) {
      // Phase 1: Windup — arms swing back, torso leans forward into the blow
      const sub = p / 0.25;
      if (j.shoulders['-1']) j.shoulders['-1'].rotation.x = sub * 0.45;
      if (j.shoulders['1']) j.shoulders['1'].rotation.x = sub * 0.45;
      if (j.body) {
        j.body.rotation.x = sub * 0.18;
        j.body.position.y = baseY - sub * 0.04;
      }
      if (j.neck) j.neck.rotation.x = -sub * 0.12;
    } else if (p < 0.55) {
      // Phase 2: Explosive Uppercut — both massive arms whip straight up and overhead!
      const sub = (p - 0.25) / 0.30;
      const armRot = 0.45 - sub * 2.85; // 0.45 -> -2.4 rad
      if (j.shoulders['-1']) j.shoulders['-1'].rotation.x = armRot;
      if (j.shoulders['1']) j.shoulders['1'].rotation.x = armRot;
      if (j.body) {
        j.body.rotation.x = 0.18 - sub * 0.45; // 0.18 -> -0.27 rad (rears back)
        j.body.position.y = baseY - 0.04 + sub * 0.15; // heave upward above baseline
      }
      if (j.neck) j.neck.rotation.x = -0.12 - sub * 0.30; // head tilts up with punch
    } else {
      // Phase 3: Recovery — arms and torso smoothly return to idle ready stance
      const sub = (p - 0.55) / 0.45;
      if (j.shoulders['-1']) j.shoulders['-1'].rotation.x = THREE.MathUtils.lerp(-2.4, 0, sub);
      if (j.shoulders['1']) j.shoulders['1'].rotation.x = THREE.MathUtils.lerp(-2.4, 0, sub);
      if (j.body) {
        j.body.rotation.x = THREE.MathUtils.lerp(-0.27, 0, sub);
        j.body.position.y = THREE.MathUtils.lerp(baseY + 0.11, baseY, sub);
      }
      if (j.neck) j.neck.rotation.x = THREE.MathUtils.lerp(-0.42, 0, sub);
    }
  }

  if (p >= 1.0) {
    s.active = false;
    mobGroup.scale.copy(s.initialScale);
    mobGroup.position.copy(s.initialPos);
    if (j) {
      if (j.shoulders['-1']) j.shoulders['-1'].rotation.set(0, 0, 0);
      if (j.shoulders['1']) j.shoulders['1'].rotation.set(0, 0, 0);
      if (j.body) {
        j.body.rotation.copy(s.initialBodyRot || new THREE.Euler());
        j.body.position.copy(s.initialBodyPos || new THREE.Vector3());
      }
      if (j.neck) j.neck.rotation.set(0, 0, 0);
    }
    mobGroup.traverse(n => {
      if (n.isMesh && n.material && n.material.emissive) {
        n.material.emissive.setHex(0x000000);
      }
    });
  }
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
