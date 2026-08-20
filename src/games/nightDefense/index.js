// games/nightDefense — "Night Defence", the Iron Golem cottage defense mini-game.
// Implements the shared game-module interface (see ../README.md).
//
//   createNightDefense(ctx) -> { id, title, start(opts), update(dt), teardown() }

import { createStage } from './stage.js';
import { createFactPicker } from './facts.js';
import { createCombatManager } from './combat.js';

export function createNightDefense(ctx) {
  const { ui } = ctx;

  let stage = null;
  let facts = null;
  let combat = null;

  return {
    id: 'night-defense',
    title: 'Night Defence',

    start(opts = {}) {
      ui.showGameHud();
      if (ui.showBack && ctx.onExit) {
        ui.showBack(ctx.onExit);
      }

      // Hide unused HUD elements
      if (ui.els.btnRecenter) ui.els.btnRecenter.classList.add('hidden');
      if (ui.els.claimEq) ui.els.claimEq.classList.add('hidden');
      if (ui.els.tally) ui.els.tally.classList.remove('show');

      stage = createStage(ctx);
      facts = createFactPicker(ctx.mastery);
      combat = createCombatManager(ctx, stage, facts);

      window.__night = () => combat ? combat.state() : null;
      window.__nightAnswer = (value) => { if (combat) combat.answer(value); };

      stage.frameCamera();
      combat.startWave(opts.wave || 1);
    },

    update(dt) {
      if (stage) stage.update(dt);
    },

    teardown() {
      if (combat) combat.teardown();
      if (stage) stage.teardown();

      stage = null;
      facts = null;
      combat = null;

      delete window.__night;
      delete window.__nightAnswer;

      if (ui.hideBack) ui.hideBack();
      if (ui.els.btnRecenter) ui.els.btnRecenter.classList.remove('hidden');
    },
  };
}
