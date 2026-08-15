// src/core/minecraftMobRig.js — Pixel-Perfect Canonical Minecraft Mob Geometries & Textures
import * as THREE from 'three';

/**
 * Creates a standard Minecraft BoxGeometry with exact UV mapping into a texture atlas.
 */
export function makeBoxUV(w, h, d, u0, v0, p = 0.055, texW = 64, texH = 64) {
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

const texLoader = new THREE.TextureLoader();
const cachedMats = {};

export function loadPixelMaterial(url, roughness = 0.85, metalness = 0.1) {
  if (cachedMats[url]) return cachedMats[url];
  const tex = texLoader.load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;

  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness,
    metalness,
    transparent: true,
    alphaTest: 0.1,
  });
  cachedMats[url] = mat;
  return mat;
}

// ── 1. STEVE BUILDER ──
export function buildSteveModel(scale = 0.055) {
  const g = new THREE.Group();
  g.name = 'steve';
  const mat = loadPixelMaterial('/assets/mobs/steve.png');
  const P = scale;

  // Legs (4x12x4, UV: 0, 16)
  const legH = 12 * P;
  const rLegGeo = makeBoxUV(4, 12, 4, 0, 16, P, 64, 64);
  const lLegGeo = makeBoxUV(4, 12, 4, 16, 48, P, 64, 64);

  const rLegPivot = new THREE.Group();
  rLegPivot.position.set(2 * P, legH, 0);
  const rLeg = new THREE.Mesh(rLegGeo, mat);
  rLeg.position.set(0, -legH / 2, 0);
  rLeg.castShadow = true;
  rLegPivot.add(rLeg);

  const lLegPivot = new THREE.Group();
  lLegPivot.position.set(-2 * P, legH, 0);
  const lLeg = new THREE.Mesh(lLegGeo, mat);
  lLeg.position.set(0, -legH / 2, 0);
  lLeg.castShadow = true;
  lLegPivot.add(lLeg);

  g.add(rLegPivot, lLegPivot);

  // Torso (8x12x4, UV: 16, 16)
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, legH, 0);

  const bodyGeo = makeBoxUV(8, 12, 4, 16, 16, P, 64, 64);
  const body = new THREE.Mesh(bodyGeo, mat);
  body.position.set(0, 6 * P, 0);
  body.castShadow = true;
  torsoGroup.add(body);

  // Head (8x8x8, UV: 0, 0)
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 12 * P, 0);
  const headGeo = makeBoxUV(8, 8, 8, 0, 0, P, 64, 64);
  const head = new THREE.Mesh(headGeo, mat);
  head.position.set(0, 4 * P, 0);
  head.castShadow = true;
  headPivot.add(head);
  torsoGroup.add(headPivot);

  // Arms (4x12x4)
  const rArmGeo = makeBoxUV(4, 12, 4, 40, 16, P, 64, 64);
  const rArmPivot = new THREE.Group();
  rArmPivot.position.set(6 * P, 10 * P, 0);
  const rArm = new THREE.Mesh(rArmGeo, mat);
  rArm.position.set(0, -4 * P, 0);
  rArm.castShadow = true;
  rArmPivot.add(rArm);

  const lArmGeo = makeBoxUV(4, 12, 4, 32, 48, P, 64, 64);
  const lArmPivot = new THREE.Group();
  lArmPivot.position.set(-6 * P, 10 * P, 0);
  const lArm = new THREE.Mesh(lArmGeo, mat);
  lArm.position.set(0, -4 * P, 0);
  lArm.castShadow = true;
  lArmPivot.add(lArm);

  torsoGroup.add(rArmPivot, lArmPivot);
  g.add(torsoGroup);

  g.userData.joints = {
    neck: headPivot,
    shoulders: { '-1': rArmPivot, '1': lArmPivot },
    hips: { '-1': rLegPivot, '1': lLegPivot },
    body: torsoGroup,
  };
  return g;
}

// ── 2. ZOMBIE BUILDER ──
export function buildZombieModel(scale = 0.055) {
  const g = buildSteveModel(scale);
  g.name = 'zombie';
  const mat = loadPixelMaterial('/assets/mobs/zombie.png');
  g.traverse(n => {
    if (n.isMesh) {
      n.material = mat;
    }
  });
  // Zombie outstretched arms pose by default
  const j = g.userData.joints;
  if (j.shoulders['-1']) j.shoulders['-1'].rotation.x = -Math.PI / 2;
  if (j.shoulders['1']) j.shoulders['1'].rotation.x = -Math.PI / 2;
  return g;
}

