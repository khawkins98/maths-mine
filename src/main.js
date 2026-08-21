// main.js — bootstrap for The Maths Mine.
//
// Builds the shared game context (the "ctx" every game module receives), wires
// the cross-cutting chrome (the wake gate that grants motion permission +
// unlocks audio, and the 🔊 voice toggle), then starts a game. Right now that's
// Block Builder straight after the gate — identical to the original flow — but
// games are launched through a tiny switcher so a second game (and a hub) can
// drop in against the documented interface (see src/games/README.md).

import * as THREE from 'three';

import { createTextures } from './core/textures.js';
import { createEngine } from './core/engine.js';
import { createAudio } from './core/audio.js';
import { createSpeech } from './core/speech.js';
import { createUI } from './core/ui.js';
import { createWorldFeel } from './core/worldFeel.js';
import { loadCharacterAssets } from './core/characters.js';
import { loadMobs } from './core/mobs.js';

import { MasteryStore } from './game/mastery.js';
import { Wallet } from './game/wallet.js';
import { TiltInput } from './game/sensors.js';
import { createBolt } from './game/bolt.js';
import { BIOME_ORDER } from './core/biomes.js';

import { createBlockBuilder } from './games/blockBuilder.js';
import { createSpotWrongun } from './games/spotWrongun/index.js';
import { createNightDefense } from './games/nightDefense/index.js';
import { createHub } from './hub.js';
import { createReferenceTray } from './game/referenceTray.js';

// ---------- shared services ----------
const textures = createTextures();
await textures.ready;
const [characterAssets, mobFactories] = await Promise.all([
  loadCharacterAssets(),
  loadMobs(),
]);
const engine = createEngine({ textures });
const audio = createAudio();
const speech = createSpeech();
const ui = createUI();
const mastery = new MasteryStore();
const wallet = new Wallet();
const sensors = new TiltInput();
const bolt = createBolt({ scene: engine.scene, camera: engine.camera, textures, characterAssets, nowT: engine.nowT, bubbleEl: ui.els.bubble });
// Parallax + a springy, touchable ground. Long-lived: it belongs to the world,
// not to any one game, so it survives every game switch.
const worldFeel = createWorldFeel({ engine, audio, textures });

// ---------- the shared game context ----------
// Everything a game module needs. A game adds its objects to a group it owns
// and fully tears them down; it never reaches into the DOM or the engine
// internals except through these handles.
const ctx = {
  renderer: engine.renderer,
  scene: engine.scene,
  camera: engine.camera,
  engine,        // frame/reset camera, worldToScreen, nowT, placeCamera, VIEW_DIR
  textures,      // shared CanvasTextures (do NOT dispose in teardown)
  characterAssets, // shared Kenney model geometry + interchangeable skins
  mobFactories,    // Minecraft mobs: villager, zombie, ghast, enderman (GLB or procedural fallback)
  audio,         // WebAudio SFX
  speech,        // TTS narration + phrase variety
  ui,            // HUD helpers
  bolt,          // 3D mascot: say/react/update/setOxidation
  mastery,       // shared adaptive per-fact ledger (× and ÷)
  wallet,        // bolts (🔩): shared across games AND sessions
  sensors,       // tilt input
  worldFeel,     // parallax + ground spring: worldFeel.impulse(strength, x, z)
  // Permission alone is not proof that the device is sending usable motion.
  // Report tilt mode only after a real orientation sample has arrived.
  get usingSensors() { return sensors.enabled && sensors.available; },
  onExit: null,  // set by the host (hub/main) so a game can request to leave
};

window.__engine = () => engine;

// ---------- game switcher ----------
// title is read off the factory function by the hub for card labels
createBlockBuilder.title = 'Block Builder';
createSpotWrongun.title = 'Spot the Wrong’un';
createNightDefense.title = 'Night Defence';
const GAMES = {
  'block-builder': createBlockBuilder,
  'spot-the-wrongun': createSpotWrongun,
  'night-defense': createNightDefense,
};
let current = null;
function startGame(id, opts) {
  // A throwing teardown must not leave `current` pointing at a half-dead game
  // that the render loop keeps calling update() on.
  if (current) {
    try { current.teardown(); } finally { current = null; audio.hush(); }
  }
  const factory = GAMES[id];
  if (!factory) { console.warn('unknown game', id); return; }
  current = factory(ctx);
  current.start(opts || {});
  return current;
}
// tear down the active game without starting another (used when opening the hub)
function stopGame() {
  if (!current) return;
  try { current.teardown(); } finally { current = null; audio.hush(); }
}
// expose for the hub + tests
ctx.startGame = startGame;
ctx.stopGame = stopGame;
ctx.games = GAMES;

