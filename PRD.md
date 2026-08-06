# The Maths Mine — Product Requirements Document

**Status:** Prototype — all three games playable, wrapper partly built
**Owner:** Ken
**Last updated:** 2026-08-06
**Document type:** Living PRD for a learning prototype (expect churn)

---

## 1. Summary

The Maths Mine is a tablet-first, motion-and-touch game suite that helps a
young child (roughly ages 7–9) build fluency and *visual understanding* of
times tables and division. It is a suite of small, contrasting mini-games that
share one adaptive "mastery" engine and one friendly mascot (Bolt), so a parent
can see which style of play actually lands for their child while the child makes
real progress no matter which game they pick.

The anchor game is **Block Builder**, the first one built: the child builds a
multiplication array out of Minecraft-style blocks — tapping squares (or, on a
tablet, tilting to pour) — then answers how many blocks they built, then rotates
the wall to *feel* that `a × b = b × a`. It also does division, as sharing the
same blocks into equal rows. Two more games sit alongside it, and a hub picks
between them.

This document describes the product vision, what is built, and the roadmap.
It is deliberately honest about what is proven, what is faked, and what is
unresolved.

---

## 2. Problem & motivation

A specific child is struggling with times tables and division. The need is two
things at once, which most drill apps address only one of:

1. **Fact fluency** — fast, confident recall of `7 × 8 = 56`.
2. **Conceptual understanding** — *why* `7 × 8` is 56: seeing it as equal
   groups / a rectangular array, and connecting multiplication to its inverse,
   division (equal sharing).

Worksheets and flash-drill apps push fluency while treating the concept as
assumed. Manipulatives (LEGO, blocks) build the concept but don't drill recall
or track progress. The child also finds pure drill boring and is drawn to
tactile, visual, game-like experiences (dice, Minecraft, LEGO, Among Us).

**Opportunity:** a tablet game that makes the *array model* physical and playful,
pairs it with genuine recall practice, and adapts to keep the child in a
"mostly winning" zone — themed with visuals the child already loves.

---

## 3. Goals & non-goals

### Goals (for the prototype)
- Prove that a tactile, visual array-building loop can teach both the *concept*
  and support *recall* of multiplication/division facts.
- Ship a small suite of contrasting mini-games so we can observe which
  mechanic the child engages with most.
- Adapt difficulty automatically so the child rarely hits a wall or gets bored.
- Feel like a game, not a worksheet: mascot, juice, rewards, no fail states.

### Non-goals (for now)
- Not a full curriculum or classroom product; no accounts, no cloud sync.
- Not multiplayer.
- Not trying to cover addition/subtraction/fractions in the prototype
  (the array model extends there later, but it's out of scope now).
- Not shipping to an app store; this is a learning prototype run locally / on a
  tablet browser.

### Success signals (qualitative, for a prototype)
- The child *chooses* to play again without being told to.
- The child can, after some sessions, answer facts they previously couldn't —
  measured by the retrieval question, not by "did a wall get built."
- A parent can glance at the mastery view and see real per-fact progress.

---

## 4. Target user & context

**Primary player:** a 7–9 year old working on times tables and division, who
reads at grade level but skips long text, has limited fine-motor precision, and
short patience for repetition. Plays on a hand-me-down tablet.

**Secondary user:** a parent who sets it up, wants to see progress, and wants
the child engaged without screens feeling like junk food.

**Device context:** tablet browser (iPad Safari / Android Chrome), landscape,
held in two hands. Also runnable on a desktop browser for development and as a
no-sensor fallback.

---

## 5. The suite

Three mini-games, three *lenses* on the same skill, one shared mastery engine
and mascot. All three are built. All progress writes to the same per-fact
ledger, so practising `6 × 7` in any game moves the child's mastery everywhere.

| Game | Metaphor | Primary input | Teaches | Status |
|---|---|---|---|---|
| **Block Builder** | Minecraft dirt/grass blocks | Tap squares (or tilt to pour) | Multiplication as an array; division as equal rows | **Built (× and ÷)** |
| **Shake-a-Batch** | 3D dice | Shake (button + accelerometer) | Multiplication as equal groups | **Built** |
| **Spot the Wrong'un** | Blocky villager crew (Bolt's cousins) | Tap to accuse | Error-detection / fact-checking | **Built (× only, two tiers)** |

