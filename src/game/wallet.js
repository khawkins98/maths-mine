// game/wallet.js — the child's bolts (🔩), shared across games and sessions.
//
// There is deliberately no on-screen counter: a permanent readout of a number
// a child does not care about is chrome, and it wore the same wooden frame as
// the buttons without being tappable. The reward moment is the "+N bolts" toast
// and Bolt's reaction. The running total is kept because it costs nothing and
// a shop or a parent view would want it.

import { localStore, readJSON, writeJSON } from '../core/storage.js';

const SAVE_KEY = 'bolts.v1';

export class Wallet {
  // `storage` is any localStorage-shaped object, or null for memory only.
  constructor({ storage = localStore() } = {}) {
    this._storage = storage;
    const saved = readJSON(storage, SAVE_KEY);
    this.bolts = (saved && Number.isFinite(saved.bolts)) ? saved.bolts : 0;
  }

  // Award `n` bolts and return the new total.
  add(n) {
    this.bolts += Math.max(0, Math.round(n) || 0);
    this.save();
    return this.bolts;
  }

  // Spend `n` bolts if available. Returns true if successful.
  spend(n) {
    const cost = Math.max(0, Math.round(n) || 0);
    if (this.bolts < cost) return false;
    this.bolts -= cost;
    this.save();
    return true;
  }

  reset() { this.bolts = 0; this.save(); }
  save() { writeJSON(this._storage, SAVE_KEY, { bolts: this.bolts }); }
}
