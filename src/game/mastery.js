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

// ---- spaced repetition ladder ----
//
// Leitner-style: every fact carries `interval` (how long it rests) and `due`
// (when it wants asking again). A correct answer promotes it one rung; a wrong
// answer drops it all the way back to the first rung.
//
// The rungs are picked for a ~7-year-old doing SHORT sessions (five or ten
// minutes on a tablet, most days but not every day), which is a very different
// shape from an adult's flashcard deck:
//
//   45s   — a couple of questions later in the same breath. A fact just missed
//           should come back while the correction is still in mind, but not as
//           the literal next question (anti-repeat via lastKey handles that).
//   3min  — later in the SAME session. Long enough that it is recall, not echo.
//   12min — the tail of a session, or the start of the next one if the session
//           was short. This is the rung most facts live on for a while.
//   1 day — the next session. The first rung that genuinely spans a night's
//           sleep, which is where the consolidation actually happens.
//   3 days / 7 days — maintenance. Beyond a week a fact this size is either
//           known or has been re-met at school, so the ladder stops there
//           rather than pretending to a month-scale schedule we cannot verify.
//
// Six rungs means a fact answered correctly every session is "put away" after
// roughly five clean meetings, which matches how the level bar (0..4) moves.
const LADDER = [
  45 * 1000,
  3 * 60 * 1000,
  12 * 60 * 1000,
  24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
];
const FIRST_INTERVAL = LADDER[0];

// Next rung up from whatever interval a record currently holds. Derived rather
// than stored as an index, so a save carrying a hand-edited or legacy interval
// still lands somewhere sane instead of on an out-of-range rung.
function promoteInterval(interval) {
  for (const rung of LADDER) if (rung > interval) return rung;
  return LADDER[LADDER.length - 1];
}
const ASK_MAX = 6; // largest multiplier we ever ask in this slice (bounds ramp math too)
const DIV_UNLOCK_LEVEL = 1; // a fact's ÷ variant unlocks once its × sibling reaches this level
const OXIDATION_TARGET = 20; // correct answers for Bolt to fully oxidise (0..1 progress)

function factKey(a, b) {
  // canonical: smaller factor first so 6x7 and 7x6 share a record
  return a <= b ? `${a}x${b}` : `${b}x${a}`;
}

// Where a child's progress lives between sessions.
//
// Deliberately NOT bumped when scheduling (`due`/`interval`) was added: a real
// child has real progress under this key, and a bump throws it away. The new
// fields are optional on read — a v1 record without them loads with every old
// field intact and is simply treated as due now, which is the honest default
// for a fact whose schedule we never knew.
const SAVE_KEY = 'mastery.v1';

