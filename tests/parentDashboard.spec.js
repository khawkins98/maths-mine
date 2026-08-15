import { test, expect } from '@playwright/test';
import { boot } from './helpers.js';

// Tests for the grown-ups' progress report (src/game/parentDashboard.js).
//
// Two things are being defended here. First, the entry: a parent view a child
// can stumble into is not a parent view, so a casual tap must do nothing and
// only a deliberate press-and-hold must open it. Second, honesty: the numbers
// on screen are compared against what the ledger itself reports through
// `window.__dash()`, so a rendering that quietly rounds, inflates or invents is
// a failure rather than a nicer-looking dashboard.
//
// Progress is seeded straight into localStorage rather than played, because
// reaching a level-4 fact through real rounds takes minutes of animation and
// the thing under test is the view, not the picker. The save format is the
// ledger's own (`mastery.v1`) and goes through its real load path.

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

function rec(a, b, o) {
  return [`${a}x${b}`, {
    a, b, correct: o.correct, attempts: o.attempts, streak: o.streak || 0,
    level: o.level, avgMs: o.avgMs || 0, seen: o.attempts,
    due: o.due, interval: o.interval,
  }];
}

// A child a few sessions in: one mastered fact, one solid, one shaky, one
// barely met — enough for every branch of the view to have something to say.
function seedRich(now) {
  return {
    facts: [
      rec(2, 2, { level: 4, correct: 8, attempts: 8, avgMs: 2500, due: now + 3 * DAY, interval: 3 * DAY }),
      rec(2, 3, { level: 3, correct: 6, attempts: 7, avgMs: 3200, due: now - 1 * MIN, interval: DAY }),
      rec(3, 4, { level: 1, correct: 2, attempts: 5, avgMs: 7000, due: now - 5 * MIN, interval: 12 * MIN }),
      rec(5, 6, { level: 0, correct: 1, attempts: 4, avgMs: 8800, due: now + 5 * MIN, interval: 12 * MIN }),
    ],
    unlockedTiers: 2,
    totalCorrect: 17,
    recent: [true, true, false, true],
  };
}

// Four answers total: the state the view has to refuse to dress up.
function seedThin(now) {
  return {
    facts: [rec(2, 3, { level: 0, correct: 3, attempts: 4, avgMs: 6000, due: now, interval: 45 * 1000 })],
    unlockedTiers: 1,
    totalCorrect: 3,
    recent: [true, false, true, true],
  };
}

// The save is built here in Node and injected verbatim: the two clocks are the
// same machine's, and every seeded `due` sits minutes away from now, so the
// second or two the page takes to boot cannot flip a fact between due and
// resting.
async function seed(page, make) {
  await page.addInitScript((save) => {
    localStorage.setItem('mastery.v1', JSON.stringify(save));
  }, make(Date.now()));
}

// The real gesture: press and hold the hub's title sign.
async function hold(page, ms) {
  const box = await page.locator('#hub h1').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

async function openDash(page) {
  await hold(page, 1900);
  await expect(page.locator('#parent-dash')).toBeVisible();
}

const tile = (page, label) => page.locator('.pd-tile', { hasText: label });

test.describe('entry gesture', () => {
  test('a casual tap does nothing; a deliberate long press opens the report', async ({ page }) => {
    const errors = await boot(page);

    // A child's tap — and then a distinctly un-childlike one, to be sure a
    // slow, heavy tap still is not enough.
    await hold(page, 120);
    await page.waitForTimeout(400);
    await expect(page.locator('#parent-dash')).toHaveCount(0);
    await hold(page, 700);
    await page.waitForTimeout(400);
    await expect(page.locator('#parent-dash')).toHaveCount(0);

    // A press that slides off is a fidget, not a hold.
    const box = await page.locator('#hub h1').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(300);
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 40);
    await page.waitForTimeout(1600);
    await page.mouse.up();
    await expect(page.locator('#parent-dash')).toHaveCount(0);

    // The real thing.
    await openDash(page);
    await expect(page.locator('#pd-title')).toHaveText('Progress report');
    expect(errors).toEqual([]);
  });

  // Discoverability for a parent on a desktop; the README carries it for tablets.
  test('the hold target advertises itself to a pointer, not to a child', async ({ page }) => {
    await boot(page);
    await expect(page.locator('#hub h1')).toHaveAttribute('title', /press and hold/i);
    // and nothing new appeared on the child's menu
    await expect(page.locator('#hub .hub-card')).toHaveCount(2);
  });

  // The gesture must be armed only on the hub: a finger held on the screen
  // during a round is ordinary play.
  test('holding during a game does not open it', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__pick('block-builder'));
    await page.waitForFunction(() => typeof window.__bb === 'function');
    await page.evaluate(async () => {
      const h1 = document.querySelector('#hub h1');
      h1.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }));
      await new Promise((r) => setTimeout(r, 1900));
    });
    await expect(page.locator('#parent-dash')).toHaveCount(0);
  });
});

