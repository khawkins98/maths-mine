// TIER 2 — IMPOSTER (advanced).
//
// A crew of Nuggets, a sign each, one of them fibbing. The child taps the wrong
// sign to bounce that villager off the island; the survivors cheer. Unlocks once
// the child is fluent enough that checking several facts at once isn't
// overwhelming.
//
// Accusing an innocent is not punished — that Nugget just proves itself with a
// little green array and the hunt continues. Only the imposter's fact is
// recorded as a win; a wrong accusation records the innocent's fact as missed,
// which is what nudges the ledger toward the facts the child is guessing at.
//
// Two things grow with the child rather than with a schedule:
//   • CREW SIZE — three villagers, four once six facts are strong. The cap is a
//     legibility one; the reasoning lives with CREW_MAX in constants.js.
//   • THE OPERATION — a round is all × or all ÷, never mixed. Mixed operators
//     turn "which of these is wrong?" into "which of these am I even reading?",
//     and the fib has to be the hard part.
//
// INSPECTION. A child can drag a finger across the crew and each villager they
// pass leans out, rings up and holds its sign closer, with its claim echoed in
// the tally line; nothing is committed until the finger LIFTS. That makes it
// safe to browse four signs, which four signs need. It is strictly an
// enhancement: a plain tap is a press and a release in one place, so it still
// inspects-then-commits exactly as it always did.

import * as THREE from 'three';

import { BASE_Y, SIGN_Y, GOOD_GREEN, VIEW, CREW_MAX, crewLayout } from './constants.js';

