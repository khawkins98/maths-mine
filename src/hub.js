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
  'night-defense': { icon: 'obsidian', desc: 'Defend your cottage against nighttime mobs!' },
};
const NIGHT_UNLOCK_STAGE = 4;

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
      if (ctx.engine.house && ctx.engine.house.reset) ctx.engine.house.reset();
      if (bolt.setOxidation) bolt.setOxidation(ctx.mastery.overallProgress());
      if (ctx.engine.updateBiomeFromProgress) ctx.engine.updateBiomeFromProgress(ctx.mastery.overallProgress());
      renderCards();
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
    const STAGE_NAMES = [
      'Cottage Foundation',
      'Two-Story Cottage',
      'Porch & Torches',
      'Iron Golem Guardian',
      "Blacksmith's Forge",
      'Windmill & Farmland',
      'Pet Tamed Wolf',
      'Nether Portal & Beacon',
    ];

    if (btn) {
      if (stage >= 8) {
        btn.innerHTML = '<span aria-hidden="true">🌙</span> Defend Village <span class="cta-detail">Night Mode</span>';
        btn.classList.remove('disabled');
        btn.classList.add('night-mode');
        btn.disabled = false;
      } else {
        const nextName = STAGE_NAMES[stage] || `Stage ${stage + 1}`;
        btn.innerHTML = `<span aria-hidden="true">🔨</span> Build ${nextName} <span class="cta-detail">${stage}/8 · ${cost} 🔩</span>`;
        btn.classList.remove('night-mode');
        if (wallet && wallet.bolts >= cost) {
          btn.classList.remove('disabled');
          btn.disabled = false;
        } else {
          btn.classList.add('disabled');
          btn.disabled = true;
        }
      }
    }
  }

  if (ui.els.btnBuildHouse) {
    ui.els.btnBuildHouse.addEventListener('click', () => {
      const house = ctx.engine && ctx.engine.house;
      const wallet = ctx.wallet;
      if (!house || !wallet) return;

      const stage = house.getStage();
      if (stage >= 8) {
        // Start Night Defence directly
        play('night-defense');
        return;
      }

      const res = house.upgrade(wallet);
      if (res.success) {
        if (ctx.audio) ctx.audio.beep(520, 0.15, 'square', 0.1);
        renderCards();
        if (res.newStage === 4) {
          ui.showToast('🛡️ Iron Golem summoned! Night mode unlocked!', 'good');
          speech.speak('You summoned the Iron Golem to guard your village!');
        } else if (res.newStage === 5) {
          ui.showToast("🔨 Blacksmith's Forge constructed! Lava hearth glowing!", 'good');
          speech.speak("You built the Blacksmith's Forge!");
        } else if (res.newStage === 6) {
          ui.showToast('🌾 Farmland & Windmill constructed!', 'good');
          speech.speak('You built the Farmland and Windmill!');
        } else if (res.newStage === 7) {
          ui.showToast('🐾 You tamed a loyal Minecraft Wolf!', 'good');
          speech.speak('You tamed a loyal pet wolf!');
        } else if (res.newStage === 8) {
          ui.showToast('🔮 Nether Portal lit & Celestial Beacon activated!', 'good');
          speech.speak('You built the Nether Portal and Celestial Beacon!');
        } else {
          ui.showToast(`🎉 Village upgraded to Stage ${res.newStage}!`, 'good');
          speech.speak(`You built stage ${res.newStage} of your village!`);
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
      card.dataset.material = meta.icon;
      const houseStage = ctx.engine.house ? ctx.engine.house.getStage() : 0;
      const locked = id === 'night-defense' && houseStage < NIGHT_UNLOCK_STAGE;
      if (locked) {
        card.classList.add('locked');
        card.setAttribute('aria-disabled', 'true');
        card.setAttribute('aria-label', `Night Defence locked. Build the Iron Golem. Village stage ${houseStage} of ${NIGHT_UNLOCK_STAGE}.`);
      }
      card.innerHTML =
        `<img class="hc-icon" alt="" src="${iconFor(meta.icon)}">` +
        `<div class="hc-title">${(factory && factory.title) || title}</div>` +
        `<div class="hc-desc">${locked
          ? `🔒 Build the Iron Golem · Stage ${houseStage} of ${NIGHT_UNLOCK_STAGE}`
          : meta.desc}</div>`;
      // Keep the locked card focusable and self-explanatory, but give it no
      // production play handler. window.__pick remains the deliberate debug
      // bypass used by Night Defence's isolated browser tests.
      if (!locked) card.addEventListener('click', () => play(id));
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
    // Game teardown must leave no latent locomotion state; greet from the
    // restored home pose rather than scheduling a walk timer across scenes.
    bolt.say('Pick a game!', '');
    if (bolt.playWave) timers.later(() => bolt.playWave(), 1150);
    speech.speak('Pick a game to play!');
  }

  // debug hooks so a headless test can drive the hub
  window.__hub = () => ({ open: ui.els.hub ? !ui.els.hub.classList.contains('hidden') : false, games: list() });
  window.__pick = (id) => play(id);

  return { id: 'hub', title: 'The Maths Mine', open, play, list, start: open };
}
