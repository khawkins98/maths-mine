# The Maths Mine

A tilt-and-tap times-tables toy I built for my kid. Three voxel mini-games on a
floating island, sharing one adaptive mastery engine and one robot mascot.

Built with **three.js + Vite**. Tablet-first, no accounts, no ads, no shop, runs
entirely in the browser.

![three games: Block Builder, Shake-a-Batch, Spot the Wrong'un](#)

## Why

A specific child was struggling with times tables. Drill apps push *recall* and
treat the *concept* as assumed; LEGO and blocks build the concept but don't
drill recall or track anything. This tries to do both at once, themed with the
things that child actually likes — Minecraft, dice, and Among Us.

The core bet is the **array model**: `6 × 4` isn't a fact to memorise, it's six
columns of four that you can build, count, and rotate. Building it is the
lesson; answering "how many altogether?" afterwards is the drill.

## The three games

| | Game | What the child does |
|---|---|---|
| 🧱 | **Block Builder** | Tap (or tilt-pour) blocks into a mould to build an `a × b` wall, answer the total, then **rotate** the wall 90° to feel that `6 × 4 = 4 × 6`. Also does division as equal sharing. |
| 🎲 | **Shake-a-Batch** | Shake the tablet to spill groups of dice, then count them up. Same maths, completely different hands. |
| 🕵️ | **Spot the Wrong'un** | Check facts instead of producing them. A crewmate holds a sign claiming `7 × 8 = 54`; the array builds in front of you and you judge it true or false. Later, three crewmates and one is fibbing. |

All three share one ledger, so practising `6 × 7` anywhere moves mastery
everywhere.

## Run it

```bash
npm install
npm run dev
```

Vite prints a Local URL and a Network URL. On your computer, open the Local URL.
**On a tablet, open the Network URL** (`http://192.168.x.x:5173`) while it's on
the same Wi-Fi — that's how you test the real motion sensors.

Tap **"Wake up Bolt!"** to start. On iPad that one tap does three things: grants
motion-sensor permission, unlocks audio, and begins play.

```bash
npm test      # Playwright smoke tests (headless, plays every game)
npm run build # production build into dist/
```

### iOS / iPadOS note

Safari grants `DeviceOrientation` permission only over **HTTPS** and only from a
user tap. Plain `http://` on the LAN often works for testing, but if the iPad
refuses motion, serve over HTTPS (`npx vite --https`, or a tunnel like
`ngrok http 5173`) — or just use the deployed site below, which is HTTPS by
default and is the easiest way to get real tilt and shake working on an iPad.

No sensors, or permission denied? Every game falls back to press-and-drag, which
is also the desktop path — nothing is sensor-only.

## Deploying

Pushing to `main` builds the site and publishes it to GitHub Pages, but only
after the smoke tests pass (`.github/workflows/ci.yml`). Enable it once, at
**Settings → Pages → Build and deployment → Source: GitHub Actions**.

Asset paths are relative (`base: './'` in `vite.config.js`), so the build works
from a project subpath like `https://<user>.github.io/maths-mine/` as well as
from a domain root — and keeps working if the repo is renamed.

## Design notes

**No fail states.** A wrong answer triggers a gentle count-and-reveal, never a
buzzer or a red X. In Spot the Wrong'un the framing is always that the *sign* is
fibbing, never the child.

**The mascot is a progress bar.** Bolt starts as shiny copper and weathers
toward verdigris teal as mastery grows. Nobody has to explain what that means.

**Adaptive, but not clever.** `src/game/mastery.js` tracks correctness, streak
and speed per fact, aims for a ~75–85% success rate, and unlocks tables in a
pedagogical order (2/5/10, then 3/4, then 6/8, 9, and 7 last). No ML, about 300
readable lines. Progress persists to `localStorage`.

**Truthful counting.** Skip-counts shown while building are always real
(`2 groups of 3 = 6`), never a count-by-ones dressed up as multiplication and
never an equation that isn't yet true.

## Architecture

`main.js` builds one shared `ctx` — renderer, textures, audio, speech, HUD,
mastery ledger, mascot — and hands it to whichever game the hub picks. A game is
a factory returning `{ id, title, start, update, teardown }`, owns exactly one
scene group, and fully disposes it on teardown.

```
src/
  main.js              bootstrap: builds ctx, wires the wake gate, starts the hub
  hub.js               the game picker
  core/                shared shell — engine, ui, audio, speech, textures,
                       timers, blocks, pointer, ease
  game/                shared game pieces — mastery ledger, tilt input, Bolt
  games/
    blockBuilder.js
    shakeBatch.js
    spotWrongun/       two tiers on one shared stage
    README.md          ← the game-module contract; read this first
```

`src/games/README.md` documents the interface, the ownership and timer rules,
and what every core module gives you. New games should be written against it.

## Testing

`tests/smoke.spec.js` plays every game through a full round in headless
Chromium, and checks that leaving mid-round tears down cleanly and that progress
survives a reload. The games expose `window.__*` debug hooks for exactly this
reason — a headless browser can't be tilted or shaken, and pixel-hunting a WebGL
canvas isn't a test.

## Status

A working prototype, not a product. Built for one child, shared in case it's
useful to someone else.

Not built: a cosmetics shop, a parent dashboard, spaced-repetition scheduling,
and Spot the Wrong'un's later tiers (÷ facts, larger crews, drag-scrub).
`InstancedMesh` is a noted future optimisation — block counts are small enough
that it hasn't mattered.

See [PRD.md](PRD.md) for the full product thinking, including what's proven,
what's faked, and what's unresolved.

## Licence

MIT — see [LICENSE](LICENSE).