// ── 3. VILLAGER BUILDER ──
export function buildVillagerModel(scale = 0.055) {
  const g = new THREE.Group();
  g.name = 'villager';
  const mat = loadPixelMaterial('/assets/mobs/villager.png');
  const P = scale;

  // Legs (4x12x4, UV: 0, 22)
  const legH = 12 * P;
  const legGeo = makeBoxUV(4, 12, 4, 0, 22, P, 64, 64);

  const rLegPivot = new THREE.Group();
  rLegPivot.position.set(2 * P, legH, 0);
  const rLeg = new THREE.Mesh(legGeo, mat);
  rLeg.position.set(0, -legH / 2, 0);
  rLeg.castShadow = true;
  rLegPivot.add(rLeg);

  const lLegPivot = new THREE.Group();
  lLegPivot.position.set(-2 * P, legH, 0);
  const lLeg = new THREE.Mesh(legGeo, mat);
  lLeg.position.set(0, -legH / 2, 0);
  lLeg.castShadow = true;
  lLegPivot.add(lLeg);

  g.add(rLegPivot, lLegPivot);

  // Body / Robe (8x12x6, UV: 16, 20)
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, legH, 0);

  const bodyGeo = makeBoxUV(8, 12, 6, 16, 20, P, 64, 64);
  const body = new THREE.Mesh(bodyGeo, mat);
  body.position.set(0, 6 * P, 0);
  body.castShadow = true;
  torsoGroup.add(body);

  // Robe coat layer (9x18x6, UV: 0, 38)
  const robeGeo = makeBoxUV(9, 18, 6, 0, 38, P, 64, 64);
  const robe = new THREE.Mesh(robeGeo, mat);
  robe.position.set(0, 3 * P, 0);
  robe.castShadow = true;
  torsoGroup.add(robe);

  // Folded Arms (8x8x6, UV: 40, 38)
  const armsGeo = makeBoxUV(8, 8, 6, 40, 38, P, 64, 64);
  const arms = new THREE.Mesh(armsGeo, mat);
  arms.position.set(0, 7 * P, 2 * P);
  arms.castShadow = true;
  torsoGroup.add(arms);

  // Head (8x10x8, UV: 0, 0)
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 12 * P, 0);
  const headGeo = makeBoxUV(8, 10, 8, 0, 0, P, 64, 64);
  const head = new THREE.Mesh(headGeo, mat);
  head.position.set(0, 5 * P, 0);
  head.castShadow = true;
  headPivot.add(head);

  // 3D Nose (2x4x2, UV: 24, 0)
  const noseGeo = makeBoxUV(2, 4, 2, 24, 0, P, 64, 64);
  const nose = new THREE.Mesh(noseGeo, mat);
  nose.position.set(0, 3 * P, 5 * P);
  nose.castShadow = true;
  headPivot.add(nose);

  torsoGroup.add(headPivot);
  g.add(torsoGroup);

  g.userData.joints = {
    neck: headPivot,
    shoulders: { '-1': arms, '1': arms },
    hips: { '-1': rLegPivot, '1': lLegPivot },
    body: torsoGroup,
  };
  return g;
}

// ── 4. CREEPER BUILDER ──
export function buildCreeperModel(scale = 0.055) {
  const g = new THREE.Group();
  g.name = 'creeper';
  const mat = loadPixelMaterial('/assets/mobs/creeper.png');
  const P = scale;

  // 4 Legs (4x6x4, UV: 0, 16, texH=32)
  const legH = 6 * P;
  const legGeo = makeBoxUV(4, 6, 4, 0, 16, P, 64, 32);

  const fRLegPivot = new THREE.Group();
  fRLegPivot.position.set(2 * P, legH, 4 * P);
  const fRLeg = new THREE.Mesh(legGeo, mat);
  fRLeg.position.set(0, -legH / 2, 0);
  fRLeg.castShadow = true;
  fRLegPivot.add(fRLeg);

  const fLLegPivot = new THREE.Group();
  fLLegPivot.position.set(-2 * P, legH, 4 * P);
  const fLLeg = new THREE.Mesh(legGeo, mat);
  fLLeg.position.set(0, -legH / 2, 0);
  fLLeg.castShadow = true;
  fLLegPivot.add(fLLeg);

  const bRLegPivot = new THREE.Group();
  bRLegPivot.position.set(2 * P, legH, -4 * P);
  const bRLeg = new THREE.Mesh(legGeo, mat);
  bRLeg.position.set(0, -legH / 2, 0);
  bRLeg.castShadow = true;
  bRLegPivot.add(bRLeg);

  const bLLegPivot = new THREE.Group();
  bLLegPivot.position.set(-2 * P, legH, -4 * P);
  const bLLeg = new THREE.Mesh(legGeo, mat);
  bLLeg.position.set(0, -legH / 2, 0);
  bLLeg.castShadow = true;
  bLLegPivot.add(bLLeg);

  g.add(fRLegPivot, fLLegPivot, bRLegPivot, bLLegPivot);

  // Body (8x12x4, UV: 16, 16)
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, legH, 0);

  const bodyGeo = makeBoxUV(8, 12, 4, 16, 16, P, 64, 32);
  const body = new THREE.Mesh(bodyGeo, mat);
  body.position.set(0, 6 * P, 0);
  body.castShadow = true;
  torsoGroup.add(body);

  // Head (8x8x8, UV: 0, 0)
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 12 * P, 0);
  const headGeo = makeBoxUV(8, 8, 8, 0, 0, P, 64, 32);
  const head = new THREE.Mesh(headGeo, mat);
  head.position.set(0, 4 * P, 0);
  head.castShadow = true;
  headPivot.add(head);

  torsoGroup.add(headPivot);
  g.add(torsoGroup);

  g.userData.joints = {
    neck: headPivot,
    shoulders: { '-1': fRLegPivot, '1': fLLegPivot },
    hips: { '-1': fRLegPivot, '1': fLLegPivot },
    backHips: { '-1': bRLegPivot, '1': bLLegPivot },
    body: torsoGroup,
  };
  return g;
}

