// games/spotWrongun — "Spot the Wrong'un", the fact-CHECKING mini-game,
// implemented against the shared game-module interface (see ../README.md).
//
//   createSpotWrongun(ctx) -> { id, title, start(opts), update(dt), teardown() }
//
// Where the other games make a child PRODUCE an answer, this one makes them
// CHECK one. It ships as two tiers on one shared stage, chosen by mastery:
//
//   • TIER 1 "JUDGE" (default) — one villager, one claim, ✓ True / ✗ False.
//     See ./judge.js.
//   • TIER 2 "IMPOSTER" (advanced) — three villagers, one fibbing sign, tap to
//     eject it. Unlocks past IMPOSTER_THRESHOLD. See ./imposter.js.
//
// This file is the shell only: it builds the stage, picks a tier, routes input
// and the Next button to whichever tier is active, and tears everything down.
// Neither tier knows the other exists.
//
// Framing stays warm throughout: the SIGN is fibbing, never the child, and
// there is no red UI except the transient cracked sign in the imposter tier.

import { createPointerInput } from '../../core/pointer.js';
import { createStage } from './stage.js';
import { createFactPicker } from './facts.js';
import { createJudgeTier } from './judge.js';
import { createImposterTier } from './imposter.js';
import { IMPOSTER_THRESHOLD } from './constants.js';

export function createSpotWrongun(ctx) {
  const { engine, ui, bolt, mastery, sensors } = ctx;
  const nowT = engine.nowT;
  const dom = ctx.renderer.domElement;

  const sensorsLive = () => !!(sensors && sensors.enabled && sensors.available);

  const stage = createStage(ctx);
  const facts = createFactPicker(mastery);
  const tiers = {
    judge: createJudgeTier(ctx, stage, facts),
    imposter: createImposterTier(ctx, stage, facts),
  };

  let tierName = 'judge';
  let forcedTier = null; // debug: pin a tier across rounds
  const active = () => tiers[tierName];

  // ---------- input ----------
  // Only the imposter tier is pickable in 3D; the judge tier answers through the
  // DOM True/False buttons, so pointer events are simply ignored there.
  const onMove = (x, y) => {
    if (tierName !== 'imposter' || stage.state.phase !== 'accusing') return;
    tiers.imposter.setHover(tiers.imposter.pick(x, y));
  };
  const onDown = (x, y) => {
    if (tierName !== 'imposter' || stage.state.phase !== 'accusing') return;
    const i = tiers.imposter.pick(x, y);
    if (i >= 0) tiers.imposter.accuse(i);
  };
  const input = createPointerInput(dom, { onDown, onMove });

  // ---------- buttons ----------
  const onConfirm = () => {
    if (stage.state.phase !== 'done') return;
    active().newRound();
  };
  const onRecenter = () => ui.showToast(
    tierName === 'imposter' ? 'Just tap the wrong sign!' : 'Tap True or False!', 'good',
  );

  // ---------- per-frame ----------
  function update(dt) {
    const t = nowT();
    active().update(dt, t);

    // optional tilt parallax — pure juice, only when real sensors are live
    if (sensorsLive()) {
      sensors.update();
      stage.root.rotation.y += (sensors.x * (Math.PI / 30) - stage.root.rotation.y) * Math.min(1, dt * 6);
    }
    stage.updateFx(dt);
  }

  // ---------- tier control ----------
  function switchTo(name) {
    if (name !== 'judge' && name !== 'imposter') return;
    for (const t of Object.values(tiers)) t.reset();
    stage.clearRound();
    stage.root.rotation.y = 0;
    tierName = name;
    active().newRound();
  }

  // ---------- debug hooks (headless smoke test) ----------
  function installDebug() {
    window.__stw = () => ({
      tier: tierName,
      phase: stage.state.phase,
      bolts: ctx.wallet.bolts,
      ...active().debugState(),
    });
    window.__judge = (bool) => tiers.judge.judgeTap(!!bool);
    window.__accuse = (i) => tiers.imposter.accuse(i);
    window.__stwTier = (name) => { forcedTier = name; switchTo(name); };
  }
  function clearDebug() {
    for (const k of ['__stw', '__judge', '__accuse', '__stwTier']) {
      try { delete window[k]; } catch (_) { window[k] = undefined; }
    }
  }

  // ---------- interface ----------
  function start(opts = {}) {
    input.attach();
    ui.els.btnConfirm.addEventListener('click', onConfirm);
    ui.els.btnRecenter.addEventListener('click', onRecenter);
    ui.els.btnRecenter.style.display = 'none';
    installDebug();

    // default to JUDGE; graduate to IMPOSTER once the child is fluent.
    tierName = forcedTier
      || (opts.tier === 'imposter' || opts.tier === 'judge' ? opts.tier
        : (mastery.overallProgress() > IMPOSTER_THRESHOLD ? 'imposter' : 'judge'));

    bolt.setOxidation(mastery.overallProgress());
    active().newRound();
  }

  function teardown() {
    input.detach();
    ui.els.btnConfirm.removeEventListener('click', onConfirm);
    ui.els.btnRecenter.removeEventListener('click', onRecenter);
    clearDebug();
    for (const t of Object.values(tiers)) t.reset();
    stage.dispose();
    ui.els.btnRecenter.style.display = '';
    engine.resetCamera();
    stage.state.phase = 'idle';
  }

  return { id: 'spot-the-wrongun', title: 'Spot the Wrong’un', start, update, teardown };
}
