// core/engine.js — the shared rendering shell: renderer, scene, camera, lights,
// ground, sky, the animation clock, the render loop, and resize handling.
// Everything here is game-agnostic and long-lived. Games receive it via the
// shared context and add/remove their own objects to the scene.
//
// Camera framing helpers live here too: the isometric 3/4 view direction and a
// placeCamera(centerY, dist) that positions the camera along that direction,
// plus resetCamera() to return to a neutral pose on teardown.

import * as THREE from 'three';

// 3/4 isometric-ish view direction (front, elevated, slightly to the side) so
// we see block tops and fronts — blocks read as 3D, not flat squares.
export const VIEW_DIR = new THREE.Vector3(0.42, 0.5, 1).normalize();

export function createEngine({ textures }) {
  const app = document.getElementById('app');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // perf: cap at 2
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  app.appendChild(renderer.domElement);

  const SKY = 0x8cc5ef; // flat Minecraft daytime blue

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY); // flat, not a gradient
  // Very light fog, matched to the sky, pushed far out: the platform is finite so
  // there is no green-to-blue horizon smear — this only softens the far clouds.
  scene.fog = new THREE.Fog(SKY, 70, 150);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 220);
  camera.position.set(0, 3.2, 15);
  scene.add(camera); // camera must be in the scene graph for its children (Bolt) to draw

  // ---- hard Minecraft lighting: strong even fill + one short-shadow sun ----
  // Strong hemisphere + ambient lift shadows out of the murk so nothing looks
  // smudgy; exactly ONE directional light casts a crisp, short contact shadow.
  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x6f9257, 1.1));
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(0xfff4e0, 1.7);
  key.position.set(7, 15, 9);
  key.target.position.set(0, 2.5, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -16; key.shadow.camera.right = 16;
  key.shadow.camera.top = 18; key.shadow.camera.bottom = -6;
  key.shadow.camera.near = 1; key.shadow.camera.far = 60;
  key.shadow.bias = -0.0004;
  key.shadow.radius = 1; // crisp, not blobby
  scene.add(key);
  scene.add(key.target);
  // low, shadowless cool fill so back faces aren't dead flat — no gloss
  const fill = new THREE.DirectionalLight(0xbcd4ff, 0.28);
  fill.position.set(-8, 5, -4);
  scene.add(fill);

  // ---- voxel build-plot: a finite, thick, stepped floating island ----
  // Top surface sits at y=0 so every game's objects rest ON it (unchanged).
  // Grass-capped top with dirt depth on the sides; NearestFilter keeps it crisp.
  const { platform, ground } = buildPlatform(textures);
  scene.add(platform);

  // ---- cubic drifting clouds (flat, unlit white voxel slabs) ----
  const clouds = buildClouds();
  scene.add(clouds.group);

  const clock = new THREE.Clock();
  const nowT = () => clock.getElapsedTime();

  // project a world (x,y,0) point to screen pixels (used for HUD/demo/tests)
  const _proj = new THREE.Vector3();
  function worldToScreen(x, y) {
    _proj.set(x, y, 0).project(camera);
    return { x: (_proj.x * 0.5 + 0.5) * window.innerWidth, y: (-_proj.y * 0.5 + 0.5) * window.innerHeight };
  }
  function projectToScreen(obj3d) {
    obj3d.getWorldPosition(_proj); _proj.project(camera);
    return { x: (_proj.x * 0.5 + 0.5) * window.innerWidth, y: (-_proj.y * 0.5 + 0.5) * window.innerHeight };
  }

  // place the camera along the iso view direction, framing a target centred at
  // (0, centerY, 0) from `dist` away.
  function placeCamera(centerY, dist, viewDir = VIEW_DIR) {
    camera.position.copy(viewDir).multiplyScalar(dist);
    camera.position.y += centerY;
    camera.lookAt(0, centerY, 0);
  }
  function resetCamera() {
    camera.position.set(0, 3.2, 15);
    camera.lookAt(0, 3.2, 0);
  }

  // per-frame callbacks; games/bolt register here. dt is clamped elsewhere.
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
    renderer, scene, camera, ground, platform, key, fill, clock,
    VIEW_DIR,
    nowT, worldToScreen, projectToScreen,
    placeCamera, resetCamera,
    onFrame, start, resize,
  };
}

