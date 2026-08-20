import { test, expect } from '@playwright/test';
import { boot, pick } from './helpers.js';

async function seedBuild(page, stage = 0, bolts = 100) {
  await page.addInitScript(({ savedStage, savedBolts }) => {
    localStorage.setItem('house_stage.v1', JSON.stringify({ stage: savedStage }));
    localStorage.setItem('bolts.v1', JSON.stringify({ bolts: savedBolts }));
  }, { savedStage: stage, savedBolts: bolts });
}

test.describe('cottage construction reveal', () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1180, height: 720 }]) {
    test(`${viewport.width}x${viewport.height} clears the hub chrome at the build midpoint`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await seedBuild(page);
      const errors = await boot(page);
      await page.locator('#btn-build-house').click();
      await page.waitForFunction(() => window.__hub().revealPhase === 'showing');

      const state = await page.evaluate(() => {
        const hub = document.querySelector('#hub');
        const house = window.__engine().projectBoundsToScreen(window.__engine().house.group);
        return {
          building: window.__hub().building,
          chromeOpacity: getComputedStyle(document.querySelector('#hub-cards')).opacity,
          dimmerOpacity: getComputedStyle(hub, '::before').opacity,
          house,
        };
      });
      expect(state.building).toBe(true);
      expect(Number(state.chromeOpacity)).toBeLessThan(0.15);
      expect(Number(state.dimmerOpacity)).toBeLessThan(0.3);
      expect(state.house.minX).toBeGreaterThanOrEqual(0);
      expect(state.house.maxX).toBeLessThanOrEqual(viewport.width);
      expect(state.house.minY).toBeGreaterThanOrEqual(0);
      expect(state.house.maxY).toBeLessThanOrEqual(viewport.height);
      expect(errors).toEqual([]);
    });
  }

  test('rapid activation spends once and restores focus to the updated action', async ({ page }) => {
    await seedBuild(page, 0, 100);
    await boot(page);
    const button = page.locator('#btn-build-house');
    await button.evaluate((node) => { node.click(); node.click(); node.click(); });
    await expect.poll(() => page.evaluate(() => window.__engine().house.getStage())).toBe(1);
    await page.waitForFunction(() => !window.__hub().building);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bolts.v1')).bolts)).toBe(95);
    await expect(button).toBeFocused();
    await expect(button).not.toHaveAttribute('aria-busy');
  });

  test('starting a game tears down an in-flight reveal without stale restoration', async ({ page }) => {
    await seedBuild(page);
    await boot(page);
    await page.locator('#btn-build-house').click();
    await page.evaluate(() => window.__pick('block-builder'));
    await expect(page.locator('#hub')).toBeHidden();
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => window.__hub())).toMatchObject({ open: false, building: false, revealPhase: 'idle' });
    expect(await page.locator('#hub').evaluate((hub) => [...hub.classList]
      .filter((name) => name.startsWith('house-reveal')))).toEqual([]);
  });

  test('returning from every game restores the village camera', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedBuild(page, 4);
    await boot(page);
    for (const [id, hook] of [
      ['block-builder', '__bb'],
      ['spot-the-wrongun', '__stw'],
      ['night-defense', '__night'],
    ]) {
      await pick(page, id, hook);
      await page.locator('#btn-back').click();
      await page.waitForFunction(() => window.__hub().open);
      const bounds = await page.evaluate(() => window.__engine()
        .projectBoundsToScreen(window.__engine().house.group));
      expect(bounds.minX, `${id} minX`).toBeGreaterThanOrEqual(0);
      expect(bounds.maxX, `${id} maxX`).toBeLessThanOrEqual(390);
      expect(bounds.minY, `${id} minY`).toBeGreaterThanOrEqual(0);
      expect(bounds.maxY, `${id} maxY`).toBeLessThanOrEqual(844);
    }
  });

  test('reduced motion upgrades immediately with a brief static highlight', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedBuild(page);
    await boot(page);
    const button = page.locator('#btn-build-house');
    const immediate = await button.evaluate((node) => {
      node.click();
      return {
        stage: window.__engine().house.getStage(),
        className: document.querySelector('#hub').className,
        phase: window.__hub().revealPhase,
      };
    });
    expect(immediate).toEqual({ stage: 1, className: 'house-reveal-static', phase: 'showing' });
    await expect(page.locator('#hub-cards')).toHaveCSS('opacity', '1');
    await page.waitForFunction(() => !window.__hub().building);
    await expect(button).toBeFocused();
  });
});
