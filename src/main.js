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

import { MasteryStore } from './game/mastery.js';
import { TiltInput } from './game/sensors.js';
import { createBolt } from './game/bolt.js';

import { createBlockBuilder } from './games/blockBuilder.js';
import { createShakeBatch } from './games/shakeBatch.js';
import { createSpotWrongun } from './games/spotWrongun/index.js';
import { createHub } from './hub.js';

// ---------- shared services ----------
const textures = createTextures();
const engine = createEngine({ textures });
const audio = createAudio();
const speech = createSpeech();
const ui = createUI();
const mastery = new MasteryStore();
const sensors = new TiltInput();
const bolt = createBolt({ camera: engine.camera, textures, nowT: engine.nowT, bubbleEl: ui.els.bubble });

let usingSensors = false;

// ---------- the shared game context ----------
// Everything a game module needs. A game adds its objects to a group it owns
// and fully tears them down; it never reaches into the DOM or the engine
// internals except through these handles.
const ctx = {
  THREE,
  renderer: engine.renderer,
  scene: engine.scene,
  camera: engine.camera,
  engine,        // frame/reset camera, worldToScreen, nowT, placeCamera, VIEW_DIR
  textures,      // shared CanvasTextures (do NOT dispose in teardown)
  audio,         // WebAudio SFX
  speech,        // TTS narration + phrase variety
  ui,            // HUD helpers
  bolt,          // 3D mascot: say/react/update/setOxidation
  mastery,       // shared adaptive per-fact ledger (× and ÷)
  sensors,       // tilt input
  nowT: engine.nowT,
  worldToScreen: engine.worldToScreen,
  get usingSensors() { return usingSensors; },
  onExit: null,  // set by the host (hub/main) so a game can request to leave
};

// ---------- game switcher ----------
// title is read off the factory function by the hub for card labels
createBlockBuilder.title = 'Block Builder';
createShakeBatch.title = 'Shake-a-Batch';
createSpotWrongun.title = 'Spot the Wrong’un';
const GAMES = {
  'block-builder': createBlockBuilder,
  'shake-a-batch': createShakeBatch,
  'spot-the-wrongun': createSpotWrongun,
};
let current = null;
function startGame(id, opts) {
  if (current) current.teardown();
  const factory = GAMES[id];
  if (!factory) { console.warn('unknown game', id); return; }
  current = factory(ctx);
  current.start(opts || {});
  return current;
}
// tear down the active game without starting another (used when opening the hub)
function stopGame() { if (current) { current.teardown(); current = null; } }
// expose for the hub + tests
ctx.startGame = startGame;
ctx.stopGame = stopGame;
ctx.games = GAMES;

// the game picker
const hub = createHub(ctx);

// debug hook: the shared mascot (headless smoke tests + oxidation checks)
window.__bolt = bolt;

// ---------- render loop dispatch ----------
// The engine owns the loop; here we fan out per-frame work: the active game's
// juice/logic, then Bolt (shared, always animated once visible).
engine.onFrame((dt) => {
  if (current) current.update(dt);
  bolt.update(dt);
  bolt.updateBubble();
});
engine.start();

// ---------- cross-cutting chrome ----------
// voice on/off toggle
if (ui.els.btnVoice) ui.els.btnVoice.addEventListener('click', () => {
  const on = !speech.isVoiceOn();
  speech.setVoiceOn(on);
  ui.els.btnVoice.textContent = on ? '🔊' : '🔇';
  ui.els.btnVoice.classList.toggle('off', !on);
  if (on) speech.speak('Voice on!');
});

// ---------- the gate: one tap = sensor permission + audio unlock + start ----------
ui.els.btnWake.addEventListener('click', async () => {
  audio.init();
  audio.resume();
  speech.prime(); // prime TTS synchronously inside this gesture (iOS needs it)

  const granted = await sensors.requestAndStart();
  // Permission/API can say "yes" while no hardware ever emits data (desktop
  // Chrome). Wait a beat and only call it tilt-mode if real data arrived.
  if (granted) await new Promise((r) => setTimeout(r, 500));
  usingSensors = granted && sensors.available;
  if (usingSensors) sensors.recenter();

  ui.hideGate();
  bolt.show(true);
  audio.beep(660, 0.12, 'triangle', 0.06);

  // Into the hub: pick a game (Block Builder or Shake-a-Batch). Each game wires
  // ctx.onExit + the ← Menu button back to hub.open().
  hub.open();
  ui.showToast(usingSensors ? 'Motion on — pick a game!' : 'Pick a game to play!', 'good');
});
