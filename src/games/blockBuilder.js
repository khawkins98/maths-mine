// games/blockBuilder.js — the Block Builder mini-game, implemented against the
// shared game-module interface (see src/games/README.md).
//
//   createGame(ctx) -> { id, title, start(opts), update(dt), teardown() }
//
// Two modes on the same block/array/tap-to-place engine:
//   • MULTIPLICATION (×): build a cols×rows array, skip-count each completed
//     column (a "group of rows"), then ANSWER the hidden total, then ROTATE the
//     wall 90° to feel a×b = b×a.
//   • DIVISION (÷): start with the dividend visible, then take away one
//     divisor-sized column per tap. The number of columns is the quotient.
//     There is no false commutativity rotate; the ×/÷ fact family is shown.
//
// The game owns a single root group added to the scene and fully tears it down.
// Bolt, audio, speech, ui, textures, camera and the mastery ledger are shared
// via ctx.

import * as THREE from 'three';
import { createTimers } from '../core/timers.js';
import { createPointerInput } from '../core/pointer.js';
import { buildChoiceSet } from '../core/choices.js';
import { easeOutBack, easeOutBounce, easeOutCubic } from '../core/ease.js';
import { createBlockKit, CELL, BLOCK, CAP_H, BODY_H } from '../core/blocks.js';
import { getBlueprint } from './blueprints.js';

const DROP_TIME = 0.25;        // seconds for the drop-and-bounce of a placed block
const DIV_SPLIT_TIME = 0.55;   // seconds to separate the equal groups on reveal
const COLS = [0xff6b6b, 0xffd24a, 0x58e08a, 0x6ad2ff, 0xb98bff, 0xff9f5a, 0x7ef0d0, 0xf78fb3]; // confetti
const SLOT_IDLE_OPACITY = 0.34;
const SLOT_GUIDED_OPACITY = 0.52;



