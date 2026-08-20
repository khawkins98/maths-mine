// core/engine.js — the shared rendering shell: renderer, scene, camera, lights,
// ground, sky, biome management, animation clock, render loop, and resize handling.

import * as THREE from 'three';
import { BIOMES, biomeForProgress } from './biomes.js';
import { plantTrees, disposeTrees } from './trees.js';
import { createProceduralTerrain, sampleTerrainHeight, isTerrainDecorationAllowed } from './terrain.js';
import { createHouseManager } from './house.js';

export const VIEW_DIR = new THREE.Vector3(0.42, 0.55, 1).normalize();

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
  camera.position.set(0, 5.6, 15.5);
  camera.lookAt(0, 2.0, 0);

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

  // ---- one continuous seeded terrain, including the flat build clearing ----
  const terrain = createProceduralTerrain({ scene, textures });
  const platform = terrain.group; // retained API for the subtle worldFeel spring
  let ground = null;

  // ---- player voxel house & iron golem ----
  const houseManager = createHouseManager({ scene, textures });

  // ---- cubic drifting clouds ----
  const clouds = buildClouds();
  scene.add(clouds.group);

  // ---- dynamic biome management ----
  let activeBiome = BIOMES.flat;
  let groveGroup = null;

  const defaultGrovePositions = [
    { x: -28, z: -22 }, { x: 28, z: -22 },
    { x: -30, z: 4 },  { x: 30, z: 4 },
  ];

  const forestGrovePositions = [
    { x: -30, z: -25 }, { x: -20, z: -27 }, { x: 0, z: -27 }, { x: 20, z: -27 }, { x: 30, z: -25 },
    { x: -30, z: -10 }, { x: 30, z: -10 }, { x: -31, z: 5 }, { x: 31, z: 5 },
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

    // 3. Terrain geometry/materials. An unchanged seed+biome is a no-op.
    ground = terrain.build(biome);

    // 4. Scenery trees/cacti/fungi/pillars
    if (groveGroup) disposeTrees(scene, groveGroup);
    const positions = biome.treeType === 'dense_oak' ? forestGrovePositions : defaultGrovePositions;
    const safePositions = positions.filter(({ x, z }) => isTerrainDecorationAllowed(x, z));
    groveGroup = plantTrees(scene, safePositions.map((p) => ({ ...p,
      y: sampleTerrainHeight(p.x, p.z, { seed: terrain.inspect().seed, style: biome.mountainStyle }),
    })), textures, biome.treeType);
  }

  // Initialize starting biome
  setBiome(BIOMES.flat);

  function updateBiomeFromProgress(progress) {
    const b = biomeForProgress(progress);
    if (b.id !== activeBiome.id) {
      setBiome(b);
    }
  }

  // Debug hook
  window.__biome = (id) => setBiome(id);
  window.__terrain = () => ({ ...terrain.inspect(), biome: activeBiome.id,
    sample: (x, z) => sampleTerrainHeight(x, z, { seed: terrain.inspect().seed, style: activeBiome.mountainStyle }),
    decorationAllowed: isTerrainDecorationAllowed,
    treeCells: (() => {
      const cells = [];
      scene.traverse((object) => {
        if (!object.userData.decorationType) return;
        const world = new THREE.Vector3();
        object.getWorldPosition(world);
        const box = new THREE.Box3().setFromObject(object);
        cells.push({ x: world.x, y: world.y, z: world.z,
          bounds: { minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y,
            minZ: box.min.z, maxZ: box.max.z }, type: object.userData.decorationType });
      });
      return cells;
    })(),
    groveCount: scene.children.filter((object) => object.name === 'background-grove').length,
    rendererMemory: { ...renderer.info.memory },
    seedPersistence: 'ephemeral-debug; reload resets the default seed',
    fluidCells: [],
  });
  window.__terrainSetSeed = (seed) => {
    ground = terrain.setSeed(seed, activeBiome);
    setBiome(activeBiome); // re-seat owned decoration on the regenerated surface
    return terrain.inspect();
  };
  window.__terrainGroundHit = (x, z) => {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0));
    const hit = ground && ray.intersectObject(ground, false)[0];
    return hit ? hit.point.y : null;
  };
  window.__terrainSightline = (x, y, z) => {
    const target = new THREE.Vector3(x, y, z);
    const origin = new THREE.Vector3();
    camera.getWorldPosition(origin);
    const distance = origin.distanceTo(target);
    const ray = new THREE.Raycaster(origin, target.clone().sub(origin).normalize(), 0, distance - 0.05);
    const groves = scene.children.filter((object) => object.name === 'background-grove');
    const terrainHits = ground ? ray.intersectObject(ground, false) : [];
    const groveHits = ray.intersectObjects(groves, true);
    const projected = target.clone().project(camera);
    return { clear: terrainHits.length === 0 && groveHits.length === 0,
      terrainClear: terrainHits.length === 0, groveClear: groveHits.length === 0,
      checkedTerrain: !!ground, depth: projected.z };
  };
  window.__terrainRender = () => { renderer.render(scene, camera); return { ...renderer.info.memory }; };
  window.__terrainDispose = () => { terrain.dispose(); terrain.dispose(); return terrain.inspect(); };

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
  function projectBoundsToScreen(obj3d) {
    obj3d.updateWorldMatrix(true, true);
    const box = new THREE.Box3();
    obj3d.traverse((object) => {
      if (!object.geometry || object.userData.ignoreProjectionBounds) return;
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      box.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
    });
    if (box.isEmpty()) return null;
    const points = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        const point = new THREE.Vector3(x, y, z).project(camera);
        points.push({ x: (point.x * 0.5 + 0.5) * window.innerWidth,
          y: (-point.y * 0.5 + 0.5) * window.innerHeight });
      }
    }
    return { minX: Math.min(...points.map((p) => p.x)), maxX: Math.max(...points.map((p) => p.x)),
      minY: Math.min(...points.map((p) => p.y)), maxY: Math.max(...points.map((p) => p.y)) };
  }

  function placeCamera(centerY, dist, viewDir = VIEW_DIR) {
    const portraitFit = Math.max(1, Math.min(3.2, 1.45 / camera.aspect));
    camera.position.copy(viewDir).multiplyScalar(dist * portraitFit);
    camera.position.y += centerY;
    camera.lookAt(0, centerY, 0);
  }
  function resetCamera() {
    const portraitFit = Math.max(1, Math.min(3.2, 1.45 / camera.aspect));
    // The persistent village and Steve both live left of the lesson origin;
    // centre the hub framing between them and the build plot.
    camera.position.set(-4.5, 5.6 * portraitFit, 15.5 * portraitFit);
    camera.lookAt(-4.5, 2.0, 0);
  }

  const frameCbs = [];
  function onFrame(cb) { frameCbs.push(cb); return () => { const i = frameCbs.indexOf(cb); if (i >= 0) frameCbs.splice(i, 1); }; }

  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);
    clouds.update(dt);
    if (houseManager && houseManager.update) houseManager.update(dt, nowT());
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
    renderer, scene, camera, camRig, get ground() { return ground; }, platform, key, fill, clock,
    VIEW_DIR, house: houseManager,
    nowT, worldToScreen, projectToScreen, projectBoundsToScreen,
    placeCamera, resetCamera,
    setBiome, updateBiomeFromProgress, currentBiome: () => activeBiome,
    onFrame, start, resize,
  };
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