test.describe('what it shows', () => {
  test('every rendered number matches what the ledger reports', async ({ page }) => {
    await seed(page, seedRich);
    const errors = await boot(page);
    await openDash(page);

    const { summary, rows } = await page.evaluate(() => window.__dash());
    expect(summary.totalSeen).toBe(4);

    await expect(tile(page, 'Facts met').locator('b')).toHaveText(String(summary.totalSeen));
    await expect(tile(page, 'Known well').locator('b')).toHaveText(String(summary.known));
    await expect(tile(page, 'Due for review').locator('b')).toHaveText(String(summary.dueNow));

    // Lifetime accuracy is never shown without the raw counts behind it.
    const attempts = rows.reduce((s, r) => s + r.attempts, 0);
    const correct = rows.reduce((s, r) => s + r.correct, 0);
    await expect(tile(page, 'Lifetime accuracy').locator('b'))
      .toHaveText(`${Math.round((correct / attempts) * 100)}%`);
    await expect(tile(page, 'Lifetime accuracy').locator('.pd-note'))
      .toHaveText(`${correct} of ${attempts} answers`);

    // Per-fact grid: one cell per fact, carrying the ledger's own level, and a
    // division/commuted twin reading the same record (3×4 and 4×3 are one fact).
    for (const r of rows) {
      await expect(page.locator(`[aria-label^="${r.a} times ${r.b}:"]`).first()).toHaveText(String(r.level));
      await expect(page.locator(`[aria-label^="${r.b} times ${r.a}:"]`).first()).toHaveText(String(r.level));
    }
    // A fact never asked is marked as never asked, not as level 0.
    await expect(page.locator('[aria-label="9 times 6: not met yet"]')).toHaveText('–');

    // Due-now facts are flagged in the grid, and only those.
    const due = rows.filter((r) => r.overdueMs >= 0);
    for (const r of due) {
      await expect(page.locator(`[aria-label^="${r.a} times ${r.b}:"]`).first()).toHaveClass(/pd-due/);
    }
    for (const r of rows.filter((r) => r.overdueMs < 0)) {
      await expect(page.locator(`[aria-label^="${r.a} times ${r.b}:"]`).first()).not.toHaveClass(/pd-due/);
    }

    // Weakest-first list, in the ledger's order, with raw counts not just a %.
    const played = rows.filter((r) => r.attempts > 0).slice(0, 8);
    const listed = page.locator('.pd-list').first().locator('tbody tr');
    await expect(listed).toHaveCount(played.length);
    await expect(listed.first().locator('th')).toHaveText(`${played[0].a} × ${played[0].b}`);
    await expect(listed.first()).toContainText(`${played[0].correct} of ${played[0].attempts}`);

    // Per-table meters agree with tableMastery(), rounded and labelled. Row
    // order is summary.byTable's order, so index is the join.
    const tableRows = page.locator('.pd-list').last().locator('tbody tr');
    await expect(tableRows).toHaveCount(summary.byTable.length);
    for (const [i, t] of summary.byTable.entries()) {
      const row = tableRows.nth(i);
      await expect(row.locator('th')).toHaveText(`${t.table}×`);
      await expect(row).toContainText(`${Math.round(t.mastery * 100)}%`);
      await expect(row).toContainText(`${t.seen} met`);
      await expect(row).toContainText(`${t.known} known well`);
    }

    expect(errors).toEqual([]);
  });

  test('a fresh tablet says so instead of drawing an empty assessment', async ({ page }) => {
    await boot(page);
    await openDash(page);

    await expect(page.locator('.pd-warn')).toContainText('No answers recorded yet');
    await expect(tile(page, 'Lifetime accuracy').locator('b')).toHaveText('—');
    await expect(tile(page, 'Lifetime accuracy')).toContainText('no answers yet');
    // The grid still renders, entirely unseen — the shape of the work ahead is
    // real information; a percentage over zero answers would not be.
    await expect(page.locator('.pd-cell.pd-unseen')).toHaveCount(await page.locator('.pd-cell').count());
    // and nothing pretends there is a weakest fact
    await expect(page.locator('h3', { hasText: 'Weakest first' })).toHaveCount(0);
  });

  test('four answers are labelled as four answers, not as a verdict', async ({ page }) => {
    await seed(page, seedThin);
    await boot(page);
    await openDash(page);

    await expect(page.locator('.pd-warn')).toContainText('Early days — 4 answers so far');
    await expect(page.locator('.pd-warn')).toContainText('too little');
    // the one fact played is flagged as unjudgeable in the list too
    await expect(page.locator('.pd-list').first().locator('tbody tr').first()).toContainText('3 of 4');
  });
});

