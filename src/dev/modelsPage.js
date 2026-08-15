// src/dev/modelsPage.js — Live 3D Models & Mobs Dev Sandbox
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadMobs, createMob, MOB_TYPES } from '../core/mobs.js';
import { loadCharacterAssets } from '../core/characters.js';
import { createTextures } from '../core/textures.js';

const container = document.getElementById('canvas-container');

// ── Three.js Scene Setup ──
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1b24);
scene.fog = new THREE.Fog(0x1a1b24, 25, 60);

const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
camera.position.set(0, 2.5, 6.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 1.2, 0);

// ── Lighting ──
const ambient = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambient);

const hemi = new THREE.HemisphereLight(0xddeeff, 0x334455, 0.6);
scene.add(hemi);

const dirLight = new THREE.DirectionalLight(0xfffaed, 1.6);
dirLight.position.set(5, 10, 7);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.bias = -0.0005;
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight(0x90a8ff, 0.4);
fillLight.position.set(-5, 4, -5);
scene.add(fillLight);

// ── Ground Platform / Grid ──
const gridGroup = new THREE.Group();
const grid = new THREE.GridHelper(16, 16, 0x4f5b7c, 0x2b3145);
grid.position.y = -0.001;
gridGroup.add(grid);

const floorGeo = new THREE.CircleGeometry(6, 32);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x232530, roughness: 0.9, metalness: 0.1 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
gridGroup.add(floor);
scene.add(gridGroup);

// ── Model Management ──
let currentModelGroup = null;
let currentModelType = 'golem';
let mobFactories = null;
let characterAssets = null;
const textures = createTextures();

let animateEnabled = true;
let autoRotate = true;
let animSpeed = 1.0;
let modelScale = 1.0;
let wireframe = false;

// ── Helper: Box with exact Minecraft UV mapping ──
export function makeMinecraftBox(w, h, d, u0, v0, p, texW = 128, texH = 128) {
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

// ── Iron Golem Builder ──
let golemTex = null;
function getGolemTexture() {
  if (golemTex) return golemTex;
  const loader = new THREE.TextureLoader();
  golemTex = loader.load('/assets/mobs/iron_golem.png?v=' + Date.now());
  golemTex.colorSpace = THREE.SRGBColorSpace;
  golemTex.magFilter = THREE.NearestFilter;
  golemTex.minFilter = THREE.NearestFilter;
  golemTex.generateMipmaps = false;
  golemTex.needsUpdate = true;
  return golemTex;
}

export function buildArticulatedGolem() {
  const g = new THREE.Group();
  g.name = 'iron-golem';

  const tex = getGolemTexture();
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.85,
    metalness: 0.1,
    wireframe: wireframe,
  });

  const P = 0.055; // pixel unit -> height ~2.4m

  // Legs (h=16, w=6, d=5)
  const legH = 16 * P;
  const rLegGeo = makeMinecraftBox(6, 16, 5, 37, 0, P);
  const lLegGeo = makeMinecraftBox(6, 16, 5, 60, 0, P);

  const rLegPivot = new THREE.Group();
  rLegPivot.position.set(4.5 * P, legH, 0);
  const rLegMesh = new THREE.Mesh(rLegGeo, mat);
  rLegMesh.position.set(0, -legH / 2, 0);
  rLegMesh.castShadow = true;
  rLegPivot.add(rLegMesh);

  const lLegPivot = new THREE.Group();
  lLegPivot.position.set(-4.5 * P, legH, 0);
  const lLegMesh = new THREE.Mesh(lLegGeo, mat);
  lLegMesh.position.set(0, -legH / 2, 0);
  lLegMesh.castShadow = true;
  lLegPivot.add(lLegMesh);

  g.add(rLegPivot, lLegPivot);

  // Torso / Waist & Upper Chest
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, legH, 0);

  const waistGeo = makeMinecraftBox(9, 5, 6, 0, 70, P);
  const waistMesh = new THREE.Mesh(waistGeo, mat);
  waistMesh.position.set(0, 2.5 * P, 0);
  waistMesh.castShadow = true;
  torsoGroup.add(waistMesh);

  const chestH = 12 * P;
  const chestGeo = makeMinecraftBox(18, 12, 11, 0, 40, P);
  const chestMesh = new THREE.Mesh(chestGeo, mat);
  chestMesh.position.set(0, 5 * P + chestH / 2, 0);
  chestMesh.castShadow = true;
  torsoGroup.add(chestMesh);

  // Head + Nose
  const headPivot = new THREE.Group();
  headPivot.position.set(0, (5 + 12) * P, -2 * P);

  const headGeo = makeMinecraftBox(8, 10, 8, 0, 0, P);
  const headMesh = new THREE.Mesh(headGeo, mat);
  headMesh.position.set(0, 5 * P, 0);
  headMesh.castShadow = true;
  headPivot.add(headMesh);

  const noseGeo = makeMinecraftBox(2, 4, 2, 24, 0, P);
  const noseMesh = new THREE.Mesh(noseGeo, mat);
  noseMesh.position.set(0, 3 * P, 5 * P);
  noseMesh.castShadow = true;
  headPivot.add(noseMesh);

  torsoGroup.add(headPivot);

  // Arms (w=4, h=30, d=6)
  const armH = 30 * P;
  const shoulderY = (5 + 12 - 2) * P;
  const shoulderX = 11 * P;

  const rArmGeo = makeMinecraftBox(4, 30, 6, 60, 21, P);
  const rArmPivot = new THREE.Group();
  rArmPivot.position.set(shoulderX, shoulderY, 0);
  const rArmMesh = new THREE.Mesh(rArmGeo, mat);
  rArmMesh.position.set(0, -armH / 2, 0);
  rArmMesh.castShadow = true;
  rArmPivot.add(rArmMesh);

  const lArmGeo = makeMinecraftBox(4, 30, 6, 60, 58, P);
  const lArmPivot = new THREE.Group();
  lArmPivot.position.set(-shoulderX, shoulderY, 0);
  const lArmMesh = new THREE.Mesh(lArmGeo, mat);
  lArmMesh.position.set(0, -armH / 2, 0);
  lArmMesh.castShadow = true;
  lArmPivot.add(lArmMesh);

  torsoGroup.add(rArmPivot, lArmPivot);
  g.add(torsoGroup);

  g.userData.anim = {
    lLegPivot, rLegPivot, lArmPivot, rArmPivot, headPivot, torsoGroup,
  };

  return g;
}

