// hub.js — the kid-friendly game picker. After the wake gate, main.js shows the
// hub (instead of going straight into Block Builder). It renders one big card
// per registered game; tapping a card starts that game via ctx.startGame(id)
// and routes the game's exit request (ctx.onExit) back to reopening the hub.
//
// A hub is deliberately NOT a game itself — it just chooses which game factory
// to hand the shared ctx to. Games share the mastery ledger, Bolt, and the
// Bolts currency, so progress carries across.

// One-line, kid-facing blurb + emoji per game id.
const META = {
  'block-builder': { emoji: '🧱', desc: 'Build number-walls out of blocks. × and ÷.' },
  'shake-a-batch': { emoji: '🎲', desc: 'Shake out groups of dice and count them up!' },
  'spot-the-wrongun': { emoji: '🕵️', desc: 'Find the sign that’s fibbing!' },
};

export function createHub(ctx) {
  const { ui, bolt, speech } = ctx;

  function list() { return Object.keys(ctx.games || {}); }

  function renderCards() {
    const wrap = ui.els.hubCards;
    if (!wrap) return;
    wrap.innerHTML = '';
    for (const id of list()) {
      const factory = ctx.games[id];
      const title = (META[id] && META[id].title) || id;
      const meta = META[id] || { emoji: '🎮', desc: '' };
      const card = document.createElement('button');
      card.className = 'hub-card';
      card.dataset.game = id;
      card.innerHTML =
        `<div class="hc-emoji">${meta.emoji}</div>` +
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