test.describe('reset', () => {
  test('erasing progress happens only behind an inline confirmation', async ({ page }) => {
    await seed(page, seedRich);
    await boot(page);
    await openDash(page);

    // No browser confirm() anywhere: if one fired, this dialog handler would
    // see it and the test would fail on the assertion below rather than hang.
    let nativeDialog = false;
    page.on('dialog', (d) => { nativeDialog = true; d.dismiss(); });

    await page.locator('#pd-reset').click();
    await expect(page.locator('.pd-danger')).toBeVisible();
    expect((await page.evaluate(() => window.__dash())).summary.totalSeen).toBe(4);

    // backing out changes nothing
    await page.locator('#pd-reset-no').click();
    await expect(page.locator('.pd-danger')).toHaveCount(0);
    expect((await page.evaluate(() => window.__dash())).summary.totalSeen).toBe(4);

    // and going through with it wipes the ledger for real
    await page.locator('#pd-reset').click();
    await page.locator('#pd-reset-yes').click();
    const after = await page.evaluate(() => window.__dash());
    expect(after.summary.totalSeen).toBe(0);
    expect(after.summary.accuracy).toBe(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mastery.v1')).facts)).toEqual([]);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bolts.v1')).bolts)).toBe(0);

    // the view re-renders to the honest empty state, with a confirmation
    await expect(page.locator('.pd-flash')).toContainText('Progress erased');
    await expect(page.locator('.pd-warn')).toContainText('No answers recorded yet');
    expect(nativeDialog).toBe(false);
  });
});

test.describe('lifecycle', () => {
  test('closing detaches every listener and cancels every timer', async ({ page }) => {
    await seed(page, seedRich);
    const errors = await boot(page);
    await openDash(page);

    expect((await page.evaluate(() => window.__dash())).listeners).toBeGreaterThan(0);

    await page.locator('#pd-close').click();
    await expect(page.locator('#parent-dash')).toHaveCount(0);
    const after = await page.evaluate(() => window.__dash());
    expect(after.open).toBe(false);
    expect(after.mounted).toBe(false);
    expect(after.listeners).toBe(0);
    expect(after.timers).toBe(0);

    // The hub underneath is untouched and still playable.
    await expect(page.locator('.hub-card')).toHaveCount(2);
    expect(errors).toEqual([]);
  });

  test('Escape closes it, and it can be reopened without stacking up', async ({ page }) => {
    await boot(page);
    for (let i = 0; i < 3; i++) {
      await openDash(page);
      await page.keyboard.press('Escape');
      await expect(page.locator('#parent-dash')).toHaveCount(0);
      const s = await page.evaluate(() => window.__dash());
      expect(s.listeners).toBe(0);
      expect(s.timers).toBe(0);
    }
    await openDash(page);
    await expect(page.locator('#parent-dash')).toHaveCount(1);
  });

  // The reset confirmation schedules a timed flash message. Closing while it is
  // still pending is exactly the shape of the leak the earlier audit found: the
  // callback fires against a panel that no longer exists.
  test('closing mid-flash cancels the pending timer and throws nothing', async ({ page }) => {
    await seed(page, seedRich);
    const errors = await boot(page);
    await openDash(page);

    await page.locator('#pd-reset').click();
    await page.locator('#pd-reset-yes').click();
    await expect(page.locator('.pd-flash')).toBeVisible();
    expect((await page.evaluate(() => window.__dash())).timers).toBeGreaterThan(0);

    await page.locator('#pd-close').click();
    expect((await page.evaluate(() => window.__dash())).timers).toBe(0);
    await page.waitForTimeout(7000); // outlive the flash timeout
    expect(errors).toEqual([]);
  });

  // Starting a game with the report open must not leave it floating over a
  // live round, and the round must still be playable underneath.
  test('picking a game closes the report cleanly', async ({ page }) => {
    const errors = await boot(page);
    await openDash(page);
    await page.evaluate(() => window.__pick('block-builder'));
    await page.waitForFunction(() => typeof window.__bb === 'function');
    await expect(page.locator('#parent-dash')).toHaveCount(0);
    const s = await page.evaluate(() => window.__dash());
    expect(s.listeners).toBe(0);
    expect(s.timers).toBe(0);
    expect(errors).toEqual([]);
  });
});
