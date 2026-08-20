import { test, expect } from '@playwright/test';
import { boot, pick } from './helpers.js';

async function seedVillage(page, stage, bolts = 0) {
  await page.addInitScript(({ savedStage, savedBolts }) => {
    localStorage.setItem('house_stage.v1', JSON.stringify({ stage: savedStage }));
    localStorage.setItem('bolts.v1', JSON.stringify({ bolts: savedBolts }));
  }, { savedStage: stage, savedBolts: bolts });
}

async function openDashboard(page) {
  const title = page.locator('#hub h1');
  const box = await title.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1900);
  await page.mouse.up();
  await expect(page.locator('#parent-dash')).toBeVisible();
}

const nightCard = (page) => page.locator('.hub-card[data-game="night-defense"]');

test.describe('Night Defence village unlock', () => {
  test('a fresh village shows all games but keeps Night Defence locked', async ({ page }) => {
    const errors = await boot(page);
    await expect(page.locator('.hub-card')).toHaveCount(3);
    await expect(nightCard(page)).toHaveClass(/locked/);
    await expect(nightCard(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(nightCard(page)).toHaveAttribute('aria-label', /Village stage 0 of 4/);
    await expect(nightCard(page).locator('.hc-desc')).toContainText('Stage 0 of 4');

    // A DOM click bypasses Playwright's aria-disabled actionability check and
    // proves there truly is no production handler behind the locked surface.
    await nightCard(page).evaluate((card) => card.click());
    await expect(page.locator('#hub')).toBeVisible();
    expect(await page.evaluate(() => typeof window.__night)).toBe('undefined');

    // The two foundational games remain ordinary production choices.
    await page.locator('.hub-card[data-game="block-builder"]').click();
    await page.waitForFunction(() => typeof window.__bb === 'function');
    await page.locator('#btn-back').click();
    await page.locator('.hub-card[data-game="spot-the-wrongun"]').click();
    await page.waitForFunction(() => typeof window.__stw === 'function');
    expect(errors).toEqual([]);
  });

  for (const stage of [1, 2, 3]) {
    test(`village stage ${stage} stays locked with truthful progress`, async ({ page }) => {
      await seedVillage(page, stage);
      await boot(page);
      await expect(nightCard(page)).toHaveAttribute('aria-disabled', 'true');
      await expect(nightCard(page).locator('.hc-desc')).toContainText(`Stage ${stage} of 4`);
    });
  }

  test('building the stage-4 Iron Golem unlocks Night Defence immediately', async ({ page }) => {
    await seedVillage(page, 3, 20);
    const errors = await boot(page);
    await expect(nightCard(page)).toHaveClass(/locked/);

    await page.locator('#btn-build-house').click();
    await expect(nightCard(page)).not.toHaveClass(/locked/);
    await expect(nightCard(page)).not.toHaveAttribute('aria-disabled', 'true');
    expect(await page.evaluate(() => window.__engine().house.getStage())).toBe(4);

    await nightCard(page).click();
    await page.waitForFunction(() => typeof window.__night === 'function');
    expect(errors).toEqual([]);
  });

  test('a saved stage-4 village stays unlocked after reload', async ({ page }) => {
    await seedVillage(page, 4);
    await boot(page);
    await expect(nightCard(page)).not.toHaveClass(/locked/);
    await page.reload();
    await expect(page.locator('#hub')).toBeVisible();
    await expect(nightCard(page)).not.toHaveClass(/locked/);
  });

  test('erasing all progress resets the village and relocks Night Defence', async ({ page }) => {
    await seedVillage(page, 4, 30);
    await boot(page);
    await expect(nightCard(page)).not.toHaveClass(/locked/);

    await openDashboard(page);
    await page.locator('#pd-reset').click();
    await expect(page.locator('.pd-danger')).toContainText('village upgrade');
    await page.locator('#pd-reset-yes').click();
    await page.locator('#pd-close').click();

    await expect(nightCard(page)).toHaveClass(/locked/);
    await expect(nightCard(page).locator('.hc-desc')).toContainText('Stage 0 of 4');
    expect(await page.evaluate(() => window.__engine().house.getStage())).toBe(0);
  });

  test('the debug launcher still reaches locked Night Defence for isolated tests', async ({ page }) => {
    await boot(page);
    await pick(page, 'night-defense', '__night');
    await expect(page.locator('#hub')).toBeHidden();
  });
});
