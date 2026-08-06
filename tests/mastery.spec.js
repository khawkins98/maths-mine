import { test, expect } from '@playwright/test';
import { MasteryStore, factKey } from '../src/game/mastery.js';

// The mastery ledger is plain logic — no three.js, no DOM, no localStorage —
// so it is tested by importing it straight into the Playwright runner's Node
// process. No page, no server, no wall clock: `storage` and `now` are both
// injected, which is the whole point of injecting them.
//
// Everything below drives a FAKE clock. A test that read Date.now() would be
// asserting on the machine it happens to run on.

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// The rungs the store schedules on, in order.
const LADDER = [45 * SEC, 3 * MIN, 12 * MIN, 1 * DAY, 3 * DAY, 7 * DAY];

// A localStorage-shaped object backed by a Map, plus a fake clock the test
// moves by hand.
function harness({ seed = null, start = 1_000 } = {}) {
  const map = new Map();
  if (seed !== null) map.set('mastery.v1', typeof seed === 'string' ? seed : JSON.stringify(seed));
  const storage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  const clock = { t: start };
  const store = new MasteryStore({ storage, now: () => clock.t });
  return { store, clock, storage, raw: () => map.get('mastery.v1') };
}

const rec = (store, a, b) => store.facts.get(factKey(a, b));

test.describe('interval ladder', () => {
  test('a correct answer climbs one rung, and the top rung holds', () => {
    const { store, clock } = harness();

    // Answers are deliberately SLOW (20s) so no level-up fires: this test is
    // about the schedule, not about the mastery level.
    const seen = [];
    for (let i = 0; i < LADDER.length + 1; i++) {
      const r = store.record(2, 3, true, 20_000);
      seen.push(r.interval);
      expect(r.due).toBe(clock.t + r.interval);
      clock.t += 1 * MIN;
    }

    // A brand-new fact starts on rung 0, so the first correct answer promotes
    // it to rung 1; the last two answers both sit on the top rung.
    expect(seen).toEqual([...LADDER.slice(1), LADDER[LADDER.length - 1], LADDER[LADDER.length - 1]]);
  });

  test('a wrong answer drops all the way back to the shortest rung', () => {
    const { store, clock } = harness();
    for (let i = 0; i < 4; i++) { store.record(2, 3, true, 20_000); clock.t += MIN; }
    expect(rec(store, 2, 3).interval).toBe(3 * DAY);

    const r = store.record(2, 3, false, 20_000);
    expect(r.interval).toBe(LADDER[0]);
    expect(r.due).toBe(clock.t + LADDER[0]);

    // ...and it climbs again from the bottom, not from where it fell.
    expect(store.record(2, 3, true, 20_000).interval).toBe(LADDER[1]);
  });

  test('a fact met for the first time is due immediately', () => {
    const { store, clock } = harness();
    const q = store.nextQuestion({ op: 'mul' });
    const r = rec(store, q.a, q.b);
    expect(r.due).toBe(clock.t);
    expect(r.interval).toBe(LADDER[0]);
    expect(store.summary().dueNow).toBe(1);
  });
});

