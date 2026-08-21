// games/nightDefense/combat.js — Wave progression, math challenge routing, and reward loop.

import { createTimers } from '../../core/timers.js';
import { BIOMES } from '../../core/biomes.js';

export function createCombatManager(ctx, stage, facts) {
  const { ui, bolt, audio, speech, wallet, mastery, engine } = ctx;
  const timers = createTimers();

  let wave = 1;
  let roundIndex = 0;
  const totalRoundsPerWave = 4;
  const mobProgression = ['zombie', 'creeper', 'enderman', 'ghast'];

  let activeFact = null;
  let answering = false;
  let phase = 'idle';
  let askT = 0;
  let scored = false;

  function startWave(waveNumber = 1) {
    wave = waveNumber;
    roundIndex = 0;
    if (engine.setBiome) engine.setBiome(BIOMES.night);
    if (bolt.say) bolt.say(`Night falls! Defend the cottage, Wave ${wave}!`, 'alert');
    if (speech && speech.speak) speech.speak(`Night falls! Defend the cottage, Wave ${wave}!`);

    timers.later(() => {
      startRound();
    }, 1200);
  }

  function startRound() {
    if (roundIndex >= totalRoundsPerWave) {
      completeWave();
      return;
    }

    answering = true;
    phase = 'asking';
    scored = false;
    const mobType = mobProgression[roundIndex % mobProgression.length];
    stage.spawnMob(mobType);

    // Pick math challenge
    activeFact = facts.pickFact();
    mastery.beginQuestion(activeFact);
    askT = engine.nowT();

    // UI Presentation
    ui.setStatus(`Wave ${wave} · Defend against the ${mobType.toUpperCase()}!`);
    ui.setAskEq(activeFact.text);
    ui.showChoices(activeFact.choices, (choiceVal, btnEl) => {
      if (!answering) return;
      handleAnswer(choiceVal, btnEl);
    });

    if (bolt.say) bolt.say(`Golem ready! What is ${activeFact.text}?`, 'idle');
    if (speech && speech.speak) {
      const spokenText = activeFact.op === '×'
        ? `What is ${activeFact.a} times ${activeFact.b}?`
        : `What is ${activeFact.dividend} divided by ${activeFact.divisor}?`;
      speech.speak(spokenText);
    }
  }

  function handleAnswer(answer, btnEl) {
    if (!answering || !activeFact) return;
    answering = false;

    const isCorrect = (answer === activeFact.target);
    // A correct answer that arrives AFTER the fact was shown is a copy, not a
    // recall. The ledger already refuses to score it; the reward has to agree,
    // or the cheapest route to bolts is to guess wrong on purpose and read the
    // answer off the screen. Block Builder and Spot the Wrong'un both withhold
    // it the same way.
    const assisted = scored;

    if (isCorrect) {
      phase = 'victory';
      // ── CORRECT ANSWER: MIGHTY GOLEM UPPERCUT! ──
      if (btnEl) btnEl.classList.add('correct');
      if (audio) {
        audio.beep(440, 0.1, 'square', 0.15);
        timers.later(() => audio.beep(880, 0.2, 'triangle', 0.2), 100);
      }

      // Record mastery
      if (!scored && mastery && typeof mastery.record === 'function') {
        mastery.record(activeFact.a, activeFact.b, true, (engine.nowT() - askT) * 1000);
        scored = true;
        if (bolt.setOxidation) bolt.setOxidation(mastery.overallProgress());
        if (engine.updateBiomeFromProgress) engine.updateBiomeFromProgress(mastery.overallProgress());
      }

      // Award Bolts — the golem still swings either way, so the round never
      // dead-ends; only the payout distinguishes recall from a read-back.
      const earned = 5;
      if (assisted) {
        ui.showToast('💥 UPPERCUT! You used the answer', 'good');
        if (bolt.say) bolt.say('BOOM! Golem smash! You used the answer.');
        if (speech && speech.speak) speech.speak('Smash! You used the answer that time.');
      } else {
        if (wallet) wallet.add(earned);
        ui.showToast(`💥 UPPERCUT! +${earned} 🔩`, 'good');
        if (bolt.say) bolt.say(`BOOM! Golem smash! +${earned} bolts!`);
        if (speech && speech.speak) speech.speak(`Smash! Correct! Plus ${earned} bolts!`);
      }

      // Execute 3D Golem uppercut and launch mob
      stage.executeUppercutVictory(() => {
        roundIndex++;
        timers.later(() => {
          startRound();
        }, 800);
      });

    } else {
      phase = 'revealing';
      // ── INCORRECT ANSWER: MOB ATTACK DEFLECTION ──
      if (audio) audio.beep(220, 0.18, 'triangle', 0.1);

      // Record retry
      if (!scored && mastery && typeof mastery.record === 'function') {
        mastery.record(activeFact.a, activeFact.b, false, (engine.nowT() - askT) * 1000);
        scored = true;
      }

      // A miss becomes instruction, not just damage: show and say the complete
      // fact before asking the child to use it for the successful counter-hit.
      ui.lockChoices();
      ui.choiceButtons().forEach((choice) => {
        if (Number(choice.textContent) === activeFact.target) choice.classList.add('right');
      });
      ui.setAskEq(activeFact.answerText);
      ui.setStatus(`Remember: ${activeFact.answerText}`);
      if (bolt.say) bolt.say(`Remember: ${activeFact.answerText}`, '');
      if (speech && speech.speak) speech.speak(`${activeFact.answerText}. Now use it to block the mob!`);
      if (ui.showToast) ui.showToast('🛡️ Learn it, then block!');

      stage.executeMobAttackDeflection(() => {
        timers.later(() => {
          phase = 'retrying';
          answering = true;
          ui.setAskEq(activeFact.text);
          ui.setStatus('Now block it — what is the answer?');
          ui.showChoices(activeFact.choices, (choiceVal, newBtnEl) => {
            if (!answering) return;
            handleAnswer(choiceVal, newBtnEl);
          });
        }, 1400);
      });
    }
  }

  function completeWave() {
    phase = 'complete';
    // ── DAWN BREAKS: VICTORY & REWARD ──
    if (engine.setBiome) engine.setBiome(BIOMES.dawn);

    const bonusBolts = 15;
    if (wallet) wallet.add(bonusBolts);

    if (audio) {
      audio.beep(523, 0.15, 'triangle', 0.2);
      timers.later(() => audio.beep(659, 0.15, 'triangle', 0.2), 150);
      timers.later(() => audio.beep(784, 0.3, 'triangle', 0.25), 300);
    }

    ui.setAskEq(null);
    ui.setStatus('☀️ Dawn has broken! The cottage is safe!');
    ui.showToast(`🏆 Wave ${wave} Cleared! +${bonusBolts} Bonus 🔩`, 'good');

    if (bolt.say) bolt.say(`The sun rises! The cottage survived! +${bonusBolts} 🔩!`, 'happy');
    if (speech && speech.speak) speech.speak(`The sun rises! Wave ${wave} cleared! Plus ${bonusBolts} bonus bolts!`);

    // Next Wave Button
    const btnNext = ui.els.btnConfirm;
    if (btnNext) {
      btnNext.classList.remove('hidden');
      btnNext.textContent = `⚔️ Start Wave ${wave + 1}`;
      btnNext.onclick = () => {
        btnNext.classList.add('hidden');
        btnNext.onclick = null;
        startWave(wave + 1);
      };
    }
  }

  function teardown() {
    timers.clearAll();
    answering = false;
    mastery.endQuestion();
    ui.setAskEq(null);
    if (ui.els.btnConfirm) {
      ui.els.btnConfirm.classList.add('hidden');
      ui.els.btnConfirm.onclick = null;
    }
  }

  return {
    startWave,
    state: () => ({ phase, wave, roundIndex, answering, fact: activeFact && { ...activeFact } }),
    answer: (value) => handleAnswer(value, null),
    teardown,
  };
}
