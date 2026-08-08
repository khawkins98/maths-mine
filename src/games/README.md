# Game-module interface

Every mini-game is a **factory** that receives the shared context (`ctx`) and
returns a small object the host (`main.js` / `hub.js`) drives. Implement a new
game against exactly this contract and it slots in with no changes to the shell.

```js
export function createMyGame(ctx) {
  // build geometry into a group you OWN and add to ctx.scene
  return {
    id: 'my-game',        // stable slug (also the key in main.js GAMES registry)
    title: 'My Game',     // human label (for the hub)
    start(opts) { /* attach listeners, first round, camera framing */ },
    update(dt) { /* per-frame juice/logic; called by the engine loop */ },
    teardown() { /* remove EVERYTHING you added: listeners, meshes, hooks */ },
  };
}
```

Register it in `main.js`:

```js
import { createMyGame } from './games/myGame.js';
const GAMES = { 'block-builder': createBlockBuilder, 'my-game': createMyGame };
```

## Lifecycle contract

- `start(opts)` — called once when the game becomes active. Attach input, wire
  the shared `ui.els.btnConfirm` / `btnRecenter` buttons, frame the camera,
  install debug hooks, begin the first round.
- `update(dt)` — called every frame (dt seconds, clamped ≤ 0.05) by the engine
  loop **while this game is active**. Bolt and the speech bubble are updated by
  the host, not the game.
