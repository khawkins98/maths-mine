// games/nightDefense/facts.js — Math fact challenge generator for Night Defence.
// Prioritises the child's unmastered facts from the shared mastery ledger.

export function createFactPicker(mastery) {
  function generateChoices(target, a, b, op) {
    const choices = new Set([target]);
    const offsets = [-1, 1, -2, 2, -b, b, -a, a];

    // Shuffle candidate offsets
    const shuffledOffsets = offsets.sort(() => Math.random() - 0.5);
    for (const off of shuffledOffsets) {
      const candidate = target + off;
      if (candidate > 0 && candidate !== target) {
        choices.add(candidate);
      }
      if (choices.size >= 4) break;
    }

    // Fallbacks if not enough unique positive distractors
    let fallback = 1;
    while (choices.size < 4) {
      if (target + fallback > 0 && target + fallback !== target) choices.add(target + fallback);
      fallback++;
    }

    return Array.from(choices).sort(() => Math.random() - 0.5);
  }

  function pickFact() {
    // 1. Check mastery for active/weak facts
    let a, b, op;
    const isDivision = Math.random() < 0.35; // 35% chance of division if unlocked

    if (mastery && typeof mastery.pickFact === 'function') {
      const picked = mastery.pickFact();
      if (picked) {
        a = picked.a;
        b = picked.b;
      }
    }

    if (!a || !b) {
      // Default tables: 2, 3, 4, 5, 6, 7, 8, 9, 10
      const tables = [2, 3, 4, 5, 6, 7, 8, 9, 10];
      a = tables[Math.floor(Math.random() * tables.length)];
      b = Math.floor(Math.random() * 9) + 2; // 2..10
    }

    if (isDivision) {
      const product = a * b;
      const target = a;
      return {
        a: product,
        b,
        op: '÷',
        target,
        text: `${product} ÷ ${b} = ?`,
        claimText: `${product} ÷ ${b} = ${target}`,
        choices: generateChoices(target, a, b, '÷'),
      };
    } else {
      const target = a * b;
      return {
        a,
        b,
        op: '×',
        target,
        text: `${a} × ${b} = ?`,
        claimText: `${a} × ${b} = ${target}`,
        choices: generateChoices(target, a, b, '×'),
      };
    }
  }

  return { pickFact };
}
