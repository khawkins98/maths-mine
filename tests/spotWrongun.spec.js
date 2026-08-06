import { test, expect } from '@playwright/test';
import { boot, pick, waitForState, state } from './helpers.js';

// Spot the Wrong'un's later tiers: division claims, crews bigger than three,
// and drag-scrub inspection.
//
// Same idiom as smoke.spec.js — everything is driven through the game's
// `window.__*` hooks rather than by pixel-hunting the WebGL canvas. The one
// exception is drag-scrub, which is dispatched as REAL pointer events at
// coordinates the game hands back via `__stwSeatXY`, because the thing under
// test is precisely the wiring between core/pointer.js and the tier.

// ---------------------------------------------------------------------------
// A seeded ledger.
//
// Division only exists for a fact whose × sibling is already known, and the
// crew only grows for a child who has taken facts to "strong". Both are
// several minutes of real play, so the tests that need that state start from a
// saved ledger instead of grinding to it — which is also a fair test of the
// gate, since nothing here reaches into the ledger's internals at runtime.
function ledger(level, keys) {
  return {
    facts: keys.map((k) => {
      const [a, b] = k.split('x').map(Number);
      return [k, { a, b, correct: 6, attempts: 6, streak: 0, level, avgMs: 2500, seen: 6 }];
    }),
    unlockedTiers: 1,          // tables 2, 5, 10
    totalCorrect: 4,           // low enough that JUDGE is still the default tier
    recent: [true, true, true, true, true], // recent accuracy → the 60 product cap
  };
}

// Eight facts drawn from the 2/5/10 tables, all a≠b so none is a trivial ÷.
const KEYS = ['2x3', '2x4', '2x5', '2x6', '3x5', '4x5', '5x6', '2x10'];

async function bootWith(page, save) {
  if (save) {
    await page.addInitScript(
      (s) => localStorage.setItem('mastery.v1', JSON.stringify(s)),
      save,
    );
  }
  return boot(page);
}

const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mastery.v1')));

test.describe("Spot the Wrong'un — division claims", () => {
  test('a villager can claim a division fact, and it can be judged correctly', async ({ page }) => {
    const errors = await bootWith(page, ledger(2, KEYS));
    await pick(page, 'spot-the-wrongun', '__stw');

    await page.evaluate(() => { window.__stwOp('div'); window.__stwTier('judge'); });
    await waitForState(page, '__stw', "s.phase === 'judging'");

    const jr = await state(page, '__stw');
    expect(jr.op).toBe('div');
    expect(jr.claimText).toContain('÷');
    expect(jr.claimText).toBe(`${jr.dividend} ÷ ${jr.divisor} = ${jr.claim}`);

    // The truth of the round is the quotient, and the array the child counts is
    // the share-out that proves it: one row per group, dividend blocks in all.
    expect(jr.answer).toBe(jr.dividend / jr.divisor);
    expect(jr.rows).toBe(jr.divisor);
    expect(jr.cols).toBe(jr.answer);
    expect(jr.blocks).toBe(jr.dividend);

    const before = (await saved(page)).totalCorrect;
    await page.evaluate((truth) => window.__judge(truth), jr.isTrue);
    await waitForState(page, '__stw', "s.phase === 'revealing' || s.phase === 'done'");
    await waitForState(page, '__stw', "s.phase === 'done'", 40_000);

    // scored on the CANONICAL factors, in the one ledger both operations share
    const after = await saved(page);
    expect(after.totalCorrect).toBe(before + 1);
    expect(after.facts.some(([, r]) => r.a === jr.a && r.b === jr.b)).toBe(true);

    expect(errors).toEqual([]);
  });

  test('imposter signs can fib about a share-out', async ({ page }) => {
    const errors = await bootWith(page, ledger(2, KEYS));
    await pick(page, 'spot-the-wrongun', '__stw');

    await page.evaluate(() => { window.__stwOp('div'); window.__stwTier('imposter'); });
    await waitForState(page, '__stw', "s.phase === 'accusing'");

    const r = await state(page, '__stw');
    expect(r.op).toBe('div');
    for (const n of r.crew) expect(n.claimText).toContain('÷');
    // exactly one fib, and it is a plausible neighbouring quotient — a child
    // must do the division to find it, not spot an absurdity
    const imp = r.crew.filter((n) => n.imposter);
    expect(imp).toHaveLength(1);
    expect(imp[0].shown).not.toBe(imp[0].answer);
    expect(Math.abs(imp[0].shown - imp[0].answer)).toBeLessThanOrEqual(2);
    expect(imp[0].shown).toBeGreaterThanOrEqual(2);

    await page.evaluate((i) => window.__accuse(i), r.imposterIndex);
    await waitForState(page, '__stw', "s.phase === 'ejecting' || s.phase === 'done'");
    expect(errors).toEqual([]);
  });

  // The ledger's rule, not ours: a fact's ÷ form does not exist until its ×
  // sibling is known. Asking for division on a fresh save must yield ×, never
  // an invented share-out.
  test('division is not offered before the ledger unlocks it', async ({ page }) => {
    const errors = await bootWith(page, null);
    await pick(page, 'spot-the-wrongun', '__stw');

    await page.evaluate(() => { window.__stwOp('div'); window.__stwTier('judge'); });
    await waitForState(page, '__stw', "s.phase === 'building' || s.phase === 'judging'");
    expect((await state(page, '__stw')).op).toBe('mul');

    await page.evaluate(() => window.__stwTier('imposter'));
    await waitForState(page, '__stw', "s.phase === 'accusing'");
    const r = await state(page, '__stw');
    expect(r.op).toBe('mul');
    for (const n of r.crew) expect(n.claimText).toContain('×');
    expect(errors).toEqual([]);
  });
});

