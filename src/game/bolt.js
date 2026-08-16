// game/bolt.js — the 3D mascot: a texture-mapped block adventurer
// who reacts to the child (idle bob, blink, hop on correct, shake on "wow",
// blob shadow). A speech bubble tracks his head in screen space.
//
// RIG: the miner has an ARTICULATED SKELETON of THREE.Object3D pivots
// (the Minecraft-mob approach for rigid parts):
//   root → torso → { neckPivot→head, shoulder→(arm→elbow→hand), hip→leg }
// Every limb mesh hangs off a pivot placed at its real joint, so rotating a
// pivot swings the limb from the shoulder/hip. All motion (idle breathing, arm
// sway, wave, hop, wow, walk) is procedural joint rotation driven from update().
//
// EXPERIENCE-AS-PROGRESS: setOxidation(0..1) controls how battle-worn the miner
// looks — fresh and clean at 0, slightly weathered/darker at 1 as mastery grows.
// The API is preserved so callers don't need to change.

import * as THREE from 'three';

// The miner stands ON the island rather than being pinned to the camera. Parented to
// the camera he was really a 3D HUD element: he ignored the terrain, and when a
// camera move took his fixed offset below the ground he sank into it, which is
// exactly what the commutativity rotate used to do to him.
//
// In the world he casts onto the same grass as the blocks, is occluded like
// anything else, and moves with the parallax for free. The cost is that each
// game must put him somewhere its own camera framing can see, via placeAt().
const BOLT_SCALE = 0.58;
const BOLT_HOME = new THREE.Vector3(-4.8, 0, 1.8); // natural position beside cottage porch
const EDGE = 0.74;  // how close to the frame edge he may stand, in NDC