test.describe('the picker favours overdue facts', () => {
  test('an overdue fact is drawn far more often than a resting one', () => {
    const { store, clock } = harness();

    // Two facts, identical in every way the old weighting could see: both
    // level 0 (slow answers), both with a live streak, both inside the product
    // cap. The ONLY difference is where they sit in the schedule.
    store.record(2, 3, true, 20_000);                       // -> rests 3 min
    for (let i = 0; i < 4; i++) store.record(5, 6, true, 20_000); // -> rests 3 days

    expect(rec(store, 2, 3).level).toBe(0);
    expect(rec(store, 5, 6).level).toBe(0);
    expect(rec(store, 2, 3).interval).toBe(3 * MIN);
    expect(rec(store, 5, 6).interval).toBe(3 * DAY);

    clock.t += 10 * MIN; // 2x3 is now well overdue; 5x6 is still resting

    const counts = new Map();
    for (let i = 0; i < 400; i++) {
      const q = store.nextQuestion({ op: 'mul' });
      const k = factKey(q.a, q.b);
      counts.set(k, (counts.get(k) || 0) + 1);
    }

    const overdue = counts.get('2x3') || 0;
    const resting = counts.get('5x6') || 0;
    expect(overdue).toBeGreaterThan(resting * 3);
    expect(overdue).toBeGreaterThan(0);
  });

  test('the division path serves due facts ahead of resting ones', () => {
    const { store, clock } = harness();

    // Unlock ÷ on several facts (needs level >= 1, so answer these FAST).
    for (const [a, b] of [[2, 3], [2, 4], [2, 5], [5, 4]]) {
      for (let i = 0; i < 3; i++) { store.record(a, b, true, 1_500); clock.t += SEC; }
      expect(rec(store, a, b).level).toBeGreaterThanOrEqual(1);
    }
    // Push two of them far into the future, leave two due.
    rec(store, 2, 3).due = clock.t + 3 * DAY;
    rec(store, 2, 4).due = clock.t + 3 * DAY;
    rec(store, 2, 5).due = clock.t - 5 * MIN;
    rec(store, 5, 4).due = clock.t - 20 * MIN;

    const keys = store._divisibleFacts().map((r) => factKey(r.a, r.b));
    expect(keys).toEqual(['4x5', '2x5']); // most overdue first, resting excluded

    for (let i = 0; i < 20; i++) {
      const q = store.nextQuestion({ op: 'div' });
      expect(['2x5', '4x5']).toContain(factKey(q.a, q.b));
      expect(q.dividend).toBe(q.divisor * q.quotient);
    }
  });

  test('the existing tuning still holds: anti-repeat, caps, and no squares in ÷', () => {
    const { store } = harness();
    const MIN_PRODUCT = 6;
    let last = null;
    for (let i = 0; i < 120; i++) {
      const q = store.nextQuestion({ op: 'mul' });
      const k = factKey(q.a, q.b);
      expect(k).not.toBe(last);          // anti-repeat via lastKey
      expect(q.a * q.b).toBeGreaterThanOrEqual(MIN_PRODUCT);
      expect(q.a * q.b).toBeLessThanOrEqual(60); // product cap, best case
      expect(q.answer).toBe(q.a * q.b);
      last = k;
    }
    // squares are de-weighted, never eliminated, but ÷ must skip them entirely
    for (const r of store._divisibleFacts()) expect(r.a).not.toBe(r.b);
  });
});

test.describe('backward compatibility with mastery.v1', () => {
  const legacy = {
    facts: [
      ['2x3', { a: 2, b: 3, correct: 7, attempts: 9, streak: 2, level: 3, avgMs: 4200, seen: 11 }],
      ['5x6', { a: 5, b: 6, correct: 1, attempts: 4, streak: 0, level: 0, avgMs: 8800, seen: 4 }],
    ],
    unlockedTiers: 2,
    totalCorrect: 8,
    recent: [true, false, true, true],
  };

  test('a save with no due/interval loads with nothing lost, due now', () => {
    const start = 5_000_000;
    const { store, clock } = harness({ seed: legacy, start });
    expect(clock.t).toBe(start);

    const a = rec(store, 2, 3);
    expect(a).toMatchObject({ a: 2, b: 3, correct: 7, attempts: 9, streak: 2, level: 3, avgMs: 4200, seen: 11 });
    expect(a.due).toBe(start);          // never scheduled: treat as due now
    expect(a.interval).toBe(LADDER[0]); // and on the shortest rung

    expect(rec(store, 5, 6)).toMatchObject({ correct: 1, attempts: 4, level: 0, seen: 4 });
    expect(store.unlockedTiers).toBe(2);
    expect(store.totalCorrect).toBe(8);
    expect(store.recent).toEqual([true, false, true, true]);
    expect(store.summary().dueNow).toBe(2);
  });

  test('the key is still mastery.v1 and a re-save round-trips the new fields', () => {
    const { store, clock, raw, storage } = harness({ seed: legacy, start: 5_000_000 });
    clock.t += HOUR;
    store.record(2, 3, true, 20_000);

    expect(storage.getItem('mastery.v1')).toBeTruthy();
    const written = JSON.parse(raw());
    const entry = written.facts.find(([k]) => k === '2x3')[1];
    expect(entry.correct).toBe(8);
    expect(entry.interval).toBe(LADDER[1]);
    expect(entry.due).toBe(clock.t + LADDER[1]);

    // and a second store reading that save sees the same schedule
    const reload = new MasteryStore({ storage, now: () => clock.t });
    expect(rec(reload, 2, 3).due).toBe(clock.t + LADDER[1]);
    expect(rec(reload, 2, 3).interval).toBe(LADDER[1]);
    expect(reload.totalCorrect).toBe(9);
  });

  test('a corrupt save starts fresh instead of crashing', () => {
    for (const seed of [
      'not json at all {{{',
      { facts: 'nope' },
      { facts: [null, 'x', ['2x3'], ['2x3', null], ['2x3', { a: 2, b: 'three' }]], unlockedTiers: 99 },
      { facts: [['2x3', { a: 2, b: 3, level: 99, correct: NaN, due: 'soon', interval: -5 }]] },
    ]) {
      const { store, clock } = harness({ seed, start: 7_777 });
      // whatever survived is well-formed, and the store is playable
      for (const r of store.facts.values()) {
        expect(Number.isFinite(r.due)).toBe(true);
        expect(r.interval).toBeGreaterThan(0);
        expect(r.level).toBeGreaterThanOrEqual(0);
        expect(r.level).toBeLessThanOrEqual(4);
        expect(Number.isFinite(r.correct)).toBe(true);
      }
      expect(store.unlockedTiers).toBeGreaterThanOrEqual(1);
      expect(store.unlockedTiers).toBeLessThanOrEqual(5);
      const q = store.nextQuestion({ op: 'mul' });
      expect(q.answer).toBe(q.a * q.b);
      expect(clock.t).toBe(7_777); // the fake clock is the only clock in play
    }
  });
});

