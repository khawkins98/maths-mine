// The shared stage for Spot the Wrong'un.
//
// Both tiers — JUDGE (one sign, true or false?) and IMPOSTER (three signs, one
// fibbing) — are performed by the same cast on the same set: Nuggets holding
// wooden signs, dirt/grass array blocks, and the same dust/confetti/shard
// effects. The stage owns all of that, plus the pools those effects live in and
// the round teardown that empties them.
//
// A tier receives the stage and does nothing but direct: build a round, animate
// its cast, score the child's answer. It never creates geometry or disposes
// anything — that asymmetry is what made the single-file version hard to reason
// about, because "who owns this mesh?" had no consistent answer.

import * as THREE from 'three';

import { createTimers } from '../../core/timers.js';
import { createBlockKit } from '../../core/blocks.js';
import { easeOutBack } from '../../core/ease.js';
import {
  VILLAGERS, SKIN, SKIN_DARK, HAIR, BROW, GOOD_GREEN, CONFETTI_COLS,
} from './constants.js';

export function createStage(ctx) {
  const { scene, textures, audio } = ctx;

  // ---------- owned geometry (one set, reused by every Nugget) ----------
  const geo = {
    // Villager proportions: a tall boxy head with a protruding nose, a long
    // robe, arms folded across the front, stubby legs.
    robe: new THREE.BoxGeometry(0.82, 1.0, 0.5),
    trim: new THREE.BoxGeometry(0.5, 0.72, 0.06),   // apron down the front
    belt: new THREE.BoxGeometry(0.86, 0.1, 0.54),
    head: new THREE.BoxGeometry(0.62, 0.7, 0.58),
    nose: new THREE.BoxGeometry(0.16, 0.3, 0.2),
    brow: new THREE.BoxGeometry(0.52, 0.08, 0.04),
    hair: new THREE.BoxGeometry(0.66, 0.22, 0.62),
    eye: new THREE.BoxGeometry(0.13, 0.16, 0.04),
    pupil: new THREE.BoxGeometry(0.07, 0.1, 0.03),
    arm: new THREE.BoxGeometry(0.2, 0.52, 0.22),
    leg: new THREE.BoxGeometry(0.24, 0.42, 0.26),
    hit: new THREE.BoxGeometry(1.7, 3.2, 1.5),   // FAT hitbox so small fingers can't miss
    ring: new THREE.RingGeometry(0.85, 1.2, 28), // hover ground ring (imposter)
    sign: new THREE.PlaneGeometry(2.15, 1.26),   // ~512×300 aspect
    shard: new THREE.PlaneGeometry(0.5, 0.5),    // smashed-sign shards
    dot: new THREE.SphereGeometry(0.16, 12, 10), // imposter micro-proof dots
  };

  // ---------- owned materials ----------
  const skinMat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.85 });
  const noseMat = new THREE.MeshStandardMaterial({ color: SKIN_DARK, roughness: 0.85 });
  const hairMat = new THREE.MeshStandardMaterial({ color: HAIR, roughness: 0.9 });
  const browMat = new THREE.MeshStandardMaterial({ color: BROW, roughness: 0.9 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x2b1d12, roughness: 0.5 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.9 });
  // one pair per villager variety
  const robeMats = VILLAGERS.map((v) => new THREE.MeshStandardMaterial({ color: v.robe, roughness: 0.85 }));
  const trimMats = VILLAGERS.map((v) => new THREE.MeshStandardMaterial({ color: v.trim, roughness: 0.85 }));
  const shardMat = new THREE.MeshBasicMaterial({ color: 0xfff3dd, side: THREE.DoubleSide });
  const dotMat = new THREE.MeshStandardMaterial({ color: GOOD_GREEN, emissive: 0x1f7a44, emissiveIntensity: 0.5, roughness: 0.5 });

  // Same kit, same geometry and seams as Block Builder's wall — the visual
  // rhyme is the teaching point — but cut from emerald. The three games step up
  // through the materials: dirt, then stone, then the precious one.
  const blocks = createBlockKit(textures, { body: textures.emeraldTex, cap: textures.emeraldTopTex });
  const { makeBlock, setCapGrass } = blocks;

  const sharedGeos = new Set([...Object.values(geo), ...blocks.sharedGeos]);
  const sharedMats = new Set([skinMat, noseMat, hairMat, browMat, eyeMat, pupilMat, legMat,
    shardMat, dotMat, ...robeMats, ...trimMats]);

  // ---------- scene subtree ----------
  const root = new THREE.Group();
  scene.add(root);
  const crewGroup = new THREE.Group();  // Nugget(s)
  const signGroup = new THREE.Group();  // billboarded signs
  const arrayGroup = new THREE.Group(); // JUDGE tier: the dirt/grass block array
  const fxGroup = new THREE.Group();    // shards / dust / confetti / proof dots
  root.add(crewGroup, signGroup, arrayGroup, fxGroup);

  // shared hover ring (imposter tier only)
  const ring = new THREE.Mesh(geo.ring, new THREE.MeshBasicMaterial({
    color: 0xffe14a, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide,
  }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  ring.visible = false;
  root.add(ring);

  const hitboxes = []; // imposter raycast targets

  // ---------- transient FX pools ----------
  const shards = [];    // { mesh, v, spin, life }
  const dust = [];      // { mesh, v, life }
  const confetti = [];  // { mesh, v, life }
  const proofDots = []; // imposter dots (disposed each round)
  const blockPops = []; // JUDGE array blocks currently popping/pulsing

  // Every delayed beat goes through later(); clearAll() in teardown guarantees
  // none outlives the game.
  const timers = createTimers();
  const later = timers.later;

  // ---------- state both tiers and the shell read ----------
  // Held in an object rather than as module-level `let`s so a tier can update
  // the phase and the shell can see it without a setter round-trip. Bolts are
  // NOT here: they live in the shared wallet, which outlives the game.
  const state = { phase: 'idle' };

  // ---------- owned sign textures (created + disposed here; NOT ctx.textures) ----------
  const signTextures = [];

  // Draw the wooden sign board + the fact. `left` and `right` are the two terms
  // as the child reads them — `a × b` for a product, `dividend ÷ divisor` for a
  // share-out — and `opts.op` picks the operator between them. `opts.mark`
  // optionally stamps a small green ✓ badge in the top-right (used on the
  // reveal to confirm the true fact).
  function makeSignTex(left, right, shown, opts = {}) {
    const W = 512, H = 300;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    c.clearRect(0, 0, W, H);
    c.imageSmoothingEnabled = false;

    // ---- wooden sign board: hard corners, horizontal planks, pixel frame ----
    const planks = ['#b07d43', '#a5743c', '#b98a4e', '#9c6a36'];
    const plankH = 56;
    for (let py = 20, i = 0; py < H - 20; py += plankH, i++) {
      c.fillStyle = planks[i % planks.length];
      c.fillRect(20, py, W - 40, Math.min(plankH, H - 20 - py));
      for (let g = 0; g < 22; g++) {
        c.fillStyle = Math.random() < 0.5 ? 'rgba(80,50,22,0.35)' : 'rgba(210,165,110,0.35)';
        const gx = 24 + ((Math.random() * ((W - 56) / 8)) | 0) * 8;
        const gy = py + ((Math.random() * (plankH / 8)) | 0) * 8;
        c.fillRect(gx, gy, 8 + 8 * ((Math.random() * 2) | 0), 8);
      }
      c.fillStyle = 'rgba(70,44,20,0.75)';
      c.fillRect(20, py + plankH - 4, W - 40, 4);
    }
    c.fillStyle = '#5c3a1c';
    c.fillRect(8, 8, W - 16, 12); c.fillRect(8, H - 20, W - 16, 12);
    c.fillRect(8, 8, 12, H - 16); c.fillRect(W - 20, 8, 12, H - 16);
    c.fillStyle = 'rgba(230,195,140,0.55)';
    c.fillRect(20, 20, W - 40, 5); c.fillRect(20, 20, 5, H - 40);

    // ---- the fact, blocky + high-contrast (cream halo behind dark text) ----
    const text = `${left} ${opts.op === 'div' ? '÷' : '×'} ${right} = ${shown}`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    let px = 122;
    const maxW = W * 0.82;
    do { c.font = `700 ${px}px "Fredoka", system-ui, sans-serif`; px -= 4; }
    while (c.measureText(text).width > maxW && px > 30);
    c.lineJoin = 'round';
    c.lineWidth = 10; c.strokeStyle = '#f6ecd6'; c.strokeText(text, W / 2, H / 2 + 4);
    c.fillStyle = '#241a10'; c.fillText(text, W / 2, H / 2 + 4);

    // ---- optional green ✓ badge (reveal: "this is the true fact") ----
    if (opts.mark === 'check') {
      const bx = W - 66, by = 66, r = 40;
      c.fillStyle = '#2f8a45'; c.beginPath(); c.arc(bx, by, r, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#54c26a'; c.beginPath(); c.arc(bx, by, r - 6, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#ffffff'; c.lineWidth = 9; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(bx - 18, by + 1); c.lineTo(bx - 5, by + 15); c.lineTo(bx + 20, by - 16); c.stroke();
    }

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    signTextures.push(tex);
    return tex;
  }

  // ---------- build a villager (articulated: neck / shoulders / hips) ----------
  //
  // Keeps the exact joint set the tiers animate — neck, shoulders, hips, body,
  // eyes — so the idle bob, blink, cheer and eject animations are untouched.
  function makeNugget(variantIdx) {
    const i = ((variantIdx % VILLAGERS.length) + VILLAGERS.length) % VILLAGERS.length;
    const g = new THREE.Group();

    const body = new THREE.Mesh(geo.robe, robeMats[i]);
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);

    // apron down the front and a belt: what actually distinguishes one
    // villager's trade from another at a glance
    const apron = new THREE.Mesh(geo.trim, trimMats[i]);
    apron.position.set(0, -0.08, 0.26);
    g.add(apron);
    const belt = new THREE.Mesh(geo.belt, trimMats[i]);
    belt.position.set(0, -0.26, 0);
    g.add(belt);

    const neck = new THREE.Object3D(); neck.position.set(0, 0.5, 0); g.add(neck);

    const head = new THREE.Mesh(geo.head, skinMat);
    head.position.y = 0.36; head.castShadow = true;
    neck.add(head);

    // The nose is the villager. Big, blunt, straight off the front of the face.
    const nose = new THREE.Mesh(geo.nose, noseMat);
    nose.position.set(0, 0.3, 0.36);
    nose.castShadow = true;
    neck.add(nose);

    const brow = new THREE.Mesh(geo.brow, browMat);
    brow.position.set(0, 0.52, 0.29);
    neck.add(brow);

    const hair = new THREE.Mesh(geo.hair, hairMat);
    hair.position.set(0, 0.62, -0.02);
    neck.add(hair);

    const eyes = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(geo.eye, eyeMat);
      eye.position.set(s * 0.17, 0.4, 0.3);
      const pupil = new THREE.Mesh(geo.pupil, pupilMat);
      pupil.position.set(s * 0.02, 0, 0.03);
      eye.add(pupil); // parented, so a blink closes the pupil with the eye
      neck.add(eye);
      eyes.push(eye);
    }

    // Arms folded across the belly, the way villagers stand.
    const shoulders = {};
    for (const s of [-1, 1]) {
      const sh = new THREE.Object3D(); sh.position.set(s * 0.33, 0.2, 0); g.add(sh);
      const arm = new THREE.Mesh(geo.arm, robeMats[i]);
      arm.position.set(s * -0.04, -0.2, 0.22);
      arm.rotation.x = -1.25;
      arm.rotation.z = s * 0.18;
      arm.castShadow = true;
      sh.add(arm);
      shoulders[s] = sh;
    }

    const hips = {};
    for (const s of [-1, 1]) {
      const hp = new THREE.Object3D(); hp.position.set(s * 0.17, -0.5, 0); g.add(hp);
      const leg = new THREE.Mesh(geo.leg, legMat);
      leg.position.y = -0.2; leg.castShadow = true;
      hp.add(leg);
      hips[s] = hp;
    }

    g.userData.joints = { neck, shoulders, hips, body, eyes };
    return g;
  }

  // ---------- juice ----------
  function dustPuff(x, y, z) {
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({
        map: textures.puffTex, color: 0xe6d9be, transparent: true, opacity: 0.75, depthWrite: false,
      }));
      m.position.set(x + (Math.random() - 0.5) * 0.8, y, z + (Math.random() - 0.5) * 0.6);
      m.scale.setScalar(0.25 + Math.random() * 0.2);
      fxGroup.add(m);
      dust.push({ mesh: m, v: new THREE.Vector3((Math.random() - 0.5) * 2.2, 0.6 + Math.random() * 1.1, (Math.random() - 0.5) * 1), life: 0.5 });
    }
  }

  function ejectSfx() {
    audio.beepEnv(180, 880, 0.14, 'square', 0.06);
    later(() => audio.beepEnv(900, 300, 0.12, 'triangle', 0.05), 70);
    audio.noiseBurst(0.12, 0.05, 1600);
  }

  function celebrate(cx = 0, cy = 4, cz = 0) {
    for (let i = 0; i < 54; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), new THREE.MeshBasicMaterial({ color: CONFETTI_COLS[i % CONFETTI_COLS.length] }));
      m.position.set(cx, cy, cz);
      const a = (i / 54) * Math.PI * 2;
      fxGroup.add(m);
      confetti.push({ mesh: m, v: new THREE.Vector3(Math.cos(a) * (2 + i % 3), 6 + (i % 4), Math.sin(a) * (2 + i % 3)), life: 1.6 });
    }
  }

  function updateFx(dt) {
    // shards
    for (let i = shards.length - 1; i >= 0; i--) {
      const s = shards[i];
      s.life -= dt; s.v.y -= 20 * dt;
      s.mesh.position.addScaledVector(s.v, dt);
      s.mesh.rotation.z += s.spin * dt;
      s.mesh.material === shardMat || (s.mesh.material.opacity = Math.max(0, s.life / 0.9));
      if (s.life <= 0) { fxGroup.remove(s.mesh); shards.splice(i, 1); }
    }
    // dust
    for (let i = dust.length - 1; i >= 0; i--) {
      const d = dust[i];
      d.life -= dt;
      d.mesh.position.addScaledVector(d.v, dt);
      d.mesh.scale.multiplyScalar(1 + dt * 2.4);
      d.mesh.material.opacity = Math.max(0, d.life / 0.5) * 0.75;
      if (d.life <= 0) { fxGroup.remove(d.mesh); d.mesh.material.dispose(); dust.splice(i, 1); }
    }
    // confetti
    for (let i = confetti.length - 1; i >= 0; i--) {
      const cft = confetti[i];
      cft.life -= dt; cft.v.y -= 16 * dt;
      cft.mesh.position.addScaledVector(cft.v, dt);
      cft.mesh.rotation.x += dt * 6; cft.mesh.rotation.z += dt * 5;
      if (cft.life <= 0) { fxGroup.remove(cft.mesh); cft.mesh.geometry.dispose(); cft.mesh.material.dispose(); confetti.splice(i, 1); }
    }
    // imposter proof-dot pops + innocent tick fade
    for (let i = proofDots.length - 1; i >= 0; i--) {
      const d = proofDots[i];
      if (d.userData.pop != null) {
        d.userData.pop += dt;
        const k = Math.min(1, d.userData.pop / 0.22);
        d.scale.setScalar(Math.max(0.001, easeOutBack(k)));
      }
      if (d.userData.tick != null) {
        d.userData.tick -= dt;
        if (d.userData.tick <= 0) { fxGroup.remove(d); proofDots.splice(i, 1); }
      }
    }
    // JUDGE array block pops (springy scale-in / emphasis pulse)
    for (let i = blockPops.length - 1; i >= 0; i--) {
      const blk = blockPops[i];
      blk.userData.pop += dt;
      const k = Math.min(1, blk.userData.pop / 0.24);
      blk.scale.setScalar(Math.max(0.001, easeOutBack(k)));
      if (k >= 1) { blk.scale.setScalar(1); blockPops.splice(i, 1); }
    }
  }

  // ---------- per-round teardown ----------
  function disposeGroup(grp) {
    for (let i = grp.children.length - 1; i >= 0; i--) {
      const o = grp.children[i];
      grp.remove(o);
      o.traverse?.((n) => {
        if (n.geometry && !sharedGeos.has(n.geometry)) n.geometry.dispose?.();
        const mm = n.material;
        if (Array.isArray(mm)) mm.forEach((x) => { if (!sharedMats.has(x)) x.dispose?.(); });
        else if (mm && !sharedMats.has(mm)) mm.dispose?.();
      });
    }
  }

  // Empty the set between rounds and tiers. Cancels pending timers first, so a
  // half-finished reveal can't animate objects that are about to be disposed.
  function clearRound() {
    timers.clearAll();
    for (const t of signTextures) t.dispose();
    signTextures.length = 0;
    disposeGroup(signGroup);
    disposeGroup(crewGroup);
    disposeGroup(arrayGroup);
    disposeGroup(fxGroup);
    for (const h of hitboxes) { root.remove(h); h.material.dispose(); }
    hitboxes.length = 0;
    shards.length = 0; dust.length = 0; confetti.length = 0; proofDots.length = 0; blockPops.length = 0;
    ring.visible = false;
  }

  // Strike the set for good.
  function dispose() {
    clearRound();
    scene.remove(root);
    // ring.material is freed by the traverse below - it is still a child of
    // root - so disposing it here as well was a double free
    root.traverse((o) => {
      if (o.geometry && !sharedGeos.has(o.geometry)) o.geometry.dispose?.();
      const mm = o.material;
      if (Array.isArray(mm)) mm.forEach((x) => { if (!sharedMats.has(x)) x.dispose?.(); });
      else if (mm && !sharedMats.has(mm)) mm.dispose?.();
    });
    for (const g of Object.values(geo)) g.dispose();
    blocks.dispose();
    for (const m of sharedMats) m.dispose();
  }

  return {
    // scene graph
    root, crewGroup, signGroup, arrayGroup, fxGroup, ring, hitboxes,
    // assets
    geo, shardMat, dotMat, villagerCount: VILLAGERS.length,
    makeSignTex, makeNugget, makeBlock, setCapGrass,
    // pools a tier pushes into
    shards, proofDots, blockPops,
    // juice
    dustPuff, celebrate, ejectSfx, updateFx,
    // scheduling + shared state
    later, timers, state,
    // lifecycle
    clearRound, dispose,
  };
}
