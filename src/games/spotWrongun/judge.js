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
//
// DIVISION rounds are the same round with a different claim: "42 ÷ 6 = 8", and
// an array laid out as EQUAL SHARING — one row per group, exactly as Block
// Builder shares a dividend out — so the proof the child counts answers the
// question that was actually asked ("how many in each group?") rather than a
// product they were never shown. The ledger decides whether a division round is
// even available; see facts.js.

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
  const speak = speech.speak, eqWords = speech.eqWords, divWords = speech.divWords;
  const pickPhrase = speech.pickPhrase;
  const nowT = engine.nowT;
  const { later, state } = stage;

  let jr = null;   // the round: { op,a,b,claim,isTrue,answer,cols,rows,nugget,blocks,… }
  let judgeNo = 0;
  let trueRun = 0, falseRun = 0;
  let forcedOp = null; // debug: pin × or ÷ across rounds

  const wallHalf = (cols) => (cols * CELL) / 2;
  const nugXFor = (cols) => WALL_CX - wallHalf(cols) - 2.0;

  function judgeCellPos(col, row, cols, isDiv = false) {
    const rowGap = isDiv ? 0.22 : 0;
    return {
      x: (col - (cols - 1) / 2) * CELL + WALL_CX,
      y: BLOCK / 2 + row * CELL + row * rowGap,
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

    // Draw a fact (mastery already biases to shakier facts). Division rounds
    // alternate in as soon as the ledger has unlocked any — never sooner, and
    // never by our own rule: facts.drawDiv() returns null unless the ÷ form has
    // genuinely earned its place.
    const wantDiv = forcedOp === 'div'
      || (forcedOp !== 'mul' && judgeNo % 2 === 0 && facts.divisionReady());
    const div = wantDiv ? facts.drawDiv() : null;
    const q = div || mastery.nextQuestion({ op: 'mul' });
    mastery.beginQuestion(q);

    // `a,b` are the CANONICAL factors in every case — the pair record() scores —
    // which for a share-out are not the two numbers printed on the sign.
    const a = q.a, b = q.b;
    const op = div ? 'div' : 'mul';
    const answer = div ? div.quotient : a * b;

    // Not an alternation. It used to be `judgeNo % 2`, so round one of every
    // session was always True and the rest strictly alternated - a child who
    // noticed could score full marks without reading the sign. Random, but
    // nudged away from long runs of the same verdict.
    const isTrue = trueRun >= 2 ? false : (falseRun >= 2 ? true : Math.random() < 0.5);
    if (isTrue) { trueRun++; falseRun = 0; } else { falseRun++; trueRun = 0; }
    const claim = isTrue ? answer
      : (div ? facts.plausibleWrongQuotient(div.quotient, judgeNo)
        : facts.plausibleWrong(a, b, judgeNo));

    // × normalises the wall to WIDE-and-SHORT (bigger factor across) so it stays
    // readable and never towers over the Nugget; the array total is identical
    // either way and the skip-count still lands on the true product.
    // ÷ has no such freedom: one ROW per group is the whole idea of sharing, so
    // the row count is the divisor even when that makes a tall, narrow wall.
    const cols = div ? div.quotient : Math.max(a, b);
    const rows = div ? div.divisor : Math.min(a, b);
    const nugX = nugXFor(cols);

    // the villager stands beside the wall it is making a claim about
    // a different villager each round, so the crew is not one repeated face
    const g = stage.makeNugget(judgeNo);
    g.position.set(nugX, BASE_Y, 0);
    stage.crewGroup.add(g);

    jr = {
      op, a, b, answer, claim, isTrue, cols, rows,
      dividend: div && div.dividend, divisor: div && div.divisor,
      // what the sign says, in the child's reading order
      claimText: div ? `${div.dividend} ÷ ${div.divisor} = ${claim}`
        : `${a} × ${b} = ${claim}`,
      truthText: div ? `${div.dividend} ÷ ${div.divisor} = ${answer}`
        : `${a} × ${b} = ${answer}`,
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
    ui.setStatus(div
      ? 'Watch them share the emeralds out — is the villager telling the truth?'
      : 'Watch the emeralds — is the villager telling the truth?');
    bolt.say('Is this villager telling the truth?', 'wow');
    speak(div
      ? pickPhrase([
        `This villager says ${divWords(div.dividend, div.divisor)} is ${claim}. Let's share them out and check!`,
        `Is ${divWords(div.dividend, div.divisor)} really ${claim}? Let's share and see!`,
      ])
      : pickPhrase([
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
      // the row that WAS the top loses its grass as this new one lands on it.
      // Not for a share-out: there every row is its own GROUP, and keeping the
      // grassy lip on all of them is what makes the layers read as separate
      // plots rather than one undivided wall.
      if (r > 0 && jr.op !== 'div') {
        for (let cc = 0; cc < cols; cc++) stage.setCapGrass(jr.blocks[(r - 1) * cols + cc], false);
      }
      for (let c2 = 0; c2 < cols; c2++) {
        const blk = stage.makeBlock();
        const p = judgeCellPos(c2, r, cols, jr.op === 'div');
        blk.position.set(p.x, p.y, p.z);
        stage.setCapGrass(blk, true); // this new row is the exposed top → grassy lip
        blk.scale.setScalar(0.001);
        blk.userData.pop = 0;
        stage.arrayGroup.add(blk);
        jr.blocks.push(blk);
        stage.blockPops.push(blk);
        stage.dustPuff(p.x, p.y - 0.3, 0.3);
      }
      audio.groupChime(r + 1);
      if (jr.op === 'div') {
        // A share-out must NOT skip-count to the total: the total is the one
        // number the child already has (it is on the sign), and the thing under
        // question is the size of a group. So count groups filled, never blocks.
        ui.setTally(`${r + 1} of ${rows} groups shared`);
        speak(`${r + 1} group${r ? 's' : ''} shared.`);
      } else {
        const running = (r + 1) * cols;
        // order-neutral running count while it builds (avoid printing a flipped
        // "rows × cols" that contradicts the claim's "a × b" order on the sign)
        ui.setTally(`… ${running}`);
        speak(`${running}.`);
      }
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
    ui.setClaim(jr.claimText);
    // ONE copy of the question cue lives in the helper line; Bolt gets a
    // different idle line so "Is that right?" never appears twice.
    ui.setStatus(jr.op === 'div' ? 'How many in each group — is that right?' : 'Is that right?');
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
      // the emeralds on the stage, however they are arranged — so a share-out
      // pays what it is worth rather than the (much smaller) group size
      const reward = jr.cols * jr.rows;
      ctx.wallet.add(reward);
      ui.showToast(`+${reward} 🔩`, 'good');
    }

    state.phase = 'revealing';
    ui.setStatus(correct ? 'Nice one — let’s prove it!' : 'Good try — let’s count it together!');
    bolt.say(correct ? 'Let’s prove it!' : 'Let’s count it!', '');

    // re-count the WHOLE matrix aloud to the real total, then show the verdict.
    countReveal(() => showVerdict(correct));
  }

  // Prove a share-out by counting ONE group, block by block. Skip-counting the
  // whole array would prove the dividend, which was never in doubt — the claim
  // under test is how many each group got, so that is what gets counted.
  function countGroupReveal(done) {
    let c = 0;
    const step = () => {
      const blk = jr.blocks[c]; // row 0 is the bottom group
      if (blk) { blk.userData.pop = 0; stage.blockPops.push(blk); }
      c++;
      audio.groupChime(c);
      ui.setTally(`… ${c}`);
      speak(`${c}.`);
      if (c < jr.cols) later(step, 300);
      else later(() => {
        ui.setTally(`${jr.cols} in each group`);
        done && done();
      }, 460);
    };
    later(step, 250);
  }

  // pulse the array row by row, re-skip-counting to the REAL total.
  function countReveal(done) {
    if (jr.op === 'div') return countGroupReveal(done);
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
    const { a, b, answer, claim, isTrue, op, dividend, divisor } = jr;
    // THE HERO: the claim headline is rewritten to the confirmed TRUE fact and
    // pops, so a fib is visibly corrected in the place the child was reading.
    ui.setClaim(jr.truthText);
    ui.popClaim();

    // the fact said aloud, in the operation the child was actually asked about
    const words = (ans) => (op === 'div' ? divWords(dividend, divisor, ans) : eqWords(a, b, ans));

    // status: personality only, NO equation.
    if (isTrue) {
      ui.setStatus('It’s true!');
      // Bolt: on a CORRECT judgment, personality only — no number (the child
      // produced the judgment). On a WRONG judgment he MAY say the number.
      bolt.say(correct ? 'Nice eye — honest!' : `Tricky one — look, it’s ${answer}.`, 'happy');
      speak(pickPhrase([
        `Let's count… ${answer}! The sign was telling the truth!`,
        `${words(answer)}. That villager was honest!`,
      ]));
    } else {
      ui.setStatus('Fixed it!');
      bolt.say(correct ? 'You spotted the fib!' : `Tricky one — look, it’s ${answer}.`, 'happy');
      speak(pickPhrase([
        `Let's count… ${answer}! So ${words(answer)}!`,
        `${words(answer)}! We fixed the sign!`,
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
      op: jr && jr.op, a: jr && jr.a, b: jr && jr.b,
      dividend: jr && jr.dividend, divisor: jr && jr.divisor,
      cols: jr && jr.cols, rows: jr && jr.rows,
      claim: jr && jr.claim, claimText: jr && jr.claimText,
      isTrue: jr && jr.isTrue, answer: jr && jr.answer,
      blocks: jr ? jr.blocks.length : 0,
    };
  }

  function reset() { jr = null; }
  function setOp(op) { forcedOp = (op === 'mul' || op === 'div') ? op : null; }

  return { id: 'judge', newRound, update, judgeTap, debugState, reset, setOp };
}
