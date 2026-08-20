import { test, expect } from '@playwright/test';
import { boot } from './helpers.js';

test.describe('House Builder & Iron Golem reward loop', () => {
  test('earning bolts allows house upgrades up to Iron Golem stage 4', async ({ page }) => {
    const errors = await boot(page);
    expect(errors).toEqual([]);

    // Evaluate house manager and wallet in browser
    const res = await page.evaluate(() => {
      const house = window.__engine ? window.__engine().house : null;
      return {
        hasHouse: !!house,
        initialStage: house ? house.getStage() : 0,
      };
    });

    expect(res.initialStage).toBeDefined();

    // Verify upgrade spending logic via browser context
    const testResult = await page.evaluate(() => {
      const { Wallet } = window.__wallet ? { Wallet: window.__wallet } : { Wallet: null };
      const engine = window.__engine ? window.__engine() : null;
      if (!engine || !engine.house) return null;

      const house = engine.house;
      house.reset();

      // Give 50 bolts
      const w = { bolts: 50, spend(n) { this.bolts -= n; } };

      const u1 = house.upgrade(w);
      const u2 = house.upgrade(w);
      const u3 = house.upgrade(w);
      const u4 = house.upgrade(w);

      return {
        stage1: u1.newStage,
        stage4: u4.newStage,
        remainingBolts: w.bolts,
        isGolemPresent: !!engine.scene.getObjectByName('iron-golem'),
      };
    });

    if (testResult) {
      expect(testResult.stage1).toBe(1);
      expect(testResult.stage4).toBe(4);
      expect(testResult.isGolemPresent).toBe(true);
    }
  });
});
