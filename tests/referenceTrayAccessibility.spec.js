import { test, expect } from '@playwright/test';
import { boot } from './helpers.js';

const tray = (page) => page.locator('#ref-tray');
const tab = (page) => page.locator('#btn-ref-tab');

test.describe('Times Tables Reference Tray accessibility', () => {
  test('is a named modal with contained focus and stable table selection', async ({ page }) => {
    const errors = await boot(page);
    await tab(page).focus();
    await page.keyboard.press('Enter');

    await expect(tray(page)).toHaveAttribute('role', 'dialog');
    await expect(tray(page)).toHaveAttribute('aria-modal', 'true');
    await expect(tray(page)).toHaveAttribute('aria-labelledby', 'ref-title');
    await expect(page.locator('#btn-ref-close')).toBeFocused();
    await expect(page.locator('#hub')).toHaveAttribute('inert', '');
    await expect(tab(page)).toHaveAttribute('inert', '');
    await expect(page.locator('.ref-rail-btn[data-table="2"]')).toHaveAttribute('aria-current', 'true');

    for (let i = 0; i < 16; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.querySelector('#ref-tray').contains(document.activeElement))).toBe(true);
    }
    for (let i = 0; i < 16; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await page.evaluate(() => document.querySelector('#ref-tray').contains(document.activeElement))).toBe(true);
    }

    const eleven = page.locator('.ref-rail-btn[data-table="11"]');
    await eleven.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.ref-rail-btn[data-table="11"]')).toBeFocused();
    await expect(page.locator('.ref-rail-btn[data-table="11"]')).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('#ref-title')).toHaveText('11 × Table');

    await page.keyboard.press('Escape');
    await expect(tray(page)).not.toHaveClass(/open/);
    await expect(tab(page)).toBeFocused();
    await expect(page.locator('#hub')).not.toHaveAttribute('inert');
    expect(errors).toEqual([]);
  });

  test('all close paths restore focus and opening voids mastery once', async ({ page }) => {
    const errors = await boot(page);
    await page.evaluate(async () => {
      window.__referenceTray.teardown();
      const { createReferenceTray } = await import('/src/game/referenceTray.js');
      window.__voidCalls = 0;
      window.__referenceTray = createReferenceTray({
        mastery: { referenceKey: null, voidCurrentQuestion() { window.__voidCalls += 1; } },
        ui: {},
      });
    });

    await page.locator('#hub').evaluate((node) => { node.inert = true; });
    await tab(page).focus();
    await page.keyboard.press('Enter');
    await page.evaluate(() => window.__referenceTray.open());
    expect(await page.evaluate(() => window.__voidCalls)).toBe(1);
    await page.locator('#btn-ref-close').click();
    await expect(tab(page)).toBeFocused();
    await expect(page.locator('#hub')).toHaveAttribute('inert', '');
    await page.locator('#hub').evaluate((node) => { node.inert = false; });

    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => window.__voidCalls)).toBe(2);
    await page.locator('#ref-backdrop').evaluate((node) => node.click());
    await expect(tab(page)).toBeFocused();

    await page.keyboard.press('Enter');
    await page.evaluate(() => window.__referenceTray.teardown());
    expect(await page.locator('[inert]').count()).toBe(0);
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    expect(errors).toEqual([]);
  });
});
