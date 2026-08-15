import { test, expect } from '@playwright/test';
import { boot } from './helpers.js';

test.describe('Procedural Biomes & Progression', () => {
  test('can switch between all biomes via window.__biome debug hook', async ({ page }) => {
    const errors = await boot(page);

    const biomes = ['flat', 'plains', 'forest', 'desert', 'snow', 'nether', 'end'];
    for (const b of biomes) {
      await page.evaluate((id) => window.__biome(id), b);
      await page.waitForTimeout(50);
    }

    expect(errors).toEqual([]);
  });
});
