// TIER 2 — IMPOSTER (advanced).
//
// Three Nuggets, three signs, one of them fibbing. The child taps the wrong sign
// to bounce that villager off the island; the survivors cheer. Unlocks once the
// child is fluent enough that checking three facts at once isn't overwhelming.
//
// Accusing an innocent is not punished — that Nugget just proves itself with a
// little green array and the hunt continues. Only the imposter's fact is
// recorded as a win; a wrong accusation records the innocent's fact as missed,
// which is what nudges the ledger toward the facts the child is guessing at.

import * as THREE from 'three';

import { NUG_X, NUG_Z, BASE_Y, SIGN_Y, GOOD_GREEN, VIEW } from './constants.js';

export function createImposterTier(ctx, stage, facts) {
  const { camera, engine, audio, speech, ui, bolt, mastery } = ctx;
  const speak = speech.speak, eqWords = speech.eqWords, pickPhrase = speech.pickPhrase;
  const nowT = engine.nowT;
  const { later, state } = stage;

  let crew = [];
  let imposterIndex = 0;
  let roundNo = 0;
  let hovered = -1;
  let accuseT = 0;

  function frameImposter() {
    // Pulled back from 12.6 to leave room OUTSIDE the crew. Bolt is clamped
    // into the frame, so with a tighter camera he was shoved on top of the
    // left-hand villager rather than standing clear of them.
    engine.placeCamera(1.75, 15.5, VIEW);
    // the crew occupies x -3.35..3.35, so Bolt stands outside them and forward
    // Roughly level with the crew in depth, not four units in front of them:
    // Bolt is a world object now, so standing nearer the camera makes him
    // render larger, and he was dwarfing the villagers he is introducing.
    // In FRONT of the crew rather than beside them. The three villagers span
    // the full width of the frame, so on an upright tablet there is no room at
    // either side and the in-frame clamp shoved Bolt straight on top of the
    // left-hand one, hiding a villager the child has to be able to tap. There
    // is plenty of empty ground in front, at every aspect ratio.
    bolt.placeAt(-2.0, 4.0, 0.62);
  }

  function newRound() {
    speech.reset(); // a new round starts a new sentence, not a queue
    stage.clearRound();
    crew = [];
    roundNo++;

    // The shakiest of the three facts becomes the fibber, so the sign the child
    // must scrutinise is the one they most need the practice on.
    const drawn = facts.drawDistinct(3).slice();
    drawn.sort((f, g2) => facts.level(f.a, f.b) - facts.level(g2.a, g2.b));
    const impFact = drawn[0];
    const trueFacts = [drawn[1], drawn[2]];

    // Was `roundNo % 3` - left, middle, right in fixed rotation, which a child
    // can follow without checking a single sum.
    imposterIndex = (Math.random() * 3) | 0;
    const wrong = facts.plausibleWrong(impFact.a, impFact.b, roundNo);

    let tIdx = 0;
    for (let seat = 0; seat < 3; seat++) {
      const isImp = seat === imposterIndex;
      const f = isImp ? impFact : trueFacts[tIdx++];
      const shown = isImp ? wrong : f.answer;

      // three distinct varieties, rotating between rounds. Distinct matters:
      // the child has to hold "the one on the left said 12" in mind while
      // checking the others, and identical villagers make that harder than the
      // maths it is meant to be testing.
      const g = stage.makeNugget(roundNo + seat * 2);
      g.position.set(NUG_X[seat], BASE_Y, NUG_Z[seat]);
      stage.crewGroup.add(g);

      const signMesh = new THREE.Mesh(stage.geo.sign, new THREE.MeshBasicMaterial({
        map: stage.makeSignTex(f.a, f.b, shown), transparent: true, side: THREE.DoubleSide,
      }));
      signMesh.position.set(NUG_X[seat], SIGN_Y, NUG_Z[seat] + 0.35);
      stage.signGroup.add(signMesh);

      const hit = new THREE.Mesh(stage.geo.hit, new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0, depthWrite: false,
      }));
      hit.position.set(NUG_X[seat], 1.4, NUG_Z[seat] + 0.15);
      hit.userData.index = seat;
      stage.root.add(hit);
      stage.hitboxes.push(hit);

      crew.push({
        a: f.a, b: f.b, answer: f.answer, shown, imposter: isImp,
        seat, headIdx: seat, group: g, sign: signMesh, hit,
        joints: g.userData.joints,
        bob: Math.random() * Math.PI * 2,
        blinkIn: 2 + Math.random() * 3, blinkT: 0,
        cheerT: 0,
        signBaseY: SIGN_Y, groupBaseY: BASE_Y,
        ejecting: false, ev: new THREE.Vector3(), espin: 0,
        escale: 1, elean: 0, proven: false,
      });
    }

    state.phase = 'accusing';
    hovered = -1;
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
    ui.setStatus('Tap the sign that’s wrong to bounce it off!');
    bolt.say('One sign is fibbing!', 'wow');
    speak(pickPhrase([
      'One sign is fibbing! Tap the wrong one.',
      'Uh oh — one of these is a wrong’un. Which sign is fibbing?',
      'One sign is a mix-up! Tap the one that’s wrong.',
    ]));
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
      bolt.setOxidation(mastery.overallProgress());

      ejectNugget(n);
      shatterSign(n);
      stage.ejectSfx();
      for (const other of crew) if (other !== n && !other.imposter) other.cheerT = 1.3;

      const reward = n.answer;
      ctx.wallet.add(reward);
      ui.showToast(`+${reward} 🔩`, 'good');
      // title card stays the mode name — never feedback.
      ui.setStatus(`That sign said ${n.a} × ${n.b} = ${n.shown} — but it’s really ${n.answer}!`);
      bolt.say('Gotcha! That one was fibbing!', 'happy');
      speak(pickPhrase([
        `That’s right! ${eqWords(n.a, n.b, n.answer)}, not ${n.shown}!`,
        `You spotted it! ${eqWords(n.a, n.b)} is ${n.answer}, not ${n.shown}!`,
      ]));

      later(() => proveTruth(n, () => {
        stage.celebrate();
        audio.chordSound();
        ui.showBigTotal(n.answer);
        ui.pulseBigTotal();
        later(() => ui.hideBigTotal(), 1400);
        bolt.say(`${n.a} × ${n.b} = ${n.answer}!`, 'happy');
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
        `${eqWords(n.a, n.b, n.answer)}. That’s right! Try another.`,
        `Nope, ${n.answer} is correct. Keep looking!`,
      ]));
    }
  }

  function ejectNugget(n) {
    n.ejecting = true;
    n.ev.set((n.seat - 1) * 2.2 + (Math.random() - 0.5), 12.5, -2.5 - Math.random());
    n.espin = 8 + Math.random() * 4;
    n.hit.userData.index = -1;
    stage.dustPuff(n.group.position.x, BASE_Y - 0.4, n.group.position.z);
    // launching a villager off the island should be felt through your feet
    ctx.worldFeel.impulse(0.75, n.group.position.x, n.group.position.z);
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
  // row — the same "count it and see" move the judge tier ends on.
  function proveTruth(n, done) {
    const cols = Math.max(n.a, n.b), rows = Math.min(n.a, n.b);
    const spacing = 0.62;
    const cx = n.group.position.x, topY = 3.2;
    for (let r = 0; r < rows; r++) {
      for (let cCol = 0; cCol < cols; cCol++) {
        const d = new THREE.Mesh(stage.geo.dot, stage.dotMat);
        d.position.set(cx + (cCol - (cols - 1) / 2) * spacing, topY - r * spacing, NUG_Z[n.seat] + 0.4);
        d.scale.setScalar(0.001);
        d.userData.row = r;
        stage.fxGroup.add(d);
        stage.proofDots.push(d);
      }
    }
    ui.setTally('');
    let r = 0;
    const step = () => {
      const running = (r + 1) * cols;
      for (const d of stage.proofDots) if (d.userData.row === r) d.userData.pop = 0;
      audio.groupChime(r + 1);
      ui.setTally(`${r + 1} × ${cols} = ${running}`);
      r++;
      if (r < rows) later(step, 300);
      else later(() => {
        ui.setTally(`${n.a} × ${n.b} = ${n.answer}`);
        speak(`${eqWords(n.a, n.b, n.answer)}.`);
        done && done();
      }, 420);
    };
    later(step, 200);
  }

  function proveInnocent(n) {
    n.flashT = 0.9;
    audio.groupChime(3);
    for (let i = 0; i < 3; i++) {
      const d = new THREE.Mesh(stage.geo.dot, stage.dotMat);
      d.position.set(n.group.position.x + (i - 1) * 0.5, SIGN_Y + 1.0, NUG_Z[n.seat] + 0.4);
      d.scale.setScalar(0.001); d.userData.pop = 0; d.userData.row = -1;
      d.userData.tick = 0.9;
      stage.fxGroup.add(d);
      stage.proofDots.push(d);
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

  function setHover(i) {
    hovered = i;
    if (state.phase === 'accusing' && i >= 0 && crew[i] && !crew[i].ejecting) {
      stage.ring.position.set(crew[i].group.position.x, 0.02, NUG_Z[i]);
      stage.ring.visible = true;
    } else {
      stage.ring.visible = false;
    }
  }

  function update(dt, t) {
    for (const n of crew) {
      if (n.ejecting) continue;
      const bob = Math.sin(t * 2 + n.bob) * 0.08;
      const targetScale = (state.phase === 'accusing' && hovered === n.seat) ? 1.09 : 1;
      const targetLean = (state.phase === 'accusing' && hovered === n.seat) ? -0.12 : 0;
      n.escale += (targetScale - n.escale) * Math.min(1, dt * 12);
      n.elean += (targetLean - n.elean) * Math.min(1, dt * 12);
      n.group.position.y = n.groupBaseY + bob;
      n.group.rotation.set(n.elean, 0, 0);
      n.group.scale.setScalar(n.escale);
      n.sign.position.y = n.signBaseY + bob;

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

    // the ejected villager tumbles off, limbs flailing
    for (const n of crew) {
      if (!n.ejecting) continue;
      n.ev.y -= 26 * dt;
      n.group.position.addScaledVector(n.ev, dt);
      n.group.rotation.z += n.espin * dt;
      n.group.rotation.x += n.espin * 0.6 * dt;
      const j = n.joints;
      if (j) {
        j.shoulders[-1].rotation.z = Math.sin(t * 22) * 1.4;
        j.shoulders[1].rotation.z = Math.sin(t * 22 + 1.7) * 1.4;
        j.hips[-1].rotation.x = Math.sin(t * 26) * 0.9;
        j.hips[1].rotation.x = Math.sin(t * 26 + Math.PI) * 0.9;
        j.neck.rotation.z = Math.sin(t * 30) * 0.4;
      }
    }
  }

  // what the headless smoke test reads
  function debugState() {
    return {
      crew: crew.map((n) => ({ a: n.a, b: n.b, answer: n.answer, shown: n.shown, imposter: n.imposter })),
      imposterIndex,
    };
  }

  function reset() { crew = []; hovered = -1; }

  return { id: 'imposter', newRound, update, accuse, pick, setHover, debugState, reset };
}