// the game picker
const hub = createHub(ctx);

// the times-table reference tray ("cheat sheet")
const referenceTray = createReferenceTray({ mastery, ui });
ctx.referenceTray = referenceTray;

// debug hook: the shared mascot (headless smoke tests + oxidation checks)
window.__bolt = bolt;
window.__audio = audio;
window.__speech = speech;
window.__referenceTray = referenceTray;
window.__sensors = () => ({
  enabled: sensors.enabled,
  available: sensors.available,
  usingSensors: ctx.usingSensors,
  x: sensors.x,
  y: sensors.y,
});

// ---------- debug terrain switching ([ and ]) ----------
function cycleBiome(delta) {
  const currentId = engine.currentBiome().id;
  let idx = BIOME_ORDER.indexOf(currentId);
  if (idx < 0) idx = 0;
  const nextIdx = (idx + delta + BIOME_ORDER.length) % BIOME_ORDER.length;
  const nextId = BIOME_ORDER[nextIdx];
  engine.setBiome(nextId);
  const b = engine.currentBiome();
  ui.showToast(`Biome: ${b.name}`, 'good');
  return b;
}
window.__nextBiome = () => cycleBiome(1);
window.__prevBiome = () => cycleBiome(-1);

document.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
  if (e.key === ']') {
    cycleBiome(1);
  } else if (e.key === '[') {
    cycleBiome(-1);
  }
});

// ---------- render loop dispatch ----------
// The engine owns the loop; here we fan out per-frame work: the active game's
// juice/logic, then Bolt (shared, always animated once visible).
engine.onFrame((dt) => {
  if (current) current.update(dt);
  bolt.update(dt);
  bolt.updateBubble();
  worldFeel.update(dt);
});
engine.start();

// ---------- cross-cutting chrome ----------
// Every control knocks like wood. Delegated from the document on pointerdown
// (not click) so the sound lands the instant a finger touches, which is what
// makes a control feel physical rather than laggy. New buttons get it free.
document.addEventListener('pointerdown', (e) => {
  const btn = e.target.closest && e.target.closest('button');
  if (!btn || btn.disabled) return;
  if (btn === ui.els.btnWake) return; // the gate itself: audio isn't unlocked yet
  const bright = btn.classList.contains('hub-card') ? 0.8    // big soft plank
    : btn.classList.contains('choice') ? 1.2                 // answer slab
    : btn.classList.contains('big') ? 1.0                    // confirm / next
    : 1.45;                                                  // small chrome
  audio.woodTap(bright);
}, true);

// voice on/off toggle
if (ui.els.btnVoice) ui.els.btnVoice.addEventListener('click', () => {
  const on = !speech.isVoiceOn();
  speech.setVoiceOn(on);
  ui.els.btnVoice.textContent = on ? '🔊' : '🔇';
  ui.els.btnVoice.classList.toggle('off', !on);
  ui.els.btnVoice.setAttribute('aria-pressed', String(on));
  ui.els.btnVoice.setAttribute('aria-label', on ? 'Turn voice off' : 'Turn voice on');
  ui.els.btnVoice.title = on ? 'Turn voice off' : 'Turn voice on';
  if (on) speech.speak('Voice on!');
});

// Unlock audio/speech on first user gesture anywhere
document.addEventListener('pointerdown', () => {
  // Keep this call in the gesture task: iOS rejects motion permission requests
  // deferred through a timer or another interaction. requestAndStart handles
  // unsupported, denied, and thrown permission paths as a silent fallback.
  sensors.requestAndStart();
  audio.init();
  audio.resume();
  speech.prime();
}, { once: true });

// ---------- direct boot into level select (hub) ----------
ui.hideGate();
bolt.show(true);
hub.open();

if (ui.els.btnWake) {
  ui.els.btnWake.addEventListener('click', async () => {
    audio.init();
    audio.resume();
    speech.prime();
    ui.hideGate();
    bolt.show(true);
    hub.open();
  });
}