Spot the Wrong'un ships two tiers on one stage: **Judge** (one villager, one
claim, True/False) and **Imposter** (three villagers, one fibbing sign), which
takes over once overall mastery passes a threshold. It asks multiplication
only.

A **hub** ("The Maths Mine") lets the child pick between the three games; a
**back-to-menu** button returns from any of them. All three share one mastery
ledger and the mascot Bolt, who **oxidizes from shiny copper to verdigris teal
as overall mastery grows** (Minecraft-copper inspired). The codebase is
**modular** (`core/` shell services, `game/` shared pieces, `games/` one module
per mini-game, all behind a documented `createGame(ctx)` interface).

The wrapper around the suite is partly built: the hub and the shared currency
(**Bolts**, earned per correct answer and persisted) exist. Per-table progress
shown to the child as filling jars does not — the ledger can report a per-table
fill (`tableMastery`), but nothing draws it yet, so the child's only visible
progress signal is Bolt's oxidation.

---

## 6. Block Builder — detailed requirements

### 6.1 Core loop (multiplication)
1. **Prompt** — "Build `2 × 3`" (no answer shown; never a false equation).
2. **Build** — the child fills a `cols × rows` array. Each **completed column
   is one group of `rows`**, and a truthful skip-count appears as groups land:
   "1 group of 3 = 3", "2 groups of 3 = 6". No counting by ones.
3. **Answer (retrieval beat)** — when the wall is built, the final total is
   *hidden* and the child is asked "how many blocks altogether?" with three big
   choices (the product and one-group-off distractors). This produces a real
   right/wrong signal.
4. **Feedback** — correct: celebrate, proportional Bolts reward, Bolt cheers.
   Wrong: gentle — Bolt says "let's count them!" and the game skip-counts up to
   the true total. **No fail state, ever.**
5. **Rotate (commutativity)** — the wall flips 90°; the total flies up big and
   survives the flip ("still 6!"), showing `a × b = b × a`.
6. **Next.**

### 6.1a Division loop (built)

Same blocks, same array, different story. "Share 12 into 3 equal groups": each
**row** is one group, so rows = the divisor and the row length is the answer.
The child fills the array, the caption counts groups shared out (never the
per-group size, which would give the answer away), and the question is "how
many in each group?" — `12 ÷ 3 = ?`. There is no rotate: commutativity is not
true of division, and faking it would teach something false. Instead the round
ends by showing the ×/÷ fact family, so the child sees `3 × 4` and `12 ÷ 3` as
the same fact seen from two sides.

Division rounds are drawn from the same ledger record as their multiplication
sibling, and only appear once that sibling is known (see §8).

### 6.2 Input
- **Tap-to-place (primary, touch/mouse):** tap a square to drop a block there;
  press-drag to place across several. Placement uses 3D ray-picking, so the
  block goes exactly where the child points. (This replaced an earlier
  drag-to-aim scheme whose aim mapped to the whole screen width, making side
  columns nearly unreachable over a small centered wall — a real playtest fail.)
- **Tilt-to-pour (sensor path):** tilt left/right to aim a spout across columns,
  tilt forward to pour. Exercises the tablet's motion sensors.
- Every mechanic has a no-sensor equivalent; the game is never dead.

### 6.3 Visuals / art direction
- **Minecraft-style blocks:** dirt-brown cubes; the topmost block in each column
  shows a grass-green top, so a partial wall reads like little dirt-and-grass
  hills.
- **Isometric 3/4 view:** an angled camera so blocks read as real 3D (tops +
  fronts visible), not flat squares.
- **Bolt:** a 3D voxel robot mascot, always on screen, reacting (idle bob, hop
  on correct, shake on "wow"), with a speech bubble that tracks his head.
