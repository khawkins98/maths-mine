# Times-table reference tray

**Status:** confirmed. No implementation has started.

A slide-out reference of the times tables, available from every screen, so a
child can look up a fact while an activity is running. Consulting it is not
treated as cheating. It is treated as learning that must not be mistaken for
recall.

## Why

The app already teaches through the array model and drills recall on top of it.
What it has never had is somewhere to simply *look*. A child stuck on 7 x 8
currently has two options: guess, or get it wrong and sit through the reveal.
Neither is looking the answer up and reading it, which is what a child with a
poster on the wall would do.

A reference is only useful if it is there at the moment of need, which means
during an activity rather than between them. That is the whole idea, and it is
also the whole problem: see "The ledger rule" below.

## Decisions

| Question | Decision |
|---|---|
| Ledger effect of answering with the tray open | The answer is not recorded at all |
| Page content | Numeric list plus a block array per row |
| Tables offered | All of 1 to 12, each running to x12 |
| How it opens | Tap a right-edge tab; the tray overlays the world |
| Page shown on open | The table in the live question |

## 1. Where it lives

A new `src/game/referenceTray.js`, modelled on `src/game/parentDashboard.js`: a
self-contained DOM overlay that owns its own markup, one `createTimers()` pool,
and explicit listener registries torn down on close.

Markup and inline CSS join the other overlays in `index.html` at z-index 30 --
above the hub (20), below the parent dashboard (60). A grown-up reading the
progress report is never covered by a child's tray.

It is constructed once in `main.js` against the shared `ctx`, never by a game.
That is what makes "always available" true by construction: no game opts in, no
game can forget, and a fourth game gets it for free.

## 2. The ledger rule

The app's most valuable property is that its ledger is honest. The parent report
says how little it knows rather than drawing a confident chart. A tray open
during a question means a child can copy the answer, and a naive implementation
would record that as a fact they know. Over a few sessions that poisons the
adaptive picker, which stops asking the facts they actually need, and the parent
report, which claims mastery that is not there.

So an answer given with the tray open is not recorded. The fact stays exactly as
shaky as it was.

Fact selection is deliberately side-effect-free. Once a game has assembled the
fact or facts actually visible to the child, it calls `beginQuestion(facts)`.
That is the point where `seen` increments and the complete visible set becomes
the live question.

- Opening the tray voids the complete live question.
- `record(a, b, ...)` ignores a voided key: no attempt, no streak, no interval
  change, no `recent` push, no table ramping.
- A multi-step round may have recorded an accusation before the tray opens. The
  ledger restores its post-`beginQuestion()` snapshot, so opening the tray at
  any point still voids the whole question.
- `endQuestion()` commits a resolved or abandoned question and clears transient
  question state.

A set rather than a single boolean because Spot the Wrong'un's imposter rounds
draw several facts and record several outcomes per round
(`src/games/spotWrongun/imposter.js:183` and `:215`); one flag would void only
the first.

Voiding is armed at the question level, not the answer level. Opening the tray
at any point during a live question voids that question, even if the tray is
closed again before answering. Peek-then-close is not a loophole.

`seen` still increments and is persisted, because the child did meet the fact.
The armed/voided state itself lives only for the question and is never saved.

### Accepted trade-off

A child who leans on the tray heavily makes no visible progress and Bolt does
not oxidise. This was considered and accepted: a mastery meter that moves
because a child can read is worse than one that does not move.

## 3. The tray itself

Right-edge tab, mid-height, present on the hub and in every game. Tap to slide
the tray out over the world. Tap the tab, tap outside, or press Escape to close.

A tap rather than an edge-swipe on purpose. iPadOS claims edge swipes for
back-navigation, and Block Builder's no-sensor fallback is press-and-drag, which
an edge swipe would fight.

**Page on open:** for a single-fact question, the table named by
`mastery.referenceKey`, so `3 x 4` and `12 / 4` both land on the 3s. A multi-sign
round has no single live table, and choosing the fibber's table could reveal the
answer, so it falls back to the last page viewed. The final fallback is the 2s.

**Navigation:** a 1..12 number rail down the left edge of the tray switches
pages in one tap.

**A page:** twelve rows of `3 x 7 = 21` with a block array beside each.

### Array legibility

A 12 x 12 array is 144 blocks, and at a size that fits a tablet row the
individual blocks stop being countable. The array band is fixed-height with cell
size derived from the table number: the 2s are genuinely countable, the 12s read
as a growing rectangle. That is the right way for this to degrade, because the
small tables are where counting actually helps.

## Testing

`tests/referenceTray.spec.js`:

- the tray opens from the hub and from mid-game
- every page is present and its rows are arithmetically correct
- opening the tray mid-question voids the ledger write, and a question answered
  without opening it still records normally
- peek-then-close still voids
- teardown leaves no listeners, timers, or `window.__*` hooks behind

Ledger-only assertions belong in `tests/mastery.spec.js`, which already runs the
ledger as pure logic against a fake clock with no browser.

## Not doing

- No reward, animation, or Bolts for using the tray. It is a poster, not a game.
- No search. Twelve pages behind a number rail is not a findability problem.
- No division pages. The tray shows multiplication; division is the same facts
  read backwards, which is the lesson.
