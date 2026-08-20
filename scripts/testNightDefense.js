import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function testNightDefense() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(1000);

  const outDir = '/tmp/night_defense_shots';
  fs.mkdirSync(outDir, { recursive: true });

  // 1. Wake gate
  const btnWake = page.locator('#btn-wake');
  if (await btnWake.isVisible()) {
    await btnWake.click();
    await page.waitForTimeout(1000);
  }

  // 2. Hub Screenshot
  await page.screenshot({ path: path.join(outDir, '1_hub_with_night_defense.png') });
  console.log('Saved 1_hub_with_night_defense.png');

  // 3. Click Night Defence card
  const nightCard = page.locator('button.hub-card[data-game="night-defense"]');
  await nightCard.click();

  // 4. Night Defence Gameplay Screenshot
  await page.waitForSelector('.choices button.choice', { timeout: 5000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, '2_night_defense_gameplay.png') });
  console.log('Saved 2_night_defense_gameplay.png');

  // 5. Answer the math question
  const choices = page.locator('.choices button.choice');
  const count = await choices.count();
  console.log('Found choices:', count);

  if (count > 0) {
    // Tap first choice
    await choices.first().click();
    await page.waitForTimeout(380);

    // 6. Mid-Combat / Golem Uppercut Action Shot
    await page.screenshot({ path: path.join(outDir, '3_combat_action.png') });
    console.log('Saved 3_combat_action.png');

    // Wait for round to complete
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(outDir, '4_round_settled.png') });
    console.log('Saved 4_round_settled.png');
  }

  await browser.close();
  console.log('Night Defence test complete!');
}

testNightDefense();
