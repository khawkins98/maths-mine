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
    const mobType = mobProgression[roundIndex % mobProgression.length];
    stage.spawnMob(mobType);

    // Pick math challenge
    activeFact = facts.pickFact();

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
        : `What is ${activeFact.a} divided by ${activeFact.b}?`;
      speech.speak(spokenText);
    }
  }

  function handleAnswer(answer, btnEl) {
    if (!answering || !activeFact) return;
    answering = false;

    const isCorrect = (answer === activeFact.target);

    if (isCorrect) {
      // ── CORRECT ANSWER: MIGHTY GOLEM UPPERCUT! ──
      if (btnEl) btnEl.classList.add('correct');
      if (audio) {
        audio.beep(440, 0.1, 'square', 0.15);
        setTimeout(() => audio.beep(880, 0.2, 'triangle', 0.2), 100);
      }

      // Record mastery
      if (mastery && typeof mastery.record === 'function') {
        mastery.record(activeFact.a, activeFact.b, activeFact.op, true);
      }

      // Award Bolts
      const earned = 5;
      if (wallet) wallet.add(earned);
      ui.showToast(`💥 UPPERCUT! +${earned} 🔩`, 'good');

      if (bolt.say) bolt.say(`BOOM! Golem smash! +${earned} bolts!`, 'happy');
      if (speech && speech.speak) speech.speak(`Smash! Correct! Plus ${earned} bolts!`);

      // Execute 3D Golem uppercut and launch mob
      stage.executeUppercutVictory(() => {
        roundIndex++;
        timers.later(() => {
          startRound();
        }, 800);
      });

    } else {
      // ── INCORRECT ANSWER: MOB ATTACK DEFLECTION ──
      if (btnEl) btnEl.classList.add('wrong');
      if (audio) audio.beep(180, 0.25, 'sawtooth', 0.18);

      // Record retry
      if (mastery && typeof mastery.record === 'function') {
        mastery.record(activeFact.a, activeFact.b, activeFact.op, false);
      }

      if (bolt.say) bolt.say(`Iron Golem blocked the hit! Try again!`, 'alert');
      if (speech && speech.speak) speech.speak(`Iron Golem blocked the attack! Try again!`);

      stage.executeMobAttackDeflection(() => {
        // Allow player to retry the same challenge
        answering = true;
        ui.showChoices(activeFact.choices, (choiceVal, newBtnEl) => {
          if (!answering) return;
          handleAnswer(choiceVal, newBtnEl);
        });
      });
    }
  }

  function completeWave() {
    // ── DAWN BREAKS: VICTORY & REWARD ──
    if (engine.setBiome) engine.setBiome(BIOMES.dawn);

    const bonusBolts = 15;
    if (wallet) wallet.add(bonusBolts);

    if (audio) {
      audio.beep(523, 0.15, 'triangle', 0.2);
      setTimeout(() => audio.beep(659, 0.15, 'triangle', 0.2), 150);
      setTimeout(() => audio.beep(784, 0.3, 'triangle', 0.25), 300);
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
    ui.setAskEq(null);
    if (ui.els.btnConfirm) {
      ui.els.btnConfirm.classList.add('hidden');
      ui.els.btnConfirm.onclick = null;
    }
  }

  return {
    startWave,
    teardown,
  };
}
