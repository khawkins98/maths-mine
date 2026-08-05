// TIER 1 — JUDGE (the default).
//
// One Nugget holds a sign claiming `a × b = X`. The `a × b` array builds in
// front of it row by row with a rising chime and a running skip-count — the same
// visual language as Block Builder. Half the rounds the claim is true; half it's
// a plausible neighbour. The child taps ✓ True / ✗ False.
//
// Either way the whole matrix is re-counted aloud to the REAL total and the sign
// is swapped to the confirmed true fact. There is no fail state: a wrong
// judgment gets the identical gentle count-and-correct, and the framing is
// always that the SIGN was fibbing, never the child.

import * as THREE from 'three';

import { easeOutBack } from '../../core/ease.js';
import { CELL, BLOCK } from '../../core/blocks.js';
import { BASE_Y, GOOD_GREEN, VIEW_JUDGE, TRUE_LABEL, FALSE_LABEL } from './constants.js';

// The array is a VERTICAL wall in the z=0 plane (Block Builder look): `cols`
// wide × `rows` tall, row 0 on the ground. The Nugget stands to its LEFT so it
// never occludes the count. The wall sits a touch right of centre so the whole
// Nugget+wall composition straddles the origin the camera looks at.
const WALL_CX = 1.3;

export function createJudgeTier(ctx, stage, facts) {
  const { camera, engine, audio, speech, ui, bolt, mastery } = ctx;
  const speak = speech.speak, eqWords = speech.eqWords, pickPhrase = speech.pickPhrase;
  const nowT = engine.nowT;
  const { later, state } = stage;

  let jr = null;   // the round: { a,b,claim,isTrue,answer,cols,rows,nugget,blocks,… }
  let judgeNo = 0;

  const wallHalf = (cols) => (cols * CELL) / 2;
  const nugXFor = (cols) => WALL_CX - wallHalf(cols) - 2.0;

  function judgeCellPos(col, row, cols) {
    return {
      x: (col - (cols - 1) / 2) * CELL + WALL_CX,
      y: BLOCK / 2 + row * CELL,   // row 0 rests on the grass (y ≥ 0)
      z: 0,
    };
  }

  function frameJudge(cols, rows) {
    const centerY = Math.max(rows * CELL, 3.6) / 2 + 0.5;
    const dist = 11.5 + Math.max(cols + 3.2, rows * 1.5) * 1.15;
    engine.placeCamera(centerY, dist, VIEW_JUDGE);
    // near-left, well clear of the Nugget and its sign
    bolt.placeAt(-dist * 0.26, dist * 0.20);
  }

  function newRound() {
    speech.reset(); // a new round starts a new sentence, not a queue
    stage.clearRound();
    jr = null;
    judgeNo++;

    // Draw a fact (mastery already biases to shakier facts). Half true / half a
    // plausible-neighbour fib — alternate so both appear predictably.
    const q = mastery.nextQuestion({ op: 'mul' });
    const a = q.a, b = q.b, answer = a * b;
    const isTrue = (judgeNo % 2) === 1; // odd rounds true, even rounds a fib
    const claim = isTrue ? answer : facts.plausibleWrong(a, b, judgeNo);

    // Normalise the wall to WIDE-and-SHORT (bigger factor across) so it stays
    // readable and never towers over the Nugget; the array total is identical
    // either way and the skip-count still lands on the true product.
    const cols = Math.max(a, b), rows = Math.min(a, b);
    const nugX = nugXFor(cols);

    // the villager stands beside the wall it is making a claim about
    // a different villager each round, so the crew is not one repeated face
    const g = stage.makeNugget(judgeNo);
    g.position.set(nugX, BASE_Y, 0);
    stage.crewGroup.add(g);

    jr = {
      a, b, answer, claim, isTrue, cols, rows,
      nugget: {
        group: g, joints: g.userData.joints,
        groupBaseY: BASE_Y,
        bob: Math.random() * Math.PI * 2, blinkIn: 2 + Math.random() * 3, blinkT: 0,
      },
      blocks: [], askT: 0, answered: false,
    };

    frameJudge(cols, rows);

    // UI: warm framing. Title card = mode name only. The claim gets a big DOM
    // headline once the question is posed (onBuilt); until then it lives on the
    // 3D sign + the building array.
    ui.hideConfirm();
    ui.hideChoices();
    ui.setAskEq(null);
    ui.setClaim(null);
    ui.hideBigTotal();
    ui.setTally('');
    ui.els.btnRecenter.style.display = 'none';
    ui.setStatus('Watch the emeralds — is the villager telling the truth?');
    bolt.say('Is this villager telling the truth?', 'wow');
    speak(pickPhrase([
      `This villager says ${a} times ${b} is ${claim}. Let's count and check!`,
      `Is ${a} times ${b} really ${claim}? Let's build it and see!`,
    ]));

    state.phase = 'building';
    buildArray();
  }

  // pour the `a × b` array, ROW BY ROW (bottom-up), rising chime + skip-count.
  function buildArray() {
    let r = 0;
    const stepRow = () => {
      const { cols, rows } = jr;
      // the row that WAS the top loses its grass as this new one lands on it
      if (r > 0) for (let cc = 0; cc < cols; cc++) stage.setCapGrass(jr.blocks[(r - 1) * cols + cc], false);
      for (let c2 = 0; c2 < cols; c2++) {
        const blk = stage.makeBlock();
        const p = judgeCellPos(c2, r, cols);
        blk.position.set(p.x, p.y, p.z);
        stage.setCapGrass(blk, true); // this new row is the exposed top → grassy lip
        blk.scale.setScalar(0.001);
        blk.userData.pop = 0;
        stage.arrayGroup.add(blk);
        jr.blocks.push(blk);
        stage.blockPops.push(blk);
        stage.dustPuff(p.x, p.y - 0.3, 0.3);
      }
      const running = (r + 1) * cols;
      audio.groupChime(r + 1);
      // order-neutral running count while it builds (avoid printing a flipped
      // "rows × cols" that contradicts the claim's "a × b" order on the sign)
      ui.setTally(`… ${running}`);
      speak(`${running}.`);
      r++;
      if (r < rows) later(stepRow, 560);
      else later(onBuilt, 640);
    };
    later(stepRow, 420);
  }

  function onBuilt() {
    // The array counted itself aloud on the way up ("10. 20. 30..."), one line
    // per row. Those are queued, so on a tall wall they were still playing
    // after the question had been asked: the child heard "is that right?" and
    // then a stream of numbers. The question supersedes them.
    speech.reset();
    state.phase = 'judging';
    jr.askT = nowT();
    // The claim lives in ONE place: the big headline above the buttons. It used
    // to also hang on a small 3D board over the array, which said exactly the
    // same thing in a third of the size and cluttered the sky.
    ui.setTally('');
    // the CLAIM gets its big DOM home directly above the True/False buttons —
    // the biggest text on screen during the question.
    ui.setClaim(`${jr.a} × ${jr.b} = ${jr.claim}`);
    // ONE copy of the question cue lives in the helper line; Bolt gets a
    // different idle line so "Is that right?" never appears twice.
    ui.setStatus('Is that right?');
    bolt.say('You be the judge!', 'wow');
    speak(pickPhrase([
      `It says ${jr.claim}. Is that right? True, or false?`,
      `So — true, or false?`,
    ]));
    ui.showChoices([TRUE_LABEL, FALSE_LABEL], (val) => judgeTap(val === TRUE_LABEL));
  }

  function judgeTap(childSaysTrue) {
    if (state.phase !== 'judging' || !jr || jr.answered) return;
    jr.answered = true;
    const correct = childSaysTrue === jr.isTrue;
    const ms = (nowT() - jr.askT) * 1000;

    mastery.record(jr.a, jr.b, correct, ms);
    bolt.setOxidation(mastery.overallProgress());

    ui.lockChoices();
    // Flash the TRUE option green briefly (no red — no fail state), then fade
    // BOTH buttons out so no survivor sits on the reveal. 'solo' drops the
    // appended ✓ so it doesn't double up with the ✓/✗ label prefix.
    const truthLabel = jr.isTrue ? TRUE_LABEL : FALSE_LABEL;
    ui.choiceButtons().forEach((btn) => {
      if (btn.textContent === truthLabel) btn.classList.add('right', 'solo');
    });
    later(() => ui.fadeChoices(), 600);

    if (correct) {
      const reward = jr.answer;
      ctx.wallet.add(reward);
      ui.showToast(`+${reward} 🔩`, 'good');
    }

    state.phase = 'revealing';
    ui.setStatus(correct ? 'Nice one — let’s prove it!' : 'Good try — let’s count it together!');
    bolt.say(correct ? 'Let’s prove it!' : 'Let’s count it!', '');

    // re-count the WHOLE matrix aloud to the real total, then show the verdict.
    countReveal(() => showVerdict(correct));
  }

  // pulse the array row by row, re-skip-counting to the REAL total.
  function countReveal(done) {
    let g = 0;
    const step = () => {
      g++;
      const { cols, rows } = jr;
      // give the just-counted row an emphasis pop
      for (let c2 = 0; c2 < cols; c2++) {
        const blk = jr.blocks[(g - 1) * cols + c2];
        if (blk) { blk.userData.pop = 0; stage.blockPops.push(blk); }
      }
      audio.groupChime(g);
      ui.setTally(`… ${g * cols}`);
      speak(`${g * cols}.`);
      if (g < rows) later(step, 340);
      // leave the running count "… total" as the evidence — never stamp the
      // full "a × b = answer" equation into the DOM (that's the sign's job now).
      else later(() => { done && done(); }, 460);
    };
    later(step, 250);
  }

  function showVerdict(correct) {
    const { a, b, answer, claim, isTrue } = jr;
    // THE HERO: the claim headline is rewritten to the confirmed TRUE fact and
    // pops, so a fib is visibly corrected in the place the child was reading.
    ui.setClaim(`${a} × ${b} = ${answer}`);
    ui.popClaim();

    // status: personality only, NO equation.
    if (isTrue) {
      ui.setStatus('It’s true!');
      // Bolt: on a CORRECT judgment, personality only — no number (the child
      // produced the judgment). On a WRONG judgment he MAY say the number.
      bolt.say(correct ? 'Nice eye — honest!' : `Tricky one — look, it’s ${answer}.`, 'happy');
      speak(pickPhrase([
        `Let's count… ${answer}! The sign was telling the truth!`,
        `${eqWords(a, b, answer)}. That villager was honest!`,
      ]));
    } else {
      ui.setStatus('Fixed it!');
      bolt.say(correct ? 'You spotted the fib!' : `Tricky one — look, it’s ${answer}.`, 'happy');
      speak(pickPhrase([
        `Let's count… ${answer}! So ${a} times ${b} is ${answer}, not ${claim}. That sign was fibbing!`,
        `${eqWords(a, b, answer)} — not ${claim}. We caught the fib!`,
      ]));
    }

    if (correct) {
      audio.chordSound();
      // confetti bursts over the array the child just counted
      stage.celebrate(WALL_CX, Math.max(2.4, jr.rows * CELL), 0);
      if (bolt.playWave) later(() => bolt.playWave(), 400);
    } else { audio.groupChime(jr.rows); } // gentle, encouraging — never a buzzer

    state.phase = 'done';
    ui.showConfirm('Next →');
  }

  function update(dt, t) {
    if (!jr) return;
    const n = jr.nugget;
    // idle bob / breathe / blink + arm-hold sway, sign billboards + bobs
    const bob = Math.sin(t * 2 + n.bob) * 0.08;
    n.group.position.y = n.groupBaseY + bob;
    const j = n.joints;
    const ph = t * 1.6 + n.bob;
    j.body.scale.set(1 - Math.sin(ph) * 0.01, 1 + Math.sin(ph) * 0.02, 1);
    j.neck.rotation.z = Math.sin(t * 0.8 + n.bob) * 0.05;
    j.shoulders[-1].rotation.z = Math.sin(t * 1.3 + n.bob) * 0.06;
    j.shoulders[1].rotation.z = -Math.sin(t * 1.3 + n.bob) * 0.06;
    n.blinkT -= dt;
    if (n.blinkT <= 0) { n.blinkIn -= dt; if (n.blinkIn <= 0) { n.blinkT = 0.1; n.blinkIn = 2.5 + Math.random() * 3; } }
    const eyeS = n.blinkT > 0 ? 0.12 : 1;
    for (const e of j.eyes) e.scale.y = eyeS;

  }

  // what the headless smoke test reads
  function debugState() {
    return {
      a: jr && jr.a, b: jr && jr.b,
      claim: jr && jr.claim, isTrue: jr && jr.isTrue, answer: jr && jr.answer,
    };
  }

  function reset() { jr = null; }

  return { id: 'judge', newRound, update, judgeTap, debugState, reset };
}
