# The Maths Mine

Voxel mini-games on a floating island, sharing one adaptive mastery engine and one robot mascot.

Built with **three.js + Vite**. Tablet-first, no accounts, no ads, no shop, runs
entirely in the browser.

## Why

A specific child was struggling with times tables. Drill apps push *recall* and
treat the *concept* as assumed; LEGO and blocks build the concept but don't
drill recall or track anything. This tries to do both at once, themed with the
things that child actually likes — Minecraft and spatial puzzles.

The core bet is the **array model**: `6 × 4` isn't a fact to memorise, it's six
columns of four that you can build, count, and rotate. Building it is the
lesson; answering "how many altogether?" afterwards is the drill.

## The games

| | Game | What the child does |
|---|---|---|
| 🧱 | **Block Builder** | Tap or drag blocks into a mould to build an `a × b` wall, answer the total, then **rotate** the wall 90° to feel that `6 × 4 = 4 × 6`. Also does division as equal sharing. |
| 🕵️ | **Spot the Wrong'un** | Check facts instead of producing them. A villager holds a sign claiming `7 × 8 = 54`; the array builds in front of you and you judge it true or false. Once mastery is far enough along, three villagers turn up and one of them is fibbing. |

All three share one ledger, so practising `6 × 7` anywhere moves mastery
everywhere.

## Run it

```bash
npm install
npm run dev
```

Vite prints a Local URL and a Network URL. On your computer, open the Local URL.
**On a tablet, open the Network URL** (`http://192.168.x.x:5173`) while it's on
the same Wi-Fi.

Tap **"Wake up Bolt!"** to start — it unlocks audio and begins play.

```bash
npm test      # Playwright smoke tests (headless, plays every game)
npm run build # production build into dist/
```

### A note on tilt

Block Builder used to let you pour blocks by tilting the tablet. It was cut
after a playtest: aiming and tipping are one continuous motion, so the wall
filled up while the child was still working out where to point. Everything is
tapping and dragging now, on tablet and desktop alike.

The one thing still reading the motion sensor is Spot the Wrong'un, whose stage
leans very slightly with the tablet. That is scenery, not a control. Safari only
grants `DeviceOrientation` over HTTPS, so on a plain `http://` LAN address the
lean simply doesn't happen and nothing else changes.

## The progress report (for grown-ups)

The child only ever sees Bolt slowly oxidising. To see the real ledger — which
facts are strong, which are shaky, which the game wants to ask next, and the
lifetime accuracy — **press and hold the title "The Maths Mine" on the
game-picker screen for about a second and a half.** It's a deliberate hold
rather than a tap, so a child can't land on it by accident, and it only works on
the picker, never mid-game.

The report is honest about how little it knows. With a handful of answers
recorded it says so at the top instead of drawing a confident-looking chart, and
it separates the practice meters (which move within a single session, by design)
from the stricter count of facts actually known.

It also holds **Erase all progress**, behind an in-page confirmation. Worth
knowing if a second child starts using the same tablet — otherwise they inherit
the first child's ledger and the questions come out wrong for both of them. That
clears facts, levels and bolts together.

## Deploying

Pushing to `main` builds the site and force-pushes it to the `gh-pages` branch,
but only after the smoke tests pass (`.github/workflows/ci.yml`). Enable it
once, at **Settings → Pages → Build and deployment → Source: Deploy from a
branch → `gh-pages` / `(root)`**.

`gh-pages` holds build output and nothing else. It's force-pushed every deploy,
so never author anything on it.

Publishing a branch rather than uploading an Actions artifact is deliberate:
the artifact route ties publishing to a green Actions run, so when Actions is
unavailable there's no way to ship at all. A branch can be pushed by hand from
a laptop:

```bash
npm run build
cd dist && touch .nojekyll
git init -b gh-pages && git add -A && git commit -m "Publish"
git push -f https://github.com/<user>/maths-mine.git gh-pages:gh-pages
```

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
pedagogical order (2/5/10, then 3/4, then 6/8, 9, and 7 last). A division fact
shares the record of its multiplication sibling and only shows up once that
sibling is known, so `12 ÷ 3` and `3 × 4` are one thing being learned, not two.
Multipliers stop at 6 for now. No ML, a few hundred readable lines. Progress
persists to `localStorage`.

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
                       timers, blocks, pointer, choices, storage, world feel,
                       ease
  game/                shared game pieces — mastery ledger, Bolts wallet,
                       motion reader, Bolt
  games/
    blockBuilder.js
    spotWrongun/       tiered judge/imposter rounds on one shared stage
    README.md          ← the game-module contract; read this first
```

`src/games/README.md` documents the interface, the ownership and timer rules,
and what every core module gives you. New games should be written against it.

## Testing

`tests/smoke.spec.js` plays every game through a full round in headless
Chromium, and checks that leaving mid-round tears down cleanly and that progress
survives a reload. The games expose `window.__*` debug hooks for exactly this
reason — pixel-hunting a WebGL canvas isn't a test.

Alongside it: `mastery.spec.js` exercises the ledger and its scheduler as pure
logic against a fake clock (no browser needed), `spotWrongun.spec.js` covers the
later tiers, and `parentDashboard.spec.js` checks the report's numbers against
the ledger it claims to be reporting.

## Status

A working prototype, not a product. Built for one child, shared in case it's
useful to someone else.

Newly added: a parent progress report, spaced-repetition scheduling in the
ledger, and Spot the Wrong'un's later tiers (÷ facts, larger crews,
drag-scrub).

Not built: a cosmetics shop — Bolts pile up with nothing to spend them on — and
the per-table "filling jars" for the child, so Bolt's oxidation is the only
progress the child sees. `InstancedMesh` is a noted future optimisation; block
counts are small enough that it hasn't mattered. Nothing has been tuned on a
real tablet with a real child yet, which is the gap that matters most.

See [PRD.md](PRD.md) for the full product thinking, including what's proven,
what's faked, and what's unresolved.

## Working on it

Commit messages are checked by a hook in `.githooks/`: lines wrap at 72
characters, ASCII only (no em dashes, curly quotes or emoji), and no
`Co-authored-by` trailers. `core.hooksPath` isn't cloned, so enable it once per
clone:

```bash
git config core.hooksPath .githooks
```

## Licence

MIT — see [LICENSE](LICENSE).
