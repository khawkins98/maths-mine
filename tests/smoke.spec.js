import { test, expect } from '@playwright/test';
import { boot, pick, waitForState, state, answer } from './helpers.js';

// End-to-end smoke tests: each game must be playable from the hub through one
// full round, and every game must tear down cleanly when the child leaves.
//
// These exist to catch regressions during refactoring. They deliberately drive
// the games through the documented `window.__*` debug hooks rather than
// pixel-hunting a WebGL canvas.

test.describe('boot + hub', () => {
  test('gate leads to a hub listing all three games', async ({ page }) => {
    const errors = await boot(page);
    const { games } = await page.evaluate(() => window.__hub());
    expect(games).toEqual(['block-builder', 'shake-a-batch', 'spot-the-wrongun']);
    await expect(page.locator('.hub-card')).toHaveCount(3);
    expect(errors).toEqual([]);
  });
});

test.describe('Block Builder', () => {
  test('builds a wall, answers correctly, and advances', async ({ page }) => {
    const errors = await boot(page);
    await pick(page, 'block-builder', '__bb');

    const round = await state(page, '__bb');
    expect(round.phase).toBe('building');
    expect(round.C).toBeGreaterThan(0);
    expect(round.R).toBeGreaterThan(0);

    // Fill the mould group by group, the way a child does.
    await page.evaluate(({ C, R }) => {
      for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) window.__place(c, r);
    }, round);

    await waitForState(page, '__bb', "s.phase === 'asking'");
    const asking = await state(page, '__bb');
    expect(asking.placed).toBe(round.C * round.R);
    expect(asking.choices).toContain(asking.answer);

    await answer(page, asking.answer);

    // × rounds go to the commutativity rotate; ÷ rounds go straight to next.
    await waitForState(page, '__bb', "s.phase === 'rotate' || s.phase === 'next'");
    expect(errors).toEqual([]);
  });

  test('division rounds ask how many in each group', async ({ page }) => {
    await boot(page);
    await pick(page, 'block-builder', '__bb');

    // Play one × round so a fact is known well enough to unlock its ÷ sibling.
    const first = await state(page, '__bb');
    await page.evaluate(({ C, R }) => {
      for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) window.__place(c, r);
    }, first);
    await waitForState(page, '__bb', "s.phase === 'asking'");
    await answer(page, (await state(page, '__bb')).answer);
    await waitForState(page, '__bb', "s.phase === 'rotate' || s.phase === 'next'");

    // Force the next round to division and start it.
    await page.evaluate(() => window.__nextMode('div'));
    await page.locator('#btn-confirm').click();          // Rotate 🔄 or Next →
    await waitForState(page, '__bb', "s.phase === 'rotate' || s.phase === 'next' || s.phase === 'building'");
    if ((await state(page, '__bb')).phase !== 'building') {
      await page.locator('#btn-confirm').click();        // Next → after the rotate
    }
    await waitForState(page, '__bb', "s.phase === 'building' && s.op === 'div'");

    const div = await state(page, '__bb');
    expect(div.op).toBe('div');
    expect(div.answer).toBe(div.C); // ÷ asks how many in each group = column count
  });
});

test.describe('Shake-a-Batch', () => {
  test('one shake rolls the factors, which multiply out into a countable array', async ({ page }) => {
    const errors = await boot(page);
    await pick(page, 'shake-a-batch', '__sbb');

    const round = await state(page, '__sbb');
    expect(round.phase).toBe('rolling');

    // The groups die is an ordinary pip die, so its factor must be rollable.
    expect(round.target).toBeGreaterThanOrEqual(2);
    expect(round.target).toBeLessThanOrEqual(6);
    expect(round.target * round.groupSize).toBe(round.answer);

    // One shake rolls both factors; the array then builds itself.
    await page.evaluate(() => window.__shake());
    await waitForState(page, '__sbb', 's.factorDice === 2');
    await waitForState(page, '__sbb', "s.phase === 'asking'", 40_000);

    const asking = await state(page, '__sbb');
    expect(asking.groups).toBe(round.target);
    // exactly one counter per unit of the product, so counting them is the answer
    expect(asking.dice).toBe(round.answer);
    expect(asking.choices).toContain(asking.answer);

    await answer(page, asking.answer);
    await waitForState(page, '__sbb', "s.phase === 'next'", 30_000);
    expect(errors).toEqual([]);
  });

  // The whole trick of the game: the dice are loaded to the fact the ledger
  // wants practised. If loading silently failed the dice would contradict the
  // question, so read back what each settled die is really showing.
  test('the loaded dice land showing the factors they were loaded with', async ({ page }) => {
    await boot(page);
    await pick(page, 'shake-a-batch', '__sbb');
    const { target, groupSize } = await state(page, '__sbb');

    await page.evaluate(() => window.__shake());
    await waitForState(page, '__sbb', "s.phase === 'spawning' || s.phase === 'settling' || s.phase === 'asking'", 30_000);

    const { shown } = await state(page, '__sbb');
    expect(shown).toHaveLength(2);
    expect([...shown].sort()).toEqual([target, groupSize].sort());
  });
});