export class MasteryStore {
  // `storage` is any localStorage-shaped object, or null to run in memory only
  // (which is what the tests want, and what a browser with storage blocked
  // gives us anyway). Progress loads on construction and saves after every
  // recorded answer — a child closing the tab mid-session loses nothing.
  //
  // `now` is the clock, injected the same way `storage` is: every time read in
  // this file goes through it, so a test can drive days of scheduling in a
  // millisecond and nothing here ever touches the wall clock directly.
  constructor({ storage = localStore(), now = () => Date.now() } = {}) {
    this._now = now;
    this.facts = new Map();
    this.unlockedTiers = 1; // start with 2/5/10 only
    this.recent = [];       // rolling window of last outcomes (bool)
    this.lastKey = null;
    this.referenceKey = null;
    this.totalCorrect = 0;  // lifetime correct answers (drives Bolt oxidation)
    this._opToggle = 0;     // alternates ×/÷ when both are eligible
    this._questionKeys = new Set();
    this._answeredKeys = new Set();
    this._voided = new Set();
    this._questionSnapshot = null;
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

  // A bad save must degrade to a fresh start, never to a dead app. This runs at
  // module scope, so anything that throws here is a blank screen with no in-app
  // way out - a parent would have to clear site data. `new Map(d.facts)` throws
  // on a non-pair array, and a null record crashes on the first question, so
  // every entry is validated rather than trusted.
  load() {
    try {
      const d = readJSON(this._storage, SAVE_KEY);
      if (!d || !Array.isArray(d.facts)) return false;

      const num = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);
      const whole = (v, fallback = 0) => Math.max(0, Math.round(num(v, fallback)));
      const now = this._now();
      const facts = new Map();
      for (const entry of d.facts) {
        if (!Array.isArray(entry) || entry.length !== 2) continue;
        const [k, r] = entry;
        if (typeof k !== 'string' || !r || typeof r !== 'object') continue;
        if (!Number.isInteger(r.a) || !Number.isInteger(r.b) || r.a <= 0 || r.b <= 0) continue;
        const canonical = factKey(r.a, r.b);
        if (k !== canonical) continue;
        const attempts = whole(r.attempts);
        facts.set(canonical, {
          a: Math.min(r.a, r.b), b: Math.max(r.a, r.b),
          correct: Math.min(attempts, whole(r.correct)), attempts, streak: whole(r.streak),
          level: Math.max(0, Math.min(4, Math.round(num(r.level)))),
          avgMs: Math.max(0, num(r.avgMs)), seen: whole(r.seen),
          // Scheduling is optional on read. A pre-scheduling save (or a
          // corrupt/negative interval) becomes "due now, shortest rung":
          // the fact gets asked, answered, and schedules itself properly from
          // there. Never trust the stored numbers any more than the old ones.
          due: Number.isFinite(r.due) && r.due >= 0 ? r.due : now,
          interval: Math.max(FIRST_INTERVAL, num(r.interval, FIRST_INTERVAL)),
        });
      }

      this.facts = facts;
      this.unlockedTiers = Math.max(1, Math.min(TABLE_TIERS.length, Math.round(num(d.unlockedTiers, 1))));
      this.totalCorrect = whole(d.totalCorrect);
      this.recent = Array.isArray(d.recent) ? d.recent.slice(-8).map(Boolean) : [];
      return true;
    } catch (_) {
      return false; // unreadable save: start fresh rather than not start at all
    }
  }

  save() { writeJSON(this._storage, SAVE_KEY, this); }

  // Wipe a child's progress (a fresh start, or a second child on the tablet).
  reset() {
    this.facts = new Map();
    this.unlockedTiers = 1;
    this.recent = [];
    this.lastKey = null;
    this.referenceKey = null;
    this.totalCorrect = 0;
    this._opToggle = 0;
    this._draws = 0;
    this._divToggle = 0;
    this.endQuestion();
    this.save();
  }

  // Selection and presentation are separate operations. `nextQuestion()` may
  // be called many times while a game assembles a distinct crew; only the facts
  // that actually reach the screen belong in the ledger or in the tray's
  // question-level voiding state.
  beginQuestion(facts) {
    this.endQuestion();
    const list = Array.isArray(facts) ? facts : [facts];
    const keys = [];
    for (const f of list) {
      if (!f || !Number.isInteger(f.a) || !Number.isInteger(f.b) || f.a <= 0 || f.b <= 0) continue;
      const k = factKey(f.a, f.b);
      if (this._questionKeys.has(k)) continue;
      this._questionKeys.add(k);
      keys.push(k);
      this._rec(f.a, f.b).seen++;
    }
    this.lastKey = keys.length ? keys[keys.length - 1] : null;
    // A crew of signs has no single non-revealing "live table". The reference
    // tray falls back to its last page for those rounds.
    this.referenceKey = keys.length === 1 ? keys[0] : null;
    this._questionSnapshot = {
      facts: new Map(keys.map((k) => [k, { ...this.facts.get(k) }])),
      unlockedTiers: this.unlockedTiers,
      totalCorrect: this.totalCorrect,
      recent: this.recent.slice(),
    };
    this.save(); // persist the honest encounter even if no answer is recorded
    return keys;
  }

  // Opening the reference during a live question voids the WHOLE question.
  // Multi-step rounds can already have recorded a wrong accusation, so restore
  // the post-presentation snapshot before ignoring all later writes.
  voidCurrentQuestion() {
    if (!this._questionKeys.size) return 0;
    if (this._questionSnapshot) {
      for (const [k, r] of this._questionSnapshot.facts) this.facts.set(k, { ...r });
      this.unlockedTiers = this._questionSnapshot.unlockedTiers;
      this.totalCorrect = this._questionSnapshot.totalCorrect;
      this.recent = this._questionSnapshot.recent.slice();
    }
    this._voided = new Set(this._questionKeys);
    this._answeredKeys.clear();
    this.save();
    return this._voided.size;
  }

