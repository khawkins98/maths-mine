// games/shakeBatch.js — "Shake-a-Batch", the second mini-game, implemented
// against the shared game-module interface (see src/games/README.md):
//
//   createShakeBatch(ctx) -> { id, title, start(opts), update(dt), teardown() }
//
// A multiplication-fluency game with a DIFFERENT tactile metaphor from Block
// Builder so the child can compare: instead of stacking a grid, you SHAKE a
// batch of dice. Each shake spills ONE group of R dice (a·b → `a` groups of
// `b`) tumbling into a wooden tray. When all groups are rolled we ask the
// retrieval question "how many altogether?" with the SAME shared choice UI and
// scoring as Block Builder.
//
// No physics lib — the tumble is a short faked arc+spin animation (like
// blockBuilder fakes block drops). The game owns one root group and tears it
// down fully. Bolt, audio, speech, ui, camera and the mastery ledger are
// shared via ctx; only the dice geometry/materials + pip textures are owned
// here and disposed on teardown (ctx.textures are shared — never disposed).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { makeCanvasTex } from '../core/textures.js';
import { createTimers } from '../core/timers.js';
import { easeOutCubic } from '../core/ease.js';

const DIE = 0.6;                 // die edge length
const GAP = 0.14;                // gap between dice WITHIN a group
const STEP = DIE + GAP;          // grid pitch (within a group)
// Extra spacing BETWEEN groups (along z) so each group of `b` dice reads as its
// own distinct cluster a child can count — the whole point of the playtest fix.
// Widened (playtest v2): rows sat too close and read as one pile, not two groups.
const GROUP_GAP = 1.15;
const ZPITCH = STEP + GROUP_GAP; // group-to-group pitch
const SLAB_H = 0.25;             // tray floor thickness
const REST_Y = SLAB_H + DIE / 2; // resting height of a die on the tray floor
const COLS = [0xff6b6b, 0xffd24a, 0x58e08a, 0x6ad2ff, 0xb98bff, 0xff9f5a, 0x7ef0d0, 0xf78fb3];

// standard die pip layout (fractional positions on the face)
const PIP = {
  1: [[0.5, 0.5]],
  2: [[0.3, 0.3], [0.7, 0.7]],
  3: [[0.3, 0.3], [0.5, 0.5], [0.7, 0.7]],
  4: [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]],
  5: [[0.3, 0.3], [0.7, 0.3], [0.5, 0.5], [0.3, 0.7], [0.7, 0.7]],
  6: [[0.3, 0.3], [0.7, 0.3], [0.3, 0.5], [0.7, 0.5], [0.3, 0.7], [0.7, 0.7]],
};


