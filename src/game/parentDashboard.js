// game/parentDashboard.js — the grown-up's view of the mastery ledger.
//
// The child sees one jar per table filling with amber loot, which is deliberately
// a PRACTICE meter (see tableMastery) rather than an assessment: it has to move
// in a single session or the only progress meter in the game looks dead. That is
// the right lie to tell a seven-year-old and the wrong one to tell their parent,
// who wants to know which facts are actually shaky before a school test.
//
// So this view reads the same ledger and reports it straight: per-fact levels,
// raw right/wrong counts, what the spaced-repetition schedule wants asked next,
// and — loudly — how little of it is trustworthy when the child has only
// answered a handful of questions. Nothing here is computed; every number comes
// from mastery.js's read API (factRows/summary), and where the ledger cannot
// support a claim we print "not enough answers yet" instead of a confident bar.
//
// It is a plain DOM overlay on top of the WebGL canvas. It never touches the
// scene, the camera or the render loop, so the world keeps ticking underneath
// and closing it puts the child back exactly where they were.

import { createTimers } from '../core/timers.js';
import { factKey } from './mastery.js';

// ---- entry gesture ----------------------------------------------------------
//
// A parent view a child can stumble into is not a parent view. The rule this
// has to satisfy is "a seven-year-old mashing the screen must never see it",
// which rules out any visible button, and equally rules out a double- or
// triple-tap (children tap fast and repeatedly at the same spot when a game is
// slow to respond — that is exactly what a triple-tap detector looks for).
//
// A long press is the one gesture a child almost never performs by accident:
// they tap and release. So: press and HOLD the hub's title sign for 1.5s,
// without sliding a finger off it. The title is chosen because it is the only
// thing on the hub that is not a control, so holding it cannot be confused with
// pressing a game card, and because a parent reading the README can find it
// without being told which corner. The gesture is armed only while the hub is
// on screen — never during a game, where a held finger is ordinary play.
const HOLD_MS = 1500;
const SLIP_PX = 14; // a hold that wanders this far was a drag, not a press

// Largest multiplier the picker ever asks (ASK_MAX in mastery.js). Mirrored
// here only to size the grid and the "x of y facts" denominators — if that cap
// ever rises, this view under-reports the pool rather than inventing facts.
const ASK_MAX = 6;

// Below this many lifetime answers the ledger is not describing a child, it is
// describing an afternoon. Everything still renders; it just renders with a
// health warning attached rather than as a confident chart.
const THIN_ATTEMPTS = 20;

// What a level actually means, in a parent's words rather than the code's.
// Levels come from mastery.js: three quick correct answers in a row promote a
// fact one level, a wrong answer knocks it back one.
const LEVEL_WORDS = [
  'just met',
  'shaky',
  'coming along',
  'solid',
  'mastered',
];

function pct(x) { return `${Math.round(x * 100)}%`; }