export function createBlockBuilder(ctx) {
  const { scene, camera, engine, textures, audio, speech, ui, bolt, mastery, wallet } = ctx;
  const { dirtTex, grassTex, slotTex, puffTex } = textures;
  const speak = speech.speak, eqWords = speech.eqWords, pickPhrase = speech.pickPhrase;
  const nowT = engine.nowT;
  const dom = ctx.renderer.domElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // 3/4 iso view direction lives in the engine
  const VIEW_DIR = engine.VIEW_DIR;

  // ---- shared block geometry (rounded dirt body + grass "lip" cap) ----
  const activeBiome = engine.currentBiome ? engine.currentBiome() : null;
  const bodyTex = activeBiome && activeBiome.blockBodyKey ? textures[activeBiome.blockBodyKey] : textures.dirtTex;
  const capTex = activeBiome && activeBiome.blockCapKey ? textures[activeBiome.blockCapKey] : textures.grassTex;
  const blocks = createBlockKit(ctx.textures, { body: bodyTex, cap: capTex });
  const { makeBlock, setCapGrass } = blocks;
  const slotFrameGeo = new THREE.PlaneGeometry(CELL * 0.96, CELL * 0.96);
  const slotFillGeo = new THREE.PlaneGeometry(CELL * 0.82, CELL * 0.82);
  const sharedGeos = new Set([...blocks.sharedGeos, slotFrameGeo, slotFillGeo]);

  // ---- the game's own scene subtree ----
  const root = new THREE.Group();
  scene.add(root);

  let wall = new THREE.Group();
  root.add(wall);

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
  const disposedRoundKits = new WeakSet();
  let roundKitsCreated = 0, roundKitsDisposed = 0;
  let phase = 'idle';    // 'building' | 'removing' | 'asking' | proof/reveal phases
  let firstRound = true;
  let moldGroup = null, pulsedTile = null;
  let forcedOp = null;   // test hook: force the next round's operation
  let forcedDimensions = null; // explicit debug/QA round; normal production flow leaves this null
  let spinRAF = 0;    // the commutativity rotate's own animation frame
  let divSplit = null; // the division reveal, advanced by update(dt)


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
    const setGrass = (round && round.blockKit && round.blockKit.setCapGrass) || setCapGrass;
    for (let r = 0; r < round.R; r++) {
      const b = round.blocks[c][r];
      if (b) setGrass(b, r === maxR);
    }
  }

  function clearWall() {
    const ownedRoundKit = round?.blockKit;
    const ownedRoundGeos = ownedRoundKit?.sharedGeos;
    root.remove(wall);
    wall.traverse((o) => {
      if (o.geometry && !sharedGeos.has(o.geometry) && !ownedRoundGeos?.has(o.geometry)) o.geometry.dispose?.();
      const mm = o.material;
      if (Array.isArray(mm)) mm.forEach((x) => x.dispose?.());
      else mm?.dispose?.(); // shared textures are NOT disposed by material.dispose
    });
    if (ownedRoundKit && !disposedRoundKits.has(ownedRoundKit)) {
      ownedRoundKit.dispose();
      disposedRoundKits.add(ownedRoundKit);
      roundKitsDisposed++;
    }
    wall = new THREE.Group();
    root.add(wall);
    falling.length = 0;
    landing.length = 0;
    divSplit = null;
    moldGroup = null;
  }

  function buildMold(C, R) {
    const g = new THREE.Group();
    const tiles = Array.from({ length: C }, () => new Array(R).fill(null));
    for (let c = 0; c < C; c++) {
      for (let r = 0; r < R; r++) {
        // Two-tone silhouette stays legible on both snow/endstone and the
        // darkest Nether/End surfaces. The textured centre is deliberately
        // restrained: an empty blueprint cell, never a placed block.
        const tile = new THREE.Group();
        const frame = new THREE.Mesh(
          slotFrameGeo,
          new THREE.MeshBasicMaterial({ color: 0x17130d, transparent: true, opacity: 0.82, depthWrite: false })
        );
        const fill = new THREE.Mesh(
          slotFillGeo,
          new THREE.MeshBasicMaterial({ map: slotTex, color: 0xfff0b5, transparent: true, opacity: SLOT_IDLE_OPACITY, depthWrite: false })
        );
        frame.position.z = 0;
        fill.position.z = 0.012;
        frame.renderOrder = 1;
        fill.renderOrder = 2;
        tile.add(frame, fill);
        tile.userData.frame = frame;
        tile.userData.fill = fill;
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
    if (pulsedTile) { pulsedTile.userData.fill.material.opacity = SLOT_IDLE_OPACITY; pulsedTile = null; }
    if (!round || phase !== 'building' || !moldGroup) return;
    for (let c = 0; c < round.C; c++) {
      const r = round.cells[c].indexOf(false);
      if (r !== -1) {
        pulsedTile = moldGroup.userData.tiles[c][r];
        pulsedTile.userData.fill.material.opacity = reducedMotion.matches
          ? SLOT_GUIDED_OPACITY
          : 0.48 + 0.14 * Math.sin(nowT() * 3);
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
    let q = mastery.nextQuestion(forcedOp ? { op: forcedOp } : {});
    if (forcedDimensions) {
      const { C, R, op } = forcedDimensions;
      q = op === 'div'
        ? { op, a: C, b: R, dividend: C * R, divisor: R, quotient: C }
        : { op: 'mul', a: C, b: R };
      forcedDimensions = null;
    }
    mastery.beginQuestion(q);
    forcedOp = null;
    clearWall();

    let C, R, groupAxis, groupsTotal, groupSize, answer, factA, factB;
    if (q.op === 'div') {
      // Take divisor-sized stacks from `dividend` → answer = stack count.
      C = q.quotient; R = q.divisor;            // C groups (columns) × R blocks per group
      groupAxis = 'col';                        // every column is one divisor-sized group
      groupsTotal = C; groupSize = R;
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

    const bp = getBlueprint(C, R);
    const roundBody = textures[bp.materialKey] || bodyTex;
    const roundCap = textures[bp.capKey] || capTex;
    const roundBlockKit = createBlockKit(textures, { body: roundBody, cap: roundCap });
    roundKitsCreated++;

    round = {
      op: q.op, a: factA, b: factB, C, R, answer,
      dividend: q.dividend, divisor: q.divisor, quotient: q.quotient,
      groupAxis, groupsTotal, groupSize, blocksTotal: C * R,
      cells: Array.from({ length: C }, () => new Array(R).fill(false)),
      blocks: Array.from({ length: C }, () => new Array(R).fill(null)),
      placed: 0, groupsDone: 0, removedGroups: 0, askT: 0, answered: false,
      assisted: false, retryMistakes: 0,
      blueprint: bp,
      blockKit: roundBlockKit,
      visualC: C, visualR: R,
    };
    buildMold(C, R);
    frameCamera(C, R);

    // reset UI
    ui.hideConfirm();
    ui.setClaim(null);
    ui.hideBigTotal();
    ui.setAskEq(questionText());
    round.askT = nowT();
    buildChoices();

    if (q.op === 'div') {
      phase = 'removing';
      // Division begins with the whole dividend. Columns are concrete
      // divisor-sized chunks, so one tap always takes away exactly divisor
      // blocks and repeated subtraction leaves the quotient visible as steps.
      for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) addBlock(c, r, false);
      moldGroup.visible = false;
      updateTally();
      ui.setStatus('Tap a stack to take it away');
      bolt.say(`Start with ${q.dividend} blocks. Take away ${q.divisor} at a time!`, '');
      speak(`Start with ${q.dividend} blocks. Take away ${q.divisor} at a time.`);
    } else {
      phase = 'building';
      updateTally();
      ui.setStatus('');
      bolt.say(`${bp.icon} Blueprint: ${bp.name} (${q.a} × ${q.b})!`, '');
      speak(`Let's construct the ${bp.name}: ${q.a} groups of ${q.b}.`);
    }

    if (firstRound) startDemo();
  }

  function addBlock(c, r, animate = true) {
    if (c < 0 || c >= round.C || r < 0 || r >= round.R) return false;
    const col = round.cells[c];
    if (col[r]) return false;
    col[r] = true;
    round.placed++;
    const mesh = (round.blockKit && round.blockKit.makeBlock) ? round.blockKit.makeBlock() : makeBlock();
    round.blocks[c][r] = mesh;
    const target = cellPos(c, r, round.C, round.R);
    const fromY = (round.R * CELL) / 2 + 1.8;
    mesh.position.set(target.x, animate ? fromY : target.y, target.z);
    wall.add(mesh);
    if (animate) falling.push({ mesh, fromY, targetY: target.y, t: 0 });
    updateColumnGrass(c);

    return true;
  }

  function placeInCell(c, r) {
    if (!round) return false;
    if (phase === 'removing') return removeDivisorGroup(c);
    if (phase !== 'building' || !addBlock(c, r)) return false;

    if (firstRound && round.placed === 1) dismissDemo();
    if (groupJustCompleted(c, r)) onGroupComplete();
    else updateTally();
    return true;
  }

  function removeDivisorGroup(c) {
    if (!round || round.op !== 'div' || phase !== 'removing') return false;
    if (c < 0 || c >= round.C || !round.cells[c].some(Boolean)) return false;
    let removed = 0;
    for (let r = 0; r < round.R; r++) {
      if (!round.cells[c][r]) continue;
      round.cells[c][r] = false;
      round.blocks[c][r].visible = false;
      removed++;
    }
    round.placed -= removed;
    round.removedGroups++;
    audio.groupChime(round.removedGroups);
    updateTally();
    speak(`${removed} blocks taken away. ${round.placed} block${round.placed === 1 ? '' : 's'} left.`);
    if (round.placed === 0) onBuilt();
    return removed === round.divisor;
  }

  // Did placing at (c,r) complete this cell's group (a column for ×, a row for ÷)?
  function groupJustCompleted(c, r) {
    if (round.groupAxis === 'row') {
      for (let cc = 0; cc < round.C; cc++) if (!round.cells[cc][r]) return false;
      return true;
    }
    return round.cells[c].every(Boolean);
  }

  // What the wall actually holds right now, independent of the order it was
  // filled in. Kept as a geometry-state helper for future proof narration.
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

  // Persistent, literal visual cheat sheet: always name exactly how many blocks
  // are currently visible. It remains stable through answering and proof.
  function updateTally() {
    if (!round) return;
    const n = round.placed;
    ui.setTally(`${n} block${n === 1 ? '' : 's'}`);
  }

  function onGroupComplete() {
    round.groupsDone++;
    if (round.groupsDone >= round.groupsTotal) return onBuilt();
    const g = round.groupsDone;
    audio.groupChime(g);
    if (round.op !== 'div') {
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
    updateTally();
    if (moldGroup) moldGroup.visible = false;
    round.askT = nowT();
    if (round.op === 'div') {
      // title card stays the mode name; the big askeq sign is the question's home
      ui.setStatus(`How many groups of ${round.divisor}?`);
      ui.setAskEq(`${round.dividend} ÷ ${round.divisor} = ?`);
      bolt.say(`How many groups of ${round.divisor}?`, 'wow');
      speak(`How many groups of ${round.divisor} can you take from ${round.dividend}?`);
    } else {
      ui.setStatus('How many blocks altogether?');
      ui.setAskEq(`${round.a} × ${round.b} = ?`);
      bolt.say('How many?!', 'wow');
      speak(pickPhrase([`How many altogether? ${eqWords(round.a, round.b)}?`, `So, ${eqWords(round.a, round.b)}?`, `How many blocks did you build?`]));
    }
  }

  function buildChoices() {
    // step = the natural near-miss: a whole group for x, one-per-group for a
    // division fact. core/choices.js owns the ordering so no position leaks.
    const step = round.op === 'div' ? 1 : round.groupSize;
    ui.showChoices(buildChoiceSet(round.answer, step), answerChosen);
  }

  function questionText() {
    return round.op === 'div'
      ? `${round.dividend} ÷ ${round.divisor} = ?`
      : `${round.a} × ${round.b} = ?`;
  }

  function resolvedText() {
    return round.op === 'div'
      ? `${round.dividend} ÷ ${round.divisor} = ${round.answer}`
      : `${round.a} × ${round.b} = ${round.answer}`;
  }

  function beginAssistedRetry() {
    if (!round || !round.assisted) return;
    phase = 'retrying';
    round.answered = false;
    round.askT = nowT();
    ui.setAskEq(questionText());
    ui.setStatus(round.op === 'div'
      ? `Now you try — how many groups of ${round.divisor}?`
      : 'Now you try — how many altogether?');
    bolt.say('Your turn!', 'happy');
    speak(round.op === 'div'
      ? `Now you try. How many groups of ${round.divisor}?`
      : 'Now you try. How many altogether?');
    buildChoices();
  }

  function teachThenRetry(eqStr, retrying) {
    phase = 'revealing';
    ui.lockChoices();
    if (retrying) {
      round.retryMistakes++;
      bolt.say("Let's look once more!", '');
      ui.setStatus(round.op === 'div' ? `Let’s count groups of ${round.divisor} once more…` : 'Let’s count the groups once more…');
      speak("Let's look once more, then you can try again.");
    } else {
      bolt.say("Let's count them!", '');
      ui.setStatus(round.op === 'div' ? `Let’s count groups of ${round.divisor}…` : 'Let’s count the groups together…');
      speak("Let's count them together.");
    }
    countReveal(() => {
      const right = ui.choiceButtons().find((c) => Number(c.textContent) === round.answer);
      if (right) right.classList.add('right');
      ui.setAskEq(eqStr);
      ui.popAskEq();
      if (round.op === 'div') {
        ui.setStatus(`${round.answer} groups of ${round.divisor}. Now you try!`);
        speak(`${round.dividend} makes ${round.answer} groups of ${round.divisor}. Now you try it!`);
        bolt.say(`It's ${round.answer} groups!`, '');
      } else {
        ui.setStatus(`${round.a} × ${round.b} = ${round.answer}. Now you try!`);
        speak(`${eqWords(round.a, round.b, round.answer)}. Now you try it!`);
        bolt.say(`It's ${round.answer}!`, '');
      }
      timers.later(() => ui.fadeChoices(), 700);
      timers.later(beginAssistedRetry, 1100);
    });
  }

  function answerChosen(val, btn) {
    const retrying = phase === 'retrying';
    const independentlyAnswerable = phase === 'building' || phase === 'removing' || phase === 'asking';
    if ((!independentlyAnswerable && !retrying) || round.answered) return;
    round.answered = true;
    const correct = val === round.answer;
    const ms = (nowT() - round.askT) * 1000;
    const referenced = !retrying && Boolean(mastery.isCurrentQuestionVoided?.(round.a, round.b));
    if (referenced) round.assisted = true;
    ui.lockChoices();

    if (!retrying) {
      mastery.record(round.a, round.b, correct, ms);
      // Once the child's independent answer has been scored, reference use is
      // no longer part of this live question and must not roll the attempt back.
      mastery.endQuestion();
      bolt.setOxidation(mastery.overallProgress()); // weather Bolt as mastery grows
      if (ctx.engine.updateBiomeFromProgress) ctx.engine.updateBiomeFromProgress(mastery.overallProgress());
    }

    const eqStr = resolvedText();

    if (correct) {
      // A direct answer can arrive before construction has started or finished.
      // Resolve the concrete model before celebrating or offering rotation.
      prepareProofWall();
      btn.classList.add('right');
      updateTally();
      // the resolved equation sign is the hero (with a brief '?'→answer pop). No
      // floating number competes with it at this confirm moment.
      ui.setAskEq(eqStr);
      ui.popAskEq();

      const bp = round.blueprint;
      const reward = (bp && bp.bonusBolts) ? bp.bonusBolts : round.blocksTotal;
      audio.chordSound();
      celebrate();
      if (bp && bp.activationVFX) spawnBlueprintVFX(bp.activationVFX);

      if (retrying || referenced) {
        ui.showToast(referenced ? 'Reference used — practice complete' : 'You used the proof!', 'good');
      } else if (bp) {
        wallet.add(reward);
        ui.showToast(`✨ ${bp.icon} ${bp.name} Complete! +${reward} 🔩`, 'good');
      } else {
        wallet.add(reward);
        ui.showToast(`+${reward} 🔩`, 'good');
      }

      if (round.op === 'div') {
        ui.setStatus(retrying || referenced
          ? `You used help: ${round.answer} groups of ${round.divisor}.`
          : `Yes! ${round.answer} groups of ${round.divisor} make ${round.dividend}.`);
        bolt.say(retrying || referenced ? `You got it — ${round.answer} groups!` : `YES! +${reward} bolts!`, 'happy');
        speak(retrying || referenced
          ? `You used help. ${round.answer} groups of ${round.divisor} make ${round.dividend}.`
          : `That's right! ${round.answer} groups of ${round.divisor} make ${round.dividend}.`);
      } else {
        ui.setStatus(retrying || referenced
          ? `${referenced ? 'Reference used:' : 'You used the proof!'} ${round.a} × ${round.b} = ${round.answer}.`
          : `Yes! ${round.a} × ${round.b} = ${round.answer}.`);
        bolt.say(retrying || referenced ? `You got it — ${round.answer}!` : (bp ? `${bp.icon} ${bp.name} built! +${reward} 🔩!` : `YES! +${reward} bolts!`), 'happy');
        speak(retrying || referenced
          ? `${referenced ? 'You used the reference' : 'You used the proof'}. ${eqWords(round.a, round.b, round.answer)}!`
          : pickPhrase([`That's right! ${eqWords(round.a, round.b, round.answer)}!`, `Yes! ${eqWords(round.a, round.b, round.answer)}!`, `You got it — ${round.answer}!`, `Nice work! ${round.answer} blocks!`]));
      }
      timers.later(() => ui.fadeChoices(), 600);
      timers.later(() => finishRound(), 1000);
    } else {
      btn.classList.add('wrong');
      audio.buzzSound();
      round.assisted = true;
      teachThenRetry(eqStr, retrying);
    }
  }

  // Concrete proof animation on a wrong answer, revealing the truth.
  function countReveal(done) {
    prepareProofWall();
    let g = 0;
    const step = () => {
      g++;
      audio.groupChime(g);
      if (g < round.groupsTotal) timers.later(step, 260);
      else timers.later(done, 500);
    };
    timers.later(step, 200);
  }

  function prepareProofWall() {
    if (!round) return;
    for (let c = 0; c < round.C; c++) for (let r = 0; r < round.R; r++) {
      if (!round.blocks[c][r]) addBlock(c, r, false);
      round.cells[c][r] = true;
      round.blocks[c][r].visible = true;
    }
    round.placed = round.blocksTotal;
    if (moldGroup) moldGroup.visible = false;
    updateTally();
  }

  // × rounds rotate to feel commutativity; ÷ rounds show the ×/÷ fact family.
  function finishRound() {
    if (round.op === 'div') goToDivReveal();
    else goToRotate();
  }

  function goToDivReveal() {
    phase = 'dividing';
    prepareProofWall();
    // Keep the repeated-subtraction model: quotient columns, each containing
    // exactly divisor blocks. Separate those columns without changing meaning.
    bolt.say(`${round.answer} groups of ${round.divisor} make ${round.dividend}!`, 'wow');
    speak(`${round.answer} groups of ${round.divisor} make ${round.dividend}.`);
    ui.setStatus(`${round.answer} groups · ${round.divisor} in each group`);
    updateTally();

    // A fixed gap clips large arrays, so cap the total added width while
    // keeping two- and three-group examples especially easy to distinguish.
    const gap = round.C > 1
      ? Math.min(CELL * 0.42, (CELL * 1.8) / (round.C - 1))
      : 0;
    const blocksToMove = [];
    for (let c = 0; c < round.C; c++) {
      for (let r = 0; r < round.R; r++) {
        const block = round.blocks[c][r];
        if (!block) continue;
        round.blockKit.setCapGrass(block, true);
        blocksToMove.push({
          block,
          fromX: block.position.x,
          toX: cellPos(c, r, round.C, round.R).x + (c - (round.C - 1) / 2) * gap,
        });
      }
    }
    round.divisionGap = gap;
    divSplit = { elapsed: 0, blocks: blocksToMove };
  }

  function updateDivSplit(dt) {
    if (!divSplit || !round || phase !== 'dividing') return;
    divSplit.elapsed += dt;
    const k = Math.min(1, divSplit.elapsed / DIV_SPLIT_TIME);
    const eased = easeOutCubic(k);
    for (const { block, fromX, toX } of divSplit.blocks) {
      block.position.x = fromX + (toX - fromX) * eased;
    }
    if (k < 1) return;
    divSplit = null;
    phase = 'next';
    ui.showConfirm('Next →');
  }

  function goToRotate() {
    phase = 'rotate';
    ui.showConfirm('Rotate 🔄');
  }

  function doRotate() {
    phase = 'rotating';
    cancelAnimationFrame(spinRAF);
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
    updateTally();
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
      // This animates on its own rAF chain rather than through update(dt), so
      // nothing stops it when the game goes away: it kept driving the camera
      // over the hub and then threw destructuring a null round.
      if (!round || phase !== 'rotating') { spinRAF = 0; return; }
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
      if (k < 1) spinRAF = requestAnimationFrame(spin);
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
        round.blockKit.setCapGrass(b, c === 0);
      }
    }
    round.visualC = R;
    round.visualR = C;
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
    if (phase !== 'building' && phase !== 'removing') return;
    const cell = pointerToCell(clientX, clientY);
    if (cell) placeInCell(cell.c, cell.r);
  }
  function updateHover(clientX, clientY) {
    if (!round || (phase !== 'building' && phase !== 'removing')) { highlight.visible = false; return; }
    const cell = pointerToCell(clientX, clientY);
    const targetAvailable = cell && (phase === 'removing'
      ? round.cells[cell.c].some(Boolean)
      : !round.cells[cell.c][cell.r]);
    if (targetAvailable) {
      const p = phase === 'removing'
        ? cellPos(cell.c, (round.R - 1) / 2, round.C, round.R)
        : cellPos(cell.c, cell.r, round.C, round.R);
      highlight.position.set(p.x + wall.position.x, p.y + wall.position.y, 0);
      highlight.scale.set(1, phase === 'removing' ? round.R : 1, 1);
      highlight.visible = true;
    } else {
      highlight.visible = false;
      highlight.scale.set(1, 1, 1);
    }
  }

  let pointerDown = false;
  const onDown = (x, y) => { pointerDown = true; placeFromPointer(x, y); };
  const onMove = (x, y) => { updateHover(x, y); if (pointerDown) placeFromPointer(x, y); };
  const onUp = () => { pointerDown = false; };
  const input = createPointerInput(dom, { onDown, onMove, onUp });

  // ---------- juice ----------
  function spawnBlueprintVFX(vfxType) {
    if (!round) return;
    const vfxColors = {
      portal: [0x9e2ecf, 0x5a0db8, 0xd47aff, 0x2e0059],
      beacon: [0x4dedf4, 0x6ff7fc, 0xffffff, 0x22c2c9],
      fire: [0xff4400, 0xffaa00, 0xff2200, 0xffdd44],
      torches: [0xff9900, 0xffdd44, 0xff5500],
      redstone: [0xff1111, 0xcc0000, 0xff6666],
      wheat: [0xecd429, 0xc4a835, 0x55aa22],
      emerald: [0x2fbf6d, 0x41d47f, 0x77f0ad],
      sand: [0xd8c582, 0xc9b072, 0xefdfaa],
      sparkle: [0xffe600, 0xffffff, 0xffaa00],
    };
    const pal = vfxColors[vfxType] || vfxColors.sparkle;
    for (let i = 0; i < 45; i++) {
      const s = 0.16 + Math.random() * 0.16;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(s, s, s),
        new THREE.MeshBasicMaterial({ color: pal[i % pal.length] })
      );
      const px = (Math.random() - 0.5) * (round.C * CELL);
      const py = wallCenterYFor(round.R) + (Math.random() - 0.5) * (round.R * CELL * 0.6);
      m.position.set(px, py, 0.4);
      const speed = 2.5 + Math.random() * 3.5;
      const angle = Math.random() * Math.PI * 2;
      m.userData.v = new THREE.Vector3(Math.cos(angle) * speed, 3.5 + Math.random() * 4.5, Math.sin(angle) * speed);
      root.add(m);
      confetti.push({ mesh: m, life: 1.8 });
    }
  }

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
    demoUpdate(dt);
    updateMoldPulse();
    updateDivSplit(dt);
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

  // ---------- debug hooks for the headless smoke test ----------
  function installDebug() {
    window.__bb = () => {
      const firstBlock = round?.blocks.flat().find(Boolean);
      const bodyMap = firstBlock?.children[0]?.material?.map;
      const capMap = firstBlock?.children[1]?.material?.map;
      return ({
        placed: round?.placed, groupsDone: round?.groupsDone, phase,
        removedGroups: round?.removedGroups,
        C: round?.C, R: round?.R, answer: round?.answer,
        blocksTotal: round?.blocksTotal,
        a: round?.a, b: round?.b,
        dividend: round?.dividend, divisor: round?.divisor, quotient: round?.quotient,
        visualC: round?.visualC, visualR: round?.visualR,
        op: round?.op, mode: round?.op,
        divisionGap: round?.divisionGap || 0,
        rowYs: round?.op === 'div' && round.blocks[0]
          ? round.blocks[0].map((block) => block?.position.y)
          : [],
        colXs: round?.op === 'div'
          ? round.blocks.map((column) => column[0]?.position.x)
          : [],
        choices: ui.currentChoiceValues(),
        tally: ui.els.tally.textContent,
        visibleBlocks: round?.blocks.flat().filter((block) => block?.visible).length || 0,
        bolts: wallet.bolts,
        assisted: round?.assisted || false,
        retryMistakes: round?.retryMistakes || 0,
        targetStyle: moldGroup ? {
          frameOpacity: moldGroup.userData.tiles[0][0].userData.frame.material.opacity,
          fillOpacity: moldGroup.userData.tiles[0][0].userData.fill.material.opacity,
          frameColor: moldGroup.userData.tiles[0][0].userData.frame.material.color.getHexString(),
          fillColor: moldGroup.userData.tiles[0][0].userData.fill.material.color.getHexString(),
        } : null,
        materialIdentity: round?.blockKit ? {
          blueprintMaterialKey: round.blueprint?.materialKey,
          blueprintCapKey: round.blueprint?.capKey,
          renderedBodyMap: bodyMap?.uuid || null,
          renderedCapMap: capMap?.uuid || null,
          expectedBodyMap: textures[round.blueprint?.materialKey]?.uuid || null,
          expectedCapMap: textures[round.blueprint?.capKey]?.uuid || null,
          dirtMap: textures.dirtTex.uuid,
          renderedBodyMaps: round.blocks.flat().filter(Boolean).map((block) => block.children[0].material.map?.uuid || null),
          renderedCapMaps: round.blocks.flat().filter(Boolean).map((block) => block.children[1].material.map?.uuid || null),
        } : null,
        roundKitLifecycle: { created: roundKitsCreated, disposed: roundKitsDisposed },
      });
    };
    window.__place = (c, r) => placeInCell(c, r);
    window.__cellXY = (c, r) => { const p = cellPos(c, r, round.C, round.R); return engine.worldToScreen(p.x + wall.position.x, p.y + wall.position.y); };
    window.__nextMode = (op) => { forcedOp = (op === 'div' || op === 'mul') ? op : null; }; // test: force next round's ×/÷
    window.__bbForceRound = (C, R, op = 'mul') => {
      const cols = Math.max(2, Math.min(10, Math.round(C)));
      const rows = Math.max(2, Math.min(6, Math.round(R)));
      mastery.endQuestion();
      forcedDimensions = { C: cols, R: rows, op: op === 'div' ? 'div' : 'mul' };
      newRound();
      return window.__bb();
    };
  }
  function clearDebug() {
    for (const k of ['__bb', '__place', '__cellXY', '__nextMode', '__bbForceRound']) { try { delete window[k]; } catch (_) { window[k] = undefined; } }
  }

  // ---------- interface ----------
  function start(opts = {}) {
    input.attach();
    ui.els.btnConfirm.addEventListener('click', onConfirm);
    installDebug();
    bolt.setOxidation(mastery.overallProgress());
    newRound();
  }

  function teardown() {
    cancelAnimationFrame(spinRAF); spinRAF = 0;
    dismissDemo();  // the first-touch hint is outside the HUD, so hideGameHud misses it
    speech.reset(); // a child leaving must not hear the old round finish
    input.detach();
    ui.els.btnConfirm.removeEventListener('click', onConfirm);
    clearDebug();
    timers.clearAll(); // no pending reveal/count-up may outlive the game
    mastery.endQuestion();
    clearWall();
    scene.remove(root);
    root.traverse((o) => {
      if (o.geometry && !sharedGeos.has(o.geometry)) o.geometry.dispose?.();
      const mm = o.material;
      if (Array.isArray(mm)) mm.forEach((x) => x.dispose?.());
      else mm?.dispose?.();
    });
    blocks.dispose(); slotFrameGeo.dispose(); slotFillGeo.dispose();
    engine.resetCamera();
    round = null; phase = 'idle';
  }

  return { id: 'block-builder', title: 'Block Builder', start, update, teardown };
}
