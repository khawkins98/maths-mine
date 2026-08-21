import { test, expect } from '@playwright/test';
import { boot, pick, state, answer, waitForState } from './helpers.js';

const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mastery.v1')));

function record(save, a, b) {
  const key = a <= b ? `${a}x${b}` : `${b}x${a}`;
  return save.facts.find(([candidate]) => candidate === key)[1];
}

async function force(page, C, R, op) {
  return page.evaluate(([c, r, operation]) => window.__bbForceRound(c, r, operation), [C, R, op]);
}

test.describe('Block Builder direct-answer construction flow', () => {
  test('multiplication starts answerable at zero and keeps a literal running total', async ({ page }) => {
    const errors = await boot(page);
    await pick(page, 'block-builder', '__bb');
    const round = await force(page, 3, 2, 'mul');

    expect(round).toMatchObject({ phase: 'building', placed: 0, tally: '0 blocks' });
    await expect(page.locator('#choices')).toBeVisible();
    await expect(page.locator('#choices .choice')).toHaveCount(3);
    await expect(page.locator('#choices .choice').first()).toBeEnabled();

    // A real canvas pick increments exactly the visible block count.
    const point = await page.evaluate(() => window.__cellXY(0, 0));
    await page.mouse.click(point.x, point.y);
    await expect.poll(() => state(page, '__bb')).toMatchObject({ placed: 1, tally: '1 block' });

    // Fill the rest in a scattered order; the cheat sheet is never replaced by
    // group jargon and remains present while answering and during the proof.
    await page.evaluate(() => {
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) window.__place(c, r);
    });
    await waitForState(page, '__bb', "s.phase === 'asking'");
    await expect(page.locator('#tally')).toHaveText('6 blocks');
    await answer(page, round.answer);
    await waitForState(page, '__bb', "s.phase === 'rotate'");
    await expect(page.locator('#tally')).toHaveText('6 blocks');
    expect(errors).toEqual([]);
  });

  test('a clean immediate multiplication answer earns one honest attempt and reward', async ({ page }) => {
    await boot(page);
    await pick(page, 'block-builder', '__bb');
    const round = await force(page, 3, 2, 'mul');
    const before = await saved(page);
    await answer(page, round.answer);
    await waitForState(page, '__bb', "s.phase === 'rotate'");
    const after = await saved(page);
    expect(record(after, round.a, round.b).attempts).toBe(record(before, round.a, round.b).attempts + 1);
    expect(record(after, round.a, round.b).correct).toBe(record(before, round.a, round.b).correct + 1);
    expect((await state(page, '__bb')).bolts).toBe(round.bolts + 3);
  });

  test('division starts full and each real tap removes one divisor-sized stack', async ({ page }) => {
    const errors = await boot(page);
    await pick(page, 'block-builder', '__bb');
    const round = await force(page, 3, 2, 'div');
    expect(round).toMatchObject({
      phase: 'removing', a: 3, b: 2, dividend: 6, divisor: 2,
      quotient: 3, answer: 3, placed: 6, visibleBlocks: 6, tally: '6 blocks',
    });
    await expect(page.locator('#askeq')).toHaveText('6 ÷ 2 = ?');
    await expect(page.locator('#choices .choice').first()).toBeEnabled();

    const point = await page.evaluate(() => window.__cellXY(1, 0));
    await page.mouse.click(point.x, point.y);
    await expect.poll(() => state(page, '__bb')).toMatchObject({
      phase: 'removing', removedGroups: 1, placed: 4, visibleBlocks: 4, tally: '4 blocks',
    });
    expect((await page.locator('#tally').textContent()).toLowerCase()).not.toContain('shared');

    // Answering before taking another stack preserves canonical a/b identity.
    const before = await saved(page);
    await answer(page, round.answer);
    await waitForState(page, '__bb', "s.phase === 'next' && s.divisionGap > 0");
    const after = await saved(page);
    expect(record(after, round.a, round.b).attempts).toBe(record(before, round.a, round.b).attempts + 1);
    expect(record(after, round.a, round.b).correct).toBe(record(before, round.a, round.b).correct + 1);
    expect((await state(page, '__bb')).visibleBlocks).toBe(6);
    await expect(page.locator('#tally')).toHaveText('6 blocks');
    expect(errors).toEqual([]);
  });

  for (const manipulation of ['skipped', 'partial']) {
    test(`wrong-answer proof and honest retry work when construction was ${manipulation}`, async ({ page }) => {
      await boot(page);
      await pick(page, 'block-builder', '__bb');
      const round = await force(page, 3, 2, 'mul');
      if (manipulation === 'partial') await page.evaluate(() => window.__place(0, 0));
      const before = await saved(page);
      await answer(page, round.choices.find((choice) => choice !== round.answer));
      await waitForState(page, '__bb', "s.phase === 'retrying'");
      expect(await state(page, '__bb')).toMatchObject({ placed: 6, visibleBlocks: 6, assisted: true });
      await answer(page, round.answer);
      await waitForState(page, '__bb', "s.phase === 'rotate'");
      const after = await saved(page);
      expect(record(after, round.a, round.b).attempts).toBe(record(before, round.a, round.b).attempts + 1);
      expect(record(after, round.a, round.b).correct).toBe(record(before, round.a, round.b).correct);
      expect((await state(page, '__bb')).bolts).toBe(round.bolts);
    });
  }

  for (const phase of ['building', 'removing', 'revealing']) {
    test(`route exit during ${phase} tears down and re-enters cleanly`, async ({ page }) => {
      const errors = await boot(page);
      await pick(page, 'block-builder', '__bb');
      const round = await force(page, 3, 2, phase === 'removing' ? 'div' : 'mul');
      if (phase === 'building') await page.evaluate(() => window.__place(0, 0));
      if (phase === 'removing') await page.evaluate(() => window.__place(0, 0));
      if (phase === 'revealing') {
        await answer(page, round.choices.find((choice) => choice !== round.answer));
        await waitForState(page, '__bb', "s.phase === 'revealing'");
      }
      await page.locator('#btn-back').click();
      await expect(page.locator('#hub')).toBeVisible();
      expect(await page.evaluate(() => typeof window.__bb)).toBe('undefined');
      await expect(page.locator('#choices .choice')).toHaveCount(0);
      await page.waitForTimeout(1_500);
      await pick(page, 'block-builder', '__bb');
      await waitForState(page, '__bb', "s.phase === 'building' || s.phase === 'removing'");
      expect(errors).toEqual([]);
    });
  }

  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    test(`total and choices remain visible without occlusion at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await boot(page);
      await pick(page, 'block-builder', '__bb');
      await force(page, 3, 2, 'mul');
      const boxes = await Promise.all([
        page.locator('#tally').boundingBox(),
        page.locator('#askeq').boundingBox(),
        page.locator('#choices').boundingBox(),
      ]);
      for (const box of boxes) {
        expect(box).not.toBeNull();
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      }
      expect(boxes[0].y + boxes[0].height).toBeLessThanOrEqual(boxes[1].y);
      expect(boxes[1].y + boxes[1].height).toBeLessThanOrEqual(boxes[2].y);
    });
  }
});
