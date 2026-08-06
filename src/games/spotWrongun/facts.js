// Fact selection for Spot the Wrong'un.
//
// This game is about CHECKING facts, so it needs two things the other games
// don't: a set of distinct facts to put on several signs at once, and a wrong
// answer that is genuinely tempting rather than obviously silly.

import { factKey } from '../../game/mastery.js';
import { CREW_MIN, CREW_MAX } from './constants.js';

const ASK_MAX = 6; // largest multiplier the ledger ever serves in this slice

export function createFactPicker(mastery) {
  // How well a fact is known (0..4) — the imposter tier makes a fibber of the
  // shakiest fact on the table, so the child practises what they need.
  const level = (a, b) => mastery.levelOf(a, b);

  // `n` distinct facts, drawn from the adaptive ledger first, then topped up
  // from the active tables, then from a fixed fallback list. The guards matter:
  // nextQuestion() has anti-repeat logic that can legitimately return the same
  // fact twice, and three signs must never show the same sum.
  function drawDistinct(n) {
    const out = [], seen = new Set();
    let guard = 0;
    while (out.length < n && guard++ < 40) {
      const q = mastery.nextQuestion({ op: 'mul' });
      const k = factKey(q.a, q.b);
      if (seen.has(k)) continue;
      seen.add(k); out.push({ op: 'mul', a: q.a, b: q.b, answer: q.a * q.b });
    }
    if (out.length < n) {
      outer: for (const t of mastery.activeTables()) for (let m = 2; m <= 6; m++) {
        const k = factKey(t, m); if (seen.has(k) || t * m < 6) continue;
        seen.add(k); out.push({ op: 'mul', a: t, b: m, answer: t * m });
        if (out.length >= n) break outer;
      }
    }
    const fb = [[2, 3], [2, 4], [5, 2], [3, 4], [5, 3], [2, 6]];
    let i = 0;
    while (out.length < n) {
      const [a, b] = fb[i++ % fb.length]; const k = factKey(a, b);
      if (!seen.has(k)) { seen.add(k); out.push({ op: 'mul', a, b, answer: a * b }); }
    }
    return out;
  }

  // ---------- division ----------
  //
  // The ledger owns the gate: a fact's ÷ form only exists once its × sibling is
  // known (level ≥ 1), and `nextQuestion({ op: 'div' })` will still hand back a
  // well-formed round when NOTHING is eligible yet, by falling back to a plain
  // multiplication fact. That fallback is right for Block Builder and wrong
  // here — it would put a division sign in front of a child who has not earned
  // one — so every drawn round is re-checked against the same rule and a round
  // that fails it is simply not offered as division.
  const eligible = (a, b) => a !== b && mastery.levelOf(a, b) >= 1;

  // Is there anything to ask at all? Counted the same way the ledger counts,
  // through the public levelOf(), never by reading mastery.facts.
  function divisionReady(n = 1) {
    let found = 0;
    const seen = new Set();
    for (const t of mastery.activeTables()) {
      for (let m = 2; m <= ASK_MAX; m++) {
        const k = factKey(t, m);
        if (seen.has(k)) continue;
        seen.add(k);
        if (eligible(t, m) && ++found >= n) return true;
      }
    }
    return false;
  }

  // One division round: { a, b, dividend, divisor, quotient, answer }.
  // `a,b` stay the canonical factors, because that is what record() scores.
  // Returns null when the ledger has nothing unlocked — callers fall back to ×.
  function drawDiv() {
    let fallback = null;
    for (let guard = 0; guard < 12; guard++) {
      const q = mastery.nextQuestion({ op: 'div' });
      if (q.op !== 'div' || !eligible(q.a, q.b)) continue;
      const round = {
        op: 'div', a: q.a, b: q.b,
        dividend: q.dividend, divisor: q.divisor, quotient: q.quotient,
        answer: q.quotient,
      };
      // The array shows one ROW per group, so the divisor is a row count. Past
      // about six the wall towers, the camera backs off to fit it and the
      // emeralds a child is supposed to count go tiny. The ledger alternates
      // which factor divides, so asking again usually hands back the same fact
      // the other way up — 60 ÷ 10 becomes 60 ÷ 6, which is the same fact
      // family in a shape that fits the screen.
      if (round.divisor <= 6) return round;
      fallback = fallback || round;
    }
    return fallback;
  }

  // `n` distinct division rounds for a crew of signs, or null if the child has
  // not unlocked enough of them to fill the stage without repeating a sum.
  function drawDistinctDiv(n) {
    const out = [], seen = new Set();
    let guard = 0;
    while (out.length < n && guard++ < 40) {
      const d = drawDiv();
      if (!d) return null;
      const k = factKey(d.a, d.b);
      if (seen.has(k)) continue;
      seen.add(k); out.push(d);
    }
    return out.length === n ? out : null;
  }

  // A PLAUSIBLE NEIGHBOUR wrong answer: the product of a×(b±1) or (a±1)×b —
  // never off-by-one, never random. A child who has half-learned the table lands
  // on exactly these, so a wrong sign is worth catching; `56` for `7×8` teaches
  // nothing if the alternative on offer is `13`.
  function plausibleWrong(a, b, rot) {
    const truth = a * b;
    const cands = [];
    if (b - 1 >= 2) cands.push(a * (b - 1));
    cands.push(a * (b + 1));
    if (a - 1 >= 2) cands.push((a - 1) * b);
    cands.push((a + 1) * b);
    const uniq = [...new Set(cands)].filter((v) => v > 0 && v !== truth);
    uniq.sort((x, y) => Math.abs(x - truth) - Math.abs(y - truth)); // closest first
    const pool = uniq.slice(0, Math.min(3, uniq.length));
    return pool.length ? pool[rot % pool.length] : truth + a;
  }

  // The division equivalent, and the same principle. A child works out 42 ÷ 6
  // by hunting the 6-times table, so their near-misses are the neighbouring
  // multiples: 7 becomes 6 or 8, never 15. Anything below 2 is dropped — "= 1"
  // and "= 0" are answers no child arrives at by reasoning, so a sign showing
  // one is spotted without doing the maths.
  function plausibleWrongQuotient(quotient, rot) {
    const cands = [quotient - 1, quotient + 1, quotient - 2, quotient + 2]
      .filter((v) => v >= 2 && v !== quotient);
    return cands.length ? cands[rot % cands.length] : quotient + 1;
  }

  // ---------- how many villagers ----------
  //
  // Demonstrated mastery, not a round counter or a session count: the crew only
  // grows once the child has actually taken facts to "strong" (level ≥ 2), so a
  // child having a rough day never finds four signs waiting for them.
  function strongCount() {
    let strong = 0;
    const seen = new Set();
    for (const t of mastery.activeTables()) {
      for (let m = 2; m <= ASK_MAX; m++) {
        const k = factKey(t, m);
        if (seen.has(k)) continue;
        seen.add(k);
        if (mastery.levelOf(t, m) >= 2) strong++;
      }
    }
    return strong;
  }

  // One extra villager per six strong facts, capped — see CREW_MAX for why the
  // cap is where it is.
  function crewSize() {
    return Math.min(CREW_MAX, CREW_MIN + Math.floor(strongCount() / 6));
  }

  return {
    level, drawDistinct, plausibleWrong,
    divisionReady, drawDiv, drawDistinctDiv, plausibleWrongQuotient,
    strongCount, crewSize,
  };
}