// ---------------------------------------------------------------------------
// Voxel build-plot. A finite, thick, stepped floating island whose TOP is at
// y=0 (so games keep resting objects on the y=0 plane). Efficient: a handful of
// boxes with per-face NearestFilter textures + one instanced border rim.
// Footprint is wide/deep enough for the biggest layouts (a ~10-block wall, the
// dice tray, the Nugget crew) and reads as stacked cubes from every framing.
function buildPlatform(textures) {
  const platform = new THREE.Group();
  platform.name = 'voxel-island';

  const W = 30, D = 24; // top footprint (x, z)

  // per-face texture helper: clone the shared repeatable tex so each face can
  // tile independently WITHOUT touching the game blocks' textures.
  const TEXEL = 2; // world units per texture tile — matched across all faces
  function face(tex, ru, rv) {
    const t = tex.clone();
    t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(ru, rv);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 1, metalness: 0 });
  }
  // BoxGeometry material order: +x, -x, +y(top), -y(bottom), +z, -z
  function slab(w, h, d, topGrass) {
    const side = () => face(textures.platDirtTex, 1, 1); // repeat set below per-face
    const mats = [side(), side(), null, side(), side(), side()];
    // horizontal repeats follow the face's width, vertical follows height
    mats[0].map.repeat.set(d / TEXEL, h / TEXEL); // +x face spans z × y
    mats[1].map.repeat.set(d / TEXEL, h / TEXEL); // -x
    mats[4].map.repeat.set(w / TEXEL, h / TEXEL); // +z spans x × y
    mats[5].map.repeat.set(w / TEXEL, h / TEXEL); // -z
    mats[3].map.repeat.set(w / TEXEL, d / TEXEL); // bottom (dirt)
    mats[2] = topGrass
      ? face(textures.platGrassTex, w / TEXEL, d / TEXEL)
      : face(textures.platDirtTex, w / TEXEL, d / TEXEL);
    const geo = new THREE.BoxGeometry(w, h, d); // hard edges (no bevel)
    return new THREE.Mesh(geo, mats);
  }

  // Tier 1 — grass-capped top slab (the play surface; top at y=0)
  const t1 = slab(W, 1.2, D, true);
  t1.position.y = -0.6;
  t1.receiveShadow = true;
  platform.add(t1);

  // Tiers 2 & 3 — progressively inset dirt, giving a tapered island silhouette
  const t2 = slab(W - 4, 1.8, D - 4, false);
  t2.position.y = -1.2 - 0.9;
  platform.add(t2);
  const t3 = slab(W - 11, 3.0, D - 10, false);
  t3.position.y = -3.0 - 1.5;
  platform.add(t3);

  // Blocky raised border rim (instanced grass cubes) so the top silhouette
  // reads as stacked cubes. Sits at the outer edge, clear of the play area.
  const rimGeo = new THREE.BoxGeometry(1, 1, 1);
  const rimTex = textures.platGrassTex.clone();
  rimTex.needsUpdate = true; rimTex.repeat.set(1, 1);
  const rimMat = new THREE.MeshStandardMaterial({ map: rimTex, roughness: 1, metalness: 0 });
  const hx = W / 2 - 0.5, hz = D / 2 - 0.5;
  const cells = [];
  for (let x = -hx; x <= hx; x += 1) { cells.push([x, hz]); cells.push([x, -hz]); }
  for (let z = -hz + 1; z <= hz - 1; z += 1) { cells.push([hx, z]); cells.push([-hx, z]); }
  const rim = new THREE.InstancedMesh(rimGeo, rimMat, cells.length);
  rim.receiveShadow = true;
  const m4 = new THREE.Matrix4();
  cells.forEach(([x, z], i) => {
    // slight alternating lift for a chunky, hand-stacked silhouette
    const lift = 0.35 + ((x + z) & 1 ? 0.14 : 0);
    m4.makeTranslation(x, lift - 0.5, z); // cube top at ~y=0.35–0.49
    rim.setMatrixAt(i, m4);
  });
  rim.instanceMatrix.needsUpdate = true;
  platform.add(rim);

  return { platform, ground: t1 };
}

// A few flat white voxel cloud clusters that drift and wrap. Unlit (MeshBasic)
// so they read as flat Minecraft slabs, kept high and far so they never occlude
// the play area centred on the origin.
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
    // low over a distant horizon (far behind the play area) so they read in the
    // sky band without ever occluding the objects centred on the origin.
    c.position.set(rnd(X_MIN, X_MAX), rnd(9, 20), rnd(-70, -34));
    c.userData.speed = rnd(0.5, 1.3);
    group.add(c);
    cloudMeshes.push(c);
  }
  function update(dt) {
    for (const c of cloudMeshes) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > X_MAX) c.position.x -= SPAN; // wrap
    }
  }
  return { group, update };
}