export function createShakeBatch(ctx) {
  const { scene, engine, audio, speech, ui, bolt, mastery } = ctx;
  const speak = speech.speak, eqWords = speech.eqWords, pickPhrase = speech.pickPhrase;
  const nowT = engine.nowT;
  const VIEW_DIR = engine.VIEW_DIR;
  // Steeper, more top-down view than the shared iso angle: the groups are
  // separated along DEPTH (z), and a low camera foreshortens that gap into a
  // pile. Looking down more turns the clusters into clearly countable rows.
  // Reduced x-tilt (playtest v2) so rows sit square/horizontal, not diagonal —
  // "two groups of three" then reads at a glance instead of as one pile.
  const SB_VIEW = new THREE.Vector3(0.1, 1.15, 1).normalize();

  // ---- owned dice assets (NOT ctx.textures — these we create AND dispose) ----
  // HARD-PIXEL die faces: a crisp cream face with a chunky pixel border and
  // SQUARE pips (no smooth anti-aliased circles) so the dice read as blocky
  // Minecraft cubes, not glossy plastic. NearestFilter, 48px grid.
  function pipTexture(n) {
    const S = 48, U = S / 8; // 8×8 texel grid; each texel = U px
    return makeCanvasTex(S, (c) => {
      c.fillStyle = '#f4ead2'; c.fillRect(0, 0, S, S);        // cream face
      c.fillStyle = '#d9c9a3'; c.fillRect(0, 0, S, U);        // pixel bevel frame
      c.fillRect(0, 0, U, S); c.fillRect(S - U, 0, U, S); c.fillRect(0, S - U, S, U);
      c.fillStyle = '#2b2320';                                 // dark square pips
      const R = U;                                             // one texel wide
      for (const [px, py] of PIP[n]) {
        const cx = Math.round((px * S - R) / U) * U;
        const cy = Math.round((py * S - R) / U) * U;
        c.fillRect(cx, cy, R * 2, R * 2);
      }
    }, { nearest: true });
  }
  const pipTex = [null, 1, 2, 3, 4, 5, 6].map((n) => (n ? pipTexture(n) : null));
  // BoxGeometry face order: +x,-x,+y,-y,+z,-z — pair opposite faces to sum 7
  const faceValues = [1, 6, 2, 5, 3, 4];
  const faceMats = faceValues.map((v) => new THREE.MeshStandardMaterial({ map: pipTex[v], roughness: 1, metalness: 0 }));
  const dieGeo = new THREE.BoxGeometry(DIE, DIE, DIE);

  // shared tray materials — WOOD PIXEL texture (plank grain), matte, hard pixel.
  const trayWoodTex = ctx.textures.woodTex.clone();
  trayWoodTex.needsUpdate = true;
  trayWoodTex.wrapS = trayWoodTex.wrapT = THREE.RepeatWrapping;
  trayWoodTex.repeat.set(3, 3);
  const trayMat = new THREE.MeshStandardMaterial({ map: trayWoodTex, roughness: 1, metalness: 0 });
  const lipMat = new THREE.MeshStandardMaterial({ color: 0x8a5f34, roughness: 1, metalness: 0 });

  const sharedGeos = new Set([dieGeo]);
  const sharedMats = new Set([...faceMats, trayMat, lipMat]);

  // ---- scene subtree the game owns ----
  const root = new THREE.Group();
  scene.add(root);
  const trayGroup = new THREE.Group();
  const diceGroup = new THREE.Group();
  root.add(trayGroup, diceGroup);

  const trayParts = [];   // per-round tray geometries (disposed each round)
  // shared cancellable timer pool: every delayed beat goes through later(),
  // and clearTimers() in teardown guarantees none outlives the game.
  const timers = createTimers();
  const later = timers.later;
  const clearTimers = timers.clearAll;
  const tumbling = [];    // dice mid-tumble: { mesh, delay, t, dur, from, to, axis, spin, arc }
  const pops = [];        // dice mid-landing-bounce (scale pop): { mesh, t }
  const dust = [];        // landing puffs
  const confetti = [];

  // ---- game state ----
  let round = null;
  let phase = 'idle';     // 'rolling' | 'settling' | 'asking' | 'next'
  let bolts = 0;

  // ---------- tray ----------
  function disposeTray() {
    for (const m of trayParts) { trayGroup.remove(m); m.geometry.dispose(); }
    trayParts.length = 0;
  }
  function buildTray(cols, rows) {
    disposeTray();
    // depth spans the widened group spacing so the tray frames all clusters
    const gridW = cols * STEP, gridD = rows * STEP + Math.max(0, rows - 1) * GROUP_GAP;
    const w = gridW + 0.9, d = gridD + 0.9;
    const slab = new THREE.Mesh(new RoundedBoxGeometry(w, SLAB_H, d, 3, 0.08), trayMat);
    slab.position.y = SLAB_H / 2;
    slab.castShadow = true; slab.receiveShadow = true;
    trayGroup.add(slab); trayParts.push(slab);
    const lipH = 0.22, lipT = 0.16, topY = SLAB_H + lipH / 2 - 0.06;
    const specs = [
      [w + lipT, lipT, 0, d / 2], [w + lipT, lipT, 0, -d / 2],
      [lipT, d + lipT, w / 2, 0], [lipT, d + lipT, -w / 2, 0],
    ];
    for (const [lw, ld, x, z] of specs) {
      const lip = new THREE.Mesh(new THREE.BoxGeometry(lw, lipH, ld), lipMat);
      lip.position.set(x, topY, z);
      lip.castShadow = true; lip.receiveShadow = true;
      trayGroup.add(lip); trayParts.push(lip);
    }
  }

  // one die slot: groups run along z, per-group dice run along x
  function diePos(g, k) {
    const cols = round.groupSize, rows = round.target;
    // dice within a group run along x (tight); groups step along z (wide gap)
    return { x: (k - (cols - 1) / 2) * STEP, y: REST_Y, z: (g - (rows - 1) / 2) * ZPITCH };
  }

  function makeDie() {
    const m = new THREE.Mesh(dieGeo, faceMats);
    m.castShadow = true; m.receiveShadow = true;
    m.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
    return m;
  }

  function clearDice() {
    clearTimers(); // cancel any in-flight count/reveal chain from the last round
    if (round) for (const die of round.dice) diceGroup.remove(die); // shared geo/mats kept
    tumbling.length = 0;
    pops.length = 0;
  }

  // ---------- camera ----------
  function frameCamera() {
    const w = round.groupSize * STEP + 0.9;
    const d = round.target * STEP + Math.max(0, round.target - 1) * GROUP_GAP + 0.9;
    engine.placeCamera(0.4, Math.max(w, d) * 1.5 + 6.5, SB_VIEW);
  }

  // ---------- juice ----------
  function puff(x, y, z) {
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({
        map: ctx.textures.puffTex, color: 0xe6d9be, transparent: true, opacity: 0.6, depthWrite: false,
      }));
      m.position.set(x + (Math.random() - 0.5) * 0.4, y - 0.2, z + (Math.random() - 0.5) * 0.4);
      m.scale.setScalar(0.18 + Math.random() * 0.14);
      m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.4 + Math.random() * 0.7, (Math.random() - 0.5) * 1.2);
      root.add(m);
      dust.push({ mesh: m, life: 0.35 });
    }
  }
  function rollSound() {
    audio.noiseBurst(0.12, 0.05, 1600);
    audio.beep(260 + Math.random() * 40, 0.05, 'square', 0.04);
    later(() => audio.beep(300 + Math.random() * 50, 0.04, 'square', 0.03), 70);
  }
  function celebrate() {
    for (let i = 0; i < 44; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), new THREE.MeshBasicMaterial({ color: COLS[i % COLS.length] }));
      m.position.set(0, REST_Y + 1, 0);
      const a = (i / 44) * Math.PI * 2;
      m.userData.v = new THREE.Vector3(Math.cos(a) * (2 + i % 3), 6 + (i % 4), Math.sin(a) * (2 + i % 3));
      root.add(m);
      confetti.push({ mesh: m, life: 1.6 });
    }
  }

  // ---------- round flow ----------
  function newRound() {
    clearDice();
    const q = mastery.nextQuestion({ op: 'mul' }); // this game is pure ×
    round = {
      a: q.a, b: q.b, target: q.a, groupSize: q.b,
      product: q.a * q.b, answer: q.a * q.b,
      groupsRolled: 0, dice: [], askT: 0, answered: false,
    };
    buildTray(round.groupSize, round.target);
    frameCamera();
    phase = 'rolling';

    ui.hideChoices();
    ui.setAskEq(null);
    ui.setClaim(null);
    ui.hideBigTotal();
    ui.setTally('');
    ui.els.btnRecenter.style.display = 'none';
    // Title card = mode name only (never the equation, never feedback).
    ui.setPrompt(`${round.a} × ${round.b}`, 'Shake-a-Batch');
    // Big central goal so the counting — not the bouncing — is the thing a child
    // reads. Updates to "1 group of 3 → 2 groups of 3 …" as each group lands.
    ui.setClaim(`Roll ${round.a} group${round.a > 1 ? 's' : ''} of ${round.b}`);
    // The yellow SHAKE button + Bolt carry the instruction — no redundant footer.
    ui.setStatus('');
    ui.showConfirm('Shake! 🎲');
    bolt.say(`Roll ${round.a} groups of ${round.b}!`, '');
    speak(`Roll ${round.a} groups of ${round.b}!`);
    ui.renderJars(mastery);
  }

  // spill ONE group of `groupSize` dice, tumbling into the tray
  function spillGroup() {
    if (!round || phase !== 'rolling') return;
    const g = round.groupsRolled;
    if (g >= round.target) return;
    const cols = round.groupSize;
    for (let k = 0; k < cols; k++) {
      const slot = diePos(g, k);
      const die = makeDie();
      const from = {
        x: slot.x + (Math.random() - 0.5) * 1.4,
        y: REST_Y + 3 + Math.random() * 1.2,
        z: slot.z - 2.6 - Math.random() * 0.8,
      };
      die.position.set(from.x, from.y, from.z);
      diceGroup.add(die);
      round.dice.push(die);
      const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      tumbling.push({ mesh: die, delay: k * 0.06, t: 0, dur: 0.5, from, to: slot, axis, spin: 8 + Math.random() * 6, arc: 1.4 + Math.random() });
    }
    round.groupsRolled++;
    rollSound();
    audio.groupChime(round.groupsRolled);
    onGroupRolled();
  }

  function onGroupRolled() {
    const g = round.groupsRolled;
    // BIG central count so the maths — not the bouncing — is what a child reads.
    ui.setClaim(`${g} group${g > 1 ? 's' : ''} of ${round.groupSize}`);
    ui.popClaim();
    // truthful progress WITHOUT revealing the final product
    ui.setTally(`${g} of ${round.target} groups`);
    if (g >= round.target) {
      // Don't ask over a pile of dice still in the air — wait for them to SETTLE
      // into their separated clusters (update() fires onAllRolled once landed),
      // so the child can actually count them to answer.
      phase = 'settling';
      ui.hideConfirm(); // no dead "Shake!" tap while the last dice land
      // keep the headline to one clean line; Bolt carries the "count them!" cue
      ui.setClaim(`${round.target} groups of ${round.groupSize}`);
      ui.popClaim();
      bolt.say('Now count them all!', 'wow');
      return;
    }
    speak(pickPhrase([`${g} group${g > 1 ? 's' : ''}.`, `Keep shaking!`, `${g} so far.`]));
    if (g === Math.max(1, Math.floor(round.target / 2))) bolt.say('Keep shaking!', 'happy');
  }

  function onAllRolled() {
    phase = 'asking';
    round.askT = nowT();
    // the goal headline fades; the equation sign takes over as the question. The
    // dice sit SETTLED in separated groups right above it — countable evidence.
    ui.fadeClaim();
    ui.setTally(`${round.target} groups of ${round.groupSize} …`);
    ui.setPrompt(`${round.a} × ${round.b} = ?`, null);
    ui.setStatus('Count the dice — how many?');
    ui.setAskEq(`${round.a} × ${round.b} = ?`);
    ui.hideConfirm();
    bolt.say('How many dice altogether?', 'wow');
    speak(pickPhrase([`Count the dice! How many altogether?`, `So, ${eqWords(round.a, round.b)}? Count them!`, `How many dice did you roll?`]));
    buildChoices();
  }

  function buildChoices() {
    const p = round.answer, R = round.groupSize;
    const set = new Set([p]);
    if (p - R > 0) set.add(p - R);
    set.add(p + R);
    while (set.size < 3) set.add(p + R * set.size);
    const opts = [...set].slice(0, 3);
    const rot = round.product % opts.length; // deterministic order (no Math.random)
    ui.showChoices(opts.slice(rot).concat(opts.slice(0, rot)), answerChosen);
  }

  function answerChosen(val, btn) {
    if (phase !== 'asking' || round.answered) return;
    round.answered = true;
    const correct = val === round.answer;
    const ms = (nowT() - round.askT) * 1000;
    ui.lockChoices();

    mastery.record(round.a, round.b, correct, ms);
    ui.renderJars(mastery);
    bolt.setOxidation(mastery.overallProgress());

    const eqStr = `${round.a} × ${round.b} = ${round.answer}`;
    if (correct) {
      btn.classList.add('right');
      // fade the answer slabs after the green flash — no dead buttons over the count
      later(() => ui.fadeChoices(), 500);
      // COUNT the settled dice so "6" unmistakably means THESE dice, then the
      // resolved equation is the hero. Answer is framed as "dice"; the reward is
      // a separate "+N 🔩" event so score never reads as the answer.
      countDice(() => {
        ui.setAskEq(eqStr);
        ui.popAskEq();
        ui.setTally(`${round.target} groups of ${round.groupSize} = ${round.answer} dice`);
        const reward = round.product;
        bolts += reward; ui.setBolts(bolts); ui.rewardPop();
        audio.chordSound(); celebrate();
        ui.showToast(`+${reward} 🔩 collected!`, 'good');
        ui.setStatus(`Yes! ${round.answer} dice altogether!`);
        bolt.say(`YES! +${reward} bolts!`, 'happy');
        speak(pickPhrase([`That's right! ${eqWords(round.a, round.b, round.answer)} dice!`, `Yes! ${eqWords(round.a, round.b, round.answer)}!`, `You got it — ${round.answer} dice!`]));
        later(() => finishRound(), 900);
      });
    } else {
      btn.classList.add('wrong');
      audio.buzzSound();
      bolt.say("Let's count them!", '');
      ui.setStatus('Let’s count the dice together…');
      speak("Let's count them together.");
      countDice(() => {
        const right = ui.choiceButtons().find((c) => Number(c.textContent) === round.answer);
        if (right) right.classList.add('right');
        ui.setAskEq(eqStr);
        ui.popAskEq();
        ui.setTally(`${round.target} groups of ${round.groupSize} = ${round.answer} dice`);
        ui.setStatus(`${round.answer} dice! Now you know it.`);
        speak(`${eqWords(round.a, round.b, round.answer)}. Now you know it!`);
        bolt.say(`It's ${round.answer}!`, '');
        later(() => ui.fadeChoices(), 500);
        later(() => finishRound(), 900);
      });
    }
  }

  // pop every die in group g (round.dice is filled in spill order, group by group)
  function popGroup(g) {
    const gs = round.groupSize;
    for (let k = 0; k < gs; k++) {
      const die = round.dice[g * gs + k];
      if (die) { die.userData.pt = 0; pops.push(die); }
    }
  }

  // skip-count the settled dice group-by-group, popping each cluster as it's
  // counted — ties the running total to the PHYSICAL dice (per playtest). Used
  // on a correct answer (confirm) and a wrong one (reveal).
  function countDice(done, ms = 240) {
    let g = 0;
    const step = () => {
      if (!round) return; // round torn down mid-count (left for the hub) — bail
      g++;
      popGroup(g - 1);
      audio.groupChime(g);
      ui.setTally(`… ${g * round.groupSize} dice`);
      speak(`${g * round.groupSize}.`);
      if (g < round.target) later(step, ms);
      else later(done, ms + 220);
    };
    later(step, 180);
  }

  function finishRound() {
    phase = 'next';
    // no floating number at the confirm — the resolved askeq sign is the hero.
    ui.showConfirm('Next →');
  }

  // ---------- device shake (tablet) — the SHAKE button is the primary path ----------
  let lastShakeT = -1;
  function onMotion(e) {
    if (phase !== 'rolling') return;
    const withG = e.accelerationIncludingGravity;
    const a = (e.acceleration && e.acceleration.x != null) ? e.acceleration : withG;
    if (!a) return;
    const base = (a === withG) ? 9.81 : 0; // subtract gravity when only gravity-incl. is available
    const mag = Math.abs(Math.hypot(a.x || 0, a.y || 0, a.z || 0) - base);
    const t = nowT();
    if (mag > 15 && t - lastShakeT > 0.6) { // debounced ~15 m/s^2 threshold
      lastShakeT = t;
      spillGroup();
      ui.showToast('Shake! 🎲', 'good');
    }
  }

  // ---------- buttons ----------
  const onConfirm = () => {
    if (phase === 'rolling') spillGroup();
    else if (phase === 'next') newRound();
  };
  const onRecenter = () => ui.showToast('Just shake or tap SHAKE!', 'good');

  // ---------- per-frame ----------
  function update(dt) {
    for (let i = tumbling.length - 1; i >= 0; i--) {
      const it = tumbling[i];
      if (it.delay > 0) { it.delay -= dt; continue; }
      it.t += dt;
      const k = Math.min(1, it.t / it.dur);
      const e = easeOutCubic(k);
      it.mesh.position.x = it.from.x + (it.to.x - it.from.x) * e;
      it.mesh.position.z = it.from.z + (it.to.z - it.from.z) * e;
      it.mesh.position.y = it.from.y + (it.to.y - it.from.y) * e + Math.sin(Math.PI * k) * it.arc;
      it.mesh.rotateOnAxis(it.axis, it.spin * dt * (1 - 0.5 * k));
      if (k >= 1) {
        it.mesh.position.set(it.to.x, it.to.y, it.to.z);
        tumbling.splice(i, 1);
        audio.thunk(0);
        puff(it.to.x, it.to.y, it.to.z);
        it.mesh.userData.pt = 0; pops.push(it.mesh); // landing squash-bounce
      }
    }
    // landing bounce: quick scale pop so a settling die draws the eye to itself
    for (let i = pops.length - 1; i >= 0; i--) {
      const m = pops[i];
      m.userData.pt += dt;
      const k = m.userData.pt / 0.3;
      if (k >= 1) { m.scale.setScalar(1); pops.splice(i, 1); }
      else m.scale.setScalar(1 + Math.sin(Math.PI * k) * 0.22);
    }
    // once the LAST group has stopped tumbling, pose the question over the
    // settled, countable clusters (never over dice still in the air).
    if (phase === 'settling' && tumbling.length === 0) onAllRolled();
    for (let i = dust.length - 1; i >= 0; i--) {
      const d = dust[i];
      d.life -= dt;
      d.mesh.position.addScaledVector(d.mesh.userData.v, dt);
      d.mesh.scale.multiplyScalar(1 + dt * 2.2);
      d.mesh.material.opacity = Math.max(0, d.life / 0.35) * 0.6;
      if (d.life <= 0) { root.remove(d.mesh); d.mesh.material.dispose(); dust.splice(i, 1); }
    }
    for (let i = confetti.length - 1; i >= 0; i--) {
      const c = confetti[i];
      c.life -= dt;
      c.mesh.userData.v.y -= 16 * dt;
      c.mesh.position.addScaledVector(c.mesh.userData.v, dt);
      c.mesh.rotation.x += dt * 6; c.mesh.rotation.z += dt * 5;
      if (c.life <= 0) { root.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh.material.dispose(); confetti.splice(i, 1); }
    }
  }

  // ---------- debug hooks (headless smoke test) ----------
  function installDebug() {
    window.__sbb = () => ({
      phase, groups: round?.groupsRolled, target: round?.target,
      groupSize: round?.groupSize, answer: round?.answer,
      choices: ui.currentChoiceValues(), bolts,
    });
    window.__shake = () => spillGroup(); // programmatic shake (a test can't shake a device)
  }
  function clearDebug() {
    for (const k of ['__sbb', '__shake']) { try { delete window[k]; } catch (_) { window[k] = undefined; } }
  }

  // ---------- interface ----------
  function start() {
    ui.els.btnConfirm.addEventListener('click', onConfirm);
    ui.els.btnRecenter.addEventListener('click', onRecenter);
    ui.els.btnRecenter.style.display = 'none';
    window.addEventListener('devicemotion', onMotion, { passive: true });
    installDebug();
    bolt.setOxidation(mastery.overallProgress());
    newRound();
  }

  function teardown() {
    ui.els.btnConfirm.removeEventListener('click', onConfirm);
    ui.els.btnRecenter.removeEventListener('click', onRecenter);
    window.removeEventListener('devicemotion', onMotion);
    clearDebug();
    clearTimers();
    disposeTray();
    scene.remove(root);
    root.traverse((o) => {
      if (o.geometry && !sharedGeos.has(o.geometry)) o.geometry.dispose?.();
      const mm = o.material;
      if (Array.isArray(mm)) mm.forEach((x) => { if (!sharedMats.has(x)) x.dispose?.(); });
      else if (mm && !sharedMats.has(mm)) mm.dispose?.();
    });
    dieGeo.dispose();
    faceMats.forEach((m) => m.dispose());
    pipTex.forEach((t) => t && t.dispose());
    trayMat.dispose(); lipMat.dispose(); trayWoodTex.dispose();
    ui.els.btnRecenter.style.display = '';
    engine.resetCamera();
    round = null; phase = 'idle';
  }

  return { id: 'shake-a-batch', title: 'Shake-a-Batch', start, update, teardown };
}
