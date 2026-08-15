// Shared staging numbers for both Spot the Wrong'un tiers.

import * as THREE from 'three';

// Once overall mastery passes this, new sessions default to the harder IMPOSTER
// tier instead of JUDGE. (Debug hook __stwTier can force either for testing.)
export const IMPOSTER_THRESHOLD = 0.5;

// Fixed, gently-elevated FRONTAL views so signs + array read head-on.
export const VIEW = new THREE.Vector3(0, 0.26, 1).normalize();
export const VIEW_JUDGE = new THREE.Vector3(0, 0.42, 1).normalize(); // higher: see grass tops

// --- imposter-tier seat layout ---
//
// The crew grows with mastery, so the seats are computed rather than listed.
// Each size carries its own spacing, sign scale and camera pull-back, because
// the three constraints fight each other: more villagers need a wider frame,
// a wider frame is a further camera, and a further camera shrinks the sign
// text that the whole game is about reading.
//
// CREW_MAX is 4 and that is a LEGIBILITY cap, not an arbitrary one. The worst
// case we design for is an upright tablet (3:4). With a 45° vertical fov the
// visible half-width at distance d is only ~0.31·d there, so five seats plus
// their signs need d ≈ 21, which puts the sign lettering at roughly 23 CSS px
// on a 768×1024 screen — below the floor the legibility audit set. Four seats
// fit at d = 19 with ~7% of the width still to spare, and hold the lettering
// near 30 px. If the signs ever get smaller or the camera closer, this number
// moves with them.
export const CREW_MIN = 3;
export const CREW_MAX = 4;

const CREW_FIT = {
  3: { gap: 3.35, sign: 1.0, dist: 15.5 },  // the original, hand-tuned trio
  4: { gap: 3.0, sign: 0.9, dist: 19.0 },
};

// Seats left→right, plus the sign scale and camera distance that size wants.
// The arc (centre seats stepping toward the camera) is what stops a row of
// villagers reading as a police line-up.
export function crewLayout(n) {
  const fit = CREW_FIT[n] || CREW_FIT[CREW_MAX];
  const x = [], z = [];
  const mid = (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    x.push((i - mid) * fit.gap);
    const edge = mid === 0 ? 0 : Math.abs(i - mid) / mid; // 0 centre … 1 outermost
    z.push(-0.5 + (1 - edge) * 1.05);
  }
  return { x, z, signScale: fit.sign, dist: fit.dist };
}

export const BASE_Y = 0;     // authored character models have feet at zero
export const SIGN_Y = 3.05;  // sign centre height, above the raised arms

export const GOOD_GREEN = 0x43d17c;
export const CONFETTI_COLS = [0xff6b6b, 0xffd24a, 0x58e08a, 0x6ad2ff, 0xb98bff, 0xff9f5a, 0x7ef0d0, 0xf78fb3];

export const TRUE_LABEL = '✓ True';
export const FALSE_LABEL = '✗ False';