test.describe('injected clock', () => {
  test('every time read goes through `now`, never Date.now()', () => {
    let calls = 0;
    const clock = { t: 1_000 };
    const store = new MasteryStore({ storage: null, now: () => { calls++; return clock.t; } });

    store.nextQuestion({ op: 'mul' });
    const r = store.record(2, 3, true, 20_000);
    expect(calls).toBeGreaterThan(0);

    // Every scheduling number is an offset from the fake epoch, so nothing here
    // could have come from the real clock (which is ~1.7e12).
    expect(r.due).toBe(1_000 + LADDER[1]);
    expect(store.factRows().every((row) => row.due < 1e9)).toBe(true);

    // Moving the fake clock forward is what makes a fact overdue.
    expect(store.summary().dueNow).toBe(0);
    clock.t += 10 * MIN;
    expect(store.summary().dueNow).toBe(1);
    expect(store.factRows().find((x) => x.key === '2x3').overdueMs).toBe(10 * MIN - LADDER[1]);
  });

  test('the default clock is Date.now', () => {
    const before = Date.now();
    const store = new MasteryStore({ storage: null });
    const r = store.record(2, 3, true, 20_000);
    expect(r.due).toBeGreaterThanOrEqual(before + LADDER[1]);
  });
});

test.describe('dashboard reads', () => {
  test('factRows lists every recorded fact, weakest first, and creates none', () => {
    const { store, clock } = harness();
    for (let i = 0; i < 3; i++) { store.record(2, 3, true, 1_500); clock.t += SEC; }  // strong
    store.record(5, 6, false, 9_000);                                                 // weak
    store.record(2, 4, true, 20_000);                                                 // middling
    const before = store.facts.size;

    const rows = store.factRows();
    expect(rows).toHaveLength(before);
    expect(store.facts.size).toBe(before); // a pure read: no phantom records

    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(
        ['a', 'attempts', 'avgMs', 'b', 'correct', 'due', 'interval', 'key', 'level', 'overdueMs', 'seen', 'streak'],
      );
      expect(row.key).toBe(factKey(row.a, row.b));
      expect(row.overdueMs).toBe(clock.t - row.due);
    }
    // weakest first: levels never decrease down the list
    for (let i = 1; i < rows.length; i++) expect(rows[i].level).toBeGreaterThanOrEqual(rows[i - 1].level);
    expect(rows[rows.length - 1].key).toBe('2x3');
  });

  test('summary reports the headline numbers without touching the ledger', () => {
    const { store, clock } = harness();
    // three clean runs of three: each level-up consumes the streak, so it takes
    // nine correct answers to reach level 3 ("known")
    for (let i = 0; i < 9; i++) { store.record(2, 3, true, 1_200); clock.t += SEC; }
    store.record(5, 6, false, 9_000);
    clock.t += MIN; // the missed fact's 45s rest has now elapsed
    const before = store.facts.size;

    const s = store.summary();
    expect(store.facts.size).toBe(before);
    expect(Object.keys(s).sort()).toEqual(
      ['accuracy', 'byTable', 'dueNow', 'known', 'totalSeen', 'unlockedTiers'],
    );
    expect(s.totalSeen).toBe(2);
    expect(s.known).toBe(1);                    // 2x3 reached level >= 3
    expect(rec(store, 2, 3).level).toBeGreaterThanOrEqual(3);
    expect(s.accuracy).toBeCloseTo(9 / 10, 6);
    expect(s.unlockedTiers).toBe(store.unlockedTiers);
    expect(s.dueNow).toBe(1);                   // the missed fact only

    expect(s.byTable.map((t) => t.table)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const two = s.byTable.find((t) => t.table === 2);
    expect(two.mastery).toBe(store.tableMastery(2));
    expect(two.seen).toBe(1);
    expect(two.known).toBe(1);
    const nine = s.byTable.find((t) => t.table === 9);
    expect(nine).toEqual({ table: 9, mastery: 0, seen: 0, known: 0 });
  });
});
