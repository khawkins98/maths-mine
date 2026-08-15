// core/engine.js — the shared rendering shell: renderer, scene, camera, lights,
// ground, sky, biome management, animation clock, render loop, and resize handling.

import * as THREE from 'three';
import { BIOMES, biomeForProgress } from './biomes.js';
import { plantTrees, disposeTrees } from './trees.js';

export const VIEW_DIR = new THREE.Vector3(0.42, 0.5, 1).normalize();

export function createEngine({ textures }) {
  const app = document.getElementById('app');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  app.appendChild(renderer.domElement);

  const SKY = 0x8cc5ef;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 70, 150);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 220);
  camera.position.set(0, 3.2, 15);

  const camRig = new THREE.Group();
  camRig.name = 'camera-rig';
  scene.add(camRig);
  camRig.add(camera);

  // ---- hard Minecraft lighting ----
  const hemiLight = new THREE.HemisphereLight(0xcfe8ff, 0x6f9257, 1.1);
  scene.add(hemiLight);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(ambientLight);

  const key = new THREE.DirectionalLight(0xfff4e0, 1.7);
  key.position.set(7, 15, 9);
  key.target.position.set(0, 2.5, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -16; key.shadow.camera.right = 16;
  key.shadow.camera.top = 18; key.shadow.camera.bottom = -6;
  key.shadow.camera.near = 1; key.shadow.camera.far = 60;
  key.shadow.bias = -0.0004;
  key.shadow.radius = 1;
  scene.add(key);
  scene.add(key.target);

  const fill = new THREE.DirectionalLight(0xbcd4ff, 0.28);
  fill.position.set(-8, 5, -4);
  scene.add(fill);

  // ---- voxel build-plot floating island ----
  const { platform, ground, updatePlatformTextures } = buildPlatform(textures);
  scene.add(platform);

  // ---- cubic drifting clouds ----
  const clouds = buildClouds();
  scene.add(clouds.group);

  // ---- dynamic biome management ----
  let activeBiome = BIOMES.flat;
  let groveGroup = null;
  const grovePositions = [
    { x: -11, z: -8 }, { x: 11, z: -8 },
    { x: -12, z: 2 },  { x: 12, z: 2 },
  ];

  function setBiome(target) {
    const biome = typeof target === 'string' ? (BIOMES[target] || BIOMES.flat) : target;
    activeBiome = biome;

    // 1. Sky & fog
    scene.background.setHex(biome.skyColor);
    scene.fog.color.setHex(biome.fogColor);
    scene.fog.near = biome.fogNear;
    scene.fog.far = biome.fogFar;

    // 2. Lighting
    hemiLight.color.setHex(biome.hemiSky);
    hemiLight.groundColor.setHex(biome.hemiGround);
    key.color.setHex(biome.sunColor);
    key.intensity = biome.sunIntensity;
    ambientLight.color.setHex(biome.ambientColor);
    ambientLight.intensity = biome.ambientIntensity;

    // 3. Ground platform textures
    const topTex = textures[biome.topTexKey] || textures.platGrassTex;
    const sideTex = textures[biome.sideTexKey] || textures.platDirtTex;
    updatePlatformTextures(topTex, sideTex);

    // 4. Scenery trees/cacti/fungi/pillars
    if (groveGroup) disposeTrees(scene, groveGroup);
    groveGroup = plantTrees(scene, grovePositions, textures, biome.treeType);
  }

  function updateBiomeFromProgress(progress) {
    const b = biomeForProgress(progress);
    if (b.id !== activeBiome.id) {
      setBiome(b);
    }
  }

  // Debug hook
  window.__biome = (id) => setBiome(id);

  const clock = new THREE.Clock();
  const nowT = () => clock.getElapsedTime();

  const _proj = new THREE.Vector3();
  function worldToScreen(x, y) {
    _proj.set(x, y, 0).project(camera);
    return { x: (_proj.x * 0.5 + 0.5) * window.innerWidth, y: (-_proj.y * 0.5 + 0.5) * window.innerHeight };
  }
  function projectToScreen(obj3d) {
    obj3d.getWorldPosition(_proj); _proj.project(camera);
    return { x: (_proj.x * 0.5 + 0.5) * window.innerWidth, y: (-_proj.y * 0.5 + 0.5) * window.innerHeight };
  }

  function placeCamera(centerY, dist, viewDir = VIEW_DIR) {
    camera.position.copy(viewDir).multiplyScalar(dist);
    camera.position.y += centerY;
    camera.lookAt(0, centerY, 0);
  }
  function resetCamera() {
    camera.position.set(0, 3.2, 15);
    camera.lookAt(0, 3.2, 0);
  }

  const frameCbs = [];
  function onFrame(cb) { frameCbs.push(cb); return () => { const i = frameCbs.indexOf(cb); if (i >= 0) frameCbs.splice(i, 1); }; }

  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);
    clouds.update(dt);
    for (let i = 0; i < frameCbs.length; i++) frameCbs[i](dt);
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  function start() { resize(); tick(); }

  return {
    renderer, scene, camera, camRig, ground, platform, key, fill, clock,
    VIEW_DIR,
    nowT, worldToScreen, projectToScreen,
    placeCamera, resetCamera,
    setBiome, updateBiomeFromProgress, currentBiome: () => activeBiome,
    onFrame, start, resize,
  };
}