test.describe("Spot the Wrong'un — larger crews", () => {
  test('a four-villager crew renders and is playable', async ({ page }) => {
    const errors = await bootWith(page, ledger(2, KEYS));
    await pick(page, 'spot-the-wrongun', '__stw');
    await page.evaluate(() => window.__stwTier('imposter'));
    await waitForState(page, '__stw', "s.phase === 'accusing'");

    // eight strong facts is past the growth threshold, so the crew is four
    // WITHOUT being forced there
    const r = await state(page, '__stw');
    expect(r.crewSize).toBe(4);
    expect(r.crew).toHaveLength(4);
    expect(r.crew.filter((n) => n.imposter)).toHaveLength(1);

    // four signs the child has to hold in mind at once must all say different
    // things, or the round is a memory puzzle rather than a maths one
    expect(new Set(r.crew.map((n) => n.claimText)).size).toBe(4);

    // every seat is reachable: each has a distinct on-screen position, inside
    // the viewport, and the hitbox under it picks the seat it belongs to
    const seats = await page.evaluate((n) => {
      const out = [];
      for (let i = 0; i < n; i++) out.push(window.__stwSeatXY(i));
      return out;
    }, r.crewSize);
    const w = page.viewportSize();
    let lastX = -Infinity;
    for (const s of seats) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(w.width);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(w.height);
      expect(s.x).toBeGreaterThan(lastX); // left→right, never stacked
      lastX = s.x;
    }

    await page.evaluate((i) => window.__accuse(i), r.imposterIndex);
    await waitForState(page, '__stw', "s.phase === 'ejecting' || s.phase === 'done'", 40_000);
    expect(errors).toEqual([]);
  });

  // The cap is a legibility limit on what a child is shown, so it has to hold
  // against anything that asks for more — including a future mastery ramp.
  test('a crew asked to grow past the legibility cap is clamped', async ({ page }) => {
    const errors = await bootWith(page, ledger(2, KEYS));
    await pick(page, 'spot-the-wrongun', '__stw');
    await page.evaluate(() => window.__stwCrew(9));
    await waitForState(page, '__stw', "s.phase === 'accusing'");

    const r = await state(page, '__stw');
    expect(r.crewSize).toBe(4);

    // and the four it does show stay inside a portrait-tablet frame, which is
    // the constraint the cap was derived from
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(300); // let the resize handler reframe
    const seats = await page.evaluate(() => {
      const out = [];
      for (let i = 0; i < 4; i++) out.push(window.__stwSeatXY(i));
      return out;
    });
    // …with margin left over for the sign each one holds, which is wider than
    // the villager: a seat centre pushed to the very edge means a clipped sign
    for (const s of seats) {
      expect(s.x).toBeGreaterThan(768 * 0.08);
      expect(s.x).toBeLessThan(768 * 0.92);
    }
    expect(errors).toEqual([]);
  });
});