  isCurrentQuestionVoided(a, b) {
    return this._voided.has(factKey(a, b));
  }

  endQuestion() {
    this._questionKeys.clear();
    this._answeredKeys.clear();
    this._voided.clear();
    this._questionSnapshot = null;
    this.referenceKey = null;
  }

  _rec(a, b) {
    const k = factKey(a, b);
    if (!this.facts.has(k)) {
      this.facts.set(k, {
        a: Math.min(a, b), b: Math.max(a, b),
        correct: 0, attempts: 0, streak: 0, level: 0, avgMs: 0, seen: 0,
        // a fact first met is due immediately, on the shortest rung
        due: this._now(), interval: FIRST_INTERVAL,
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
  // The same product cap multiplication uses. Without it a share-out ignored
  // difficulty entirely: a child capped at 12 for x could be handed 60 / 6,
  // which in Block Builder is a sixty-tap build.
  _productCap() {
    const acc = this.recentAccuracy();
    if (this.recent.length < 4) return 12;
    if (acc > 0.85) return 60;
    if (acc > 0.7) return 30;
    return 20;
  }

  // How much a record's schedule should push it forward in the draw.
  //   overdue  -> 1..2.5, growing with how many intervals late it is
  //   resting  -> 0.4, quiet but never silent (a rested fact is still fair game
  //               when nothing else is due, which keeps the flow zone varied)
  // Returns 1 for a fact with no record at all, so unseen facts keep exactly
  // the weight the picker already gave them.
  _dueWeight(r, now) {
    if (!r) return 1;
    const interval = r.interval > 0 ? r.interval : FIRST_INTERVAL;
    const over = now - (Number.isFinite(r.due) ? r.due : now);
    if (over < 0) return 0.4;
    return 1 + Math.min(1.5, over / interval);
  }

  _divisibleFacts() {
    const out = [];
    const cap = this._productCap();
    const tables = this.activeTables();
    const now = this._now();
    const seen = new Set();
    for (const t of tables) {
      for (let m = 2; m <= ASK_MAX; m++) {
        const k = factKey(t, m);
        if (seen.has(k)) continue; seen.add(k);
        const r = this.facts.get(k);
        if (r && r.level >= DIV_UNLOCK_LEVEL && r.a !== r.b && r.a * r.b <= cap) out.push(r); // skip squares (a/a is trivial)
      }
    }
    // The ÷ path draws by deterministic rotation rather than by weight, so
    // due-ness enters here as an ordering + filter instead: most overdue
    // first, and if two or more facts are actually due, rotate through only
    // those. The "two or more" guard stops a single overdue fact from being
    // served every ÷ round in a row.
    out.sort((x, y) => this._dueWeight(y, now) - this._dueWeight(x, now));
    const due = out.filter((r) => now >= r.due);
    return due.length >= 2 ? due : out;
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

    const now = this._now();
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
        // Scheduling multiplies the existing weakness weight rather than
        // replacing it: a weak fact that is also overdue rises furthest, and a
        // strong fact that has rested long enough can still surface.
        w *= this._dueWeight(r, now);
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
      // Alternate which factor divides. It was always the smaller one, so a
      // child met 60 / 6 = 10 but never 60 / 10 = 6: half of every fact family
      // went unpractised.
      const flip = (this._divToggle = (this._divToggle || 0) + 1) % 2 === 0;
      const divisor = flip ? r.b : r.a;
      const quotient = flip ? r.a : r.b;
      const dividend = divisor * quotient;
      return { op: 'div', dividend, divisor, quotient, answer: quotient, a: r.a, b: r.b };
    }

    const chosen = this._pickMulFact();
    return { op: 'mul', a: chosen.a, b: chosen.b, answer: chosen.a * chosen.b };
  }

  // Record an outcome against the canonical fact (a,b) — the same record backs
  // both a×b and (a·b)÷a, so division practice moves multiplication mastery too.
  record(a, b, correct, ms) {
    const k = factKey(a, b);
    const r = this._rec(a, b);
    if (this._voided.has(k)) {
      this.save();
      if (this._questionKeys.has(k)) {
        this._answeredKeys.add(k);
        if (this._answeredKeys.size === this._questionKeys.size) this.endQuestion();
      }
      return r;
    }
    const now = this._now();
    r.attempts++;
    // Leitner: right promotes one rung, wrong falls all the way back.
    r.interval = correct ? promoteInterval(r.interval) : FIRST_INTERVAL;
    r.due = now + r.interval;
    if (correct) {
      r.correct++;
      r.streak++;
      this.totalCorrect++;
      r.avgMs = r.avgMs ? r.avgMs * 0.6 + ms * 0.4 : ms;
      // A level-up consumes the streak, so each level needs its own fresh run
      // of three. Without the reset, streak stayed above 3 forever and every
      // subsequent correct answer bumped a level: four answers reached "strong"
      // and five reached level 4, which is not mastery, it is a hot streak.
      if (r.streak >= 3 && r.avgMs <= LEVEL_MS[Math.min(r.level + 1, 4)]) {
        r.level = Math.min(4, r.level + 1);
        r.streak = 0;
      }
    } else {
      r.streak = 0;
      r.level = Math.max(0, r.level - 1); // forgiving decay
    }
    this.recent.push(!!correct);
    if (this.recent.length > 8) this.recent.shift();
    this._maybeRampTables();
    this.save();
    if (this._questionKeys.has(k)) {
      this._answeredKeys.add(k);
      if (this._answeredKeys.size === this._questionKeys.size) this.endQuestion();
    }
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

  // ---- read-only views (the parent dashboard) ----
  //
  // Both of these are PURE reads, in the same spirit as `levelOf`: a parent
  // opening a dashboard must not create records for facts their child has
  // never met, or the ledger would fill with phantom facts at level 0 and the
  // picker would treat them as seen. Nothing below touches `_rec`.

  // Every fact that HAS a record, weakest first. Weakest = lowest level, then
  // worst accuracy, then most overdue — the order a parent wants to read.
  factRows() {
    const now = this._now();
    const rows = [];
    for (const [key, r] of this.facts) {
      rows.push({
        key,
        a: r.a, b: r.b,
        level: r.level,
        correct: r.correct,
        attempts: r.attempts,
        streak: r.streak,
        avgMs: r.avgMs,
        seen: r.seen,
        due: r.due,
        interval: r.interval,
        overdueMs: now - r.due, // negative while the fact is still resting
      });
    }
    const acc = (row) => (row.attempts > 0 ? row.correct / row.attempts : 0);
    rows.sort((x, y) => x.level - y.level
      || acc(x) - acc(y)
      || y.overdueMs - x.overdueMs
      || (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
    return rows;
  }

  // Headline numbers for the dashboard. `known` is level >= 3 (fast and
  // repeatedly right), which is the threshold at which a fact stops needing
  // regular practice.
  summary() {
    const now = this._now();
    let attempts = 0, correct = 0, known = 0, dueNow = 0;
    for (const r of this.facts.values()) {
      attempts += r.attempts;
      correct += r.correct;
      if (r.level >= 3) known++;
      if (now >= r.due) dueNow++;
    }

    const tables = [...new Set(TABLE_TIERS.flat())].sort((x, y) => x - y);
    const byTable = tables.map((t) => {
      let seen = 0, tKnown = 0;
      for (let m = 2; m <= 10; m++) {
        const r = this.facts.get(factKey(t, m));
        if (!r) continue;
        seen++;
        if (r.level >= 3) tKnown++;
      }
      return { table: t, mastery: this.tableMastery(t), seen, known: tKnown };
    });

    return {
      totalSeen: this.facts.size, // facts with a record, i.e. ever met
      known,
      dueNow,
      accuracy: attempts > 0 ? correct / attempts : 0,
      unlockedTiers: this.unlockedTiers,
      byTable,
    };
  }
}

export { factKey };
