// game/mastery.js — the shared per-fact mastery ledger + adaptive question
// picker. Deliberately simple (no ML): tracks correctness, streak, and speed
// per fact, keeps the child in a ~75-85% success "flow zone", and unlocks
// tables in a pedagogical order. This same store is shared by all games in the
// suite; multiplication AND division draw from the same per-fact ledger, so
// practicing 6×7 (or 42÷6) in any game moves mastery everywhere.
//
// Division: a division fact a·b ÷ b is served from the SAME record as its
// multiplication sibling a×b, and only once that sibling is "known" (level ≥
// DIV_UNLOCK_LEVEL) — i.e. division unlocks after its × sibling, per the PRD.

import { localStore, readJSON, writeJSON } from '../core/storage.js';

const TABLE_TIERS = [
  [2, 5, 10],
  [3, 4],
  [6, 8],
  [9],
  [7],
];

const LEVEL_MS = [Infinity, 9000, 6000, 4000, 3000]; // speed bar per mastery level
const ASK_MAX = 6; // largest multiplier we ever ask in this slice (bounds ramp math too)
const DIV_UNLOCK_LEVEL = 1; // a fact's ÷ variant unlocks once its × sibling reaches this level
const OXIDATION_TARGET = 20; // correct answers for Bolt to fully oxidise (0..1 progress)

function factKey(a, b) {
  // canonical: smaller factor first so 6x7 and 7x6 share a record
  return a <= b ? `${a}x${b}` : `${b}x${a}`;
}

// Where a child's progress lives between sessions. Bumped if the record shape
// ever changes, which discards the old save rather than half-reading it.
const SAVE_KEY = 'mastery.v1';

export class MasteryStore {
  // `storage` is any localStorage-shaped object, or null to run in memory only
  // (which is what the tests want, and what a browser with storage blocked
  // gives us anyway). Progress loads on construction and saves after every
  // recorded answer — a child closing the tab mid-session loses nothing.
  constructor({ storage = localStore() } = {}) {
    this.facts = new Map();
    this.unlockedTiers = 1; // start with 2/5/10 only
    this.recent = [];       // rolling window of last outcomes (bool)
    this.lastKey = null;
    this.totalCorrect = 0;  // lifetime correct answers (drives Bolt oxidation)
    this._opToggle = 0;     // alternates ×/÷ when both are eligible
    this._storage = storage;
    this.load();
  }

  // ---- persistence ----
  toJSON() {
    return {
      facts: [...this.facts.entries()],
      unlockedTiers: this.unlockedTiers,
      totalCorrect: this.totalCorrect,
      recent: this.recent,
    };
  }

  load() {
    const d = readJSON(this._storage, SAVE_KEY);
    if (!d || !Array.isArray(d.facts)) return false;
    this.facts = new Map(d.facts);
    this.unlockedTiers = d.unlockedTiers || 1;
    this.totalCorrect = d.totalCorrect || 0;
    this.recent = Array.isArray(d.recent) ? d.recent : [];
    return true;
  }

  save() { writeJSON(this._storage, SAVE_KEY, this); }

  // Wipe a child's progress (a fresh start, or a second child on the tablet).
  reset() {
    this.facts = new Map();
    this.unlockedTiers = 1;
    this.recent = [];
    this.lastKey = null;
    this.totalCorrect = 0;
    this.save();
  }

  _rec(a, b) {
    const k = factKey(a, b);
    if (!this.facts.has(k)) {
      this.facts.set(k, {
        a: Math.min(a, b), b: Math.max(a, b),
        correct: 0, attempts: 0, streak: 0, level: 0, avgMs: 0, seen: 0,
      });
    }
    return this.facts.get(k);
  }

  activeTables() {
    const tiers = TABLE_TIERS.slice(0, this.unlockedTiers);
    return tiers.flat();
  }

  // Mastery level (0..4) for a fact, without creating a record for it. Games use
  // this to gauge how well a fact is known — e.g. Spot the Wrong'un only makes
  // an imposter of a fact the child has some grip on. Read-only by design: the
  // `facts` map is the store's own business.
  levelOf(a, b) {
    const r = this.facts.get(factKey(a, b));
    return r ? r.level : 0;
  }

  // Rolling accuracy over the last N answers.
  recentAccuracy() {
    if (this.recent.length === 0) return 1;
    const hits = this.recent.filter(Boolean).length;
    return hits / this.recent.length;
  }

  // 0..1 overall mastery progress — grows with each correct answer and never
  // regresses. Drives Bolt's copper→verdigris oxidation.
  overallProgress() {
    return Math.min(1, this.totalCorrect / OXIDATION_TARGET);
  }

  _maybeRampTables() {
    // Unlock the next tier once ~60% of the ACTUALLY-ASKED facts reach level>=2.
    if (this.unlockedTiers >= TABLE_TIERS.length) return;
    const active = this.activeTables();
    let strong = 0, total = 0;
    for (const t of active) {
      for (let m = 2; m <= ASK_MAX; m++) {
        const r = this.facts.get(factKey(t, m));
        total++;
        if (r && r.level >= 2) strong++;
      }
    }
    if (total > 0 && strong / total >= 0.6) this.unlockedTiers++;
  }

  // Facts whose × sibling is known well enough to also ask as division.
  _divisibleFacts() {
    const out = [];
    const tables = this.activeTables();
    const seen = new Set();
    for (const t of tables) {
      for (let m = 2; m <= ASK_MAX; m++) {
        const k = factKey(t, m);
        if (seen.has(k)) continue; seen.add(k);
        const r = this.facts.get(k);
        if (r && r.level >= DIV_UNLOCK_LEVEL && r.a !== r.b) out.push(r); // skip squares (a÷a is trivial)
      }
    }
    return out;
  }

