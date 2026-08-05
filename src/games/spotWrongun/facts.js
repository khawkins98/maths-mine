// Fact selection for Spot the Wrong'un.
//
// This game is about CHECKING facts, so it needs two things the other games
// don't: a set of distinct facts to put on several signs at once, and a wrong
// answer that is genuinely tempting rather than obviously silly.

import { factKey } from '../../game/mastery.js';

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
      seen.add(k); out.push({ a: q.a, b: q.b, answer: q.a * q.b });
    }
    if (out.length < n) {
      outer: for (const t of mastery.activeTables()) for (let m = 2; m <= 6; m++) {
        const k = factKey(t, m); if (seen.has(k) || t * m < 6) continue;
        seen.add(k); out.push({ a: t, b: m, answer: t * m });
        if (out.length >= n) break outer;
      }
    }
    const fb = [[2, 3], [2, 4], [5, 2], [3, 4], [5, 3], [2, 6]];
    let i = 0;
    while (out.length < n) {
      const [a, b] = fb[i++ % fb.length]; const k = factKey(a, b);
      if (!seen.has(k)) { seen.add(k); out.push({ a, b, answer: a * b }); }
    }
    return out;
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

  return { level, drawDistinct, plausibleWrong };
}
