# The Maths Mine — Product Requirements Document

**Status:** Prototype / vertical slice in progress
**Owner:** Ken
**Last updated:** 2026-08-02
**Document type:** Living PRD for a learning prototype (expect churn)

---

## 1. Summary

The Maths Mine is a tablet-first, motion-and-touch game suite that helps a
young child (roughly ages 7–9) build fluency and *visual understanding* of
times tables and division. It is a suite of small, contrasting mini-games that
share one adaptive "mastery" engine and one friendly mascot (Bolt), so a parent
can see which style of play actually lands for their child while the child makes
real progress no matter which game they pick.

The first game being built is **Block Builder**: the child builds a
multiplication array out of Minecraft-style blocks — tapping squares (or, on a
tablet, tilting to pour) — then answers how many blocks they built, then rotates
the wall to *feel* that `a × b = b × a`.

This document describes the product vision, the first slice, and the roadmap.
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
and mascot. All progress writes to the same per-fact ledger, so practicing
`6 × 7` in any game moves the child's mastery everywhere.

| Game | Metaphor | Primary input | Teaches | Status |
|---|---|---|---|---|
| **Block Builder** | Minecraft dirt/grass blocks | Tap squares (or tilt to pour) | Multiplication as an array; division as equal rows | **Built (× and ÷)** |
| **Shake-a-Batch** | 3D dice | Shake (button + accelerometer) | Multiplication as equal groups | **Built** |
| **Spot the Wrong'un** | Blocky "Nugget" crew (Bolt's cousins) | Tap to accuse | Error-detection / fact-checking | **Built (× slice)** |

A **hub** ("The Maths Mine") lets the child pick between the three built
games; a **back-to-menu** button returns from either. Both share one mastery
ledger and the mascot Bolt, who **oxidizes from shiny copper to verdigris teal
as overall mastery grows** (Minecraft-copper inspired). The codebase is
**modular** (`core/` shell services, `game/` shared pieces, `games/` one file
per mini-game, all behind a documented `createGame(ctx)` interface).

A light wrapper ("The Maths Mine") ties them together: a hub, a shared
currency (**Bolts**, cosmetic only), and per-table progress shown as filling
jars. The wrapper is deferred until at least two games exist.

---

## 6. Block Builder — detailed requirements (the current slice)

### 6.1 Core loop
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
- **Division (planned):** the same blocks split into equal rows/shelves is the
  equal-sharing model, connecting `a × b` to `a·b ÷ b`.

---

## 8. Adaptive mastery engine

A single per-fact ledger, shared across the suite. **Not ML** — a transparent
mastery model.

- **Per fact** (e.g. `6×7`): correct/attempts, streak, rolling avg *answer*
  time (retrieval speed, not build speed), and a mastery level 0–4.
- **Level up** when a fact is answered correctly on a streak and fast enough;
  **forgiving decay** of one level on a miss.
- **Question selection:** a weighted draw favoring weak/unseen facts, with a few
  strong facts sprinkled in for confidence, and anti-repeat.
- **Difficulty by total size, not just multiplier:** early rounds are capped by
  *number of blocks* (small totals like 2×2, 2×3), ramping the cap up with
  accuracy — so "easy" genuinely means "a short build," not "a small factor
  times ten."
- **Table unlock order:** 2/5/10 → 3/4 → 6/8 → 9 → 7; division facts unlock
  after their multiplication sibling.
- **Shown to the child** as filling jars per table; never as a score or a
  percentage. A future **parent view** exposes the real per-fact table.

---

## 9. Technical overview

- **Stack:** three.js + Vite, plain JavaScript, no framework.
- **Rendering:** individual block meshes sharing geometry (counts are small;
  `InstancedMesh` is a noted future optimization). Per-face materials give the
  grass-on-dirt look.
- **No physics library** in the slice; blocks fall with a simple tween.
- **Files:** `src/main.js` (scene, loop, input, juice), `src/sensors.js` (tilt
  input + iOS permission), `src/mastery.js` (adaptive engine). See `README.md`
  to run.
- **Verification:** headless-browser smoke tests drive the full loop
  (build → ask → correct/wrong → rotate → next) and assert no console errors.

---

## 10. Metrics we'd want (when it's more than a prototype)

- Per-fact mastery growth over sessions (the real learning signal).
- Retrieval accuracy and speed trend.
- Time-on-task and voluntary replays per game (the "which mechanic lands"
  question).
- Drop-off points within a round (e.g. build length fatigue).

For the prototype, these are observed by watching the child play plus the
parent view, not instrumented analytics.

---

## 11. Roadmap

**Milestone 0 — Block Builder vertical slice (in progress)**
Build → skip-count → retrieval → commutativity → next; adaptive engine; tap +
tilt input; Minecraft/iso visuals; 3D Bolt; sounds; first-touch demo. *Mostly
done.*

**Milestone 1 — On-device pass**
Tune tilt/shake thresholds on a real iPad; test tap-to-place with a real child;
fix motor/readability issues found.

**Milestone 2 — Division mode in Block Builder**
Tilt/tap a pile into equal rows/shelves; wire division facts into the ledger.

**Milestone 3 — Game 2: Shake-a-Batch (dice / shake)**
Validate the shake sensor and the equal-groups/dealing model.

**Milestone 4 — Game 3: Spot the Wrong'un (imposter)**
Fact-checking / error-detection recall game.

**Milestone 5 — The wrapper**
Hub, shared Bolts economy, cosmetics, parent dashboard, spaced-repetition
scheduling.

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
- **Which convention for division** (rows = divisor?) should be locked before
  Milestone 2 so it's consistent across games.
- **Reward economy:** Bolts are cosmetic-only by design; confirm that stays
  motivating without becoming a grind.

---

## 13. Appendix: what's real vs. faked in the current build

- **Real:** tap-to-place ray-picking, the adaptive engine, retrieval scoring,
  commutativity, Minecraft/iso rendering, 3D Bolt, sound, sensor permission flow
  and fallback.
- **Faked / deferred:** true block physics (simple tween instead), the workshop
  hub, cosmetics, parent dashboard, division, spaced repetition, games 2 & 3,
  and any on-device sensor tuning.
