import { blockIconDataURL, ICON_PALETTES } from './core/blockIcon.js';
import { createTimers } from './core/timers.js';
import { createParentDashboard } from './game/parentDashboard.js';

// hub.js — the kid-friendly game picker. After the wake gate, main.js shows the
// hub (instead of going straight into Block Builder). It renders one big card
// per registered game; tapping a card starts that game via ctx.startGame(id)
// and routes the game's exit request (ctx.onExit) back to reopening the hub.
//
// A hub is deliberately NOT a game itself — it just chooses which game factory
// to hand the shared ctx to. Games share the mastery ledger, Bolt, and the
// Bolts currency, so progress carries across.

// One-line, kid-facing blurb per game, and the block each one is made of.
// The three materials are a difficulty ladder a Minecraft player already
// reads without being told: dirt, then stone, then emerald.
const META = {
  'block-builder': { icon: 'dirt', desc: 'Build number-walls out of blocks. × and ÷.' },
  'spot-the-wrongun': { icon: 'emerald', desc: 'Find the player who’s fibbing!' },
};

export function createHub(ctx) {
  const { ui, bolt, speech } = ctx;

  // Bolt's walk-in and wave were raw setTimeouts, so picking a card inside the
  // first 1150ms left him walking on the spot into the round and waving in the
  // middle of the first question.
  const timers = createTimers();

  // Drawn once and reused: the cards are rebuilt every time the hub opens.
  const iconCache = {};
  function iconFor(name) {
    const key = ICON_PALETTES[name] ? name : 'stone';
    if (!iconCache[key]) iconCache[key] = blockIconDataURL(ICON_PALETTES[key]);
    return iconCache[key];
  }

  function list() { return Object.keys(ctx.games || {}); }

  // ---- the grown-ups' progress report ----
  //
  // Lives on the hub rather than in a game because it reads the ledger, not a
  // round, and because the hub title is the one press-and-hold target that can
  // never be mistaken for a control a child wants. The gesture is armed once
  // here and gated on the hub actually being visible, so a finger held on the
  // screen during a round cannot summon it over live play.
  const dash = createParentDashboard({
    mastery: ctx.mastery,
    wallet: ctx.wallet,
    // Erasing progress must also un-weather Bolt: he is the visible face of
    // overallProgress(), and a fully verdigris mascot on a blank ledger is the
    // app contradicting itself in front of the next child.
    onChange: () => {
      if (bolt.setOxidation) bolt.setOxidation(ctx.mastery.overallProgress());
      if (ctx.engine.updateBiomeFromProgress) ctx.engine.updateBiomeFromProgress(ctx.mastery.overallProgress());
    },
  });
  const hubVisible = () => !!ui.els.hub && !ui.els.hub.classList.contains('hidden');
  dash.armOpenGesture(ui.els.hub && ui.els.hub.querySelector('h1'), hubVisible);

  function updateHouseUI() {
    const wallet = ctx.wallet;
    const house = ctx.engine.house;
    if (!ui.els.boltsCount || !house) return;

    ui.els.boltsCount.textContent = wallet ? wallet.bolts : 0;
    const stage = house.getStage();
    const cost = house.getNextCost();

    if (ui.els.houseStageText) ui.els.houseStageText.textContent = stage;
    if (ui.els.houseCostText) ui.els.houseCostText.textContent = cost;

    const btn = ui.els.btnBuildHouse;
    if (btn) {
      if (stage >= 4) {
        btn.textContent = '🛡️ Iron Golem Guarding House!';
        btn.classList.add('disabled');
      } else {
        btn.innerHTML = `🔨 Build House (Stage ${stage}/4) · ${cost} 🔩`;
        if (wallet && wallet.bolts >= cost) {
          btn.classList.remove('disabled');
        } else {
          btn.classList.add('disabled');
        }
      }
    }
  }

  if (ui.els.btnBuildHouse) {
    ui.els.btnBuildHouse.addEventListener('click', () => {
      const house = ctx.engine && ctx.engine.house;
      const wallet = ctx.wallet;
      if (!house || !wallet) return;

      const res = house.upgrade(wallet);
      if (res.success) {
        if (ctx.audio) ctx.audio.beep(520, 0.15, 'square', 0.1);
        updateHouseUI();
        if (res.newStage >= 4) {
          ui.showToast('🛡️ Iron Golem summoned! Night mode unlocked!', 'good');
          speech.speak('You summoned the Iron Golem to guard your house!');
        } else {
          ui.showToast(`🎉 House upgraded to Stage ${res.newStage}!`, 'good');
          speech.speak(`You built stage ${res.newStage} of your house!`);
        }
      }
    });
  }

  function renderCards() {
    const wrap = ui.els.hubCards;
    if (!wrap) return;
    wrap.innerHTML = '';
    for (const id of list()) {
      const factory = ctx.games[id];
      const title = (META[id] && META[id].title) || id;
      const meta = META[id] || { icon: 'stone', desc: '' };
      const card = document.createElement('button');
      card.className = 'hub-card';
      card.dataset.game = id;
      card.innerHTML =
        `<img class="hc-icon" alt="" src="${iconFor(meta.icon)}">` +
        `<div class="hc-title">${(factory && factory.title) || title}</div>` +
        `<div class="hc-desc">${meta.desc}</div>`;
      card.addEventListener('click', () => play(id));
      wrap.appendChild(card);
    }
    updateHouseUI();
  }

  // Launch a game by id; wire its exit (a back button / ctx.onExit) to the hub.
  function play(id, opts) {
    timers.clearAll(); // the greeting must not follow the child into the game
    dash.close();      // never let the parent view survive into a round
    ui.hideHub();
    ui.showGameHud();
    ctx.onExit = () => open();
    ui.showBack(() => { if (ctx.onExit) ctx.onExit(); });
    return ctx.startGame(id, opts);
  }

  // Show the picker: stop the current game (clean slate behind the overlay),
  // reset the shared HUD bits, render cards, and let Bolt invite the child.
  function open() {
    speech.reset(); // the menu greeting should not queue behind a dead round
    if (ctx.stopGame) ctx.stopGame();
    if (ctx.engine.updateBiomeFromProgress) ctx.engine.updateBiomeFromProgress(ctx.mastery.overallProgress());
    ui.hideBack();
    ui.hideChoices();
    ui.hideConfirm();
    ui.setAskEq(null);
    ui.hideBigTotal();
    ui.setTally('');
    // Full HUD reset so no stale in-game chrome bleeds onto the menu: hide the
    // whole game HUD (top pill/score + bottom status/claim/actions) and empty
    // the jar shelf. Clear the text too so it's fresh when a game shows it again.
    ui.hideGameHud();
    ui.setStatus('');
    ui.hideClaim();
    renderCards();
    updateHouseUI();
    ui.showHub();
    bolt.resetPlacement();
    bolt.show(true);
    // Bolt walks in, then greets the child with a wave.
    if (bolt.playWalk) { bolt.playWalk(true); timers.later(() => bolt.playWalk(false), 1100); }
    bolt.say('Pick a game!', '');
    if (bolt.playWave) timers.later(() => bolt.playWave(), 1150);
    speech.speak('Pick a game to play!');
  }

  // debug hooks so a headless test can drive the hub
  window.__hub = () => ({ open: ui.els.hub ? !ui.els.hub.classList.contains('hidden') : false, games: list() });
  window.__pick = (id) => play(id);

  return { id: 'hub', title: 'The Maths Mine', open, play, list, start: open };
}
