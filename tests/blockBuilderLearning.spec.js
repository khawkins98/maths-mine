import { test, expect } from '@playwright/test';
import { boot, pick, waitForState, state, answer } from './helpers.js';

const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mastery.v1')));

function factRecord(save, a, b) {
  const key = a <= b ? `${a}x${b}` : `${b}x${a}`;
  return save.facts.find(([candidate]) => candidate === key)[1];
}

async function forceBuiltRound(page, C, R, op = 'mul') {
  await page.evaluate(({ c, r, operation }) => window.__bbForceRound(c, r, operation), {
    c: C, r: R, operation: op,
  });
  const round = await state(page, '__bb');
  await page.evaluate(({ cols, rows }) => {
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) window.__place(c, r);
    }
  }, { cols: round.C, rows: round.R });
  await waitForState(page, '__bb', "s.phase === 'asking'");
  return state(page, '__bb');
}

async function miss(page, round) {
  const wrong = round.choices.find((value) => value !== round.answer);
  await answer(page, wrong);
  return wrong;
}

test.describe('Block Builder evidence and retrieval', () => {
  test('a first-try answer keeps canonical mastery and the full reward', async ({ page }) => {
    const errors = await boot(page);
    await pick(page, 'block-builder', '__bb');
    const round = await forceBuiltRound(page, 3, 2);
    const before = await saved(page);
    const recordBefore = factRecord(before, round.a, round.b);

    await answer(page, round.answer);
    await waitForState(page, '__bb', "s.phase === 'rotate'");

    const after = await saved(page);
    const recordAfter = factRecord(after, round.a, round.b);
    expect(recordAfter.attempts).toBe(recordBefore.attempts + 1);
    expect(recordAfter.correct).toBe(recordBefore.correct + 1);
    expect(after.totalCorrect).toBe(before.totalCorrect + 1);
    expect((await state(page, '__bb')).bolts).toBe(round.bolts + 3);
    expect(errors).toEqual([]);
  });

  test('a multiplication miss is taught, retried, and never credited or rewarded', async ({ page }) => {
    const errors = await boot(page);
    await pick(page, 'block-builder', '__bb');
    const round = await forceBuiltRound(page, 3, 2);
    const before = await saved(page);
    const recordBefore = factRecord(before, round.a, round.b);

    await miss(page, round);
    const afterMiss = await saved(page);
    expect(factRecord(afterMiss, round.a, round.b).attempts).toBe(recordBefore.attempts + 1);
    expect(factRecord(afterMiss, round.a, round.b).correct).toBe(recordBefore.correct);

    // The independent answer is already final: reference help after it cannot
    // erase the miss while the proof or assisted retry is still on screen.
    await page.evaluate(() => { window.__refTray.open(); window.__refTray.close(); });
    expect(factRecord(await saved(page), round.a, round.b).attempts).toBe(recordBefore.attempts + 1);

    await waitForState(page, '__bb', "s.phase === 'retrying'");
    let retry = await state(page, '__bb');
    expect(retry.assisted).toBe(true);
    expect(retry.choices).toContain(round.answer);

    // A second miss remains supportive but is not another assessment event.
    await miss(page, retry);
    await waitForState(page, '__bb', "s.phase === 'retrying' && s.retryMistakes === 1");
    expect(factRecord(await saved(page), round.a, round.b).attempts).toBe(recordBefore.attempts + 1);

    retry = await state(page, '__bb');
    await answer(page, retry.answer);
    await waitForState(page, '__bb', "s.phase === 'rotate'");

    const afterRetry = await saved(page);
    const recordAfter = factRecord(afterRetry, round.a, round.b);
    expect(recordAfter.attempts).toBe(recordBefore.attempts + 1);
    expect(recordAfter.correct).toBe(recordBefore.correct);
    expect(afterRetry.totalCorrect).toBe(before.totalCorrect);
    expect((await state(page, '__bb')).bolts).toBe(round.bolts);
    await expect(page.locator('#status')).toContainText('You used the proof!');

    await page.locator('#btn-confirm').click();
    await waitForState(page, '__bb', "s.phase === 'next'");
    await page.locator('#btn-confirm').click();
    await waitForState(page, '__bb', "s.phase === 'building'");
    expect(await state(page, '__bb')).toMatchObject({ assisted: false, retryMistakes: 0 });
    expect(errors).toEqual([]);
  });

  test('assisted division keeps canonical identity and the equal-group reveal', async ({ page }) => {
    const errors = await boot(page);
    await pick(page, 'block-builder', '__bb');
    const round = await forceBuiltRound(page, 3, 2, 'div');
    expect(round).toMatchObject({
      a: 3, b: 2, dividend: 6, divisor: 2, quotient: 3, answer: 3,
    });
    await expect(page.locator('#askeq')).toHaveText('6 ÷ 2 = ?');
    const before = await saved(page);
    const canonicalKey = '2x3'; // the persisted identity for the 3 × 2 fact family
    const recordBefore = before.facts.find(([key]) => key === canonicalKey)[1];

    await miss(page, round);
    await waitForState(page, '__bb', "s.phase === 'retrying'");
    await answer(page, round.answer);
    await waitForState(page, '__bb', "s.phase === 'next' && s.divisionGap > 0");

    const after = await saved(page);
    const recordAfter = after.facts.find(([key]) => key === canonicalKey)[1];
    expect(recordAfter.attempts).toBe(recordBefore.attempts + 1);
    expect(recordAfter.correct).toBe(recordBefore.correct);
    expect(after.totalCorrect).toBe(before.totalCorrect);
    expect((await state(page, '__bb')).bolts).toBe(round.bolts);
    const revealed = await state(page, '__bb');
    expect(revealed.divisionGap).toBeGreaterThan(0);
    for (let r = 1; r < revealed.rowYs.length; r++) {
      expect(revealed.rowYs[r] - revealed.rowYs[r - 1]).toBeGreaterThan(1.15);
    }
    expect(errors).toEqual([]);
  });

  test('leaving mid-proof cancels the reveal chain and re-enters cleanly', async ({ page }) => {
    const errors = await boot(page);
    await pick(page, 'block-builder', '__bb');
    const round = await forceBuiltRound(page, 2, 3);
    await miss(page, round);
    await waitForState(page, '__bb', "s.phase === 'revealing'");

    // Leave while recursive countReveal plus its fade/retry timers are pending.
    await page.locator('#btn-back').click();
    await expect(page.locator('#hub')).toBeVisible();
    expect(await page.evaluate(() => typeof window.__bb)).toBe('undefined');
    await expect(page.locator('#choices')).toBeHidden();
    await expect(page.locator('#choices .choice')).toHaveCount(0);
    await expect(page.locator('#askeq')).toBeHidden();

    // The complete abandoned chain would have reached its retry by now.
    await page.waitForTimeout(3_000);
    await expect(page.locator('#hub')).toBeVisible();
    expect(await page.evaluate(() => typeof window.__bb)).toBe('undefined');
    await expect(page.locator('#choices')).toBeHidden();
    await expect(page.locator('#choices .choice')).toHaveCount(0);
    await expect(page.locator('#askeq')).toBeHidden();

    await pick(page, 'block-builder', '__bb');
    await waitForState(page, '__bb', "s.phase === 'building' && !s.assisted");
    expect(errors).toEqual([]);
  });
});
