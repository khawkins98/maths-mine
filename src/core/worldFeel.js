// core/worldFeel.js — makes the island feel like a physical object rather than
// a backdrop.
//
// Two effects, both deliberately small. This is not a 3D camera control; the
// games own the framing and a child must never be able to lose the play area.
//
//   1. PARALLAX. Moving a finger or the mouse turns the camera rig by a couple
//      of degrees, so the blocks shift against the ground and the world reads as
//      having depth. Heavily smoothed, and it always eases back to centre.
//
//   2. TOUCH. Tapping the ground makes it respond: the whole island dips and
//      springs back on a damped spring, tilting toward wherever you touched
//      like a trampoline, with a puff of dust and a soft thud. Taps that land
//      on game objects are ignored — only bare ground answers.
//
// Runs off the shared engine and is never torn down, so it survives game
// switches. It only ever writes to `camRig.rotation` and `platform.position /
// rotation`, neither of which any game touches.

import * as THREE from 'three';

// --- parallax ---
const YAW = 0.055;      // radians at full deflection (~3.2 degrees)
const PITCH = 0.028;    // less vertically; too much reads as a camera fault
const EASE = 3.2;       // approach rate; low enough to feel like weight
const RECENTRE = 0.55;  // per-second drift back to centre when idle

// --- ground spring ---
const STIFFNESS = 155;  // how hard it pulls back to rest
const DAMPING = 11;     // how fast the wobble dies (higher = fewer bounces)
const DIP = 1.9;        // downward impulse on a tap
const TILT = 0.055;     // how much the island leans toward the touch
const MAX_DIP = 0.34;   // clamp, so a drum-roll of taps can't launch the island
const REST_EPS = 1e-4;  // below this the spring is visually at rest: stop writing

export function createWorldFeel({ engine, audio, textures }) {
  const { camRig, camera, platform, ground, renderer, scene } = engine;
  const dom = renderer.domElement;

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  // parallax state
  let targetYaw = 0, targetPitch = 0;
  let pointerSeen = false;

  // spring state: vertical dip plus a lean on each horizontal axis
  let y = 0, vy = 0;
  let rx = 0, vrx = 0;
  let rz = 0, vrz = 0;
  let asleep = true;   // no impulse yet, so nothing to integrate

  const restY = platform.position.y;

  // dust raised by a tap
  const dust = [];
  const dustGroup = new THREE.Group();
  dustGroup.name = 'world-feel-dust';
  scene.add(dustGroup);

  function puff(x, z, n = 6) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({
        map: textures.puffTex, color: 0xdcc9a4, transparent: true,
        opacity: 0.6, depthWrite: false,
      }));
      m.position.set(x + (Math.random() - 0.5) * 0.7, 0.05, z + (Math.random() - 0.5) * 0.7);
      m.scale.setScalar(0.18 + Math.random() * 0.16);
      dustGroup.add(m);
      dust.push({
        mesh: m,
        v: new THREE.Vector3((Math.random() - 0.5) * 1.4, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 1.4),
        life: 0.45,
      });
    }
  }

  // Where on the ground is this screen point, if anywhere?
  function groundHit(clientX, clientY) {
    ndc.x = (clientX / window.innerWidth) * 2 - 1;
    ndc.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    // Only the top slab counts. `recursive: false` keeps blocks, dice, Nuggets
    // and Bolt out of it — tapping a game object is that game's business.
    const hits = raycaster.intersectObject(ground, false);
    return hits.length ? hits[0].point : null;
  }

  function onPointerMove(e) {
    pointerSeen = true;
    targetYaw = ((e.clientX / window.innerWidth) * 2 - 1) * YAW;
    targetPitch = ((e.clientY / window.innerHeight) * 2 - 1) * PITCH;
  }

  function onPointerDown(e) {
    onPointerMove(e);
    const p = groundHit(e.clientX, e.clientY);
    if (!p) return;

    // Dip, and lean toward the touch. Normalising by the island's half-extent
    // means a tap near an edge tips it noticeably while a tap dead centre just
    // pushes straight down.
    vy -= DIP;
    vrx += (p.z / 12) * TILT * STIFFNESS * 0.02;
    vrz -= (p.x / 15) * TILT * STIFFNESS * 0.02;
    asleep = false;

    puff(p.x, p.z);
    audio.thunk(0);
  }

  // A finger leaving the screen shouldn't freeze the world off-centre.
  function onPointerOut() { pointerSeen = false; }

  dom.addEventListener('pointermove', onPointerMove);
  dom.addEventListener('pointerdown', onPointerDown);
  dom.addEventListener('pointerleave', onPointerOut);
  window.addEventListener('blur', onPointerOut);

  function update(dt) {
    // --- parallax: ease toward the target, drift home when idle ---
    if (!pointerSeen) {
      const k = Math.min(1, dt * RECENTRE);
      targetYaw += (0 - targetYaw) * k;
      targetPitch += (0 - targetPitch) * k;
    }
    const k = Math.min(1, dt * EASE);
    camRig.rotation.y += (targetYaw - camRig.rotation.y) * k;
    camRig.rotation.x += (targetPitch - camRig.rotation.x) * k;

    // --- ground spring (damped harmonic, integrated semi-implicitly) ---
    // Only touched while it is actually moving. Writing the platform transform
    // every frame would dirty the matrices of three big slabs and a 100-cube
    // instanced rim on every tick, for nothing, which measurably slowed the
    // whole render loop once this shipped.
    if (!asleep) {
      vy += (-STIFFNESS * y - DAMPING * vy) * dt;
      y = Math.max(-MAX_DIP, Math.min(MAX_DIP, y + vy * dt));
      vrx += (-STIFFNESS * rx - DAMPING * vrx) * dt;
      rx += vrx * dt;
      vrz += (-STIFFNESS * rz - DAMPING * vrz) * dt;
      rz += vrz * dt;

      // Close enough to rest that nobody can see the difference: snap and stop.
      if (Math.abs(y) < REST_EPS && Math.abs(vy) < REST_EPS
        && Math.abs(rx) < REST_EPS && Math.abs(vrx) < REST_EPS
        && Math.abs(rz) < REST_EPS && Math.abs(vrz) < REST_EPS) {
        y = vy = rx = vrx = rz = vrz = 0;
        asleep = true;
      }

      platform.position.y = restY + y;
      platform.rotation.x = rx;
      platform.rotation.z = rz;
    }

    // --- dust ---
    for (let i = dust.length - 1; i >= 0; i--) {
      const d = dust[i];
      d.life -= dt;
      d.v.y -= 1.6 * dt;
      d.mesh.position.addScaledVector(d.v, dt);
      d.mesh.scale.multiplyScalar(1 + dt * 1.9);
      d.mesh.material.opacity = Math.max(0, d.life / 0.45) * 0.6;
      if (d.life <= 0) {
        dustGroup.remove(d.mesh);
        d.mesh.material.dispose();
        dust.splice(i, 1);
      }
    }
  }

  // Let a game punch the ground without a tap (a block landing, a die hitting
  // the tray) so the island reacts to the play, not only to fingers.
  function impulse(strength = 1, x = 0, z = 0) {
    vy -= DIP * strength;
    vrx += (z / 12) * TILT * STIFFNESS * 0.02 * strength;
    vrz -= (x / 15) * TILT * STIFFNESS * 0.02 * strength;
    asleep = false;
  }

  return { update, impulse, puff };
}
