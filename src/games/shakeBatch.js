// games/shakeBatch.js — "Shake-a-Batch", the dice mini-game, implemented against
// the shared game-module interface (see src/games/README.md):
//
//   createShakeBatch(ctx) -> { id, title, start(opts), update(dt), teardown() }
//
// You ROLL TWO DICE to get the two factors, then watch them multiply out into
// an array you can count. The dice say what the sum IS; the array proves it.
//
//   * The GROUPS die reads how many groups. Its faces are numerals.
//   * The TABLE die reads how many in each group, drawn from the tables the
//     child has unlocked. That is also why it cannot be a pip die: pips stop at
//     six, and the 10x table would be unreachable in this game.
//   * Both are quietly LOADED to the fact the mastery ledger wants practised.
//     It is a dice game; nobody can tell, and the adaptive engine still drives.
//
// Both dice carry NUMERALS. An earlier version made the groups die a pip die
// and the table die a numeral one, and reading two notations side by side to
// get one sum is work a child should not be spending attention on here.
//
// The array is built from plain STONE BLOCKS that land square in a grid. They
// were dice before: first ordinary pip dice used as anonymous counters, which
// put numbers in front of a child and then asked them to ignore those numbers,
// and then single-pip dice, which still tumbled to random angles and read as a
// scatter rather than as something countable. A block has no value to misread
// and no orientation to land wrong.
//
// No physics lib — the tumble is a short faked arc+spin animation (like
// blockBuilder fakes block drops). The game owns one root group and tears it
// down fully. Bolt, audio, speech, ui, camera and the mastery ledger are
// shared via ctx; the dice geometry/materials + pip textures are owned here and
// disposed on teardown (ctx.textures are shared — never disposed).

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
const FACTOR_SCALE = 1.9;        // the two factor dice are the headline
const FACTOR_GAP = 1.5;          // between them, room for the x sign to read
const FACTOR_BACK = 1.9;         // how far behind the tray they sit