- Dark, calm background; bright blocks and UI. High-contrast, large text for
  young readers.

### 6.4 Audio
- Soft block-land "thunk" synced to the landing, rising per-group chime, warm
  success arpeggio, gentle (never harsh) "not quite" tone. WebAudio, unlocked by
  the first tap (which also grants motion permission — see 6.6).

### 6.5 Onboarding
- A single **"Wake up Bolt!"** button starts play. That one tap does three
  things: grants iOS motion permission, unlocks audio, and begins the game.
- **First-touch demo:** on the first round, a ghost finger taps the first
  squares to show the child what to do; it disappears on their first real tap.

### 6.6 Sensor handling (reality check)
- iOS 13+ requires `requestPermission()` for DeviceOrientation/Motion from a
  user gesture over HTTPS — handled by the wake button.
- Sensors are treated as "live" only once real orientation data actually
  arrives (the API merely *existing* is true on desktop Chrome and must not be
  trusted), otherwise the game runs in tap mode.
- Tilt uses a neutral-pose calibration, a deadzone, clamping, and a low-pass
  filter. Thresholds are starting points; **on-device tuning with a real tablet
  (and a real child) is required before any sensor mechanic is called done.**

---

## 7. Pedagogy

- **Array model:** building `cols × rows` makes multiplication a rectangle —
  the single most important multiplication visualization and the bridge to area
  and fractions later.
- **Skip-counting:** completing a column at a time and counting `3, 6, 9…`
  moves the child from additive (count-by-ones) to multiplicative thinking.
- **Commutativity:** rotating the finished wall shows `a × b = b × a` with the
  count unchanged — a concrete "aha."
- **Retrieval practice:** the answer question forces recall (or at least a
  commit), which is what actually builds fluency; reading a number does not.
- **Division (built):** the same blocks shared into equal rows is the
  equal-sharing model, connecting `a × b` to `a·b ÷ b`. Because both draw on one
  ledger record, a child who has just built `3 × 4` meets `12 ÷ 3` soon after,
  which is the point.

---

## 8. Adaptive mastery engine

A single per-fact ledger, shared across the suite. **Not ML** — a transparent
mastery model.

- **Per fact** (e.g. `6×7`): correct/attempts, streak, rolling avg *answer*
  time (retrieval speed, not build speed), and a mastery level 0–4.
- **Level up** when a fact is answered correctly three times running and fast
  enough; the level-up consumes the streak, so every level needs its own fresh
  run of three. **Forgiving decay** of one level on a miss.
- **Question selection:** a weighted draw favoring weak/unseen facts, with a few
  strong facts sprinkled in for confidence, and anti-repeat.
- **Difficulty by total size, not just multiplier:** early rounds are capped by
  *number of blocks* (small totals like 2×2, 2×3), ramping the cap up with
  accuracy — so "easy" genuinely means "a short build," not "a small factor
  times ten."
- **Table unlock order:** 2/5/10 → 3/4 → 6/8 → 9 → 7, the next tier opening
  once ~60% of the facts asked so far are solid. Division facts share the
  record of their multiplication sibling and unlock once that sibling is known,
  so `12 ÷ 3` and `3 × 4` move the same number. Multipliers are capped at 6 in
  this slice, so it is a 2–6 times-table toy, not the full grid.
- **Shown to the child** never as a score or a percentage. Today the only
  progress the child sees is Bolt's oxidation; the per-table "filling jars" are
  designed but not drawn (`tableMastery(t)` returns the fill nothing renders).
  A **parent view** over the real per-fact table now exists, behind a long-press
  on the hub title — see §11.

---

## 9. Technical overview

- **Stack:** three.js + Vite, plain JavaScript, no framework.
- **Rendering:** individual block meshes sharing geometry (counts are small;
  `InstancedMesh` is a noted future optimisation, still not done). Per-face
  materials give the grass-on-dirt look.