function buildPlatform(textures) {
  const platform = new THREE.Group();
  platform.name = 'voxel-island';

  const W = 30, D = 24;
  const TEXEL = 2;

  function face(tex, ru, rv) {
    const t = tex.clone();
    t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(ru, rv);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 1, metalness: 0 });
  }

  function slab(w, h, d, topTex, sideTex) {
    const side = () => face(sideTex, 1, 1);
    const mats = [side(), side(), null, side(), side(), side()];
    mats[0].map.repeat.set(d / TEXEL, h / TEXEL);
    mats[1].map.repeat.set(d / TEXEL, h / TEXEL);
    mats[4].map.repeat.set(w / TEXEL, h / TEXEL);
    mats[5].map.repeat.set(w / TEXEL, h / TEXEL);
    mats[3].map.repeat.set(w / TEXEL, d / TEXEL);
    mats[2] = face(topTex, w / TEXEL, d / TEXEL);
    const geo = new THREE.BoxGeometry(w, h, d);
    return new THREE.Mesh(geo, mats);
  }

  const t1 = slab(W, 1.2, D, textures.platGrassTex, textures.platDirtTex);
  t1.position.y = -0.6;
  t1.receiveShadow = true;
  platform.add(t1);

  const t2 = slab(W - 4, 1.8, D - 4, textures.platDirtTex, textures.platDirtTex);
  t2.position.y = -1.2 - 0.9;
  platform.add(t2);

  const t3 = slab(W - 11, 3.0, D - 10, textures.platDirtTex, textures.platDirtTex);
  t3.position.y = -3.0 - 1.5;
  platform.add(t3);

  const rimGeo = new THREE.BoxGeometry(1, 1, 1);
  const rimMat = new THREE.MeshStandardMaterial({ map: textures.platGrassTex.clone(), roughness: 1, metalness: 0 });
  rimMat.map.needsUpdate = true;
  rimMat.map.repeat.set(1, 1);

  const hx = W / 2 - 0.5, hz = D / 2 - 0.5;
  const cells = [];
  for (let x = -hx; x <= hx; x += 1) { cells.push([x, hz]); cells.push([x, -hz]); }
  for (let z = -hz + 1; z <= hz - 1; z += 1) { cells.push([hx, z]); cells.push([-hx, z]); }
  const rim = new THREE.InstancedMesh(rimGeo, rimMat, cells.length);
  rim.receiveShadow = true;
  const m4 = new THREE.Matrix4();
  cells.forEach(([x, z], i) => {
    const lift = 0.35 + ((x + z) & 1 ? 0.14 : 0);
    m4.makeTranslation(x, lift - 0.5, z);
    rim.setMatrixAt(i, m4);
  });
  rim.instanceMatrix.needsUpdate = true;
  platform.add(rim);

  function updatePlatformTextures(topTex, sideTex) {
    // t1 top (material index 2) & sides (index 0,1,3,4,5)
    t1.material[2].map.image = topTex.image; t1.material[2].map.needsUpdate = true;
    [0, 1, 3, 4, 5].forEach((i) => {
      t1.material[i].map.image = sideTex.image;
      t1.material[i].map.needsUpdate = true;
    });

    // t2 & t3
    [t2, t3].forEach((t) => {
      t.material.forEach((mat) => {
        if (mat && mat.map) {
          mat.map.image = sideTex.image;
          mat.map.needsUpdate = true;
        }
      });
    });

    // rim
    rimMat.map.image = topTex.image;
    rimMat.map.needsUpdate = true;
  }

  return { platform, ground: t1, updatePlatformTextures };
}

function buildClouds() {
  const group = new THREE.Group();
  group.name = 'clouds';
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
  const cloudMeshes = [];
  const X_MIN = -60, X_MAX = 60, SPAN = X_MAX - X_MIN;
  const rnd = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Group();
    const puffs = 3 + ((Math.random() * 3) | 0);
    for (let p = 0; p < puffs; p++) {
      const w = rnd(4, 8), h = rnd(1.4, 2.2), d = rnd(3, 5);
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      box.position.set(rnd(-5, 5), rnd(-0.6, 0.6), rnd(-4, 4));
      c.add(box);
    }
    c.position.set(rnd(X_MIN, X_MAX), rnd(9, 20), rnd(-70, -34));
    c.userData.speed = rnd(0.5, 1.3);
    group.add(c);
    cloudMeshes.push(c);
  }
  function update(dt) {
    for (const c of cloudMeshes) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > X_MAX) c.position.x -= SPAN;
    }
  }
  return { group, update };
}