// ── Model Switcher ──
async function switchModel(type) {
  currentModelType = type;
  if (currentModelGroup) {
    scene.remove(currentModelGroup);
    currentModelGroup = null;
  }

  const nameEl = document.getElementById('model-name');
  const statsEl = document.getElementById('model-stats');
  const texImg = document.getElementById('tex-preview');

  if (type === 'golem') {
    currentModelGroup = buildArticulatedGolem();
    nameEl.innerHTML = '<strong>Iron Golem</strong>';
    statsEl.textContent = 'Height: ~2.4m | Articulated 128x128 UV Box Skeleton';
    texImg.src = '/assets/mobs/iron_golem.png?v=2';
  } else if (type === 'steve') {
    if (mobFactories && mobFactories.steve) {
      currentModelGroup = mobFactories.steve();
      currentModelGroup.scale.setScalar(1.2);
    } else if (characterAssets) {
      currentModelGroup = characterAssets.create('steve');
      currentModelGroup.scale.setScalar(1.2);
    }
    nameEl.innerHTML = '<strong>Steve (Player Character)</strong>';
    statsEl.textContent = 'Height: ~1.8m | Official Minecraft GLB Rig';
    texImg.src = '/assets/characters/Textures/texture-steve.png';
  } else if (mobFactories) {
    currentModelGroup = createMob(mobFactories, type);
    currentModelGroup.scale.setScalar(1.2);
    const titles = {
      villager: 'Villager (Honest Crew)',
      zombie:   'Zombie (Imposter Mob)',
      creeper:  'Creeper (Explosive Mob)',
      ghast:    'Ghast (Nether Mob)',
      enderman: 'Enderman (Ender Mob)',
    };
    nameEl.innerHTML = `<strong>${titles[type] || type}</strong>`;
    statsEl.textContent = 'Articulated 3D GLB Model with Bone Skeleton';
    texImg.src = '/assets/mobs/iron_golem.png?v=2';
  }

  if (currentModelGroup) {
    currentModelGroup.scale.multiplyScalar(modelScale);
    scene.add(currentModelGroup);
    updateWireframe();
  }
}