test.describe("Spot the Wrong'un — drag-scrub", () => {
  // Drag across the crew: each villager under the finger is inspected, and
  // NOTHING is committed until the finger lifts.
  test('dragging inspects each villager without committing', async ({ page }) => {
    const errors = await bootWith(page, ledger(2, KEYS));
    await pick(page, 'spot-the-wrongun', '__stw');
    await page.evaluate(() => window.__stwCrew(4));
    await waitForState(page, '__stw', "s.phase === 'accusing'");

    const before = await state(page, '__stw');
    const bolts = before.bolts;

    const down = (i) => page.evaluate((seat) => {
      const p = window.__stwSeatXY(seat);
      document.querySelector('canvas').dispatchEvent(
        new PointerEvent('pointerdown', { clientX: p.x, clientY: p.y, bubbles: true }),
      );
    }, i);
    const moveTo = (i) => page.evaluate((seat) => {
      const p = window.__stwSeatXY(seat);
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: p.x, clientY: p.y, bubbles: true }));
    }, i);

    await down(0);
    expect((await state(page, '__stw')).inspecting).toBe(0);

    // slide along the whole crew — every seat reports as inspected in turn
    for (let i = 1; i < 4; i++) {
      await moveTo(i);
      const s = await state(page, '__stw');
      expect(s.inspecting).toBe(i);
      expect(s.scrubbing).toBe(true);
      expect(s.phase).toBe('accusing'); // still browsing: nothing decided
      expect(s.bolts).toBe(bolts);
    }

    // release OFF the crew: a drag that ends nowhere is a free cancel
    await page.evaluate(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 4, clientY: 4, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    });
    const after = await state(page, '__stw');
    expect(after.phase).toBe('accusing');
    expect(after.scrubbing).toBe(false);
    expect(after.inspecting).toBe(-1);
    expect(after.bolts).toBe(bolts);
    expect(errors).toEqual([]);
  });

  test('releasing on a villager commits, and a plain tap is still a whole move', async ({ page }) => {
    const errors = await bootWith(page, ledger(2, KEYS));
    await pick(page, 'spot-the-wrongun', '__stw');
    await page.evaluate(() => window.__stwCrew(4));
    await waitForState(page, '__stw', "s.phase === 'accusing'");
    const r = await state(page, '__stw');

    // A TAP — press and release in one place, no move event between them, which
    // is the only input a child who never discovers dragging will ever produce.
    await page.evaluate((seat) => {
      const p = window.__stwSeatXY(seat);
      document.querySelector('canvas').dispatchEvent(
        new PointerEvent('pointerdown', { clientX: p.x, clientY: p.y, bubbles: true }),
      );
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    }, r.imposterIndex);

    await waitForState(page, '__stw', "s.phase === 'ejecting' || s.phase === 'done'", 40_000);
    expect(errors).toEqual([]);
  });
});

test.describe("Spot the Wrong'un — teardown", () => {
  test('leaving mid-drag on a large division round leaves the scene clean', async ({ page }) => {
    const errors = await bootWith(page, ledger(2, KEYS));

    const sceneBefore = await page.evaluate(() => window.__bolt.group.parent.children.length);

    await pick(page, 'spot-the-wrongun', '__stw');
    await page.evaluate(() => { window.__stwOp('div'); window.__stwCrew(4); });
    await waitForState(page, '__stw', "s.phase === 'accusing'");

    // finger DOWN on the crew, then bail without ever lifting it: the accusation
    // is scheduled for pointer-up, and pointer-up is bound to the window, so a
    // half-finished drag is exactly the shape a lifecycle leak takes here
    await page.evaluate(() => {
      const p = window.__stwSeatXY(1);
      document.querySelector('canvas').dispatchEvent(
        new PointerEvent('pointerdown', { clientX: p.x, clientY: p.y, bubbles: true }),
      );
      document.getElementById('btn-back').click();
    });
    await expect(page.locator('#hub')).toBeVisible();

    // the release lands after teardown, against a torn-down round
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));

    // hooks gone
    for (const h of ['__stw', '__judge', '__accuse', '__stwTier', '__stwCrew', '__stwOp', '__stwSeatXY']) {
      expect(await page.evaluate((k) => typeof window[k], h)).toBe('undefined');
    }
    // and the scene is exactly as it was found
    expect(await page.evaluate(() => window.__bolt.group.parent.children.length)).toBe(sceneBefore);

    // outlive every pending reveal timer from the round we abandoned
    await page.waitForTimeout(2500);
    expect(errors).toEqual([]);

    // and it can be re-entered — a leaked timer would throw around now
    await pick(page, 'spot-the-wrongun', '__stw');
    await page.waitForTimeout(1500);
    expect(errors).toEqual([]);
  });

  test('leaving mid-reveal of a division round does not throw', async ({ page }) => {
    const errors = await bootWith(page, ledger(2, KEYS));
    await pick(page, 'spot-the-wrongun', '__stw');
    await page.evaluate(() => { window.__stwOp('div'); window.__stwTier('judge'); });
    await waitForState(page, '__stw', "s.phase === 'judging'");

    const jr = await state(page, '__stw');
    await page.evaluate((truth) => {
      window.__judge(truth);                          // start the count-and-prove
      document.getElementById('btn-back').click();    // …and bail through it
    }, jr.isTrue);

    await expect(page.locator('#hub')).toBeVisible();
    await page.waitForTimeout(3000); // outlive the whole reveal chain
    expect(errors).toEqual([]);
  });
});
