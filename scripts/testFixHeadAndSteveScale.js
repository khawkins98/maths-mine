import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function testFixHeadAndSteveScale() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(1000);

  const outDir = '/tmp/golem_head_steve_fix';
  fs.mkdirSync(outDir, { recursive: true });

  const btnWake = page.locator('#btn-wake');
  if (await btnWake.isVisible()) {
    await btnWake.click();
    await page.waitForTimeout(1000);
  }

  // 1. Hub menu screenshot (showing Steve scaled naturally in world)
  await page.screenshot({ path: path.join(outDir, '1_hub_natural_steve.png') });
  console.log('Saved 1_hub_natural_steve.png');

  // 2. Open Reference Tray to see layout with Steve in background
  const tabBtn = page.locator('#ref-tray-tab');
  if (await tabBtn.isVisible()) {
    await tabBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, '2_hub_with_ref_tray.png') });
    console.log('Saved 2_hub_with_ref_tray.png');
    // Close tray
    await page.locator('#ref-tray-close').click();
    await page.waitForTimeout(400);
  }

  // 3. Launch Night Defence
  console.log('Launching Night Defence...');
  const card = page.locator('button.hub-card[data-game="night-defense"]');
  await card.click();
  await page.waitForTimeout(1500);

  // 4. Standoff screenshot (showing Iron Golem forward head & Steve on sidelines)
  await page.screenshot({ path: path.join(outDir, '3_night_defense_fixed.png') });
  console.log('Saved 3_night_defense_fixed.png');

  await browser.close();
  console.log('All tests completed successfully!');
}

testFixHeadAndSteveScale();