- `teardown()` — called when switching away. You MUST: detach every listener,
  **cancel every pending timer**, remove your root group from `ctx.scene` and
  dispose your own geometries/materials (but **not** the shared `ctx.textures`
  or the core kits' geometry), delete any `window.__*` debug hooks, and call
  `ctx.engine.resetCamera()`. After teardown the scene must be exactly as you
  found it plus the shared shell.

**Ownership rule:** a game adds all its objects to a single `THREE.Group` it
creates and adds to `ctx.scene`, so teardown is `scene.remove(root)` + dispose.
Bolt is parented to the camera and is shared — never add it to your group.

**Restore what you hid.** The HUD is shared chrome. If your `start()` hides or
restyles a shared element (`btnRecenter`, the hint overlay), put it back in
`teardown()` — the next game inherits whatever you leave.

**Release any `engine.onFrame` subscription.** It returns an unsubscribe
function; a game that registers one per visit and never calls it will
double-update and keep a torn-down closure alive. Games are normally driven by
`update(dt)` and should not need `onFrame` at all.

**Timer rule:** never call `setTimeout` directly. Schedule through a
`createTimers()` pool (`src/core/timers.js`) and call `clearAll()` in teardown.
A child can leave mid-reveal at any moment, and a stray callback firing against
a torn-down round is a crash, not a cosmetic glitch — this was a real bug.

## Shared core modules

Reach for these before writing your own; they exist because two or three games
had already grown their own copy.

| Module | What it gives you |
|---|---|
| `core/engine.js` | renderer, scene, camera, lights, ground, clouds, the loop, camera framing |
| `core/timers.js` | `createTimers()` → `later(fn, ms)`, `cancel(id)`, `clearAll()` — cancellable scheduling |
| `core/storage.js` | `localStore()`, `readJSON`, `writeJSON` — guarded persistence that degrades to memory-only |
| `core/worldFeel.js` | pointer parallax + the springy, touchable ground (owned by the shell, not by games) |
| `core/blocks.js` | `createBlockKit(textures)` → `makeBlock()`, `setCapGrass()`, `sharedGeos`, `dispose()`, plus `CELL/BLOCK/CAP_H/BODY_H`. The dirt-and-grass voxel block |
| `core/pointer.js` | `createPointerInput(dom, { onDown, onMove, onUp })` → `attach()` / `detach()`. Unifies pointer + touch |
| `core/ease.js` | `easeOutBack`, `easeOutBounce`, `easeOutCubic` |
| `core/ui.js` | every HUD helper; no game touches `document.getElementById` itself |
| `core/textures.js`, `core/audio.js`, `core/speech.js` | shared canvas textures, WebAudio SFX, TTS narration |

## What `ctx` exposes

| Field | What it is |
|---|---|
| `ctx.renderer` / `ctx.scene` / `ctx.camera` | the shared renderer, scene, camera |
| `ctx.engine` | `placeCamera(centerY, dist, viewDir?)`, `resetCamera()`, `worldToScreen(x,y)`, `projectToScreen(obj)`, `nowT()`, `VIEW_DIR`, `onFrame(cb)` |
| `ctx.textures` | shared `CanvasTexture`s: `dirtTex, grassTex, groundTex, puffTex, slotTex, skyTex` (do NOT dispose) |
| `ctx.audio` | `init, resume, beep, beepEnv, noiseBurst, thunk, groupChime, chordSound, buzzSound` |
| `ctx.speech` | `speak, prime, setVoiceOn, isVoiceOn, eqWords(a,b,ans?), divWords(d,s,ans?), pickPhrase(arr)` |
| `ctx.ui` | HUD helpers — see `core/ui.js`; raw elements at `ui.els` |
| `ctx.bolt` | mascot — `say(text, mood)`, `react(mood)`, `setOxidation(0..1)`, `show(v)`, `group`, `headAnchor` (moods: `'happy'`, `'wow'`, `''`) |
| `ctx.mastery` | shared ledger — `nextQuestion({op?})`, `beginQuestion(facts)`, `record(a,b,correct,ms)`, `voidCurrentQuestion()`, `endQuestion()`, `levelOf(a,b)`, `activeTables()`, `tableMastery(t)`, `overallProgress()`, `reset()` |
| `ctx.wallet` | the child's bolts, shared across games and sessions — `bolts`, `add(n)`, `reset()`. No on-screen readout by design |
| `ctx.worldFeel` | the living island — `impulse(strength, x, z)` to punch the ground on a landing block or a thrown die |
| `ctx.sensors` | `TiltInput`: `enabled, available, x, y, update(), recenter()` |
| `ctx.usingSensors` | whether real motion data arrived (tilt mode vs tap mode) |
| `ctx.startGame(id, opts)` | switch to another registered game |
| `ctx.onExit` | host-provided callback a game calls to request leaving (back to the hub) |

## Mastery / narration expectations

- Award bolts with `ctx.wallet.add(n)`. Never keep your own running total:
  bolts persist across games and sessions, and a local counter silently resets
  both. There is no on-screen counter; the reward moment is the toast.
- Ask a real retrieval question and score it with `ctx.mastery.record(a, b,
  correct, ms)` where `a,b` are the canonical factors (for division, the two
  factors of the fact — `record` shares one ledger for `a×b` and `(a·b)÷b`).
  The ledger **persists to localStorage** on every `record`, so never call it
  speculatively.
- `nextQuestion()` only selects. Call `beginQuestion(q)` once the fact is really
  on screen; multi-fact rounds pass the complete visible array. Call
  `endQuestion()` when a multi-step round resolves or is abandoned.
- Read a fact's strength with `ctx.mastery.levelOf(a, b)`. Do not reach into
  `mastery.facts` — that map is the store's own business.
- After scoring, call `ctx.bolt.setOxidation(ctx.mastery.overallProgress())` so
  Bolt keeps weathering as mastery grows.
- Narrate with `ctx.speech` and vary phrasing via `pickPhrase`.

## Bolt oxidation (shared mascot state)

Bolt starts shiny copper (`setOxidation(0)`) for a new child and oxidises toward
verdigris teal at `setOxidation(1)`, driven off `ctx.mastery.overallProgress()`.
Any game should refresh it after recording an answer; the state persists across
games and now across sessions.

## Multi-file games

A game that outgrows one file becomes a directory with an `index.js` exporting
the factory — see `spotWrongun/`, which splits into a `stage` (the shared cast,
props and effects both its tiers perform on), one module per tier, and a shell
that picks between them. The contract above is unchanged; only `index.js` is
visible to `main.js`.

## Debug hooks

Each game installs `window.__*` getters and drivers in `start()` and deletes
them in `teardown()`. These are not vestigial — `tests/smoke.spec.js` drives
every game through them, because a headless browser cannot be tilted or shaken
and pixel-hunting a WebGL canvas is not a test. Keep them working.
