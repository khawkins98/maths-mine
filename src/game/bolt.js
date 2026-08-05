// game/bolt.js — the 3D Bolt mascot: a voxel-ish copper-golem robot parented to
// the camera so he's always bottom-left of the view and reacts to the child
// (idle bob, blink, hop on correct, shake on "wow", antenna glow while talking,
// blob shadow, patina flecks). A speech bubble tracks his head in screen space.
//
// RIG: Bolt is no longer a flat bag of meshes — he has an ARTICULATED SKELETON
// made of THREE.Object3D pivots (the Minecraft-mob approach for rigid parts):
//   root → torso → { neckPivot→head, shoulder→(arm→elbow→hand), hip→leg }
// Every limb mesh hangs off a pivot placed at its real joint, so rotating a
// pivot swings the limb from the shoulder/hip. All motion (idle breathing, arm
// sway, wave, hop, wow, walk) is procedural joint rotation driven from update().
//
// OXIDATION-AS-PROGRESS: Bolt starts as shiny un-oxidised COPPER (orange) for a
// new child and oxidises toward the verdigris-TEAL copper-golem look as overall
// mastery grows — inspired by Minecraft copper's four oxidation stages.
// setOxidation(0..1) is the single knob; the palette (and a little metalness +
// the verdigris fleck opacity) is a pure function of it. It walks the whole
// joint hierarchy so every part recolours no matter how deep it is nested.

import * as THREE from 'three';

const BOLT_SCALE = 0.6;                                  // fully in frame
const BOLT_HOME = new THREE.Vector3(-2.3, -1.72, -6.2); // local to camera

// Endpoint palette per material role: `fresh` = un-oxidised shiny copper (0),
// `oxid` = weathered verdigris/copper (1, == the original hard-coded colours).
const OX = {
  teal:     { fresh: 0xe07b3c, oxid: 0x5cc3bd }, // body / legs / arms
  tealHi:   { fresh: 0xf0975a, oxid: 0x74d2cc }, // head (lighter face)
  tealDk:   { fresh: 0xb05c28, oxid: 0x3f9e98 }, // hips / shade
  copper:   { fresh: 0xe89a54, oxid: 0xc9793d }, // trim: feet, plate, shoulders…
  copperDk: { fresh: 0xc0703a, oxid: 0x9c5a2b }, // neck / mouth
};

