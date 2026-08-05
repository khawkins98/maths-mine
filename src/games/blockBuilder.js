// games/blockBuilder.js — the Block Builder mini-game, implemented against the
// shared game-module interface (see src/games/README.md).
//
//   createGame(ctx) -> { id, title, start(opts), update(dt), teardown() }
//
// Two modes on the same block/array/tap-to-place engine:
//   • MULTIPLICATION (×): build a cols×rows array, skip-count each completed
//     column (a "group of rows"), then ANSWER the hidden total, then ROTATE the
//     wall 90° to feel a×b = b×a.
//   • DIVISION (÷): "Share 12 into 3 equal groups" — fill the same array
//     (3 groups × 4 each), skip-count groups shared, then ANSWER "how many in
//     each group?" (12 ÷ 3 = 4). Taught as equal sharing; no false commutativity
//     rotate — instead the ×/÷ fact family is shown.
//
// The game owns a single root group added to the scene and fully tears it down.
// Bolt, audio, speech, ui, textures, camera and the mastery ledger are shared
// via ctx.

import * as THREE from 'three';
import { createTimers } from '../core/timers.js';
import { createPointerInput } from '../core/pointer.js';
import { easeOutBack, easeOutBounce } from '../core/ease.js';
import { createBlockKit, CELL, BLOCK, CAP_H, BODY_H } from '../core/blocks.js';

const DROP_INTERVAL = 0.16;    // seconds between poured blocks (full pour)
const DROP_TIME = 0.25;        // seconds for the drop-and-bounce of a placed block
const COLS = [0xff6b6b, 0xffd24a, 0x58e08a, 0x6ad2ff, 0xb98bff, 0xff9f5a, 0x7ef0d0, 0xf78fb3]; // confetti



