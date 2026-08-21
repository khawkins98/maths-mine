import { test, expect } from '@playwright/test';
import { boot } from './helpers.js';

test.describe('shared UI transitions', () => {
  test('an old claim fade cannot hide replacement content', async ({ page }) => {
    const errors = await boot(page);
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
    expect(errors).toEqual([]);
  });

  test('an old choices fade cannot erase a replacement row', async ({ page }) => {
    const errors = await boot(page);
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
    expect(errors).toEqual([]);
  });

  test('locked choices cannot be activated by keyboard', async ({ page }) => {
    const errors = await boot(page);
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
    expect(errors).toEqual([]);
  });

  test('a tapped choice gets immediate tactile selection state', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      const { createUI } = await import('/src/core/ui.js');
      const ui = createUI();
      ui.showGameHud();
      ui.showChoices([3, 6, 9], () => {});
    });
    const picked = page.locator('#choices .choice').nth(1);
    await expect(picked).toBeVisible();
    await picked.dispatchEvent('click');
    await expect(page.locator('#choices .choice').nth(1)).toHaveClass(/selected/);
    await expect(page.locator('#choices .choice').first()).not.toHaveClass(/selected/);
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

  test('portrait hub stacks its blocks and keeps the village action readable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await boot(page);
    const layout = await page.evaluate(() => {
      const cards = document.querySelector('#hub-cards');
      const build = document.querySelector('#btn-build-house');
      const style = getComputedStyle(build);
      return {
        columns: getComputedStyle(cards).gridTemplateColumns.split(' ').length,
        cardDirections: [...cards.children].map((card) => getComputedStyle(card).flexDirection),
        buildDisabled: build.disabled,
        buildOpacity: style.opacity,
        buildColor: style.color,
      };
    });
    expect(layout.columns).toBe(1);
    expect(layout.cardDirections).toEqual(['row', 'row', 'row']);
    expect(layout.buildDisabled).toBe(true);
    expect(layout.buildOpacity).toBe('1');
    expect(layout.buildColor).toBe('rgb(255, 249, 223)');
    expect(errors).toEqual([]);
  });
});
