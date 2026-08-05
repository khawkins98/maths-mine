// core/choices.js — the three answer cards.
//
// This is a teaching decision, not a layout one, so it is stated once here
// rather than reimplemented per game.
//
// An audit found the previous version was trivially gameable without doing any
// arithmetic at all. Both games built the set as `{p - d, p, p + d}`, and since
// `p - d > 0` always held, the answer was ALWAYS the numerically middle option.
// The shuffle leaked it too: the rotation was `p % 3` over a fixed insertion
// order, which put the answer in the first slot for 27 of the 45 askable facts,
// and for every single question in the 3, 6 and 9 tables.
//
// So "tap the middle number" scored 100%, and "tap the first button" scored 60%
// overall and 100% on three whole tables — and the mastery ledger dutifully
// recorded level 4 across the board. A game that can be beaten by position is
// worse than no game: it tells a parent the child knows something they do not.
//
// Now the distractors straddle the answer in a varied pattern (sometimes both
// above, sometimes both below, sometimes one either side) and the order is
// genuinely shuffled, so neither value nor position carries any signal.

// Fisher-Yates. Real randomness is correct here: any deterministic order is a
// pattern, and a pattern is exactly what we are trying to remove.
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// `answer` is the truth; `step` is the natural near-miss for this question — a
// whole group for a multiplication array, one-per-group for a share-out. A
// distractor a child might actually arrive at teaches more than a random number.
export function buildChoiceSet(answer, step, count = 3) {
  const d = Math.max(1, Math.round(step));

  // The answer must be the smallest, the middle or the largest value about
  // equally often. Offsets are in units of `step`, so every distractor is a
  // near-miss a child might genuinely arrive at rather than a random number.
  //
  // Picking a shape at random is not enough on its own: an earlier version drew
  // uniformly from five shapes, three of which happened to leave the answer in
  // the middle, so "tap the middle number" still won 61% of the time. Draw the
  // ROLE first, then a shape for it.
  const roles = [
    [[1, 2], [1, 3]],      // answer smallest
    [[-1, 1], [-1, 2], [-2, 1]], // answer in the middle
    [[-2, -1], [-3, -1]],  // answer largest
  ];

  for (const role of shuffle(roles.slice())) {
    const shape = role[(Math.random() * role.length) | 0];
    const set = new Set([answer]);
    for (const k of shape) {
      const v = answer + k * d;
      if (v > 0) set.add(v);
    }
    if (set.size >= count) return shuffle([...set].slice(0, count));
  }

  // Should be unreachable; a correct-but-dull fallback beats throwing.
  const set = new Set([answer]);
  let n = 0;
  while (set.size < count) { const v = answer + (++n) * d; if (v > 0) set.add(v); }
  return shuffle([...set]);
}
