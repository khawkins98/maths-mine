// Shared staging numbers for both Spot the Wrong'un tiers.

import * as THREE from 'three';

// Once overall mastery passes this, new sessions default to the harder IMPOSTER
// tier instead of JUDGE. (Debug hook __stwTier can force either for testing.)
export const IMPOSTER_THRESHOLD = 0.5;

// Fixed, gently-elevated FRONTAL views so signs + array read head-on.
export const VIEW = new THREE.Vector3(0, 0.26, 1).normalize();
export const VIEW_JUDGE = new THREE.Vector3(0, 0.42, 1).normalize(); // higher: see grass tops

// --- imposter-tier seat layout ---
export const NUG_X = [-3.35, 0, 3.35];   // three seats, left→right
export const NUG_Z = [-0.5, 0.55, -0.5]; // gentle arc: centre steps toward the camera

export const BASE_Y = 0.62;  // Nugget centre height (feet on the grass)
export const SIGN_Y = 3.05;  // sign centre height, above the raised arms

// Villager varieties, loosely after the Minecraft professions: a robe colour
// and the apron/trim that goes over it. The crew is drawn from these so three
// villagers standing together are told apart by what they wear, which is how
// you tell them apart in Minecraft too.
export const VILLAGERS = [
  { robe: 0x8a6242, trim: 0xc2a06d },  // farmer: brown, straw apron
  { robe: 0xe4e0d6, trim: 0xa33b32 },  // librarian: white, red band
  { robe: 0x7a4a8f, trim: 0x593369 },  // cleric: purple
  { robe: 0x474c55, trim: 0x2c3037 },  // toolsmith: dark grey
  { robe: 0x5c8a4a, trim: 0x3d6631 },  // nitwit: green
  { robe: 0xa4543f, trim: 0x76392a },  // mason: terracotta
];

export const SKIN = 0xc09372;      // villager skin
export const SKIN_DARK = 0xa87c5e; // the nose, a shade deeper
export const HAIR = 0x50331f;
export const BROW = 0x3a2415;
export const GOOD_GREEN = 0x43d17c;
export const CONFETTI_COLS = [0xff6b6b, 0xffd24a, 0x58e08a, 0x6ad2ff, 0xb98bff, 0xff9f5a, 0x7ef0d0, 0xf78fb3];

export const TRUE_LABEL = '✓ True';
export const FALSE_LABEL = '✗ False';
