import { test, expect } from '@playwright/test';

test.describe('shared UI transitions', () => {
  test('an old claim fade cannot hide replacement content', async ({ page }) => {
    await page.goto('/');
    const visible = await page.evaluate(async () => {
      const { createUI } = await import('/src/core/ui.js');
      const ui = createUI();
      ui.setClaim('old');
      ui.fadeClaim();
      ui.setClaim('replacement');
      await new Promise((resolve) => setTimeout(resolve, 500));
      return {
        text: ui.els.claimEq.textContent,
        hidden: ui.els.claimEq.classList.contains('hidden'),
      };
    });
    expect(visible).toEqual({ text: 'replacement', hidden: false });
  });

  test('an old choices fade cannot erase a replacement row', async ({ page }) => {
    await page.goto('/');
    const visible = await page.evaluate(async () => {
      const { createUI } = await import('/src/core/ui.js');
      const ui = createUI();
      ui.showChoices([1, 2, 3], () => {});
      ui.fadeChoices();
      ui.showChoices([7, 8, 9], () => {});
      await new Promise((resolve) => setTimeout(resolve, 450));
      return {
        values: ui.currentChoiceValues(),
        hidden: ui.els.choices.classList.contains('hidden'),
      };
    });
    expect(visible).toEqual({ values: [7, 8, 9], hidden: false });
  });

  test('locked choices cannot be activated by keyboard', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      const { createUI } = await import('/src/core/ui.js');
      const ui = createUI();
      window.__testPicks = 0;
      ui.showChoices([6, 8, 12], () => { window.__testPicks += 1; });
      ui.lockChoices();
    });
    const first = page.locator('#choices .choice').first();
    await expect(first).toBeDisabled();
    await first.focus();
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => window.__testPicks)).toBe(0);
  });

  test('voice toggle exposes its state and action', async ({ page }) => {
    await page.goto('/');
    const voice = page.locator('#btn-voice');
    await expect(voice).toHaveAttribute('aria-pressed', 'true');
    await expect(voice).toHaveAttribute('aria-label', 'Turn voice off');
    await voice.evaluate((button) => button.click());
    await expect(voice).toHaveAttribute('aria-pressed', 'false');
    await expect(voice).toHaveAttribute('aria-label', 'Turn voice on');
  });
});