export function createImposterTier(ctx, stage, facts) {
  const { camera, engine, audio, speech, ui, bolt, mastery } = ctx;
  const speak = speech.speak, eqWords = speech.eqWords, divWords = speech.divWords;
  const pickPhrase = speech.pickPhrase;
  const nowT = engine.nowT;
  const { later, state } = stage;

  let crew = [];
  let layout = crewLayout(3);
  let imposterIndex = 0;
  let roundNo = 0;
  let hovered = -1;
  let inspecting = -1; // seat currently under a held finger, -1 when not scrubbing
  let accuseT = 0;
  let forcedSize = 0;  // debug: pin a crew size
  let forcedOp = null; // debug: pin × or ÷

  function frameImposter() {
    // Distance comes from the layout now, because it is a function of how many
    // signs have to fit across the frame — see CREW_FIT.
    engine.placeCamera(1.75, layout.dist, VIEW);
    // In FRONT of the crew rather than beside them. The villagers span the full
    // width of the frame, so on an upright tablet there is no room at either
    // side and the in-frame clamp shoved Bolt straight on top of the left-hand
    // one, hiding a villager the child has to be able to tap. There is plenty
    // of empty ground in front, at every aspect ratio. He stands off the same
    // proportion of the camera distance so a wider crew does not leave him
    // marooned in the foreground, dwarfing the villagers he is introducing.
    bolt.placeAt(-5.2, layout.dist * 0.23, 0.72);
  }

  // The claim as the child reads it, and as the ledger scores it. `a,b` stay
  // canonical throughout — for a share-out they are NOT the printed numbers.
  function makeClaims(n) {
    const useDiv = forcedOp === 'div' || (forcedOp !== 'mul' && roundNo % 2 === 0);
    const drawn = useDiv ? facts.drawDistinctDiv(n) : null;
    // drawDistinctDiv returns null unless the ledger has unlocked enough ÷
    // facts to fill every sign without repeating one. Falling back to × is the
    // whole gate: we never invent a division fact the child has not earned.
    return drawn || facts.drawDistinct(n);
  }

  function newRound() {
    speech.reset(); // a new round starts a new sentence, not a queue
    stage.clearRound();
    crew = [];
    hovered = -1; inspecting = -1;
    roundNo++;

    const size = forcedSize || facts.crewSize();
    layout = crewLayout(size);

    // The shakiest of the drawn facts becomes the fibber, so the sign the child
    // must scrutinise is the one they most need the practice on.
    const drawn = makeClaims(size).slice();
    mastery.beginQuestion(drawn);
    drawn.sort((f, g2) => facts.level(f.a, f.b) - facts.level(g2.a, g2.b));
    const impFact = drawn[0];
    const trueFacts = drawn.slice(1);

    // Was `roundNo % 3` - left, middle, right in fixed rotation, which a child
    // can follow without checking a single sum.
    imposterIndex = (Math.random() * size) | 0;

    let tIdx = 0;
    for (let seat = 0; seat < size; seat++) {
      const isImp = seat === imposterIndex;
      const f = isImp ? impFact : trueFacts[tIdx++];
      const isDiv = f.op === 'div';
      const truth = isDiv ? f.quotient : f.answer;
      const shown = isImp
        ? (isDiv ? facts.plausibleWrongQuotient(truth, roundNo + seat)
          : facts.plausibleWrong(f.a, f.b, roundNo + seat))
        : truth;
      const left = isDiv ? f.dividend : f.a;
      const right = isDiv ? f.divisor : f.b;

      // distinct varieties, rotating between rounds. Distinct matters: the
      // child has to hold "the one on the left said 12" in mind while checking
      // the others, and identical villagers make that harder than the maths it
      // is meant to be testing.
      const g = stage.makeNugget(roundNo + seat * 2);
      g.position.set(layout.x[seat], BASE_Y, layout.z[seat]);
      stage.crewGroup.add(g);

      // Emerald block array showing the true representation (cols × rows) positioned on outer sides of screen
      const cols = isDiv ? f.quotient : Math.max(f.a, f.b);
      const rows = isDiv ? f.divisor : Math.min(f.a, f.b);
      const gridGroup = new THREE.Group();
      const blockList = [];
      const cellSpacing = Math.min(0.48, 2.4 / Math.max(cols, 1));
      const blockScale = cellSpacing / 1.0;

      const rowGap = isDiv ? cellSpacing * 0.45 : 0;
      for (let r = 0; r < rows; r++) {
        for (let cCol = 0; cCol < cols; cCol++) {
          const blk = stage.makeBlock();
          const bx = (cCol - (cols - 1) / 2) * cellSpacing;
          const by = (r + 0.5) * cellSpacing + r * rowGap;
          const bz = 0;
          blk.position.set(bx, by, bz);
          blk.scale.setScalar(blockScale);
          stage.setCapGrass(blk, isDiv || r === rows - 1);
          gridGroup.add(blk);
          blockList.push(blk);
        }
      }
      // Outer left side for left seats, outer right side for right seats
      const sideOffset = (seat < size / 2) ? -2.4 : 2.4;
      gridGroup.position.set(layout.x[seat] + sideOffset, BASE_Y, layout.z[seat] - 0.3);
      stage.arrayGroup.add(gridGroup);

      const signMesh = new THREE.Mesh(stage.geo.sign, new THREE.MeshBasicMaterial({
        map: stage.makeSignTex(left, right, shown, { op: f.op }), transparent: true, side: THREE.DoubleSide,
      }));
      signMesh.position.set(layout.x[seat], SIGN_Y, layout.z[seat] + 0.35);
      signMesh.scale.setScalar(layout.signScale);
      stage.signGroup.add(signMesh);

      const hit = new THREE.Mesh(stage.geo.hit, new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0, depthWrite: false,
      }));
      hit.position.set(layout.x[seat], 1.4, layout.z[seat] + 0.15);
      hit.userData.index = seat;
      stage.root.add(hit);
      stage.hitboxes.push(hit);

      crew.push({
        op: f.op, a: f.a, b: f.b, answer: truth, shown, imposter: isImp,
        dividend: f.dividend, divisor: f.divisor,
        claimText: `${left} ${isDiv ? '÷' : '×'} ${right} = ${shown}`,
        truthText: `${left} ${isDiv ? '÷' : '×'} ${right} = ${truth}`,
        // what a share-out is worth in emeralds is the pile, not the group size
        reward: isDiv ? f.dividend : truth,
        seat, headIdx: seat, group: g, sign: signMesh, hit,
        blocks: blockList, gridGroup, cols, rows,
        joints: g.userData.joints,
        bob: Math.random() * Math.PI * 2,
        blinkIn: 2 + Math.random() * 3, blinkT: 0,
        cheerT: 0,
        signBaseY: SIGN_Y, signBaseScale: layout.signScale, sZoom: 1,
        groupBaseY: BASE_Y,
        ejecting: false, ev: new THREE.Vector3(), espin: 0,
        escale: 1, elean: 0, proven: false,
      });
    }

    state.phase = 'accusing';
    stage.ring.visible = false;
    accuseT = nowT();
    frameImposter();

    ui.hideConfirm();
    ui.hideChoices();
    ui.setAskEq(null);
    ui.setClaim(null);
    ui.hideBigTotal();
    ui.setTally('');
    ui.els.btnRecenter.style.display = 'none';
    ui.setStatus('Tap the sign that’s wrong.');
    bolt.say('One player is fibbing!', 'wow');
    speak(pickPhrase([
      'One player is fibbing! Tap their sign.',
      'Uh oh — one of these is a wrong’un. Which player is fibbing?',
      'One player has a mix-up! Tap their sign.',
    ]));
  }

  function words(n, ans) {
    return n.op === 'div' ? divWords(n.dividend, n.divisor, ans) : eqWords(n.a, n.b, ans);
  }

  function accuse(index) {
    if (state.phase !== 'accusing') return;
    if (index < 0 || index >= crew.length) return;
    const n = crew[index];
    const ms = (nowT() - accuseT) * 1000;

    if (n.imposter) {
      state.phase = 'ejecting';
      stage.ring.visible = false;
      mastery.record(n.a, n.b, true, ms);
      mastery.endQuestion();
      bolt.setOxidation(mastery.overallProgress());

      ejectNugget(n);
      shatterSign(n);
      stage.ejectSfx();
      for (const other of crew) if (other !== n && !other.imposter) other.cheerT = 1.3;

      ctx.wallet.add(n.reward);
      ui.showToast(`+${n.reward} 🔩`, 'good');
      // title card stays the mode name — never feedback.
      ui.setStatus(`That sign said ${n.claimText} — but it’s really ${n.answer}!`);
      bolt.say('Gotcha! That player was fibbing!', 'happy');
      speak(pickPhrase([
        `That’s right! ${words(n, n.answer)}, not ${n.shown}!`,
        `You spotted it! ${words(n)} is ${n.answer}, not ${n.shown}!`,
      ]));

      later(() => proveTruth(n, () => {
        stage.celebrate();
        audio.chordSound();
        ui.showBigTotal(n.answer);
        ui.pulseBigTotal();
        later(() => ui.hideBigTotal(), 1400);
        bolt.say(`${n.truthText}!`, 'happy');
        if (bolt.playWave) later(() => bolt.playWave(), 500);
        state.phase = 'done';
        ui.showConfirm('Next →');
      }), 650);
    } else {
      if (!n.proven) {
        n.proven = true;
        mastery.record(n.a, n.b, false, ms);
      }
      proveInnocent(n);
      ui.setStatus(`Yep, ${n.answer} — that one’s true! Keep looking…`);
      bolt.say('Not that one!', '');
      speak(pickPhrase([
        `Yep, ${n.answer} — I’m true! Keep looking.`,
        `${words(n, n.answer)}. That’s right! Try another.`,
        `Nope, ${n.answer} is correct. Keep looking!`,
      ]));
    }
  }

  function ejectNugget(n) {
    n.ejecting = true;
    n.hit.userData.index = -1;

    // Flash red first (Minecraft hit flash)
    n.group.traverse((child) => {
      if (child.isMesh && child.material && child.material.color) {
        if (!child.userData.origColor) {
          child.userData.origColor = child.material.color.getHex();
        }
        child.material.color.setHex(0xff2222);
      }
    });
    stage.damageSfx();

    // After red flash, GO POOF and SMOKE!
    later(() => {
      n.group.visible = false;
      stage.poofPuff(n.group.position.x, BASE_Y + 0.8, n.group.position.z);
      stage.poofSfx();
      ctx.worldFeel.impulse(0.75, n.group.position.x, n.group.position.z);
    }, 350);
  }

  function shatterSign(n) {
    n.sign.visible = false;
    const p = n.sign.position;
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(stage.geo.shard, stage.shardMat);
      m.position.set(p.x + (Math.random() - 0.5) * 0.8, p.y + (Math.random() - 0.5) * 0.7, p.z);
      m.rotation.z = Math.random() * Math.PI;
      m.scale.setScalar(0.5 + Math.random() * 0.7);
      stage.fxGroup.add(m);
      stage.shards.push({
        mesh: m,
        v: new THREE.Vector3((Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 2),
        spin: (Math.random() - 0.5) * 14,
        life: 0.9,
      });
    }
  }

  // The caught imposter's fact, proved with a little green array counted row by
  // row — the same "count it and see" move the judge tier ends on. A share-out
  // counts GROUPS rather than skip-counting to a total the sign already gave.
  function proveTruth(n, done) {
    const isDiv = n.op === 'div';
    const cols = n.cols || (isDiv ? n.answer : Math.max(n.a, n.b));
    const rows = n.rows || (isDiv ? n.divisor : Math.min(n.a, n.b));
    ui.setTally('');
    let r = 0;
    const step = () => {
      if (n.blocks) {
        for (let cCol = 0; cCol < cols; cCol++) {
          const blk = n.blocks[r * cols + cCol];
          if (blk) { blk.userData.pop = 0; stage.blockPops.push(blk); }
        }
      }
      audio.groupChime(r + 1);
      ui.setTally(isDiv
        ? `${r + 1} of ${rows} groups shared`
        : `${r + 1} × ${cols} = ${(r + 1) * cols}`);
      r++;
      if (r < rows) later(step, 300);
      else later(() => {
        ui.setTally(n.truthText);
        speak(`${words(n, n.answer)}.`);
        done && done();
      }, 420);
    };
    later(step, 200);
  }

  function proveInnocent(n) {
    n.flashT = 0.9;
    audio.groupChime(3);
    if (n.blocks) {
      for (const blk of n.blocks) {
        blk.userData.pop = 0;
        stage.blockPops.push(blk);
      }
    }
  }

  // ---------- raycast picking ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function pick(clientX, clientY) {
    ndc.x = (clientX / window.innerWidth) * 2 - 1;
    ndc.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(stage.hitboxes, false);
    for (const h of hits) { const i = h.object.userData.index; if (i >= 0) return i; }
    return -1;
  }

  // Where seat `i` is on screen. Only used by the headless test, which cannot
  // aim a finger at a WebGL canvas any other way.
  function seatScreenPos(i) {
    const n = crew[i];
    return n ? engine.projectToScreen(n.hit) : null;
  }

  function setHover(i) {
    hovered = i;
    if (state.phase === 'accusing' && i >= 0 && crew[i] && !crew[i].ejecting) {
      stage.ring.position.set(crew[i].group.position.x, 0.02, layout.z[i]);
      stage.ring.visible = true;
    } else {
      stage.ring.visible = false;
    }
  }

  // ---------- drag-scrub ----------
  //
  // Inspecting is deliberately louder than hovering: with four signs up, a
  // child needs to know WHICH one they are about to bounce before they let go.
  // So the held villager gets the ring, the lean, a sign zoom, a soft tick, and
  // its claim spelled out in the tally line.
  function inspect(i) {
    if (state.phase !== 'accusing') return;
    if (i === inspecting) return;
    inspecting = i;
    setHover(i);
    if (i >= 0 && crew[i]) {
      ui.setTally(crew[i].claimText);
      audio.beep(520, 0.05, 'sine', 0.035); // "you're on this one"
    } else {
      ui.setTally('');
    }
  }

  // Called when the finger lifts, BEFORE any accusation, so the stage is back
  // to rest whichever way the round goes.
  function endInspect() {
    inspecting = -1;
    setHover(-1);
    ui.setTally('');
  }

  function update(dt, t) {
    for (const n of crew) {
      if (n.ejecting) continue;
      const bob = Math.sin(t * 2 + n.bob) * 0.08;
      const lit = state.phase === 'accusing' && hovered === n.seat;
      const targetScale = lit ? 1.09 : 1;
      const targetLean = lit ? -0.12 : 0;
      // the sign leans in with its owner while a finger is holding them
      const targetZoom = (lit && inspecting === n.seat) ? 1.22 : 1;
      n.escale += (targetScale - n.escale) * Math.min(1, dt * 12);
      n.elean += (targetLean - n.elean) * Math.min(1, dt * 12);
      n.sZoom += (targetZoom - n.sZoom) * Math.min(1, dt * 12);
      n.group.position.y = n.groupBaseY + bob;
      n.group.rotation.set(n.elean, 0, 0);
      n.group.scale.setScalar(n.escale);
      n.sign.position.y = n.signBaseY + bob + (n.sZoom - 1) * 0.5;
      n.sign.scale.setScalar(n.signBaseScale * n.sZoom);

      const j = n.joints;
      const ph = t * 1.6 + n.bob;
      j.body.scale.set(1 - Math.sin(ph) * 0.01, 1 + Math.sin(ph) * 0.02, 1);
      j.neck.rotation.z = Math.sin(t * 0.8 + n.bob) * 0.05;
      j.neck.rotation.x = 0;
      let swayL = Math.sin(t * 1.3 + n.bob) * 0.06;
      let swayR = -Math.sin(t * 1.3 + n.bob) * 0.06;
      n.blinkT -= dt;
      if (n.blinkT <= 0) { n.blinkIn -= dt; if (n.blinkIn <= 0) { n.blinkT = 0.1; n.blinkIn = 2.5 + Math.random() * 3; } }
      const eyeS = n.blinkT > 0 ? 0.12 : 1;
      for (const e of j.eyes) e.scale.y = eyeS;

      if (n.cheerT > 0) {
        n.cheerT -= dt;
        const ck = Math.max(0, n.cheerT / 1.3);
        const bounce = Math.abs(Math.sin((1.3 - n.cheerT) * 12));
        swayL = -1.0 * ck - 0.15 * bounce;
        swayR = 1.0 * ck + 0.15 * bounce;
        j.neck.rotation.x = -0.15 * ck * bounce;
        n.group.position.y = n.groupBaseY + bounce * 0.18 * ck;
        n.sign.position.y = n.signBaseY + bounce * 0.18 * ck;
      }
      j.shoulders[-1].rotation.z = swayL;
      j.shoulders[1].rotation.z = swayR;
      n.sign.quaternion.copy(camera.quaternion);
      if (n.flashT > 0) {
        n.flashT -= dt;
        const k = Math.max(0, n.flashT / 0.9);
        n.sign.material.color.setRGB(1, 1, 1).lerp(new THREE.Color(GOOD_GREEN), k * 0.6);
        n.sign.position.y += Math.sin((0.9 - n.flashT) * 22) * 0.06 * k;
        if (n.flashT <= 0) n.sign.material.color.setRGB(1, 1, 1);
      }
    }

    // the ejected fibbing villager leans left and falls sideways during red flash before going poof
    for (const n of crew) {
      if (!n.ejecting) continue;
      if (n.group.visible) {
        if (n.ejectT == null) n.ejectT = 0;
        n.ejectT += dt;
        const progress = Math.min(1, n.ejectT / 0.35);
        n.group.rotation.z = -0.55 * progress; // lean left ~30 degrees
        n.group.position.y = BASE_Y - 0.22 * progress; // fall down slightly
        n.group.position.x = layout.x[n.seat] - 0.12 * progress + (Math.random() - 0.5) * 0.04;
      }
    }
  }

  // what the headless smoke test reads
  function debugState() {
    return {
      crew: crew.map((n) => ({
        op: n.op, a: n.a, b: n.b, answer: n.answer, shown: n.shown,
        claimText: n.claimText, imposter: n.imposter,
      })),
      crewSize: crew.length,
      op: crew.length ? crew[0].op : null,
      imposterIndex,
      hovered, inspecting,
    };
  }

  function reset() { crew = []; hovered = -1; inspecting = -1; }
  // Debug/test override. Still clamped: CREW_MAX is a legibility limit on what
  // a child can be shown, so nothing — not a hook, not a future ramp — is
  // allowed to put more signs on the stage than fit.
  function setSize(n) {
    forcedSize = Number.isFinite(n) && n > 0 ? Math.min(CREW_MAX, Math.round(n)) : 0;
  }
  function setOp(op) { forcedOp = (op === 'mul' || op === 'div') ? op : null; }

  return {
    id: 'imposter', newRound, update, accuse, pick, setHover,
    inspect, endInspect, seatScreenPos,
    debugState, reset, setSize, setOp,
  };
}