test.describe("Spot the Wrong'un", () => {
  test('judge tier: scores a true/false claim', async ({ page }) => {
    const errors = await boot(page);
    await pick(page, 'spot-the-wrongun', '__stw');
    await page.evaluate(() => window.__stwTier('judge'));

    await waitForState(page, '__stw', "s.phase === 'judging'");
    const jr = await state(page, '__stw');
    expect(jr.tier).toBe('judge');

    await page.evaluate((truth) => window.__judge(truth), jr.isTrue);
    await waitForState(page, '__stw', "s.phase === 'revealing' || s.phase === 'done'");
    expect(errors).toEqual([]);
  });

  test('imposter tier: accusing the fibbing sign resolves the round', async ({ page }) => {
    const errors = await boot(page);
    await pick(page, 'spot-the-wrongun', '__stw');
    await page.evaluate(() => window.__stwTier('imposter'));

    await waitForState(page, '__stw', "s.phase === 'accusing'");
    const r = await state(page, '__stw');
    expect(r.crew.length).toBeGreaterThan(1);
    expect(r.crew.filter((n) => n.imposter)).toHaveLength(1);

    await page.evaluate((i) => window.__accuse(i), r.imposterIndex);
    await waitForState(page, '__stw', "s.phase === 'ejecting' || s.phase === 'done'");
    expect(errors).toEqual([]);
  });
});

test.describe('progress', () => {
  test('mastery survives a reload', async ({ page }) => {
    await boot(page);
    await pick(page, 'block-builder', '__bb');

    // Play one round correctly so there is progress worth keeping.
    const round = await state(page, '__bb');
    await page.evaluate(({ C, R }) => {
      for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) window.__place(c, r);
    }, round);
    await waitForState(page, '__bb', "s.phase === 'asking'");
    await answer(page, (await state(page, '__bb')).answer);
    await waitForState(page, '__bb', "s.phase === 'rotate' || s.phase === 'next'");

    const saved = await page.evaluate(() => localStorage.getItem('mastery.v1'));
    expect(saved).toBeTruthy();
    expect(JSON.parse(saved).totalCorrect).toBe(1);

    // Reload: the ledger — and so Bolt's oxidation — must come back.
    await boot(page);
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('mastery.v1')));
    expect(after.totalCorrect).toBe(1);
    expect(after.facts.length).toBeGreaterThan(0);
  });
});

test.describe('teardown', () => {
  // The regression guard for the timer leak: leaving mid-round must not let a
  // pending setTimeout fire against a torn-down game.
  test('leaving a game mid-round is clean, and games can be re-entered', async ({ page }) => {
    const errors = await boot(page);

    for (const [id, hook] of [
      ['block-builder', '__bb'],
      ['shake-a-batch', '__sbb'],
      ['spot-the-wrongun', '__stw'],
    ]) {
      await pick(page, id, hook);
      await page.locator('#btn-back').click();
      await expect(page.locator('#hub')).toBeVisible();
      // the game must remove its own debug hooks on teardown
      expect(await page.evaluate((h) => typeof window[h], hook)).toBe('undefined');
    }

    // Re-enter the first game — a leaked timer from the earlier visit would
    // fire around now and throw against a null round.
    await pick(page, 'block-builder', '__bb');
    const round = await state(page, '__bb');
    await page.evaluate(({ C, R }) => window.__place(0, 0) && C && R, round);
    await page.waitForTimeout(1500);
    expect(errors).toEqual([]);
  });

  test('answering then immediately leaving does not throw', async ({ page }) => {
    const errors = await boot(page);
    await pick(page, 'block-builder', '__bb');

    const round = await state(page, '__bb');
    await page.evaluate(({ C, R }) => {
      for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) window.__place(c, r);
    }, round);
    await waitForState(page, '__bb', "s.phase === 'asking'");
    await answer(page, (await state(page, '__bb')).answer);

    // Bail out during the reveal, while timers are still pending.
    await page.locator('#btn-back').click();
    await expect(page.locator('#hub')).toBeVisible();
    await page.waitForTimeout(2000); // outlive every pending timeout
    expect(errors).toEqual([]);
  });
});