- **No physics library**; blocks fall with a simple tween.
- **Files:** `src/main.js` builds one shared `ctx` and hands it to whichever
  game the hub (`src/hub.js`) picks. `src/core/` holds the shell services
  (engine, ui, audio, speech, textures, blocks, pointer, timers, choices,
  storage, world feel), `src/game/` the shared pieces (`mastery.js` the
  adaptive ledger, `wallet.js` the Bolts, `sensors.js` tilt input + iOS
  permission, `bolt.js` the mascot), and `src/games/` one module per mini-game
  against the contract in `src/games/README.md`. See `README.md` to run.
- **Verification:** headless-browser smoke tests play every game through a full
  round (including a division round), check that leaving mid-round tears down
  cleanly, that mastery and Bolts survive a reload, and that the answer cards
  are not guessable by value or position — all asserting no console errors.

---

## 10. Metrics we'd want (when it's more than a prototype)

- Per-fact mastery growth over sessions (the real learning signal).
- Retrieval accuracy and speed trend.
- Time-on-task and voluntary replays per game (the "which mechanic lands"
  question).
- Drop-off points within a round (e.g. build length fatigue).

For the prototype, these are observed by watching the child play — and, once
the parent view lands, by reading the ledger — not by instrumented analytics.

---

## 11. Roadmap

**Milestone 0 — Block Builder vertical slice — done**
Build → skip-count → retrieval → commutativity → next; adaptive engine; tap +
tilt input; Minecraft/iso visuals; 3D Bolt; sounds; first-touch demo.

**Milestone 1 — On-device pass — not done**
Tune tilt/shake thresholds on a real iPad; test tap-to-place with a real child;
fix motor/readability issues found. Still the biggest gap between "works" and
"works for a child."

**Milestone 2 — Division mode in Block Builder — done**
Share a pile into equal rows; division facts wired into the ledger against the
same record as their multiplication sibling.

**Milestone 3 — Game 2: Shake-a-Batch (dice / shake) — done**
Shake sensor plus the equal-groups model; multiplication only.

**Milestone 4 — Game 3: Spot the Wrong'un — done**
Fact-checking / error-detection. Judge and imposter tiers, now also over ÷
facts, with larger crews and drag-scrub inspection.

**Milestone 5 — The wrapper — partly done**
Hub: done. Shared Bolts economy: earned and persisted, nothing to spend them
on. Parent dashboard: done. Spaced-repetition scheduling: done, as a Leitner
ladder in the ledger. Cosmetics shop: not built.

---

## 12. Open questions & risks

- **Sensors are the biggest risk.** They look fine on desktop and behave
  differently on the first real device. Budget real tuning time.
- **Retrieval vs. reveal balance:** does hiding the final total and asking work
  for this child, or is it discouraging? Needs a real playtest.
- **Build length:** even small walls can feel repetitive; watch for fatigue and
  consider auto-filling the tail or shortening.
- **Does the child connect the wall to "times tables"?** The link is currently
  implicit; may need clearer framing.
- **The convention for division is now locked:** rows = divisor, each row is
  one shared group, and the row length is the answer. Block Builder is the only
  game that asks division so far; anything new must match it.
- **Reward economy:** Bolts are cosmetic-only by design; confirm that stays
  motivating without becoming a grind.

---

## 13. Appendix: what's real vs. faked in the current build

- **Real:** all three games; tap-to-place ray-picking; the adaptive engine with
  multiplication and division on one ledger; retrieval scoring; commutativity;
  answer cards that can't be beaten by value or position; Minecraft/iso
  rendering; 3D Bolt and his oxidation; sound; the hub; Bolts earned and
  persisted; sensor permission flow and fallback; progress that survives a
  reload.
- **Also real, newly added:** the parent progress report, spaced-repetition
  scheduling (a Leitner ladder on each fact, with the picker favouring overdue
  ones), and Spot the Wrong'un's later tiers.
- **Faked / deferred:** true block physics (a simple tween instead), the
  cosmetics shop (Bolts accumulate with nothing to spend them on), the
  per-table jars for the child, `InstancedMesh`, and any on-device sensor
  tuning with a real tablet and a real child.