export function createBolt({ camera, textures, nowT, bubbleEl }) {
  const bolt = new THREE.Group();

  let boltEyes = [], boltBulbMat = null, boltShadow = null;

  // a MeshStandardMaterial recoloured by setOxidation() from its role's
  // fresh→oxid endpoints (plus a shiny→matte metalness ramp). The endpoints are
  // tagged on the material's userData so setOxidation can find it by walking the
  // hierarchy instead of relying on a flat array.
  const oxMat = (role, emissive = 0, rough = 0.5) => {
    const mat = new THREE.MeshStandardMaterial({ color: OX[role].oxid, roughness: rough, metalness: 0.18, emissive });
    mat.userData.oxFresh = new THREE.Color(OX[role].fresh);
    mat.userData.oxOxid = new THREE.Color(OX[role].oxid);
    return mat;
  };
  // a constant (non-oxidising) material — eyes, chest bolt, antenna bulb, sockets
  const flat = (c, e = 0, rough = 0.5) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0.18, emissive: e });

  // mesh helper — parents `mat`-skinned box/geo under `parent` at a local pos.
  const node = (parent, geo, mat, x = 0, y = 0, z = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.z = rz;
    parent.add(m); return m;
  };
  const boxGeo = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // ---- joint hierarchy (pivots placed at real joint locations) ----
  const torso = new THREE.Object3D();          // root of the body; breathing scales this
  bolt.add(torso);

  const neckPivot = new THREE.Object3D();       // head swings from the neck base
  neckPivot.position.set(0, 0.34, 0);
  torso.add(neckPivot);

  const shoulder = { '-1': null, '1': null };
  const elbow = { '-1': null, '1': null };
  const hip = { '-1': null, '1': null };

  // ---- torso meshes ----
  node(torso, boxGeo(0.94, 0.72, 0.6), oxMat('teal'), 0, -0.05, 0);   // body
  node(torso, boxGeo(0.72, 0.18, 0.5), oxMat('tealDk'), 0, -0.42, 0); // hips
  node(torso, boxGeo(0.52, 0.44, 0.07), oxMat('copper'), 0, -0.02, 0.31); // chest plate
  node(torso, boxGeo(0.12, 0.12, 0.04), flat(0xffe08a, 0x553a00), 0, -0.02, 0.35); // chest bolt

  // ---- legs (hip pivots) ----
  for (const s of [-1, 1]) {
    const h = new THREE.Object3D(); h.position.set(s * 0.22, -0.42, 0); torso.add(h); hip[s] = h;
    node(h, boxGeo(0.2, 0.3, 0.24), oxMat('teal'), 0, -0.13, 0);     // leg
    node(h, boxGeo(0.28, 0.18, 0.36), oxMat('copper'), 0, -0.36, 0.05); // foot
  }

  // ---- arms (shoulder pivot → upper arm → elbow pivot → hand) ----
  for (const s of [-1, 1]) {
    const sh = new THREE.Object3D(); sh.position.set(s * 0.56, 0.22, 0); torso.add(sh); shoulder[s] = sh;
    node(sh, boxGeo(0.2, 0.2, 0.34), oxMat('copper'), 0, 0, 0);       // shoulder
    node(sh, boxGeo(0.2, 0.62, 0.24), oxMat('teal'), s * 0.02, -0.38, 0.02, s * 0.06); // upper arm
    const el = new THREE.Object3D(); el.position.set(s * 0.02, -0.55, 0.02); sh.add(el); elbow[s] = el;
    node(el, boxGeo(0.24, 0.2, 0.28), oxMat('copper'), s * 0.02, -0.17, 0.02); // hand
  }

  // ---- head (under neck pivot) ----
  node(neckPivot, boxGeo(0.32, 0.16, 0.34), oxMat('copperDk'), 0, 0.06, 0); // neck
  node(neckPivot, boxGeo(0.74, 0.52, 0.62), oxMat('tealHi'), 0, 0.38, 0);   // head
  node(neckPivot, boxGeo(0.76, 0.1, 0.64), oxMat('copper'), 0, 0.62, 0);    // brow ridge
  boltEyes = [];
  for (const s of [-1, 1]) {
    node(neckPivot, boxGeo(0.22, 0.24, 0.05), flat(0x241a12, 0, 0.8), s * 0.18, 0.38, 0.31); // socket
    const eye = node(neckPivot, boxGeo(0.15, 0.17, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xffca55, emissive: 0xffb020, emissiveIntensity: 1.15, roughness: 0.4 }),
      s * 0.18, 0.38, 0.325);
    boltEyes.push(eye);
    node(neckPivot, boxGeo(0.04, 0.04, 0.02), new THREE.MeshBasicMaterial({ color: 0xffffff }), s * 0.15, 0.43, 0.345); // glint
  }
  node(neckPivot, boxGeo(0.26, 0.05, 0.05), oxMat('copperDk'), 0, 0.22, 0.31); // mouth
  node(neckPivot, new THREE.CylinderGeometry(0.03, 0.03, 0.34), oxMat('copper'), 0, 0.76, 0); // antenna stalk
  boltBulbMat = new THREE.MeshStandardMaterial({ color: 0xffc93c, roughness: 0.35, emissive: 0xffc93c, emissiveIntensity: 0.6 });
  node(neckPivot, new THREE.SphereGeometry(0.09, 12, 12), boltBulbMat, 0, 0.98, 0); // bulb

  // verdigris "patina" flecks on the torso front — invisible on shiny copper,
  // fading in as Bolt oxidises. Tagged so setOxidation drives their opacity.
  for (const [x, y, z, sz] of [[-0.3, 0.12, 0.31, 0.14], [0.26, -0.22, 0.31, 0.12], [-0.16, 0.64, 0.32, 0.1], [0.5, -0.32, 0.14, 0.1]]) {
    const mat = new THREE.MeshStandardMaterial({ color: OX.tealDk.oxid, roughness: 0.75, metalness: 0.1, transparent: true, opacity: 0 });
    mat.userData.patina = true;
    node(torso, boxGeo(sz, sz, 0.03), mat, x, y, z);
  }

  // blob shadow: parented to the ROOT (not the torso) so it stays flat under the
  // feet and never inherits limb/breathing motion.
  boltShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 0.9),
    new THREE.MeshBasicMaterial({ map: textures.puffTex, color: 0x203a2a, transparent: true, opacity: 0.3, depthWrite: false })
  );
  boltShadow.rotation.x = -Math.PI / 2.4;
  boltShadow.position.y = -0.92;
  bolt.add(boltShadow);

  bolt.scale.setScalar(BOLT_SCALE);
  bolt.position.copy(BOLT_HOME);
  bolt.visible = false;
  camera.add(bolt);
  // speech-bubble anchor — parented to the head pivot so it tracks the now
  // articulated head. (0.1,1.21,0) in neck-local == (0.1,1.55,0) in bolt-local.
  const headAnchor = new THREE.Object3D(); headAnchor.position.set(0.1, 1.21, 0); neckPivot.add(headAnchor);

  let oxidation = 0;
  // The single oxidation knob: palette + metalness + fleck opacity as a pure
  // function of level. Walks the whole hierarchy and recolours every tagged
  // material, however deeply it is nested under a joint.
  function setOxidation(level) {
    oxidation = Math.max(0, Math.min(1, level || 0));
    bolt.traverse((o) => {
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        if (m.userData.oxOxid) {
          m.color.copy(m.userData.oxFresh).lerp(m.userData.oxOxid, oxidation);
          m.metalness = 0.55 + (0.18 - 0.55) * oxidation; // shiny → matte as it weathers
        }
        if (m.userData.patina) m.opacity = 0.85 * oxidation;
      }
    });
    bolt.userData.oxidation = oxidation;
  }
  setOxidation(0); // new child → shiny copper

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
  let blinkIn = 3, blinkT = 0;
  let boltBulbT = 0;
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
    for (const s of [-1, 1]) {
      shoulder[s].rotation.set(0, 0, 0);
      elbow[s].rotation.set(0, 0, 0);
      hip[s].rotation.set(0, 0, 0);
    }
  }

  function update(dt) {
    if (!bolt.visible) return;
    const t = nowT();
    resetPose();

    // ---- root hover (kept subtle; the joints do the "alive" work) ----
    let rootY = BOLT_HOME.y + Math.sin(t * 2) * 0.04;
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
        elbow[1].rotation.z = Math.sin(actionT * 13) * 0.6 * inOut; // wag
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

    // ---- apply root transform (kept in-frame: scale is constant) ----
    bolt.position.y = rootY;
    bolt.rotation.set(rootRX, 0, rootRZ);
    bolt.scale.setScalar(BOLT_SCALE);

    // ---- blob shadow: shrinks/fades as he bobs higher ----
    const bob = rootY - BOLT_HOME.y;
    boltShadow.position.y = -0.92 - bob;
    const sh = Math.max(0.35, 1 - bob * 1.6);
    boltShadow.scale.set(sh, sh, 1);
    boltShadow.material.opacity = 0.28 * Math.max(0.4, sh);

    // ---- blink (squash the eyes for 100ms every 3-5s) ----
    blinkT -= dt;
    if (blinkT <= 0) {
      blinkIn -= dt;
      if (blinkIn <= 0) { blinkT = 0.1; blinkIn = 3 + Math.random() * 2; }
    }
    const eyeS = blinkT > 0 ? 0.1 : 1;
    for (const e of boltEyes) e.scale.y = eyeS;

    // ---- antenna bulb pulses when he speaks ----
    if (boltBulbT > 0) {
      boltBulbT -= dt;
      boltBulbMat.emissiveIntensity = 0.6 + Math.max(0, boltBulbT) * 1.6 * (0.6 + 0.4 * Math.sin(t * 18));
    } else boltBulbMat.emissiveIntensity = 0.6;
  }

  const _proj = new THREE.Vector3();
  function updateBubble() {
    if (!bubbleEl || bubbleEl.classList.contains('hidden')) return;
    headAnchor.getWorldPosition(_proj); _proj.project(camera);
    const W = window.innerWidth;
    // The bubble is centred over Bolt's head (CSS translate(-50%,…)); clamp its
    // x to the LEFT region so it never covers the centre HUD text (tally /
    // question) — a real overlap bug two playtesters hit.
    const x = Math.max(W * 0.14, Math.min((_proj.x * 0.5 + 0.5) * W, W * 0.40));
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
    boltBulbT = 0.6; // antenna glow pulse while speaking
    react(mood);
  }

  function show(v = true) { bolt.visible = v; if (bubbleEl) bubbleEl.classList.toggle('hidden', !v); }

  // dispose the whole joint hierarchy's geometries + materials (Bolt normally
  // lives for the app's lifetime, but keep teardown correct/leak-free).
  function dispose() {
    bolt.traverse((o) => {
      if (o.geometry) o.geometry.dispose?.();
      const mm = o.material;
      if (Array.isArray(mm)) mm.forEach((m) => m.dispose?.());
      else if (mm) mm.dispose?.();
    });
    camera.remove(bolt);
  }

  return { group: bolt, headAnchor, react, say, update, updateBubble, setOxidation, show,
    playWave, playWalk, dispose,
    get oxidation() { return oxidation; } };
}
