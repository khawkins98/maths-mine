import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadMobs, createMob, MOB_TYPES } from '../core/mobs.js';
import { loadCharacterAssets } from '../core/characters.js';
import { createTextures } from '../core/textures.js';
import {
  buildSteveModel,
  buildZombieModel,
  buildVillagerModel,
  buildCreeperModel,
  buildEndermanModel,
  buildGhastModel,
  buildArticulatedGolem,
} from '../core/minecraftMobRig.js';

const container = document.getElementById('canvas-container');

// ── Three.js Scene Setup ──
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1b24);
scene.fog = new THREE.Fog(0x1a1b24, 25, 60);

const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
camera.position.set(1.5, 1.8, 4.8);

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
await textures.ready;

let animateEnabled = true;
let autoRotate = false;
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

  const titles = {
    golem:    { name: 'Iron Golem', stats: 'Height: ~2.4m | Articulated 128x128 UV Box Guardian', tex: '/assets/mobs/iron_golem.png?v=2' },
    steve:    { name: 'Steve (Player Character)', stats: 'Height: ~1.8m | Official Minecraft Character Model', tex: '/assets/characters/Textures/texture-steve.png' },
    villager: { name: 'Villager (Honest Crew)', stats: 'Height: ~1.9m | Authentic Robes, Snout & Folded Arms', tex: '/assets/mobs/villager.png?v=2' },
    zombie:   { name: 'Zombie (Imposter Mob)', stats: 'Height: ~1.9m | Outstretched Arms Imposter Model', tex: '/assets/mobs/zombie.png?v=2' },
    creeper:  { name: 'Creeper (Explosive Mob)', stats: 'Height: ~1.7m | 4-Legged Quadruped Model', tex: '/assets/mobs/creeper.png?v=2' },
    ghast:    { name: 'Ghast (Nether Mob)', stats: 'Height: ~2.5m | 9-Tentacle Floating Model', tex: '/assets/mobs/ghast.png?v=2' },
    enderman: { name: 'Enderman (Ender Mob)', stats: 'Height: ~2.8m | Slender Long-Limbed Ender Model', tex: '/assets/mobs/enderman.png?v=2' },
  };

  const meta = titles[type] || titles.golem;
  nameEl.innerHTML = `<strong>${meta.name}</strong>`;
  statsEl.textContent = meta.stats;
  texImg.src = meta.tex;

  if (type === 'golem') {
    currentModelGroup = buildArticulatedGolem();
  } else if (type === 'creeper') {
    currentModelGroup = buildCreeperModel(0.055 * 1.3);
  } else if (type === 'steve' && characterAssets) {
    currentModelGroup = characterAssets.create('steve');
    currentModelGroup.scale.setScalar(1.2);
  } else if (mobFactories && mobFactories[type]) {
    currentModelGroup = mobFactories[type]();
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

// ── Attack & Action Sequences ──
let attackState = {
  active: false,
  type: '',
  timer: 0,
  duration: 1.0,
  initialScale: new THREE.Vector3(1, 1, 1),
  initialPos: new THREE.Vector3(0, 0, 0),
};

function triggerAttack() {
  if (!currentModelGroup || attackState.active) return;

  const durations = {
    golem: 0.9,
    creeper: 1.5,
    zombie: 0.75,
    enderman: 1.1,
    ghast: 1.2,
    steve: 0.6,
    villager: 1.2,
  };

  attackState = {
    active: true,
    type: currentModelType,
    timer: 0,
    duration: durations[currentModelType] || 0.8,
    initialScale: currentModelGroup.scale.clone(),
    initialPos: currentModelGroup.position.clone(),
  };

  const btn = document.getElementById('btn-attack');
  if (btn) {
    btn.style.transform = 'scale(0.95)';
    btn.style.boxShadow = '0 0 16px rgba(255,152,0,0.8)';
    setTimeout(() => {
      btn.style.transform = 'none';
      btn.style.boxShadow = '0 2px 8px rgba(230,81,0,0.3)';
    }, 200);
  }
}

// ── Animation Loop ──
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.getElapsedTime() * animSpeed;

  if (controls) controls.update();

  if (currentModelGroup && animateEnabled) {
    if (attackState.active) {
      attackState.timer += dt * animSpeed;
      const p = Math.min(attackState.timer / attackState.duration, 1.0);
      const type = attackState.type;

      if (type === 'golem' && currentModelGroup.userData.anim) {
        const { lArmPivot, rArmPivot, headPivot, torsoGroup, legH } = currentModelGroup.userData.anim;
        const baseTorsoY = legH || (16 * 0.055);

        if (p < 0.25) {
          // Wind-up: arms down and back, slight knee crouch
          const sub = p / 0.25;
          lArmPivot.rotation.x = sub * 0.8;
          rArmPivot.rotation.x = sub * 0.8;
          torsoGroup.position.y = baseTorsoY - sub * 0.05;
        } else if (p < 0.65) {
          // Explosive Uppercut launch!
          const sub = (p - 0.25) / 0.4;
          const swing = Math.sin(sub * Math.PI * 0.5);
          lArmPivot.rotation.x = 0.8 - swing * (0.8 + Math.PI * 0.85);
          rArmPivot.rotation.x = 0.8 - swing * (0.8 + Math.PI * 0.85);
          currentModelGroup.position.y = attackState.initialPos.y + Math.sin(sub * Math.PI) * 0.22;
          headPivot.rotation.x = -Math.sin(sub * Math.PI) * 0.4;
          torsoGroup.rotation.x = -Math.sin(sub * Math.PI) * 0.2;
          torsoGroup.position.y = baseTorsoY;
        } else {
          // Smooth recovery back to idle/patrol
          const sub = (p - 0.65) / 0.35;
          lArmPivot.rotation.x = -Math.PI * 0.85 * (1.0 - sub);
          rArmPivot.rotation.x = -Math.PI * 0.85 * (1.0 - sub);
          currentModelGroup.position.y = attackState.initialPos.y;
          headPivot.rotation.x = 0;
          torsoGroup.rotation.x = 0;
          torsoGroup.position.y = baseTorsoY;
        }
      } else if (type === 'creeper') {
        const j = currentModelGroup.userData.joints;
        if (p < 0.8) {
          const swell = 1.0 + Math.pow(p / 0.8, 1.8) * 0.35;
          currentModelGroup.scale.copy(attackState.initialScale).multiply(new THREE.Vector3(swell, 1.0 + (swell - 1) * 0.6, swell));
          if (j && j.neck) j.neck.rotation.x = -(p / 0.8) * 0.35;
          const flash = Math.sin(p * 30) > 0;
          currentModelGroup.traverse(n => {
            if (n.isMesh && n.material) n.material.emissive.setHex(flash ? 0xffffff : 0x000000);
          });
        } else {
          const sub = (p - 0.8) / 0.2;
          currentModelGroup.scale.lerpVectors(currentModelGroup.scale, attackState.initialScale, sub);
          currentModelGroup.traverse(n => {
            if (n.isMesh && n.material) n.material.emissive.setHex(0x000000);
          });
          if (j && j.neck) j.neck.rotation.x = 0;
        }
      } else if (type === 'zombie') {
        const j = currentModelGroup.userData.joints;
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
            j.body.position.z = sub * 0.25;
          }
          if (j.neck) j.neck.rotation.x = -0.35 + sub * 0.7;
        } else {
          const sub = (p - 0.65) / 0.35;
          if (j.shoulders['-1']) j.shoulders['-1'].rotation.x = THREE.MathUtils.lerp(0.15, -Math.PI * 0.5, sub);
          if (j.shoulders['1']) j.shoulders['1'].rotation.x = THREE.MathUtils.lerp(0.15, -Math.PI * 0.5, sub);
          if (j.body) {
            j.body.rotation.x = THREE.MathUtils.lerp(0.35, 0, sub);
            j.body.position.z = THREE.MathUtils.lerp(0.25, 0, sub);
          }
          if (j.neck) j.neck.rotation.x = THREE.MathUtils.lerp(0.35, 0, sub);
        }
      } else if (type === 'enderman') {
        const j = currentModelGroup.userData.joints;
        if (p < 0.25) {
          const sub = p / 0.25;
          if (j.neck) j.neck.rotation.x = -sub * 0.6;
          if (j.shoulders['-1']) {
            j.shoulders['-1'].rotation.x = -sub * Math.PI * 0.75;
            j.shoulders['-1'].rotation.z = sub * 0.45;
          }
          if (j.shoulders['1']) {
            j.shoulders['1'].rotation.x = -sub * Math.PI * 0.75;
            j.shoulders['1'].rotation.z = -sub * 0.45;
          }
        } else if (p < 0.8) {
          const jitterX = (Math.random() - 0.5) * 0.08;
          const jitterZ = (Math.random() - 0.5) * 0.08;
          currentModelGroup.position.x = jitterX;
          currentModelGroup.position.z = jitterZ;
          if (j.neck) j.neck.rotation.z = Math.sin(p * 50) * 0.25;
        } else {
          const sub = (p - 0.8) / 0.2;
          currentModelGroup.position.set(0, 0, 0);
          if (j.neck) {
            j.neck.rotation.x = THREE.MathUtils.lerp(-0.6, 0, sub);
            j.neck.rotation.z = 0;
          }
          if (j.shoulders['-1']) {
            j.shoulders['-1'].rotation.x = THREE.MathUtils.lerp(-Math.PI * 0.75, 0, sub);
            j.shoulders['-1'].rotation.z = THREE.MathUtils.lerp(0.45, 0, sub);
          }
          if (j.shoulders['1']) {
            j.shoulders['1'].rotation.x = THREE.MathUtils.lerp(-Math.PI * 0.75, 0, sub);
            j.shoulders['1'].rotation.z = THREE.MathUtils.lerp(-0.45, 0, sub);
          }
        }
      } else if (type === 'ghast') {
        if (p < 0.4) {
          const sub = p / 0.4;
          currentModelGroup.position.z = -sub * 0.4;
          currentModelGroup.scale.copy(attackState.initialScale).multiplyScalar(1.0 + sub * 0.15);
        } else if (p < 0.7) {
          const sub = (p - 0.4) / 0.3;
          currentModelGroup.position.z = -0.4 + sub * 0.8;
          currentModelGroup.traverse(n => {
            if (n.isMesh && n.material) n.material.emissive.setHex(0xff3300);
          });
        } else {
          const sub = (p - 0.7) / 0.3;
          currentModelGroup.position.z = THREE.MathUtils.lerp(0.4, 0, sub);
          currentModelGroup.scale.lerp(attackState.initialScale, sub);
          currentModelGroup.traverse(n => {
            if (n.isMesh && n.material) n.material.emissive.setHex(0x000000);
          });
        }
      } else if (type === 'steve') {
        const j = currentModelGroup.userData.joints;
        if (p < 0.3) {
          const sub = p / 0.3;
          if (j.shoulders['-1']) {
            j.shoulders['-1'].rotation.x = -sub * Math.PI * 0.75;
            j.shoulders['-1'].rotation.z = sub * 0.5;
          }
          if (j.body) j.body.rotation.y = -sub * 0.35;
        } else if (p < 0.65) {
          const sub = (p - 0.3) / 0.35;
          if (j.shoulders['-1']) {
            j.shoulders['-1'].rotation.x = -Math.PI * 0.75 + sub * (Math.PI * 0.75 + 0.5);
            j.shoulders['-1'].rotation.z = 0.5 - sub * 0.9;
          }
          if (j.body) j.body.rotation.y = -0.35 + sub * 0.7;
        } else {
          const sub = (p - 0.65) / 0.35;
          if (j.shoulders['-1']) {
            j.shoulders['-1'].rotation.x = THREE.MathUtils.lerp(0.5, 0, sub);
            j.shoulders['-1'].rotation.z = THREE.MathUtils.lerp(-0.4, 0, sub);
          }
          if (j.body) j.body.rotation.y = THREE.MathUtils.lerp(0.35, 0, sub);
        }
      } else if (type === 'villager') {
        const j = currentModelGroup.userData.joints;
        if (j.neck) j.neck.rotation.y = Math.sin(p * 35) * 0.5;
        if (j.shoulders && j.shoulders['-1']) {
          j.shoulders['-1'].rotation.x = -0.45 * Math.sin(p * Math.PI);
        }
        if (p >= 0.98) {
          if (j.neck) j.neck.rotation.y = 0;
          if (j.shoulders && j.shoulders['-1']) j.shoulders['-1'].rotation.x = 0;
        }
      }

      if (p >= 1.0) {
        attackState.active = false;
        currentModelGroup.scale.copy(attackState.initialScale);
        if (type !== 'ghast') currentModelGroup.position.set(0, 0, 0);
      }
    } else {
      // Normal walk & idle cycle
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
        const j = currentModelGroup.userData.joints;
        const walkPhase = Math.sin(t * 3.2);

        if (j.shoulders && j.shoulders['-1']) {
          const r0 = j.shoulders['-1'].userData.restRotation;
          j.shoulders['-1'].rotation.x = (r0 ? r0.x : 0) + walkPhase * 0.45;
        }
        if (j.shoulders && j.shoulders['1']) {
          const r0 = j.shoulders['1'].userData.restRotation;
          j.shoulders['1'].rotation.x = (r0 ? r0.x : 0) - walkPhase * 0.45;
        }
        if (j.hips && j.hips['-1']) {
          const r0 = j.hips['-1'].userData.restRotation;
          j.hips['-1'].rotation.x = (r0 ? r0.x : 0) - walkPhase * 0.4;
        }
        if (j.hips && j.hips['1']) {
          const r0 = j.hips['1'].userData.restRotation;
          j.hips['1'].rotation.x = (r0 ? r0.x : 0) + walkPhase * 0.4;
        }
        if (j.backHips && j.backHips['-1']) {
          const r0 = j.backHips['-1'].userData.restRotation;
          j.backHips['-1'].rotation.x = (r0 ? r0.x : 0) + walkPhase * 0.4;
        }
        if (j.backHips && j.backHips['1']) {
          const r0 = j.backHips['1'].userData.restRotation;
          j.backHips['1'].rotation.x = (r0 ? r0.x : 0) - walkPhase * 0.4;
        }
        if (j.neck) {
          const r0 = j.neck.userData.restRotation;
          j.neck.rotation.y = (r0 ? r0.y : 0) + Math.sin(t * 1.2) * 0.25;
        }
      }
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

const btnAttack = document.getElementById('btn-attack');
if (btnAttack) {
  btnAttack.addEventListener('click', triggerAttack);
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.key.toLowerCase() === 'a') {
    e.preventDefault();
    triggerAttack();
  }
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
