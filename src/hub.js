import { blockIconDataURL, ICON_PALETTES } from './core/blockIcon.js';

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
  'shake-a-batch': { icon: 'stone', desc: 'Roll the dice, then count the blocks!' },
  'spot-the-wrongun': { icon: 'emerald', desc: 'Find the sign that’s fibbing!' },
};

export function createHub(ctx) {
  const { ui, bolt, speech } = ctx;

  // Drawn once and reused: the cards are rebuilt every time the hub opens.
  const iconCache = {};
  function iconFor(name) {
    const key = ICON_PALETTES[name] ? name : 'stone';
    if (!iconCache[key]) iconCache[key] = blockIconDataURL(ICON_PALETTES[key]);
    return iconCache[key];
  }

  function list() { return Object.keys(ctx.games || {}); }

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
  }

  // Launch a game by id; wire its exit (a back button / ctx.onExit) to the hub.
  function play(id, opts) {
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
    ui.showHub();
    bolt.show(true);
    // Bolt walks in, then greets the child with a wave.
    if (bolt.playWalk) { bolt.playWalk(true); setTimeout(() => bolt.playWalk(false), 1100); }
    bolt.say('Pick a game!', '');
    if (bolt.playWave) setTimeout(() => bolt.playWave(), 1150);
    speech.speak('Pick a game to play!');
  }

  // debug hooks so a headless test can drive the hub
  window.__hub = () => ({ open: ui.els.hub ? !ui.els.hub.classList.contains('hidden') : false, games: list() });
  window.__pick = (id) => play(id);

  return { id: 'hub', title: 'The Maths Mine', open, play, list, start: open };
}
