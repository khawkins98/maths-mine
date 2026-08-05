// game/wallet.js — the child's bolts (🔩), shared across games and sessions.
//
// Bolts used to be a `let bolts = 0` inside each game module, which meant the
// count reset to zero every time a child changed game and again every reload.
// Mastery persists, so a currency that visibly evaporates reads as the game
// losing your things.

import { localStore, readJSON, writeJSON } from '../core/storage.js';

const SAVE_KEY = 'bolts.v1';

export class Wallet {
  // `storage` is any localStorage-shaped object, or null for memory only.
  constructor({ storage = localStore() } = {}) {
    this._storage = storage;
    const saved = readJSON(storage, SAVE_KEY);
    this.bolts = (saved && Number.isFinite(saved.bolts)) ? saved.bolts : 0;
  }

  // Award `n` bolts and return the new total, so a caller can hand it straight
  // to ui.setBolts without reading back.
  add(n) {
    this.bolts += Math.max(0, Math.round(n) || 0);
    this.save();
    return this.bolts;
  }

  reset() { this.bolts = 0; this.save(); }

  save() { writeJSON(this._storage, SAVE_KEY, { bolts: this.bolts }); }
}