export function createShakeBatch(ctx) {
  const { scene, engine, audio, speech, ui, bolt, mastery, wallet } = ctx;
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
  const dieGeo = new THREE.BoxGeometry(DIE, DIE, DIE);

  // A counter. Plain on every face, because its only job is to be counted.
  const stoneMat = new THREE.MeshStandardMaterial({ map: ctx.textures.stoneTex, roughness: 1, metalness: 0 });

  // A numeral face for the TABLE die. Deliberately smooth rather than the hard
  // pixel treatment used elsewhere: this is a number a child has to read, and
  // legibility outranks the aesthetic (10 and 18 must not be confusable).
  function numeralTexture(n) {
    return makeCanvasTex(128, (c, S) => {
      c.fillStyle = '#f4ead2'; c.fillRect(0, 0, S, S);
      c.fillStyle = '#d9c9a3';
      const U = S / 16;
      c.fillRect(0, 0, S, U); c.fillRect(0, 0, U, S);
      c.fillRect(S - U, 0, U, S); c.fillRect(0, S - U, S, U);
      c.fillStyle = '#2b2320';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `700 ${n >= 10 ? 62 : 78}px "Fredoka", system-ui, sans-serif`;
      c.fillText(String(n), S / 2, S / 2 + 4);
    }, { nearest: false });
  }

  // Local face normals, matched index-for-index with faceValues above.
  const FACE_N = [
    new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
  ];
  const UP = new THREE.Vector3(0, 1, 0);

  const UP_FACE = 2; // +y, in BoxGeometry material order


  // shared tray materials — WOOD PIXEL texture (plank grain), matte, hard pixel.
  const trayWoodTex = ctx.textures.woodTex.clone();
  trayWoodTex.needsUpdate = true;
  trayWoodTex.wrapS = trayWoodTex.wrapT = THREE.RepeatWrapping;
  trayWoodTex.repeat.set(3, 3);
  const trayMat = new THREE.MeshStandardMaterial({ map: trayWoodTex, roughness: 1, metalness: 0 });
  const lipMat = new THREE.MeshStandardMaterial({ color: 0x8a5f34, roughness: 1, metalness: 0 });

  const sharedGeos = new Set([dieGeo]);
  const sharedMats = new Set([stoneMat, trayMat, lipMat]);

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
  const tableMats = [];   // this round's numeral die materials (rebuilt per round)
  const tableTex = [];
  let round = null;
  // 'rolling'   waiting for a shake
  // 'reading'   the two factor dice are in the air
  // 'spawning'  the array is building itself, group by group
  // 'settling'  last group still landing
  // 'asking' | 'next'
  let phase = 'idle';


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

  // An array counter. Tumbles in, but settles perfectly square: a grid of
  // aligned blocks can be counted at a glance, a scatter of tilted ones cannot.
  function makeStoneBlock() {
    const m = new THREE.Mesh(dieGeo, stoneMat);
    m.castShadow = true; m.receiveShadow = true;
    m.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
    m.userData.baseScale = 1;
    m.userData.landQuat = new THREE.Quaternion(); // identity: flat and aligned
    return m;
  }

  // A factor die, oversized so it reads as the headline.
  //
  // The value it must show is painted onto its TOP face and the die simply
  // lands flat. The previous version kept a fixed set of faces and computed the
  // rotation that would bring the right one upward, plus a correction so the
  // numeral was not upside down. That arithmetic was right for some faces and
  // wrong for others, which is a miserable thing to debug through screenshots.
  // Painting the face removes the problem instead of fixing it: one
  // orientation, verified once.
  function makeFactorDie(value, others, pool) {
    // Decoys must exclude the value itself: a die showing 6 on top and 6 on its
    // side is not a die, and a child reading the wrong face gets the wrong sum.
    const decoys = [...new Set(others)].filter((v) => v !== value);
    const values = [];
    for (let i = 0, d = 0; i < 6; i++) {
      values.push(i === UP_FACE ? value : (decoys.length ? decoys[d++ % decoys.length] : value));
    }
    const mats = values.map((v) => {
      const t = numeralTexture(v);
      pool.tex.push(t);
      const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 1, metalness: 0 });
      pool.mats.push(mat);
      return mat;
    });
    const m = new THREE.Mesh(dieGeo, mats);
    m.castShadow = true; m.receiveShadow = true;
    m.scale.setScalar(FACTOR_SCALE);
    m.userData.baseScale = FACTOR_SCALE;
    m.userData.faceValues = values;
    m.userData.landQuat = new THREE.Quaternion(); // flat, square, right way up
    m.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
    return m;
  }

  // Which value is actually pointing up? Derived from the die's live orientation
  // rather than from what we intended, so a broken load shows up as a broken
  // read-back instead of an echo of our own assumption.
  const _up = new THREE.Vector3();
  function upFaceValue(die) {
    _up.set(0, 1, 0).applyQuaternion(die.quaternion.clone().invert());
    let best = 0, bestDot = -2;
    for (let i = 0; i < FACE_N.length; i++) {
      const dot = _up.dot(FACE_N[i]);
      if (dot > bestDot) { bestDot = dot; best = i; }
    }
    return die.userData.faceValues[best];
  }

  function clearDice() {
    clearTimers(); // cancel any in-flight count/reveal chain from the last round
    if (round) {
      for (const die of round.dice) diceGroup.remove(die); // shared geo/mats kept
      for (const die of round.factorDice) diceGroup.remove(die);
    }
    // the numeral faces are rebuilt per round (the unlocked tables change)
    for (const m of tableMats) m.dispose();
    for (const t of tableTex) t.dispose();
    tableMats.length = 0; tableTex.length = 0;
    tumbling.length = 0;
    pops.length = 0;
  }

  // Decoy faces: the other tables the child has unlocked, so a die that is not
  // showing its value still shows something plausible.
  function decoyTables() {
    // The unlocked tables first, topped up so a die has six distinct faces
    // rather than the same two or three numbers repeating around it.
    const seen = [...new Set([...mastery.activeTables(), 2, 3, 4, 5, 6, 10])];
    return seen.length ? seen : [2, 5, 10];
  }

  // ---------- camera ----------
  function frameCamera() {
    const w = round.groupSize * STEP + 0.9;
    // depth must also cover the two factor dice parked behind the tray
    const d = round.target * STEP + Math.max(0, round.target - 1) * GROUP_GAP + 0.9
      + FACTOR_BACK + DIE * FACTOR_SCALE;
    const dist = Math.max(w, d) * 1.5 + 6.5;
    engine.placeCamera(0.4, dist, SB_VIEW);
    // clear of the tray, on the near-left so the dice stay unobstructed
    bolt.placeAt(-w / 2 - dist * 0.16, dist * 0.10);
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
    // A low wooden rattle. This used to be a bright noise burst plus two square
    // waves, which at the corrected bus level came out as a loud hiss and a
    // chirp: the "weird high-pitched sound" a playtester kept hearing after the
    // roll. Lower cutoff and triangle waves give it a tumbling-wood character
    // that sits under the chime instead of fighting it.
    audio.noiseBurst(0.13, 0.028, 520);
    audio.beepEnv(210, 130, 0.09, 'triangle', 0.03);
    later(() => audio.beepEnv(180, 110, 0.08, 'triangle', 0.022), 90);
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
    speech.reset(); // a new round starts a new sentence, not a queue
    clearDice();
    const q = mastery.nextQuestion({ op: 'mul' }); // this game is pure ×

    // q.a is the TABLE, q.b the multiplier (always 2..6). Read as "b groups of
    // a", which puts the small factor on the pip die and caps the round at six
    // groups however big the table gets.
    const groups = q.b, each = q.a;
    round = {
      a: q.a, b: q.b,
      target: groups, groupSize: each,   // the array: `groups` rows of `each`
      product: q.a * q.b, answer: q.a * q.b,
      groupsRolled: 0, dice: [], factorDice: [],
      askT: 0, answered: false,
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
    ui.setClaim('Shake to roll!');
    ui.setStatus('');
    ui.showConfirm('Shake! 🎲');
    bolt.say('Shake the dice!', '');
    speak(pickPhrase(['Shake the dice!', 'Give them a shake!', 'Roll the dice!']));
  }

  // Tumble the two factor dice in, loaded to this round's fact.
  function rollFactors() {
    if (!round || phase !== 'rolling') return;
    phase = 'reading';
    ui.hideConfirm();

    const d = round.target * STEP + Math.max(0, round.target - 1) * GROUP_GAP + 0.9;
    const z = -d / 2 - FACTOR_BACK;
    const y = REST_Y + (FACTOR_SCALE - 1) * DIE / 2;

    // groups die (pips) on the left, table die (numerals) on the right
    // left: how many groups. right: how many in each.
    const pool = { tex: tableTex, mats: tableMats };
    const specs = [
      { value: round.target, others: [1, 2, 3, 4, 5, 6], x: -FACTOR_GAP / 2 },
      { value: round.groupSize, others: decoyTables(), x: FACTOR_GAP / 2 },
    ];
    for (const [i, sp] of specs.entries()) {
      const die = makeFactorDie(sp.value, sp.others, pool);
      const to = { x: sp.x, y, z };
      const from = { x: sp.x + (Math.random() - 0.5) * 1.6, y: y + 3.4, z: z - 2.4 };
      die.position.set(from.x, from.y, from.z);
      diceGroup.add(die);
      round.factorDice.push(die);
      const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      tumbling.push({
        mesh: die, delay: i * 0.12, t: 0, dur: 0.62, from, to, axis,
        spin: 10 + Math.random() * 5, arc: 1.7 + Math.random(), land: die.userData.landQuat,
      });
    }
    rollSound();
  }

  // Both factor dice have settled: read them out, then multiply them out.
  function onFactorsLanded() {
    const g = round.target, e = round.groupSize;
    ui.setClaim(`${g} × ${e}`);
    ui.popClaim();
    ui.setStatus('');
    bolt.say(`${g} and ${e}!`, 'wow');
    speak(`${g}, and ${e}. That's ${g} groups of ${e}!`);
    audio.groupChime(1);
    later(() => {
      if (!round) return;
      ui.setClaim(`${g} group${g > 1 ? 's' : ''} of ${e}`);
      ui.popClaim();
      startSpawning();
    }, 1150);
  }

  // The dice multiply out: one group lands per beat, with the running skip-count.
  function startSpawning() {
    if (!round) return;
    phase = 'spawning';
    const step = () => {
      if (!round) return;
      spillGroup();
      if (round.groupsRolled < round.target) later(step, 620);
      else {
        // Don't ask over dice still in the air — update() fires onAllRolled once
        // the last group has settled into countable clusters.
        phase = 'settling';
        bolt.say('Now count them all!', 'wow');
      }
    };
    later(step, 220);
  }

  // spill ONE group of `groupSize` unit dice, tumbling into the tray
  function spillGroup() {
    if (!round || (phase !== 'spawning' && phase !== 'settling')) return;
    const g = round.groupsRolled;
    if (g >= round.target) return;
    const cols = round.groupSize;
    for (let k = 0; k < cols; k++) {
      const slot = diePos(g, k);
      const die = makeStoneBlock();
      const from = {
        x: slot.x + (Math.random() - 0.5) * 1.4,
        y: REST_Y + 3 + Math.random() * 1.2,
        z: slot.z - 2.6 - Math.random() * 0.8,
      };
      die.position.set(from.x, from.y, from.z);
      diceGroup.add(die);
      round.dice.push(die);
      const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      tumbling.push({ mesh: die, delay: k * 0.06, t: 0, dur: 0.5, from, to: slot, axis, spin: 8 + Math.random() * 6, arc: 1.4 + Math.random(), land: die.userData.landQuat });
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
    // truthful running skip-count as each group lands: 5 ... 10 ... 15
    speak(`${g * round.groupSize}.`);
  }

  function onAllRolled() {
    phase = 'asking';
    round.askT = nowT();
    // the goal headline fades; the equation sign takes over as the question. The
    // dice sit SETTLED in separated groups right above it — countable evidence.
    ui.fadeClaim();
    ui.setTally(`${round.target} groups of ${round.groupSize} …`);
    ui.setStatus('Count the blocks — how many?');
    ui.setAskEq(`${round.a} × ${round.b} = ?`);
    ui.hideConfirm();
    bolt.say('How many blocks altogether?', 'wow');
    speak(pickPhrase([`Count the blocks! How many altogether?`, `So, ${eqWords(round.a, round.b)}? Count them!`, `How many blocks did you get?`]));
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
        ui.setTally(`${round.target} groups of ${round.groupSize} = ${round.answer} blocks`);
        const reward = round.product;
        wallet.add(reward);
        audio.chordSound(); celebrate();
        ui.showToast(`+${reward} 🔩 collected!`, 'good');
        ui.setStatus(`Yes! ${round.answer} blocks altogether!`);
        bolt.say(`YES! +${reward} bolts!`, 'happy');
        speak(pickPhrase([`That's right! ${eqWords(round.a, round.b, round.answer)} blocks!`, `Yes! ${eqWords(round.a, round.b, round.answer)}!`, `You got it — ${round.answer} blocks!`]));
        later(() => finishRound(), 900);
      });
    } else {
      btn.classList.add('wrong');
      audio.buzzSound();
      bolt.say("Let's count them!", '');
      ui.setStatus('Let’s count the blocks together…');
      speak("Let's count them together.");
      countDice(() => {
        const right = ui.choiceButtons().find((c) => Number(c.textContent) === round.answer);
        if (right) right.classList.add('right');
        ui.setAskEq(eqStr);
        ui.popAskEq();
        ui.setTally(`${round.target} groups of ${round.groupSize} = ${round.answer} blocks`);
        ui.setStatus(`${round.answer} blocks! Now you know it.`);
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
      ui.setTally(`… ${g * round.groupSize} blocks`);
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
      rollFactors();
      ui.showToast('Shake! 🎲', 'good');
    }
  }

  // ---------- buttons ----------
  const onConfirm = () => {
    if (phase === 'rolling') rollFactors();
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
        // a loaded die settles onto the face it was always going to show
        if (it.land) it.mesh.quaternion.copy(it.land);
        tumbling.splice(i, 1);
        audio.thunk(0);
        puff(it.to.x, it.to.y, it.to.z);
        // a factor die is big and lands alone, so it hits harder than one of
        // the many little counters
        ctx.worldFeel.impulse(it.land ? 0.3 : 0.07, it.to.x, it.to.z);
        it.mesh.userData.pt = 0; pops.push(it.mesh); // landing squash-bounce
      }
    }
    // landing bounce: quick scale pop so a settling die draws the eye to itself
    for (let i = pops.length - 1; i >= 0; i--) {
      const m = pops[i];
      const base = m.userData.baseScale || 1; // factor dice are oversized
      m.userData.pt += dt;
      const k = m.userData.pt / 0.3;
      if (k >= 1) { m.scale.setScalar(base); pops.splice(i, 1); }
      else m.scale.setScalar(base * (1 + Math.sin(Math.PI * k) * 0.22));
    }
    // once the LAST group has stopped tumbling, pose the question over the
    // settled, countable clusters (never over dice still in the air).
    if (phase === 'reading' && tumbling.length === 0) onFactorsLanded();
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
      factors: round ? [round.target, round.groupSize] : null,
      factorDice: round ? round.factorDice.length : 0,
      // what the settled factor dice are actually SHOWING
      shown: round ? round.factorDice.map(upFaceValue) : [],
      dice: round ? round.dice.length : 0,
      choices: ui.currentChoiceValues(), bolts: wallet.bolts,
    });
    window.__shake = () => rollFactors(); // a test cannot shake a device
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
    stoneMat.dispose();
    tableMats.forEach((m) => m.dispose());
    tableTex.forEach((t) => t.dispose());
    trayMat.dispose(); lipMat.dispose(); trayWoodTex.dispose();
    ui.els.btnRecenter.style.display = '';
    engine.resetCamera();
    round = null; phase = 'idle';
  }

  return { id: 'shake-a-batch', title: 'Shake-a-Batch', start, update, teardown };
}
