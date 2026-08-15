// games/nightDefense/stage.js — 3D scene management, mob spawns, and camera for Night Defence.

import * as THREE from 'three';
import { triggerMobAttack, updateMobAttack } from '../../core/mobs.js';
import { buildArticulatedGolem } from '../../core/minecraftMobRig.js';
import { BIOMES } from '../../core/biomes.js';

export function createStage(ctx) {
  const { engine, scene, camera, textures, mobFactories } = ctx;
  const root = new THREE.Group();
  root.name = 'night-defense-root';
  scene.add(root);

  // Preserve previous biome to restore on teardown
  const previousBiome = engine.currentBiome ? engine.currentBiome() : BIOMES.flat;

  // Switch to Moonlit Night
  if (engine.setBiome) engine.setBiome(BIOMES.night);

  // ---- 1. Night Torches & Defense Perimeter ----
  const torchMat = new THREE.MeshBasicMaterial({ color: 0xffaa33 });
  const woodMat = new THREE.MeshStandardMaterial({ map: textures.logTex, roughness: 1 });
  const postGeo = new THREE.BoxGeometry(0.25, 1.8, 0.25);
  const headGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);

  const torchPositions = [
    { x: -3.5, z: 2.5 },
    { x: 3.5, z: 2.5 },
    { x: -4.5, z: 6.5 },
    { x: 4.5, z: 6.5 },
  ];

  torchPositions.forEach((pos) => {
    const post = new THREE.Mesh(postGeo, woodMat);
    post.position.set(pos.x, 0.9, pos.z);
    post.castShadow = true;
    root.add(post);

    const head = new THREE.Mesh(headGeo, torchMat);
    head.position.set(pos.x, 1.9, pos.z);
    root.add(head);

    const light = new THREE.PointLight(0xffaa44, 2.2, 8);
    light.position.set(pos.x, 2.0, pos.z);
    root.add(light);
  });

  // ---- 2. Iron Golem Defender ----
  const golemGroup = buildArticulatedGolem();
  golemGroup.position.set(0, 0, 1.8);
  golemGroup.rotation.y = 0; // Facing forward down the lane (+Z)
  root.add(golemGroup);

  // ---- 3. Active Mob Slot & Particles ----
  let currentMob = null;
  let currentMobType = 'zombie';
  let mobLaunchAnim = null;

  // Particle bursts
  const particles = [];
  const particleGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.8 });

  function spawnBurst(pos, color = 'spark') {
    const mat = color === 'spark' ? sparkMat : smokeMat;
    for (let i = 0; i < 16; i++) {
      const p = new THREE.Mesh(particleGeo, mat);
      p.position.copy(pos);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        Math.random() * 4 + 2,
        (Math.random() - 0.5) * 5
      );
      root.add(p);
      particles.push({ mesh: p, vel, life: 0.6, maxLife: 0.6 });
    }
  }

  function spawnMob(type = 'zombie') {
    if (currentMob) {
      root.remove(currentMob);
      currentMob = null;
    }
    currentMobType = type;
    if (mobFactories && mobFactories[type]) {
      currentMob = mobFactories[type]();
    } else {
      currentMob = new THREE.Group();
      const mGeo = new THREE.BoxGeometry(0.8, 1.8, 0.6);
      const mMat = new THREE.MeshStandardMaterial({ color: type === 'creeper' ? 0x2e7d32 : 0x4caf50 });
      const mMesh = new THREE.Mesh(mGeo, mMat);
      mMesh.position.y = 0.9;
      currentMob.add(mMesh);
    }

    currentMob.position.set(0, type === 'ghast' ? 1.8 : 0, 7.5);
    currentMob.rotation.y = Math.PI; // Facing towards Golem and house (-Z)
    root.add(currentMob);
  }

  function executeUppercutVictory(onComplete) {
    if (!golemGroup || !currentMob) {
      if (onComplete) onComplete();
      return;
    }

    // 1. Trigger Golem Uppercut Attack Sequence
    triggerMobAttack(golemGroup, 'golem');

    // 2. Launch Mob into the sky after punch impact (at 300ms)
    setTimeout(() => {
      if (!currentMob) return;
      spawnBurst(currentMob.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 'spark');
      spawnBurst(currentMob.position.clone().add(new THREE.Vector3(0, 0.6, 0)), 'smoke');

      const startPos = currentMob.position.clone();
      const startRot = currentMob.rotation.clone();
      mobLaunchAnim = {
        timer: 0,
        duration: 0.85,
        update: (dt) => {
          mobLaunchAnim.timer += dt;
          const p = Math.min(mobLaunchAnim.timer / mobLaunchAnim.duration, 1.0);
          if (currentMob) {
            currentMob.position.y = startPos.y + p * 6.5;
            currentMob.position.z = startPos.z + p * 4.0;
            currentMob.rotation.x = startRot.x - p * Math.PI * 3;
            currentMob.rotation.y = startRot.y + p * Math.PI * 2;
            currentMob.scale.setScalar(Math.max(0.01, 1.0 - p * 0.9));
          }
          if (p >= 1.0) {
            if (currentMob) {
              root.remove(currentMob);
              currentMob = null;
            }
            mobLaunchAnim = null;
            if (onComplete) onComplete();
          }
        },
      };
    }, 280);
  }

  function executeMobAttackDeflection(onComplete) {
    if (!currentMob) {
      if (onComplete) onComplete();
      return;
    }

    // Trigger mob attack sequence (Creeper swell, Zombie claw, etc.)
    triggerMobAttack(currentMob, currentMobType);

    // Golem steps forward slightly into defensive guard
    if (golemGroup) {
      golemGroup.position.z = 2.1;
      setTimeout(() => {
        if (golemGroup) golemGroup.position.z = 1.8;
      }, 400);
    }

    setTimeout(() => {
      if (onComplete) onComplete();
    }, 1000);
  }

  // Camera framing for Night Defence (dramatic cinematic angle)
  function frameCamera() {
    camera.position.set(-3.5, 4.5, 12.0);
    camera.lookAt(0, 1.8, 3.0);
  }

  function update(dt) {
    // 1. Update active attack animations
    if (golemGroup) updateMobAttack(golemGroup, dt);
    if (currentMob) updateMobAttack(currentMob, dt);

    // 2. Update mob launch physics
    if (mobLaunchAnim) mobLaunchAnim.update(dt);

    // 3. Update particle bursts
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.life -= dt;
      pt.vel.y -= 9.8 * dt;
      pt.mesh.position.addScaledVector(pt.vel, dt);
      pt.mesh.rotation.x += dt * 5;
      if (pt.life <= 0) {
        root.remove(pt.mesh);
        pt.mesh.geometry.dispose();
        particles.splice(i, 1);
      }
    }

    // 4. Subtle ambient breathing on Golem
    if (golemGroup && !golemGroup.userData.attackState?.active) {
      const now = performance.now() * 0.002;
      golemGroup.position.y = Math.sin(now * 2) * 0.03;
    }
  }

  function teardown() {
    scene.remove(root);
    particles.forEach(p => {
      root.remove(p.mesh);
      if (p.mesh.geometry) p.mesh.geometry.dispose();
    });
    particles.length = 0;

    // Restore previous biome
    if (engine.setBiome) engine.setBiome(previousBiome);
    if (engine.resetCamera) engine.resetCamera();
  }

  return {
    root,
    golemGroup,
    getCurrentMob: () => currentMob,
    spawnMob,
    executeUppercutVictory,
    executeMobAttackDeflection,
    frameCamera,
    update,
    teardown,
  };
}