// ── 5. ENDERMAN BUILDER ──
export function buildEndermanModel(scale = 0.055) {
  const g = new THREE.Group();
  g.name = 'enderman';
  const mat = loadPixelMaterial('/assets/mobs/enderman.png');
  const P = scale;

  // Slender Legs (2x30x2, UV: 56, 0, texH=32)
  const legH = 30 * P;
  const legGeo = makeBoxUV(2, 30, 2, 56, 0, P, 64, 32);

  const rLegPivot = new THREE.Group();
  rLegPivot.position.set(2 * P, legH, 0);
  const rLeg = new THREE.Mesh(legGeo, mat);
  rLeg.position.set(0, -legH / 2, 0);
  rLeg.castShadow = true;
  rLegPivot.add(rLeg);

  const lLegPivot = new THREE.Group();
  lLegPivot.position.set(-2 * P, legH, 0);
  const lLeg = new THREE.Mesh(legGeo, mat);
  lLeg.position.set(0, -legH / 2, 0);
  lLeg.castShadow = true;
  lLegPivot.add(lLeg);

  g.add(rLegPivot, lLegPivot);

  // Torso (8x12x4, UV: 16, 16)
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, legH, 0);

  const bodyGeo = makeBoxUV(8, 12, 4, 16, 16, P, 64, 32);
  const body = new THREE.Mesh(bodyGeo, mat);
  body.position.set(0, 6 * P, 0);
  body.castShadow = true;
  torsoGroup.add(body);

  // Head (8x8x8, UV: 0, 0)
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 12 * P, 0);
  const headGeo = makeBoxUV(8, 8, 8, 0, 0, P, 64, 32);
  const head = new THREE.Mesh(headGeo, mat);
  head.position.set(0, 4 * P, 0);
  head.castShadow = true;
  headPivot.add(head);

  // Slender Arms (2x30x2, UV: 56, 0)
  const armGeo = makeBoxUV(2, 30, 2, 56, 0, P, 64, 32);
  const rArmPivot = new THREE.Group();
  rArmPivot.position.set(5 * P, 11 * P, 0);
  const rArm = new THREE.Mesh(armGeo, mat);
  rArm.position.set(0, -14 * P, 0);
  rArm.castShadow = true;
  rArmPivot.add(rArm);

  const lArmPivot = new THREE.Group();
  lArmPivot.position.set(-5 * P, 11 * P, 0);
  const lArm = new THREE.Mesh(armGeo, mat);
  lArm.position.set(0, -14 * P, 0);
  lArm.castShadow = true;
  lArmPivot.add(lArm);

  torsoGroup.add(rArmPivot, lArmPivot, headPivot);
  g.add(torsoGroup);

  g.userData.joints = {
    neck: headPivot,
    shoulders: { '-1': rArmPivot, '1': lArmPivot },
    hips: { '-1': rLegPivot, '1': lLegPivot },
    body: torsoGroup,
  };
  return g;
}

// ── 6. GHAST BUILDER ──
export function buildGhastModel(scale = 0.055) {
  const g = new THREE.Group();
  g.name = 'ghast';
  const mat = loadPixelMaterial('/assets/mobs/ghast.png');
  const P = scale * 1.5; // Ghast is large

  // Head/Body (16x16x16, UV: 0, 0, texH=32)
  const bodyGeo = makeBoxUV(16, 16, 16, 0, 0, P, 64, 32);
  const body = new THREE.Mesh(bodyGeo, mat);
  body.position.set(0, 16 * P, 0);
  body.castShadow = true;
  g.add(body);

  // 9 Tentacles (2x10x2 each)
  const tentacleGeo = makeBoxUV(2, 10, 2, 0, 0, P, 64, 32);
  const tentacles = [];
  for (let r = -1; r <= 1; r++) {
    for (let c = -1; c <= 1; c++) {
      const tPivot = new THREE.Group();
      tPivot.position.set(c * 5 * P, 8 * P, r * 5 * P);
      const tMesh = new THREE.Mesh(tentacleGeo, mat);
      tMesh.position.set(0, -5 * P, 0);
      tMesh.castShadow = true;
      tPivot.add(tMesh);
      g.add(tPivot);
      tentacles.push(tPivot);
    }
  }

  g.userData.tentacles = tentacles;
  g.userData.joints = {
    neck: body,
    shoulders: { '-1': null, '1': null },
    hips: { '-1': null, '1': null },
    body,
  };
  return g;
}
