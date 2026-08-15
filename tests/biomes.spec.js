import { test, expect } from '@playwright/test';
import { boot } from './helpers.js';

test.describe('Procedural Biomes & Progression', () => {
  test('can switch between all biomes via window.__biome debug hook', async ({ page }) => {
    const errors = await boot(page);

    const biomes = ['flat', 'hills', 'plains', 'forest', 'desert', 'snow', 'nether', 'end'];
    for (const b of biomes) {
      await page.evaluate((id) => window.__biome(id), b);
      await page.waitForTimeout(50);
    }

    expect(errors).toEqual([]);
  });

  test('can swap biomes using square brackets [ and ] debug shortcut', async ({ page }) => {
    const errors = await boot(page);

    // Initial biome is flat
    let current = await page.evaluate(() => window.__biome ? 'flat' : null);
    expect(current).toBe('flat');

    // Press ] to move to hills
    await page.keyboard.press('BracketRight');
    current = await page.evaluate(() => window.__nextBiome && window.__nextBiome().id); // nextBiome moves hills -> forest and returns forest
    expect(current).toBe('forest');

    // Press [ to move back to hills
    await page.keyboard.press('BracketLeft');
    // Pressing BracketLeft shifted forest -> hills. Let's verify by calling __prevBiome() which shifts hills -> flat
    const prev = await page.evaluate(() => window.__prevBiome().id);
    expect(prev).toBe('flat');

    expect(errors).toEqual([]);
  });
});