export function createBlockBuilder(ctx) {
  const { scene, camera, engine, textures, audio, speech, ui, bolt, mastery, wallet, sensors } = ctx;
  const { dirtTex, grassTex, slotTex, puffTex } = textures;
  const speak = speech.speak, eqWords = speech.eqWords, divWords = speech.divWords, pickPhrase = speech.pickPhrase;
  const nowT = engine.nowT;
  const dom = ctx.renderer.domElement;

  // 3/4 iso view direction lives in the engine
  const VIEW_DIR = engine.VIEW_DIR;

  // ---- shared block geometry (rounded dirt body + grass "lip" cap) ----
  const blocks = createBlockKit(ctx.textures);
  const { makeBlock, setCapGrass } = blocks;
  const slotGeo = new THREE.PlaneGeometry(CELL * 0.94, CELL * 0.94);
  const sharedGeos = new Set([...blocks.sharedGeos, slotGeo]);

  // ---- the game's own scene subtree ----
  const root = new THREE.Group();
  scene.add(root);

  let wall = new THREE.Group();
  root.add(wall);

  const spout = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 0.7, 4),
    new THREE.MeshStandardMaterial({ color: 0xffd24a, roughness: 1, metalness: 0, emissive: 0x332200 })
  );
  spout.rotation.y = Math.PI / 4;
  spout.rotation.x = Math.PI; // point down
  spout.visible = false;
  root.add(spout);

  const highlight = new THREE.Mesh(
    new THREE.BoxGeometry(CELL, CELL, CELL),
    new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.22, depthWrite: false })
  );
  highlight.visible = false;
  root.add(highlight);

  const falling = []; // dropping blocks: { mesh, fromY, targetY, t }
  const landing = []; // just-landed squash-and-stretch: { mesh, t }
  const dust = [];    // dust-puff sprites: { mesh, life }
  const confetti = [];

  // ---- game state ----
  // Every delayed beat (reveal, count-up, celebration) goes through this pool so
  // teardown can cancel them; otherwise a child leaving mid-reveal lets
  // finishRound() fire against a null round.
  const timers = createTimers();
  let round = null;
  let phase = 'idle';    // 'building' | 'asking' | 'rotate' | 'rotating' | 'next'
  let firstRound = true;
  let moldGroup = null, pulsedTile = null;
  let forcedOp = null;   // test hook: force the next round's operation
  let flashT = 0, flashCol = null;


  function sensorsLive() { return sensors.enabled && sensors.available; }

  // ---------- dust ----------
  function dustPuff(x, y, z) {
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({
        map: puffTex, color: 0xd9c8a6, transparent: true, opacity: 0.75, depthWrite: false,
      }));
      m.position.set(x + (Math.random() - 0.5) * 0.6, y - 0.3, z + 0.2 + Math.random() * 0.3);
      m.scale.setScalar(0.22 + Math.random() * 0.18);
      m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 1.8, 0.5 + Math.random() * 0.9, (Math.random() - 0.5) * 0.8);
      root.add(m);
      dust.push({ mesh: m, life: 0.4 });
    }
  }

  // ---------- geometry helpers ----------
  function cellPos(c, r, C, R) {
    return new THREE.Vector3((c - (C - 1) / 2) * CELL, (r - (R - 1) / 2) * CELL, 0);
  }

  function updateColumnGrass(c) {
    let maxR = -1;
    for (let r = 0; r < round.R; r++) if (round.cells[c][r]) maxR = r;
    for (let r = 0; r < round.R; r++) {
      const b = round.blocks[c][r];
      if (b) setCapGrass(b, r === maxR);
    }
  }

  function clearWall() {
    root.remove(wall);
    wall.traverse((o) => {
      if (o.geometry && !sharedGeos.has(o.geometry)) o.geometry.dispose?.();
      const mm = o.material;
      if (Array.isArray(mm)) mm.forEach((x) => x.dispose?.());
      else mm?.dispose?.(); // shared textures are NOT disposed by material.dispose
    });
    wall = new THREE.Group();
    root.add(wall);
    falling.length = 0;
    landing.length = 0;
    moldGroup = null;
  }

  function buildMold(C, R) {
    const g = new THREE.Group();
    const tiles = Array.from({ length: C }, () => new Array(R).fill(null));
    for (let c = 0; c < C; c++) {
      for (let r = 0; r < R; r++) {
        const tile = new THREE.Mesh(
          slotGeo,
          new THREE.MeshBasicMaterial({ map: slotTex, transparent: true, opacity: 0.28, depthWrite: false })
        );
        tile.position.copy(cellPos(c, r, C, R));
        tile.position.z = -0.2;
        g.add(tile);
        tiles[c][r] = tile;
      }
    }
    g.userData.tiles = tiles;
    moldGroup = g;
    wall.add(g);
  }

  function updateMoldPulse() {
    if (pulsedTile) { pulsedTile.material.opacity = 0.28; pulsedTile = null; }
    if (!round || phase !== 'building' || !moldGroup) return;
    for (let c = 0; c < round.C; c++) {
      const r = round.cells[c].indexOf(false);
      if (r !== -1) {
        pulsedTile = moldGroup.userData.tiles[c][r];
        pulsedTile.material.opacity = 0.4 + 0.2 * Math.sin(nowT() * 3);
        return;
      }
    }
  }

  // ---------- camera framing (block-geometry specific) ----------
  function frameValues(width, height) {
    const maxDim = Math.max(width, height);
    const centerY = ((height - 1) * CELL) / 2 + BLOCK / 2;
    const dist = maxDim * 2.15 + 8;
    return { dist, centerY };
  }
  function frameCamera(C, R) {
    const f = frameValues(C, R);
    engine.placeCamera(f.centerY, f.dist, VIEW_DIR);
    // Bolt stands on the grass to the left of the wall, stepped back from it so
    // he never overlaps the blocks the child is counting. Tied to the framing
    // distance so he stays in shot for a 2x3 wall and a 6x10 one alike.
    bolt.placeAt(-(C * CELL) / 2 - f.dist * 0.20, f.dist * 0.14);
  }
  function wallCenterYFor(R) { return frameValues(1, R).centerY; }

  // ---------- round flow ----------
  function newRound() {
    speech.reset(); // a new round starts a new sentence, not a queue
    const q = mastery.nextQuestion(forcedOp ? { op: forcedOp } : {});
    forcedOp = null;
    clearWall();

    let C, R, groupAxis, groupsTotal, groupSize, answer, factA, factB;
    if (q.op === 'div') {
      // Share `dividend` into `divisor` equal groups → answer = quotient/group.
      C = q.quotient; R = q.divisor;            // C cols (per-group size) × R rows (groups)
      groupAxis = 'row';                        // each ROW is one shared group of C
      groupsTotal = R; groupSize = C;
      answer = q.quotient;
      factA = q.a; factB = q.b;
    } else {
      // Convention: `a × b` == "a groups of b" (a groups, each of size b).
      // So the wall is exactly `a` columns (groups), each `b` blocks tall.
      C = q.a; R = q.b;                         // C=a groups (columns) × R=b each
      groupAxis = 'col';                        // each COLUMN is one group of b
      groupsTotal = C; groupSize = R;           // a groups, size b — counts up to a
      answer = q.a * q.b;
      factA = q.a; factB = q.b;
    }

    wall.position.set(0, wallCenterYFor(R), 0);
    wall.rotation.set(0, 0, 0);
    round = {
      op: q.op, a: factA, b: factB, C, R, answer,
      dividend: q.dividend, divisor: q.divisor, quotient: q.quotient,
      groupAxis, groupsTotal, groupSize, blocksTotal: C * R,
      cells: Array.from({ length: C }, () => new Array(R).fill(false)),
      blocks: Array.from({ length: C }, () => new Array(R).fill(null)),
      placed: 0, groupsDone: 0, askT: 0, answered: false,
    };
    buildMold(C, R);
    frameCamera(C, R);
    spout.visible = sensorsLive();
    phase = 'building';

    // reset UI
    ui.hideConfirm();
    ui.hideChoices();
    ui.setAskEq(null);
    ui.setClaim(null);
    ui.hideBigTotal();
    ui.setTally('');

    if (q.op === 'div') {
      // Title card = mode name only (never the equation, never feedback).
      // One instruction only: Bolt speaks it. In sensor mode there's no ghost
      // finger, so keep a short tilt cue; in drag mode the first-touch hint +
      // Bolt cover placement — no redundant footer.
      ui.setStatus(sensorsLive() ? 'Tilt to pour · fill every group equally' : '');
      bolt.say(`Share ${q.dividend} into ${q.divisor} groups!`, '');
      speak(`Let's share ${q.dividend} into ${q.divisor} equal groups.`);
    } else {
      ui.setStatus(sensorsLive() ? 'Tilt forward to pour · tilt left/right to aim' : '');
      bolt.say(`Build ${q.a} groups of ${q.b}!`, '');
      speak(`Let's build ${q.a} groups of ${q.b}.`);
    }

    if (sensorsLive()) sensors.recenter();
    if (firstRound && !sensorsLive()) startDemo();
  }

  function placeInCell(c, r) {
    if (!round || phase !== 'building') return false;
    if (c < 0 || c >= round.C || r < 0 || r >= round.R) return false;
    const col = round.cells[c];
    if (col[r]) return false;
    col[r] = true;
    round.placed++;
    const mesh = makeBlock();
    round.blocks[c][r] = mesh;
    const target = cellPos(c, r, round.C, round.R);
    const fromY = (round.R * CELL) / 2 + 1.8;
    mesh.position.set(target.x, fromY, target.z);
    wall.add(mesh);
    falling.push({ mesh, fromY, targetY: target.y, t: 0 });
    updateColumnGrass(c);

    if (firstRound && round.placed === 1) dismissDemo();
    if (groupJustCompleted(c, r)) onGroupComplete();
    else updateTally();
    return true;
  }

  // Did placing at (c,r) complete this cell's group (a column for ×, a row for ÷)?
  function groupJustCompleted(c, r) {
    if (round.groupAxis === 'row') {
      for (let cc = 0; cc < round.C; cc++) if (!round.cells[cc][r]) return false;
      return true;
    }
    return round.cells[c].every(Boolean);
  }

  function placeInColumn(c) {
    if (!round || c < 0 || c >= round.C) return;
    const r = round.cells[c].indexOf(false);
    if (r === -1) { flashSpout(0xff7a7a); return; }
    placeInCell(c, r);
  }

  // What the wall actually holds right now, independent of the order it was
  // filled in.
  function wallState() {
    let complete = 0;
    if (round.groupAxis === 'row') {
      for (let r = 0; r < round.R; r++) {
        let full = true;
        for (let c = 0; c < round.C; c++) if (!round.cells[c][r]) { full = false; break; }
        if (full) complete++;
      }
    } else {
      for (let c = 0; c < round.C; c++) if (round.cells[c].every(Boolean)) complete++;
    }
    return { complete, extra: round.placed - complete * round.groupSize };
  }

  // The running caption, refreshed after EVERY block rather than only when a
  // group closes. A child filling freeform - a bit of one column, a bit of
  // another - used to get a caption that was both stale and misleading: it read
  // "1 group of 6 = 6" while a second column was half built.
  //
  // It never states a multiplication that is not on the board yet. Before the
  // first group closes there is no product to name, so it just counts what is
  // there; after that it names the completed groups and keeps the loose blocks
  // separate. Voice stays on group milestones only: narrating every block would
  // turn an array into counting by ones, which is the habit this is trying to
  // replace.
  function updateTally() {
    if (!round || phase !== 'building') return;
    const { complete, extra } = wallState();
    const n = round.placed;
    if (round.op === 'div') {
      if (complete === 0) return ui.setTally(n ? `${n} shared out` : '');
      return ui.setTally(`${complete} of ${round.divisor} groups shared`
        + (extra ? `, and ${extra} more` : ''));
    }
    if (complete === 0) {
      return ui.setTally(n ? `${n} block${n > 1 ? 's' : ''}` : '');
    }
    ui.setTally(`${complete} group${complete > 1 ? 's' : ''} of ${round.groupSize}`
      + ` = ${complete * round.groupSize}`
      + (extra ? ` … and ${extra}` : ''));
  }

  function onGroupComplete() {
    round.groupsDone++;
    if (round.groupsDone >= round.groupsTotal) return onBuilt();
    const g = round.groupsDone;
    audio.groupChime(g);
    if (round.op === 'div') {
      // sharing language — count groups shared, don't reveal the per-group count
      updateTally();
      speak(pickPhrase([`${g} groups shared.`, `Keep sharing.`, `${g} so far.`]));
      if (g === Math.floor(round.divisor / 2)) bolt.say('Share them evenly!', 'happy');
    } else {
      // truthful skip-count of COMPLETED groups: 1×R, 2×R, 3×R …
      updateTally();
      const gs = g > 1 ? 's' : '', tot = g * round.groupSize;
      speak(pickPhrase([`${g} group${gs} of ${round.groupSize}. That's ${tot}.`, `That makes ${tot}.`, `${tot}!`, `Now we've got ${tot}.`]));
      if (g === 2 || g === Math.floor(round.groupsTotal / 2)) bolt.say('Keep going!', 'happy');
    }
  }

  function onBuilt() {
    // drop any skip-count still queued from the build: the question is what
    // matters now, and trailing numbers talk over it
    speech.reset();
    phase = 'asking';
    if (moldGroup) moldGroup.visible = false;
    round.askT = nowT();
    if (round.op === 'div') {
      ui.setTally(`${round.divisor} equal groups …`);
      // title card stays the mode name; the big askeq sign is the question's home
      ui.setStatus('How many in each group?');
      ui.setAskEq(`${round.dividend} ÷ ${round.divisor} = ?`);
      bolt.say('How many in each?!', 'wow');
      speak(pickPhrase([`How many in each group? ${divWords(round.dividend, round.divisor)}?`, `So, ${divWords(round.dividend, round.divisor)}?`, `How many did each group get?`]));
    } else {
      ui.setTally(`${round.groupsTotal} groups of ${round.groupSize} …`);
      ui.setStatus('How many blocks altogether?');
      ui.setAskEq(`${round.a} × ${round.b} = ?`);
      bolt.say('How many?!', 'wow');
      speak(pickPhrase([`How many altogether? ${eqWords(round.a, round.b)}?`, `So, ${eqWords(round.a, round.b)}?`, `How many blocks did you build?`]));
    }
    buildChoices();
  }

  function buildChoices() {
    const p = round.answer;
    let opts;
    if (round.op === 'div') {
      // distractors: one-per-group off (the natural sharing slip)
      const set = new Set([p]);
      if (p - 1 > 0) set.add(p - 1);
      set.add(p + 1);
      while (set.size < 3) set.add(p + set.size);
      opts = [...set].slice(0, 3);
    } else {
      const R = round.groupSize;
      const set = new Set([p]);
      if (p - R > 0) set.add(p - R);
      set.add(p + R);
      while (set.size < 3) set.add(p + R * set.size);
      opts = [...set].slice(0, 3);
    }
    // deterministic shuffle (no Math.random): rotate by round.placed
    const rot = round.placed % opts.length;
    const ordered = opts.slice(rot).concat(opts.slice(0, rot));
    ui.showChoices(ordered, answerChosen);
  }

  function answerChosen(val, btn) {
    if (phase !== 'asking' || round.answered) return;
    round.answered = true;
    const correct = val === round.answer;
    const ms = (nowT() - round.askT) * 1000;
    ui.lockChoices();

    mastery.record(round.a, round.b, correct, ms);
    bolt.setOxidation(mastery.overallProgress()); // weather Bolt as mastery grows

    const eqStr = round.op === 'div'
      ? `${round.dividend} ÷ ${round.divisor} = ${round.answer}`
      : `${round.a} × ${round.b} = ${round.answer}`;

    if (correct) {
      btn.classList.add('right');
      if (round.op === 'div') ui.setTally(`${round.dividend} ÷ ${round.divisor} = ${round.answer} each`);
      else ui.setTally(`${round.groupsTotal} groups of ${round.groupSize} = ${round.answer}`);
      // the resolved equation sign is the hero (with a brief '?'→answer pop). No
      // floating number competes with it at this confirm moment.
      ui.setAskEq(eqStr);
      ui.popAskEq();
      const reward = round.blocksTotal;
      wallet.add(reward);
      audio.chordSound();
      celebrate();
      ui.showToast(`+${reward} 🔩`, 'good');
      if (round.op === 'div') {
        ui.setStatus(`Yes! ${round.dividend} ÷ ${round.divisor} = ${round.answer} each.`);
        bolt.say(`YES! +${reward} bolts!`, 'happy');
        speak(pickPhrase([`That's right! ${divWords(round.dividend, round.divisor, round.answer)}!`, `Yes! Each group gets ${round.answer}!`, `You shared it — ${round.answer} each!`]));
      } else {
        ui.setStatus(`Yes! ${round.a} × ${round.b} = ${round.answer}.`);
        bolt.say(`YES! +${reward} bolts!`, 'happy');
        speak(pickPhrase([`That's right! ${eqWords(round.a, round.b, round.answer)}!`, `Yes! ${eqWords(round.a, round.b, round.answer)}!`, `You got it — ${round.answer}!`, `Nice work! ${round.answer} blocks!`]));
      }
      // fade the answer slabs ~600ms after the green flash, THEN reveal Rotate/Next
      timers.later(() => ui.fadeChoices(), 600);
      timers.later(() => finishRound(), 1000);
    } else {
      btn.classList.add('wrong');
      audio.buzzSound();
      bolt.say("Let's count them!", '');
      ui.setStatus(round.op === 'div' ? 'Let’s share them out together…' : 'Let’s count the groups together…');
      speak("Let's count them together.");
      countReveal(() => {
        const right = ui.choiceButtons().find((c) => Number(c.textContent) === round.answer);
        if (right) right.classList.add('right');
        ui.setAskEq(eqStr);
        ui.popAskEq();
        if (round.op === 'div') {
          ui.setStatus(`${round.dividend} ÷ ${round.divisor} = ${round.answer}. Now you know it!`);
          speak(`${divWords(round.dividend, round.divisor, round.answer)}. Now you know it!`);
          bolt.say(`It's ${round.answer} each!`, '');
        } else {
          ui.setStatus(`${round.a} × ${round.b} = ${round.answer}. Now you know it!`);
          speak(`${eqWords(round.a, round.b, round.answer)}. Now you know it!`);
          bolt.say(`It's ${round.answer}!`, '');
        }
        // clear the answer slabs before the rotate/next state (no dead buttons)
        timers.later(() => ui.fadeChoices(), 700);
        timers.later(() => finishRound(), 1100);
      });
    }
  }

  // skip-count / share-out animation on a wrong answer, revealing the truth.
  function countReveal(done) {
    let g = 0;
    const step = () => {
      g++;
      if (round.op === 'div') ui.setTally(`${g} of ${round.divisor} groups → ${round.answer} each`);
      else ui.setTally(`${g} × ${round.groupSize} = ${g * round.groupSize}`);
      audio.groupChime(g);
      if (g < round.groupsTotal) timers.later(step, 260);
      else timers.later(done, 500);
    };
    timers.later(step, 200);
  }

  // × rounds rotate to feel commutativity; ÷ rounds show the ×/÷ fact family.
  function finishRound() {
    if (round.op === 'div') goToDivReveal();
    else goToRotate();
  }

  function goToDivReveal() {
    phase = 'next';
    // fact family: divisor × quotient = dividend, so dividend ÷ divisor = quotient.
    // The resolved askeq sign already states it — no floating number competes here.
    bolt.say(`${round.divisor} groups of ${round.answer} make ${round.dividend}!`, 'wow');
    speak(`${round.divisor} groups of ${round.answer} make ${round.dividend}. So ${divWords(round.dividend, round.divisor, round.answer)}.`);
    ui.showConfirm('Next →');
  }

  function goToRotate() {
    phase = 'rotate';
    ui.showConfirm('Rotate 🔄');
  }

  function doRotate() {
    phase = 'rotating';
    ui.setConfirmEnabled(false);
    const from = wall.rotation.z;
    const to = from - Math.PI / 2;
    const y0 = wall.position.y;
    // The wall swaps its columns and rows, so the framing it needs swaps too.
    const fromF = frameValues(round.C, round.R);
    const toF = frameValues(round.R, round.C);
    const y1 = toF.centerY;
    const t0 = nowT();
    const square = round.a === round.b;
    // the commuted fact on the sign; title card stays the mode name (no feedback)
    ui.setAskEq(`${round.b} × ${round.a} = ${round.answer}`);
    ui.setTally('');
    ui.setStatus('Watch the total…');

    // KEEP the big surviving number here — the beloved commutativity moment.
    ui.showBigTotal(round.answer);
    bolt.say(square ? `A perfect square — ${round.answer}!` : `Whoa — still ${round.answer}!`, 'wow');
    speak(square
      ? `${eqWords(round.a, round.b, round.answer)}. A perfect square!`
      : pickPhrase([
          `${eqWords(round.a, round.b)}, and ${eqWords(round.b, round.a)}. Both ${round.answer}!`,
          `Turn it around — still ${round.answer}! ${eqWords(round.b, round.a)} is the same.`,
        ]));

    const half = Math.max(round.C, round.R) * CELL;
    const diag = Math.hypot(round.C, round.R) * CELL;
    const lift = Math.max(0, (diag - half) / 2) + 0.15;
    const dur = 0.75;
    (function spin() {
      const k = Math.min(1, (nowT() - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      wall.rotation.z = from + (to - from) * e;
      wall.position.y = y0 + (y1 - y0) * e + Math.sin(Math.PI * e) * lift;
      // Move along the SAME (centerY, dist) parameterisation placeCamera uses,
      // rather than poking .y and .z directly. `dist` is a distance ALONG the
      // isometric view direction, not a z coordinate: assigning it to .z walked
      // the camera off that direction and eased its height down to the wall's
      // centre, which put it at knee height. The result was the camera skimming
      // and then clipping through the island, showing its underside and
      // z-fighting against the grass, and dragging Bolt underground with it.
      engine.placeCamera(
        fromF.centerY + (toF.centerY - fromF.centerY) * e,
        fromF.dist + (toF.dist - fromF.dist) * e,
        VIEW_DIR,
      );
      if (k < 1) requestAnimationFrame(spin);
      else {
        settleRotation();
        ui.pulseBigTotal();
        ui.setStatus(square
          ? `${round.a} × ${round.a} — a perfect square, ${round.answer}!`
          : `${round.a} × ${round.b} and ${round.b} × ${round.a} — both ${round.answer}!`);
        timers.later(() => ui.hideBigTotal(), 1500);
        ui.showConfirm('Next →');
        phase = 'next';
      }
    })();
  }

  function settleRotation() {
    const { C, R } = round;
    wall.rotation.z = 0;
    for (let c = 0; c < C; c++) {
      for (let r = 0; r < R; r++) {
        const b = round.blocks[c][r];
        if (!b) continue;
        b.position.copy(cellPos(r, C - 1 - c, R, C));
        setCapGrass(b, c === 0);
      }
    }
  }

  // ---------- input: tap / drag to place (ray-picked) ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const wallPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const _hit = new THREE.Vector3();

  function pointerToCell(clientX, clientY) {
    if (!round) return null;
    ndc.x = (clientX / window.innerWidth) * 2 - 1;
    ndc.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectPlane(wallPlane, _hit)) return null;
    const cf = (_hit.x - wall.position.x) / CELL + (round.C - 1) / 2;
    const rf = (_hit.y - wall.position.y) / CELL + (round.R - 1) / 2;
    if (cf < -0.5 || cf > round.C - 0.5 || rf < -0.5 || rf > round.R - 0.5) return null;
    return { c: Math.round(cf), r: Math.round(rf) };
  }
  function placeFromPointer(clientX, clientY) {
    if (phase !== 'building' || sensorsLive()) return;
    const cell = pointerToCell(clientX, clientY);
    if (cell) placeInCell(cell.c, cell.r);
  }
  function updateHover(clientX, clientY) {
    if (!round || phase !== 'building' || sensorsLive()) { highlight.visible = false; return; }
    const cell = pointerToCell(clientX, clientY);
    if (cell && !round.cells[cell.c][cell.r]) {
      const p = cellPos(cell.c, cell.r, round.C, round.R);
      highlight.position.set(p.x + wall.position.x, p.y + wall.position.y, 0);
      highlight.visible = true;
    } else highlight.visible = false;
  }

  let pointerDown = false;
  const onDown = (x, y) => { pointerDown = true; placeFromPointer(x, y); };
  const onMove = (x, y) => { updateHover(x, y); if (pointerDown) placeFromPointer(x, y); };
  const onUp = () => { pointerDown = false; };
  const input = createPointerInput(dom, { onDown, onMove, onUp });

  // ---------- input: tilt to pour ----------
  let dropAcc = 0;
  function updateTiltPour(dt) {
    if (!round || phase !== 'building' || !sensorsLive()) { spout.visible = false; return; }
    spout.visible = true;
    sensors.update();
    const c = Math.round(Math.max(0, Math.min(1, (sensors.x + 1) / 2)) * (round.C - 1));
    const target = cellPos(c, 0, round.C, round.R);
    spout.position.x += (target.x + wall.position.x - spout.position.x) * 0.25;
    spout.position.y = wall.position.y + (round.R * CELL) / 2 + 2.2;
    spout.position.z = 0;
    if (sensors.y > 0.16) {
      dropAcc += dt;
      while (dropAcc >= DROP_INTERVAL) { dropAcc -= DROP_INTERVAL; placeInColumn(c); }
    } else {
      dropAcc = Math.min(dropAcc, DROP_INTERVAL);
    }
  }

  // ---------- juice ----------
  function flashSpout(color) { flashCol = new THREE.Color(color); flashT = 0.25; }
  function celebrate() {
    for (let i = 0; i < 60; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.14, 0.14),
        new THREE.MeshBasicMaterial({ color: COLS[i % COLS.length] })
      );
      m.position.set(0, wallCenterYFor(round.R) + 1, 0);
      const a = (i / 60) * Math.PI * 2;
      m.userData.v = new THREE.Vector3(Math.cos(a) * (2 + i % 3), 6 + (i % 4), Math.sin(a) * (2 + i % 3));
      root.add(m);
      confetti.push({ mesh: m, life: 1.6 });
    }
  }

  // ---------- first-touch demo ----------
  const hintEl = ui.els.hint, fingerEl = ui.els.finger;
  let demoIdx = 0, demoT = 0;
  function startDemo() { hintEl.classList.remove('hidden'); demoIdx = 0; demoT = 0.7; }
  function dismissDemo() { hintEl.classList.add('hidden'); firstRound = false; }
  function demoUpdate(dt) {
    if (hintEl.classList.contains('hidden')) return;
    if (!round || phase !== 'building' || round.placed > 0) { dismissDemo(); return; }
    const n = Math.min(round.C, 3);
    const p = cellPos(demoIdx % n, 0, round.C, round.R);
    const s = engine.worldToScreen(p.x + wall.position.x, p.y + wall.position.y);
    fingerEl.style.left = `${s.x}px`; fingerEl.style.top = `${s.y}px`;
    demoT += dt;
    if (demoT > 0.85) { demoT = 0; demoIdx++; fingerEl.classList.remove('tap'); void fingerEl.offsetWidth; fingerEl.classList.add('tap'); }
  }

  // ---------- per-frame update (called by the engine loop via main) ----------
  function update(dt) {
    updateTiltPour(dt);
    demoUpdate(dt);
    updateMoldPulse();
    if (phase !== 'building') highlight.visible = false;

    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i];
      f.t += dt;
      const k = Math.min(1, f.t / DROP_TIME);
      f.mesh.position.y = f.fromY + (f.targetY - f.fromY) * easeOutBounce(k);
      if (k >= 1) {
        f.mesh.position.y = f.targetY;
        falling.splice(i, 1);
        landing.push({ mesh: f.mesh, t: 0 });
        dustPuff(f.mesh.position.x + wall.position.x, f.targetY + wall.position.y, 0.3);
        audio.thunk(f.targetY);
        // the island takes the weight: small, because a full wall is a lot of
        // blocks and they must not stack into an earthquake
        ctx.worldFeel.impulse(0.09, f.mesh.position.x + wall.position.x, 0);
      }
    }
    for (let i = landing.length - 1; i >= 0; i--) {
      const l = landing[i];
      l.t += dt;
      const k = Math.min(1, l.t / 0.15);
      const e = easeOutBack(k);
      l.mesh.scale.set(1.1 + (1 - 1.1) * e, 0.82 + (1 - 0.82) * e, 1.1 + (1 - 1.1) * e);
      if (k >= 1) { l.mesh.scale.set(1, 1, 1); landing.splice(i, 1); }
    }
    for (let i = dust.length - 1; i >= 0; i--) {
      const d = dust[i];
      d.life -= dt;
      d.mesh.position.addScaledVector(d.mesh.userData.v, dt);
      d.mesh.scale.multiplyScalar(1 + dt * 2.4);
      d.mesh.material.opacity = Math.max(0, (d.life / 0.4)) * 0.75;
      if (d.life <= 0) { root.remove(d.mesh); d.mesh.material.dispose(); dust.splice(i, 1); }
    }
    if (flashT > 0) {
      flashT -= dt;
      spout.material.emissive.copy(flashCol).multiplyScalar(Math.max(0, flashT * 3));
    } else {
      spout.material.emissive.setHex(0x332200);
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

  // ---------- buttons ----------
  const onConfirm = () => {
    if (phase === 'rotate') doRotate();
    else if (phase === 'next') newRound();
  };
  const onRecenter = () => {
    if (sensorsLive()) { sensors.recenter(); ui.showToast('Re-centered', 'good'); }
    else ui.showToast('Drag mode — no need', 'good');
  };

  // ---------- debug hooks for the headless smoke test ----------
  function installDebug() {
    window.__bb = () => ({
      placed: round?.placed, groupsDone: round?.groupsDone, phase,
      C: round?.C, R: round?.R, answer: round?.answer,
      op: round?.op, mode: round?.op,
      choices: ui.currentChoiceValues(),
      bolts: wallet.bolts,
    });
    window.__place = (c, r) => placeInCell(c, r);
    window.__cellXY = (c, r) => { const p = cellPos(c, r, round.C, round.R); return engine.worldToScreen(p.x + wall.position.x, p.y + wall.position.y); };
    window.__nextMode = (op) => { forcedOp = (op === 'div' || op === 'mul') ? op : null; }; // test: force next round's ×/÷
  }
  function clearDebug() {
    for (const k of ['__bb', '__place', '__cellXY', '__nextMode']) { try { delete window[k]; } catch (_) { window[k] = undefined; } }
  }

  // ---------- interface ----------
  function start(opts = {}) {
    input.attach();
    ui.els.btnConfirm.addEventListener('click', onConfirm);
    ui.els.btnRecenter.addEventListener('click', onRecenter);
    ui.els.btnRecenter.style.display = sensorsLive() ? '' : 'none';
    installDebug();
    bolt.setOxidation(mastery.overallProgress());
    newRound();
  }

  function teardown() {
    input.detach();
    ui.els.btnConfirm.removeEventListener('click', onConfirm);
    ui.els.btnRecenter.removeEventListener('click', onRecenter);
    clearDebug();
    timers.clearAll(); // no pending reveal/count-up may outlive the game
    clearWall();
    scene.remove(root);
    root.traverse((o) => {
      if (o.geometry && !sharedGeos.has(o.geometry)) o.geometry.dispose?.();
      const mm = o.material;
      if (Array.isArray(mm)) mm.forEach((x) => x.dispose?.());
      else mm?.dispose?.();
    });
    blocks.dispose(); slotGeo.dispose();
    engine.resetCamera();
    round = null; phase = 'idle';
  }

  return { id: 'block-builder', title: 'Block Builder', start, update, teardown };
}