  // Pick a MULTIPLICATION fact via a weighted draw (weak/unseen favoured, a few
  // strong sprinkled in, anti-repeat, product-capped so early walls are small).
  _pickMulFact() {
    const acc = this.recentAccuracy();
    const tables = this.activeTables();

    let maxMult, productCap;
    if (this.recent.length < 4) { maxMult = 5; productCap = 12; } // gentle first builds
    else if (acc > 0.85) { maxMult = ASK_MAX; productCap = 60; }
    else if (acc > 0.7) { maxMult = ASK_MAX; productCap = 30; }
    else { maxMult = 5; productCap = 20; }                        // back off

    const MIN_PRODUCT = 6; // never a trivial 4-block wall

    const candidates = [];
    for (const t of tables) {
      for (let m = 2; m <= maxMult; m++) {
        const p = t * m;
        if (p > productCap || p < MIN_PRODUCT) continue;
        const k = factKey(t, m);
        if (k === this.lastKey) continue; // anti-repeat
        const r = this.facts.get(k);
        let w;
        if (!r) w = 6;
        else w = Math.max(1, 6 - r.level) + (r.streak === 0 ? 2 : 0);
        if (t === m) w *= 0.35; // squares flip into an identical shape — rarer
        candidates.push({ a: t, b: m, w });
      }
    }
    if (candidates.length === 0) {
      for (const t of tables) for (let m = 2; m <= 6; m++) {
        if (t * m >= MIN_PRODUCT && t !== m) { candidates.push({ a: t, b: m, w: 1 }); break; }
      }
      if (candidates.length === 0) candidates.push({ a: 2, b: 3, w: 1 });
    }

    const total = candidates.reduce((s, c) => s + c.w, 0);
    // deterministic-ish spread without Math.random: rotate through weighted list
    let pick = (this._draws = (this._draws || 0) + 1) * 2654435761 % total;
    let acc2 = 0, chosen = candidates[0];
    for (const c of candidates) { acc2 += c.w; if (pick < acc2) { chosen = c; break; } }
    return chosen; // { a, b, w }
  }

  // Draw the next question. Returns one of:
  //   { op:'mul', a, b, answer }                     — build a×b, ask the total
  //   { op:'div', dividend, divisor, quotient, answer, a, b }
  //       — share `dividend` into `divisor` equal groups, ask how many in each
  //         (answer = quotient); a,b are the canonical factors it records under.
  //
  // opts.op forces 'mul' or 'div' (used by tests). Otherwise ×/÷ alternate
  // whenever a division-eligible fact exists.
  nextQuestion(opts = {}) {
    const forced = opts.op;
    const divisible = this._divisibleFacts();
    const wantDiv = forced === 'div' || (!forced && divisible.length > 0 && (this._opToggle++ % 2 === 1));

    if (wantDiv) {
      let r;
      if (divisible.length) {
        // rotate deterministically through the eligible facts
        r = divisible[(this._draws = (this._draws || 0) + 1) % divisible.length];
      } else {
        // forced div with nothing eligible yet (e.g. a test on round 1): use a
        // small known/askable fact so the round is still well-formed.
        const f = this._pickMulFact();
        r = { a: Math.min(f.a, f.b), b: Math.max(f.a, f.b) };
      }
      const divisor = r.a;     // fewer groups (smaller factor) → cleaner share
      const quotient = r.b;    // how many in each group (the asked answer)
      const dividend = divisor * quotient;
      this.lastKey = factKey(r.a, r.b);
      this._rec(r.a, r.b).seen++;
      return { op: 'div', dividend, divisor, quotient, answer: quotient, a: r.a, b: r.b };
    }

    const chosen = this._pickMulFact();
    this.lastKey = factKey(chosen.a, chosen.b);
    this._rec(chosen.a, chosen.b).seen++;
    return { op: 'mul', a: chosen.a, b: chosen.b, answer: chosen.a * chosen.b };
  }

  // Record an outcome against the canonical fact (a,b) — the same record backs
  // both a×b and (a·b)÷a, so division practice moves multiplication mastery too.
  record(a, b, correct, ms) {
    const r = this._rec(a, b);
    r.attempts++;
    if (correct) {
      r.correct++;
      r.streak++;
      this.totalCorrect++;
      r.avgMs = r.avgMs ? r.avgMs * 0.6 + ms * 0.4 : ms;
      if (r.streak >= 3 && r.avgMs <= LEVEL_MS[Math.min(r.level + 1, 4)]) {
        r.level = Math.min(4, r.level + 1);
      }
    } else {
      r.streak = 0;
      r.level = Math.max(0, r.level - 1); // forgiving decay
    }
    this.recent.push(!!correct);
    if (this.recent.length > 8) this.recent.shift();
    this._maybeRampTables();
    this.save();
    return r;
  }

  // For the jar UI: 0..1 fill for a given table. Tied to PRACTICE, not just the
  // (hard-to-raise) mastery level — the old level/4 average never visibly budged
  // in a single session, so the one progress meter looked dead. Now every correct
  // answer to a fact in this table nudges the jar (capped per fact so breadth is
  // rewarded, not spamming one fact), and reaching higher levels fills it faster.
  tableMastery(t) {
    let score = 0;
    for (let m = 2; m <= 10; m++) {
      const r = this.facts.get(factKey(t, m));
      if (!r) continue;
      score += Math.min(r.correct, 4) + r.level * 0.5; // practice + mastery bonus
    }
    return Math.min(1, score / 24); // ~a handful of practised facts fills it
  }
}

export { factKey };
