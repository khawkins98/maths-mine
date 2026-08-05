// core/ease.js — the easing curves the games animate with.
//
// All take and return 0..1. Kept in one place because three games were each
// carrying their own copy of the same four magic constants.

// Overshoot-and-settle. The default for anything that should feel springy —
// blocks landing, signs popping in.
export function easeOutBack(x) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

// Physical bounce, decaying over four hops. For things that fall and land.
export function easeOutBounce(x) {
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}

// Plain deceleration, no overshoot. For camera moves and fades, where a
// springy curve would read as a wobble.
export function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
