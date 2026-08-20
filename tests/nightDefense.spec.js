import { test, expect } from '@playwright/test';
import { boot, pick, state, waitForState } from './helpers.js';
import { createFactPicker } from '../src/games/nightDefense/facts.js';

test.describe('Night Defence learning loop', () => {
  test('preserves canonical factors when the shared scheduler serves division', () => {
    const mastery = {
      nextQuestion: () => ({
        op: 'div', a: 3, b: 5, dividend: 15, divisor: 5,
        quotient: 3, answer: 3,
      }),
    };

    const fact = createFactPicker(mastery).pickFact();
    expect(fact).toMatchObject({
      op: '÷', a: 3, b: 5, dividend: 15, divisor: 5,
      target: 3, text: '15 ÷ 5 = ?', answerText: '15 ÷ 5 = 3',
    });
    expect(fact.choices).toContain(3);
  });

  test('starts gently and teaches the fact after a miss before retrying', async ({ page }) => {
    const errors = await boot(page);
    await pick(page, 'night-defense', '__night');
    await waitForState(page, '__night', "s.phase === 'asking'");

    const first = await state(page, '__night');
    expect(first.fact.op).toBe('×');
    expect([2, 5, 10]).toContain(first.fact.a);
    expect(first.fact.a * first.fact.b).toBeLessThanOrEqual(12);
    expect(first.fact.choices).toHaveLength(3);

    const miss = first.fact.choices.find((value) => value !== first.fact.target);
    await page.evaluate((value) => window.__nightAnswer(value), miss);
    await waitForState(page, '__night', "s.phase === 'revealing'");

    const reveal = await page.evaluate(() => ({
      equation: document.getElementById('askeq').textContent,
      status: document.getElementById('status').textContent,
    }));
    expect(reveal.equation).toBe(first.fact.answerText);
    expect(reveal.status).toContain(`Remember: ${first.fact.answerText}`);

    const savedAfterMiss = await page.evaluate(() => JSON.parse(localStorage.getItem('mastery.v1')));
    const record = savedAfterMiss.facts.find(([key]) => key === [first.fact.a, first.fact.b].sort((a, b) => a - b).join('x'))[1];
    expect(record.attempts).toBe(1);
    expect(record.correct).toBe(0);

    await waitForState(page, '__night', "s.phase === 'retrying'");
    await page.evaluate((value) => window.__nightAnswer(value), first.fact.target);
    await waitForState(page, '__night', "s.phase === 'victory'");

    // The exposed retry gives the child a successful action, but is not
    // misreported to the grown-up as a second retrieval attempt.
    const savedAfterRetry = await page.evaluate(() => JSON.parse(localStorage.getItem('mastery.v1')));
    const retryRecord = savedAfterRetry.facts.find(([key]) => key === [first.fact.a, first.fact.b].sort((a, b) => a - b).join('x'))[1];
    expect(retryRecord.attempts).toBe(1);
    expect(retryRecord.correct).toBe(0);
    expect(errors).toEqual([]);
  });

  test('records an independent correct answer with real response time', async ({ page }) => {
    await boot(page);
    await pick(page, 'night-defense', '__night');
    await waitForState(page, '__night', "s.phase === 'asking'");
    const { fact } = await state(page, '__night');

    await page.waitForTimeout(50);
    await page.evaluate((value) => window.__nightAnswer(value), fact.target);
    await waitForState(page, '__night', "s.phase === 'victory'");

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mastery.v1')));
    const key = [fact.a, fact.b].sort((a, b) => a - b).join('x');
    const record = saved.facts.find(([candidate]) => candidate === key)[1];
    expect(record.attempts).toBe(1);
    expect(record.correct).toBe(1);
    expect(record.avgMs).toBeGreaterThan(0);
  });

  test('removes its debug drivers when leaving mid-round', async ({ page }) => {
    const errors = await boot(page);
    await pick(page, 'night-defense', '__night');
    await page.locator('#btn-back').click();
    await expect(page.locator('#hub')).toBeVisible();
    await page.waitForTimeout(1800);
    expect(await page.evaluate(() => typeof window.__night)).toBe('undefined');
    expect(await page.evaluate(() => typeof window.__nightAnswer)).toBe('undefined');
    expect(errors).toEqual([]);
  });
});