export function createBolt({ scene, camera, textures, characterAssets, nowT, bubbleEl }) {
  const bolt = new THREE.Group();
  const _camPos = new THREE.Vector3();
  const _ndc = new THREE.Vector3();

  let boltShadow = null;

  // Authentic Steve skin (cyan shirt, blue jeans, dark hair, no mustache).
  const player = characterAssets.create('steve');

  const torso = new THREE.Group();
  torso.add(player);
  bolt.add(torso);

  const { neck: neckPivot, shoulders: shoulder, hips: hip } = player.userData.joints;

  // blob shadow: parented to the ROOT (not the torso) so it stays flat under the
  // feet and never inherits limb/breathing motion.
  boltShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 0.9),
    new THREE.MeshBasicMaterial({ map: textures.puffTex, color: 0x203a2a, transparent: true, opacity: 0.3, depthWrite: false })
  );
  boltShadow.rotation.x = -Math.PI / 2;
  boltShadow.position.y = 0.015;
  bolt.add(boltShadow);

  bolt.scale.setScalar(BOLT_SCALE);
  const home = BOLT_HOME.clone();
  bolt.userData.scale = BOLT_SCALE;
  bolt.position.copy(home);
  bolt.visible = false;
  scene.add(bolt);

  // Stand Bolt on the island at (x, z), optionally resized for the framing.
  //
  // Each game puts its camera at a different distance, so one world scale gives
  // him a wildly different apparent size from game to game: in the imposter
  // tier he filled nearly half the screen height and covered a villager the
  // child has to be able to see. `scale` is relative to his default.
  // Back to the menu pose. Games move Bolt to suit their own framing and none
  // of them put him back, so the mascot greeted the child at 62% scale in the
  // wrong place depending on which game they had just left.
  function resetPlacement() {
    bolt.userData.scale = BOLT_SCALE;
    home.copy(BOLT_HOME);
  }

  function placeAt(x, z, scale = 1) {
    const sc = BOLT_SCALE * scale;
    bolt.userData.scale = sc;
    home.set(x, 0, z);
  }
  // Speech-bubble anchor above the texture-mapped head.
  const headAnchor = new THREE.Object3D();
  headAnchor.position.set(0, 2.85, 0);
  torso.add(headAnchor);

  let oxidation = 0;
  // setOxidation(0..1): at 0 the miner is clean and fresh, at 1 he's slightly
  // battle-worn (darker tones). Walks the hierarchy and recolours tagged mats.
  function setOxidation(level) {
    oxidation = Math.max(0, Math.min(1, level || 0));
    player.traverse((o) => {
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        if (m.userData.characterSkin) m.color.set(0xffffff).lerp(new THREE.Color(0xc4b49e), oxidation * 0.34);
      }
    });
    bolt.userData.oxidation = oxidation;
  }
  setOxidation(0);

  // ---------------------------------------------------------------------------
  //  ANIMATION
  //  A tiny state machine: a continuous IDLE pose is computed every frame, an
  //  optional WALK cycle overrides the limbs, and a one-shot ACTION (wave / hop
  //  / wow) layers on top for its duration. All of it is joint rotation.
  // ---------------------------------------------------------------------------
  let action = null;          // 'wave' | 'hop' | 'wow' | null
  let actionT = 0;            // seconds since the action began
  const ACTION_DUR = { wave: 1.9, hop: 0.7, wow: 0.85 };
  let walkOn = false, walkT = 0;
  let footTapT = 2.5;         // countdown to the next idle foot-tap
  let tapping = 0;            // remaining time of the current foot-tap

  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  // map the legacy react() moods to actions
  function react(mood) {
    if (mood === 'happy') startAction('hop');
    else if (mood === 'wow') startAction('wow');
  }
  function startAction(name) { action = name; actionT = 0; }
  function playWave() { startAction('wave'); }
  function playWalk(on) { walkOn = !!on; if (on) walkT = 0; }

  // Reset every joint to its neutral pose, then re-apply the layered anims. This
  // keeps things drift-free: each frame is computed from scratch.
  function resetPose() {
    torso.position.set(0, 0, 0); torso.rotation.set(0, 0, 0); torso.scale.set(1, 1, 1);
    neckPivot.rotation.set(0, 0, 0);
    for (const side of [-1, 1]) {
      shoulder[side].rotation.set(0, 0, 0);
      hip[side].rotation.set(0, 0, 0);
    }
  }

  function update(dt) {
    if (!bolt.visible) return;
    const t = nowT();
    resetPose();

    // ---- root hover (kept subtle; the joints do the "alive" work) ----
    let rootY = home.y + Math.sin(t * 2) * 0.04;
    let rootRZ = Math.sin(t * 1.3) * 0.03;
    let rootRX = 0;

    // ---- IDLE: breathing + gentle arm sway + head drift + weight shift ----
    const breathe = Math.sin(t * 1.8);
    torso.scale.y = 1 + breathe * 0.015;
    torso.scale.x = 1 - breathe * 0.008;
    torso.position.y = breathe * 0.01;
    // continuous shoulder sway (arms swing opposite each other)
    shoulder[-1].rotation.x = Math.sin(t * 1.5) * 0.09;
    shoulder[1].rotation.x = Math.sin(t * 1.5 + Math.PI) * 0.09;
    shoulder[-1].rotation.z = Math.sin(t * 0.9) * 0.04;
    shoulder[1].rotation.z = -Math.sin(t * 0.9) * 0.04;
    // head drift
    neckPivot.rotation.y = Math.sin(t * 0.7) * 0.12;
    neckPivot.rotation.x = Math.sin(t * 1.1) * 0.03;
    // slow weight shift (lean into the standing leg)
    const shift = Math.sin(t * 0.5);
    rootRZ += shift * 0.015;
    // occasional foot tap
    footTapT -= dt;
    if (footTapT <= 0 && tapping <= 0) { tapping = 0.5; footTapT = 3 + Math.random() * 3; }
    if (tapping > 0) {
      tapping -= dt;
      const k = Math.max(0, tapping / 0.5);
      hip[1].rotation.x = -Math.abs(Math.sin((0.5 - tapping) * 26)) * 0.5 * k;
    }

    // ---- WALK cycle: overrides leg swing + counter-rotates the arms ----
    if (walkOn) {
      walkT += dt;
      const p = walkT * 7;
      hip[-1].rotation.x = Math.sin(p) * 0.55;
      hip[1].rotation.x = Math.sin(p + Math.PI) * 0.55;
      shoulder[-1].rotation.x = Math.sin(p + Math.PI) * 0.4;
      shoulder[1].rotation.x = Math.sin(p) * 0.4;
      shoulder[-1].rotation.z = 0; shoulder[1].rotation.z = 0;
      rootY += Math.abs(Math.sin(p)) * 0.06;
      torso.rotation.y = Math.sin(p) * 0.08;
    }

    // ---- ONE-SHOT ACTIONS ----
    if (action) {
      actionT += dt;
      const dur = ACTION_DUR[action] || 0.7;
      const prog = clamp01(actionT / dur);

      if (action === 'wave') {
        // raise the right arm out/up and wag the forearm a few times.
        const inOut = Math.sin(prog * Math.PI);           // ease in then out
        shoulder[1].rotation.z = lerp(0, 2.25, inOut);    // arm up-and-out
        shoulder[1].rotation.x = lerp(0, -0.2, inOut);
        shoulder[1].rotation.y = Math.sin(actionT * 13) * 0.22 * inOut; // wag
        neckPivot.rotation.z = Math.sin(actionT * 13) * 0.05 * inOut;
      } else if (action === 'hop') {
        const k = 1 - prog;
        rootY += Math.abs(Math.sin(prog * Math.PI)) * 0.34;   // the jump arc
        // arms thrown up
        shoulder[-1].rotation.z = lerp(0, 2.4, Math.sin(prog * Math.PI));
        shoulder[1].rotation.z = lerp(0, -2.4, Math.sin(prog * Math.PI));
        // legs tuck at the apex
        const tuck = Math.sin(prog * Math.PI) * 0.6;
        hip[-1].rotation.x = tuck; hip[1].rotation.x = tuck;
        // squash on take-off, stretch mid-air, squash on land
        let sq = 0;
        if (prog < 0.16) sq = prog / 0.16;                 // crouch
        else if (prog > 0.82) sq = (prog - 0.82) / 0.18;   // land
        torso.scale.y = 1 - 0.16 * sq; torso.scale.x = 1 + 0.14 * sq;
        neckPivot.rotation.x = -0.15 * Math.sin(prog * Math.PI);
      } else if (action === 'wow') {
        const k = Math.sin(prog * Math.PI);
        rootRX = -0.28 * k;                                 // lean back
        shoulder[-1].rotation.z = 1.3 * k;                  // arms out
        shoulder[1].rotation.z = -1.3 * k;
        neckPivot.rotation.y = Math.sin(actionT * 24) * 0.35 * k; // head shake
        rootY += 0.05 * k;
      }
      if (actionT >= dur) action = null;
    }

    // ---- apply root transform ----
    bolt.position.set(home.x, rootY, home.z);

    // Turn to face the camera. In the world he no
    // longer inherits its orientation, and a mascot addressing the child must
    // not be seen in profile when a game frames the island from another angle.
    _camPos.setFromMatrixPosition(camera.matrixWorld);
    bolt.rotation.set(
      rootRX,
      Math.atan2(_camPos.x - bolt.position.x, _camPos.z - bolt.position.z),
      rootRZ,
    );
    bolt.scale.setScalar(bolt.userData.scale);
    // Turn to face the camera. In the world he no longer inherits its
    // orientation, and a mascot addressing the child must not be seen in
    // profile when a game frames the island from a different angle.


    // ---- blob shadow: shrinks/fades as he bobs higher ----
    const bob = rootY - home.y;
    boltShadow.position.y = 0.015 - bob;
    const sh = Math.max(0.35, 1 - bob * 1.6);
    boltShadow.scale.set(sh, sh, 1);
    boltShadow.material.opacity = 0.28 * Math.max(0.4, sh);

  }

  const _proj = new THREE.Vector3();
  function updateBubble() {
    if (!bubbleEl || bubbleEl.classList.contains('hidden')) return;
    headAnchor.getWorldPosition(_proj); _proj.project(camera);
    const W = window.innerWidth;
    // The bubble is centred over Bolt's head (CSS translate(-50%,…)); clamp its
    // x to the LEFT region so it never covers the centre HUD text (tally /
    // question) — a real overlap bug two playtesters hit.
    //
    // The left bound has to account for the bubble's own width, not just a
    // fraction of the viewport: on an upright tablet a fixed 14% margin still
    // let half the bubble hang off the screen edge.
    const halfW = (bubbleEl.offsetWidth || 0) / 2;
    const lo = Math.min(halfW + 8, W * 0.45);
    const x = Math.max(lo, Math.min((_proj.x * 0.5 + 0.5) * W, W * 0.40));
    bubbleEl.style.left = `${x}px`;
    bubbleEl.style.top = `${(-_proj.y * 0.5 + 0.5) * window.innerHeight}px`;
  }

  // Update the speech bubble text + trigger the 3D reaction animation.
  function say(text, mood) {
    if (bubbleEl) {
      bubbleEl.textContent = text;
      bubbleEl.classList.remove('hidden');
      bubbleEl.style.animation = 'none'; void bubbleEl.offsetWidth; bubbleEl.style.animation = '';
    }
    react(mood);
  }

  function show(v = true) { bolt.visible = v; if (bubbleEl) bubbleEl.classList.toggle('hidden', !v); }

  // dispose the whole joint hierarchy's geometries + materials (the miner normally
  // lives for the app's lifetime, but keep teardown correct/leak-free).
  function dispose() {
    bolt.traverse((o) => {
      if (o.geometry && !characterAssets.geometries.has(o.geometry)) o.geometry.dispose?.();
      const mm = o.material;
      if (Array.isArray(mm)) mm.forEach((m) => m.dispose?.());
      else if (mm) mm.dispose?.();
    });
    scene.remove(bolt);
  }

  return { group: bolt, headAnchor, react, say, update, updateBubble, setOxidation, show, placeAt, resetPlacement,
    playWave, playWalk, dispose,
    get oxidation() { return oxidation; } };
}