function updateWireframe() {
  if (!currentModelGroup) return;
  currentModelGroup.traverse((n) => {
    if (n.isMesh && n.material) {
      n.material.wireframe = wireframe;
    }
  });
}

// ── Animation Loop ──
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.getElapsedTime() * animSpeed;

  if (controls) controls.update();

  if (currentModelGroup && animateEnabled) {
    if (currentModelType === 'golem' && currentModelGroup.userData.anim) {
      const { lLegPivot, rLegPivot, lArmPivot, rArmPivot, headPivot, torsoGroup } = currentModelGroup.userData.anim;
      const walkPhase = Math.sin(t * 3.4);

      lArmPivot.rotation.x = walkPhase * 0.65;
      rArmPivot.rotation.x = -walkPhase * 0.65;
      lLegPivot.rotation.x = -walkPhase * 0.5;
      rLegPivot.rotation.x = walkPhase * 0.5;

      currentModelGroup.position.y = Math.abs(Math.sin(t * 3.4)) * 0.05;
      headPivot.rotation.y = Math.sin(t * 1.1) * 0.3;
      torsoGroup.rotation.z = Math.sin(t * 3.4) * 0.03;
    } else if (currentModelGroup.userData.joints) {
      // Standard joints animation
      const j = currentModelGroup.userData.joints;
      const walkPhase = Math.sin(t * 3.2);
      if (j.shoulders && j.shoulders['-1']) j.shoulders['-1'].rotation.x = walkPhase * 0.5;
      if (j.shoulders && j.shoulders['1']) j.shoulders['1'].rotation.x = -walkPhase * 0.5;
      if (j.hips && j.hips['-1']) j.hips['-1'].rotation.x = -walkPhase * 0.4;
      if (j.hips && j.hips['1']) j.hips['1'].rotation.x = walkPhase * 0.4;
      // Creeper 4-legged walking animation
      if (j.backHips && j.backHips['-1']) j.backHips['-1'].rotation.x = walkPhase * 0.4;
      if (j.backHips && j.backHips['1']) j.backHips['1'].rotation.x = -walkPhase * 0.4;
      if (j.neck) j.neck.rotation.y = Math.sin(t * 1.2) * 0.25;
    }
  }

  if (autoRotate && currentModelGroup) {
    currentModelGroup.rotation.y += dt * 0.4;
  }

  renderer.render(scene, camera);
}

// ── UI Event Handlers ──
document.querySelectorAll('.model-grid button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.model-grid button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    switchModel(btn.dataset.model);
  });
});

const btnToggleAnim = document.getElementById('btn-toggle-anim');
btnToggleAnim.addEventListener('click', () => {
  animateEnabled = !animateEnabled;
  btnToggleAnim.textContent = animateEnabled ? 'ON' : 'OFF';
  btnToggleAnim.classList.toggle('active', animateEnabled);
});

const btnRotate = document.getElementById('btn-rotate');
btnRotate.addEventListener('click', () => {
  autoRotate = !autoRotate;
  btnRotate.textContent = autoRotate ? 'ON' : 'OFF';
  btnRotate.classList.toggle('active', autoRotate);
});

const btnGrid = document.getElementById('btn-grid');
btnGrid.addEventListener('click', () => {
  gridGroup.visible = !gridGroup.visible;
  btnGrid.textContent = gridGroup.visible ? 'ON' : 'OFF';
  btnGrid.classList.toggle('active', gridGroup.visible);
});

const btnWireframe = document.getElementById('btn-wireframe');
btnWireframe.addEventListener('click', () => {
  wireframe = !wireframe;
  btnWireframe.textContent = wireframe ? 'ON' : 'OFF';
  btnWireframe.classList.toggle('active', wireframe);
  updateWireframe();
});

document.getElementById('slider-speed').addEventListener('input', (e) => {
  animSpeed = parseFloat(e.target.value);
});

document.getElementById('slider-scale').addEventListener('input', (e) => {
  modelScale = parseFloat(e.target.value);
  if (currentModelGroup) {
    currentModelGroup.scale.setScalar(modelScale * (currentModelType === 'golem' ? 1.0 : 1.2));
  }
});

window.addEventListener('resize', () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});

// ── Boot ──
async function init() {
  [characterAssets, mobFactories] = await Promise.all([
    loadCharacterAssets(),
    loadMobs(),
  ]);
  switchModel('golem');
  animate();
}

init();
