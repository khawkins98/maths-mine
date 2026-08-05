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

export const HEAD_COLORS = [0x67cdc4, 0xffe08a, 0xff9ec2]; // teal / butter-yellow / pink
export const BODY_COPPER = 0xc77b4a;
export const GOOD_GREEN = 0x43d17c;
export const CONFETTI_COLS = [0xff6b6b, 0xffd24a, 0x58e08a, 0x6ad2ff, 0xb98bff, 0xff9f5a, 0x7ef0d0, 0xf78fb3];

export const TRUE_LABEL = '✓ True';
export const FALSE_LABEL = '✗ False';