function humanGap(ms) {
  const s = Math.round(ms / 1000);
  if (s < 90) return `${Math.max(1, s)} sec`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hr`;
  return `${Math.round(h / 24)} days`;
}

// The schedule in words. `overdueMs` is negative while a fact is resting.
function dueWords(row) {
  if (row.overdueMs >= 0) return row.overdueMs < 60_000 ? 'due now' : `due (${humanGap(row.overdueMs)} ago)`;
  return `resting ${humanGap(-row.overdueMs)}`;
}

function seconds(ms) { return ms > 0 ? `${(ms / 1000).toFixed(1)}s` : '—'; }

export function createParentDashboard({ mastery, wallet = null, onChange = null } = {}) {
  // Two pools so the debug hook can prove BOTH are empty after a close: the
  // panel's own scheduled work, and the press-and-hold timer, which is pending
  // for a second and a half at a time while the panel is not even open.
  const timers = createTimers();
  const holdTimers = createTimers();

  // Every listener this module attaches, so close() can undo all of them
  // without hunting. `armed` outlives the panel (the open gesture is wired once
  // and stays wired); `bound` lives as long as the panel; `dyn` belongs to the
  // current render only, because a re-render (after a reset, say) throws away
  // the nodes it was attached to and would otherwise keep growing the list.
  const armed = [];
  const bound = [];
  const dyn = [];
  function on(list, target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    list.push({ target, type, fn, opts });
  }
  function off(list) {
    while (list.length) {
      const { target, type, fn, opts } = list.pop();
      target.removeEventListener(type, fn, opts);
    }
  }

  let panel = null;        // the overlay element while open, else null
  let returnFocus = null;  // whatever the parent was focused on before opening
  let flash = '';          // transient confirmation line (e.g. after a reset)
  let confirming = false;  // the inline reset confirmation is showing

  // ---- data shaping (no arithmetic the ledger cannot back) ----
  function readLedger() {
    const summary = mastery.summary();
    const rows = mastery.factRows();
    const byKey = new Map(rows.map((r) => [r.key, r]));

    // The askable pool: every table the game knows, times 2..ASK_MAX. Built
    // through the ledger's own factKey so 3x8 and 8x3 count once, exactly as
    // the ledger counts them.
    const tables = summary.byTable.map((t) => t.table);
    const pool = new Set();
    for (const t of tables) for (let m = 2; m <= ASK_MAX; m++) pool.add(factKey(t, m));

    let attempts = 0, correct = 0;
    for (const r of rows) { attempts += r.attempts; correct += r.correct; }

    return { summary, rows, byKey, tables, pool, attempts, correct };
  }

  // ---- rendering ----
  // Everything interpolated below is a number from the ledger or a string this
  // file owns, so template literals are safe here; there is no user text.

  function statTiles(d) {
    const { summary, attempts, correct, pool } = d;
    const accuracy = attempts > 0
      ? `<b>${pct(summary.accuracy)}</b><span class="pd-note">${correct} of ${attempts} answers</span>`
      : `<b>—</b><span class="pd-note">no answers yet</span>`;
    return `
      <div class="pd-tiles">
        <div class="pd-tile"><span class="pd-tk">Facts met</span><b>${summary.totalSeen}</b><span class="pd-note">of ${pool.size} asked in this game</span></div>
        <div class="pd-tile"><span class="pd-tk">Known well</span><b>${summary.known}</b><span class="pd-note">answered fast and right, repeatedly</span></div>
        <div class="pd-tile"><span class="pd-tk">Due for review</span><b>${summary.dueNow}</b><span class="pd-note">the schedule wants these next</span></div>
        <div class="pd-tile"><span class="pd-tk">Lifetime accuracy</span>${accuracy}</div>
      </div>`;
  }

  // The honesty banner. It is the FIRST thing in the panel on purpose: a grid
  // of coloured squares built from six answers looks like an assessment, and a
  // parent should be told it is not before they read it.
  function honesty(d) {
    const { attempts, summary } = d;
    if (attempts === 0) {
      return `<p class="pd-warn"><b>No answers recorded yet.</b> Everything below is empty because
        nothing has been played, not because your child got it wrong. Play a round and come back.</p>`;
    }
    if (attempts < THIN_ATTEMPTS) {
      return `<p class="pd-warn"><b>Early days — ${attempts} answer${attempts === 1 ? '' : 's'} so far.</b>
        That is far too little to say anything about what your child knows. Treat this as a record of what
        has been <i>played</i>, not a test result. A fact needs three quick correct answers in a row to
        move up a single level.</p>`;
    }
    return `<p class="pd-fine">Built from ${attempts} answers across ${summary.totalSeen} facts.
      Levels move slowly on purpose: three quick correct answers in a row to go up one, one wrong answer to drop one.</p>`;
  }

  // The per-fact grid. Colour carries no information on its own — every cell
  // also shows its level as a digit, unseen cells show a dash, and each cell
  // spells itself out for a screen reader.
  function grid(d) {
    const { tables, byKey } = d;
    let head = '<tr><th class="pd-corner"><span class="pd-sr">Table</span></th>';
    for (let m = 2; m <= ASK_MAX; m++) head += `<th scope="col">×${m}</th>`;
    head += '</tr>';

    let body = '';
    for (const t of tables) {
      body += `<tr><th scope="row">${t}×</th>`;
      for (let m = 2; m <= ASK_MAX; m++) {
        const r = byKey.get(factKey(t, m));
        if (!r) {
          body += `<td class="pd-cell pd-unseen" aria-label="${t} times ${m}: not met yet">–</td>`;
          continue;
        }
        const due = r.overdueMs >= 0;
        const label = `${t} times ${m}: level ${r.level}, ${LEVEL_WORDS[r.level]}, `
          + `${r.correct} right of ${r.attempts}, ${dueWords(r)}`;
        body += `<td class="pd-cell pd-l${r.level}${due ? ' pd-due' : ''}" aria-label="${label}">${r.level}</td>`;
      }
      body += '</tr>';
    }

    return `
      <h3>Every fact</h3>
      <div class="pd-scrollx">
        <table class="pd-grid"><caption class="pd-sr">Mastery level per fact, tables 2 to 10</caption>
          <thead>${head}</thead><tbody>${body}</tbody></table>
      </div>
      <ul class="pd-legend">
        <li><span class="pd-swatch pd-unseen">–</span> never asked</li>
        <li><span class="pd-swatch pd-l0">0</span> just met</li>
        <li><span class="pd-swatch pd-l1">1</span> shaky</li>
        <li><span class="pd-swatch pd-l2">2</span> coming along</li>
        <li><span class="pd-swatch pd-l3">3</span> solid</li>
        <li><span class="pd-swatch pd-l4">4</span> mastered</li>
        <li><span class="pd-swatch pd-l2 pd-due">•</span> due for review now</li>
      </ul>
      <p class="pd-fine">The game only ever asks up to ×${ASK_MAX}, so there are no columns beyond it.
      Division shares a record with its multiplication twin: answering 42 ÷ 6 moves 6 × 7.</p>`;
  }

  // Weakest facts first — this is factRows()'s own order, not a re-ranking.
  function weakest(d) {
    const played = d.rows.filter((r) => r.attempts > 0).slice(0, 8);
    if (!played.length) return '';
    const body = played.map((r) => `
      <tr>
        <th scope="row">${r.a} × ${r.b}</th>
        <td>${r.level} · ${LEVEL_WORDS[r.level]}</td>
        <td>${r.correct} of ${r.attempts}${r.attempts < 3 ? ' <span class="pd-thin">too few to judge</span>' : ''}</td>
        <td>${seconds(r.avgMs)}</td>
        <td>${dueWords(r)}</td>
      </tr>`).join('');
    return `
      <h3>Weakest first</h3>
      <div class="pd-scrollx">
        <table class="pd-list">
          <thead><tr><th scope="col">Fact</th><th scope="col">Level</th><th scope="col">Right</th><th scope="col">Typical time</th><th scope="col">Schedule</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      <p class="pd-fine">"Typical time" is a running average of the correct answers only, so a fact answered
      right once has a time based on one answer.</p>`;
  }

  function tables(d) {
    const rows = d.summary.byTable.map((t) => `
      <tr>
        <th scope="row">${t.table}×</th>
        <td class="pd-barcell">
          <div class="pd-barwrap">
            <span class="pd-bar" style="--fill:${pct(t.mastery)}"></span>
            <span class="pd-barnum">${pct(t.mastery)}</span>
          </div>
        </td>
        <td>${t.seen} met</td>
        <td>${t.known} known well</td>
      </tr>`).join('');
    return `
      <h3>By table</h3>
      <div class="pd-scrollx">
        <table class="pd-list">
          <thead><tr><th scope="col">Table</th><th scope="col">Jar meter</th><th scope="col">Facts met</th><th scope="col">Known</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="pd-fine">The jar meter is what your child sees fill up on the shelf, and it rewards
      <i>practice</i> as much as mastery so that it visibly moves in one session. "Known" is the strict
      count — the facts answered quickly and correctly enough times to stop needing regular practice.
      A full jar next to a low "known" count means plenty of play and not much sticking yet.
      Table stages unlocked so far: ${d.summary.unlockedTiers}.</p>`;
  }

  function resetSection() {
    if (confirming) {
      return `
        <h3>Start again</h3>
        <div class="pd-danger" role="alertdialog" aria-label="Confirm erasing all progress">
          <p><b>Erase every fact, level, bolt and village upgrade?</b> This cannot be undone, and the games will
          start again from the 2, 5 and 10 tables as if the tablet were new.</p>
          <div class="pd-row">
            <button class="pd-btn pd-btn-danger" id="pd-reset-yes">Yes, erase everything</button>
            <button class="pd-btn" id="pd-reset-no">Keep it</button>
          </div>
        </div>`;
    }
    return `
      <h3>Start again</h3>
      <p>A second child on the same tablet inherits the first one's ledger, which makes the questions
      wrong for both of them. Erasing progress gives a clean start.</p>
      <button class="pd-btn" id="pd-reset">Erase all progress…</button>`;
  }

  function render() {
    if (!panel) return;
    off(dyn);
    const d = readLedger();
    const body = panel.querySelector('#pd-scroll');
    body.innerHTML =
      (flash ? `<p class="pd-flash" role="status">${flash}</p>` : '')
      + honesty(d)
      + statTiles(d)
      + grid(d)
      + weakest(d)
      + tables(d)
      + resetSection();

    const btn = (id) => body.querySelector(`#${id}`);
    if (btn('pd-reset')) on(dyn, btn('pd-reset'), 'click', () => { confirming = true; render(); });
    if (btn('pd-reset-no')) on(dyn, btn('pd-reset-no'), 'click', () => { confirming = false; render(); });
    if (btn('pd-reset-yes')) on(dyn, btn('pd-reset-yes'), 'click', doReset);
  }

  function doReset() {
    mastery.reset();
    if (wallet && wallet.reset) wallet.reset();
    if (onChange) onChange();
    confirming = false;
    flash = 'Progress erased. The tables and village will start again.';
    render();
    // The confirmation should not sit there forever pretending to be a heading.
    timers.later(() => { flash = ''; render(); }, 6000);
  }

  // ---- open / close ----
  function open() {
    if (panel) return;
    returnFocus = document.activeElement;
    flash = '';
    confirming = false;

    panel = document.createElement('div');
    panel.id = 'parent-dash';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'pd-title');
    panel.innerHTML = `
      <div class="pd-panel">
        <header class="pd-head">
          <div>
            <h2 id="pd-title">Progress report</h2>
            <p class="pd-sub">For a grown-up. Your child never sees this screen.</p>
          </div>
          <button class="pd-btn pd-close" id="pd-close" aria-label="Close the progress report">Close</button>
        </header>
        <div id="pd-scroll" class="pd-scroll"></div>
      </div>`;
    document.body.appendChild(panel);

    on(bound, panel.querySelector('#pd-close'), 'click', close);
    // Escape closes, and Tab is kept inside the panel: the hub's game cards are
    // still in the document behind the scrim, and a parent tabbing off the end
    // of this dialog would silently be driving the child's menu.
    on(bound, document, 'keydown', onKeydown, true);

    render();
    panel.querySelector('#pd-close').focus();
  }

  function onKeydown(e) {
    if (!panel) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const focusable = [...panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((el) => !el.disabled && el.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // Teardown discipline, borrowed wholesale from the game contract in
  // src/games/README.md: every listener detached, every pending timer cancelled,
  // every node removed. The panel is rebuilt from scratch on the next open, so
  // there is nothing left behind to go stale — a leaked `flash` timer firing
  // against a removed panel was exactly the class of bug that audit found.
  function close() {
    if (!panel) return;
    off(dyn);
    off(bound);
    timers.clearAll();
    panel.remove();
    panel = null;
    confirming = false;
    flash = '';
    if (returnFocus && returnFocus.focus) returnFocus.focus();
    returnFocus = null;
  }

  // ---- the press-and-hold opener ----
  // `canOpen()` lets the host say "only while the hub is showing"; without it a
  // held finger during a game could pop the panel over a live round.
  function armOpenGesture(el, canOpen = () => true) {
    if (!el) return () => {};
    let start = null;

    const cancel = () => { holdTimers.clearAll(); start = null; };

    on(armed, el, 'pointerdown', (e) => {
      if (panel || !canOpen()) return;
      start = { x: e.clientX, y: e.clientY };
      holdTimers.clearAll();
      holdTimers.later(() => { start = null; if (canOpen()) open(); }, HOLD_MS);
    });
    // A press that slides is a scroll or a fidget, not a deliberate hold.
    on(armed, el, 'pointermove', (e) => {
      if (!start) return;
      if (Math.abs(e.clientX - start.x) > SLIP_PX || Math.abs(e.clientY - start.y) > SLIP_PX) cancel();
    });
    on(armed, el, 'pointerup', cancel);
    on(armed, el, 'pointercancel', cancel);
    on(armed, el, 'pointerleave', cancel);

    // Discoverable on a desktop without adding a single pixel of child-facing
    // chrome; the README carries it for tablets.
    el.setAttribute('title', 'Grown-ups: press and hold for the progress report');
    return () => { cancel(); off(armed); };
  }

  // Debug hooks, the same convention the games use (src/games/README.md): the
  // test suite drives the real gesture and then reads this to prove that
  // closing left nothing attached and nothing pending.
  window.__dash = () => ({
    open: !!panel,
    mounted: !!document.getElementById('parent-dash'),
    listeners: bound.length + dyn.length,
    armedListeners: armed.length,
    timers: timers.pending + holdTimers.pending,
    confirming,
    summary: mastery.summary(),
    rows: mastery.factRows(),
  });

  return {
    open,
    close,
    render,
    armOpenGesture,
    isOpen: () => !!panel,
    teardown() { close(); off(armed); holdTimers.clearAll(); delete window.__dash; },
  };
}
