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
//   • TIER 2 "IMPOSTER" (advanced) — a crew of villagers, one fibbing sign, tap
//     (or drag and release) to eject it. Unlocks past IMPOSTER_THRESHOLD, and
//     the crew grows with mastery from there. See ./imposter.js.
//
// Both tiers can put a DIVISION claim on a sign ("42 ÷ 6 = 8"), but only for a
// fact whose × sibling the ledger has already unlocked — the gate is the
// ledger's, not ours; see ./facts.js.
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
  //
  // DRAG-SCRUB. The accusation moved from pointer-DOWN to pointer-UP so a child
  // can hold a finger on the crew, slide along it reading each sign, and only
  // commit where they lift. A tap is the degenerate case of exactly that — press
  // and release on one villager — so tap-only play is unchanged and complete,
  // and sliding off the crew before lifting is a free cancel.
  let scrubbing = false;
  let scrubSeat = -1;
  const live = () => tierName === 'imposter' && stage.state.phase === 'accusing';

  const onDown = (x, y) => {
    if (!live()) return;
    scrubbing = true;
    scrubSeat = tiers.imposter.pick(x, y);
    tiers.imposter.inspect(scrubSeat);
  };
  const onMove = (x, y) => {
    if (!live()) return;
    const i = tiers.imposter.pick(x, y);
    // A mouse with no button down still gets the cheap hover highlight; a held
    // finger gets the full inspection.
    if (scrubbing) { scrubSeat = i; tiers.imposter.inspect(i); }
    else tiers.imposter.setHover(i);
  };
  const onUp = () => {
    if (!scrubbing) return;
    scrubbing = false;
    const seat = scrubSeat;
    scrubSeat = -1;
    tiers.imposter.endInspect();
    if (live() && seat >= 0) tiers.imposter.accuse(seat);
  };
  const onCancel = () => {
    if (!scrubbing) return;
    scrubbing = false;
    scrubSeat = -1;
    tiers.imposter.endInspect();
  };
  const input = createPointerInput(dom, { onDown, onMove, onUp, onCancel });
  const stopScrub = () => { scrubbing = false; scrubSeat = -1; };

  // ---------- buttons ----------
  const onConfirm = () => {
    if (stage.state.phase !== 'done') return;
    active().newRound();
  };
  const onRecenter = () => ui.showToast(
    tierName === 'imposter' ? 'Tap the wrong sign — or drag to read them!' : 'Tap True or False!', 'good',
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
    stopScrub(); // a finger held across a tier switch must not accuse into the new round
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
      scrubbing,
      ...active().debugState(),
    });
    window.__judge = (bool) => tiers.judge.judgeTap(!!bool);
    window.__accuse = (i) => tiers.imposter.accuse(i);
    window.__stwTier = (name) => { forcedTier = name; switchTo(name); };
    // Crew size and operation are normally earned from the ledger; a test needs
    // to reach a tier state without first playing its way there.
    window.__stwCrew = (n) => { tiers.imposter.setSize(n); switchTo('imposter'); };
    window.__stwOp = (op) => { for (const t of Object.values(tiers)) t.setOp(op); };
    // Screen coordinates of a villager, so a headless browser can aim REAL
    // pointer events at the crew instead of calling the tier directly — which
    // is the only way drag-scrub gets tested at all.
    window.__stwSeatXY = (i) => tiers.imposter.seatScreenPos(i);
  }
  function clearDebug() {
    for (const k of ['__stw', '__judge', '__accuse', '__stwTier',
      '__stwCrew', '__stwOp', '__stwSeatXY']) {
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
    if (ctx.engine.updateBiomeFromProgress) ctx.engine.updateBiomeFromProgress(mastery.overallProgress());
    active().newRound();
  }

  function teardown() {
    ctx.speech.reset(); // a child leaving must not hear the old round finish
    stopScrub();        // …nor have a lifted finger accuse a torn-down crew
    input.detach();
    ui.els.btnConfirm.removeEventListener('click', onConfirm);
    ui.els.btnRecenter.removeEventListener('click', onRecenter);
    clearDebug();
    for (const t of Object.values(tiers)) t.reset();
    mastery.endQuestion();
    stage.dispose();
    ui.els.btnRecenter.style.display = '';
    engine.resetCamera();
    stage.state.phase = 'idle';
  }

  return { id: 'spot-the-wrongun', title: 'Spot the Wrong’un', start, update, teardown };
}
