import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function testReferenceTray() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(1000);

  const outDir = '/tmp/ref_tray_shots';
  fs.mkdirSync(outDir, { recursive: true });

  const btnWake = page.locator('#btn-wake');
  if (await btnWake.isVisible()) {
    await btnWake.click();
    await page.waitForTimeout(1000);
  }

  // 1. Tab exists on Hub
  const tab = page.locator('#btn-ref-tab');
  await tab.waitFor({ state: 'visible' });
  console.log('Found Reference Tray tab');

  // 2. Open Reference Tray
  await tab.click();
  await page.waitForSelector('#ref-tray:not(.hidden)', { timeout: 3000 });
  await page.waitForTimeout(300);

  // 3. Screenshot: Table 2 (default)
  await page.screenshot({ path: path.join(outDir, '1_ref_tray_open_2x.png') });
  console.log('Saved 1_ref_tray_open_2x.png');

  // 4. Switch to Table 7 via rail
  const rail7 = page.locator('.ref-rail-btn[data-table="7"]');
  await rail7.click();
  await page.waitForTimeout(300);

  // 5. Screenshot: Table 7
  await page.screenshot({ path: path.join(outDir, '2_ref_tray_7x.png') });
  console.log('Saved 2_ref_tray_7x.png');

  // 6. Switch to Table 12 via rail
  const rail12 = page.locator('.ref-rail-btn[data-table="12"]');
  await rail12.click();
  await page.waitForTimeout(300);

  // 7. Screenshot: Table 12
  await page.screenshot({ path: path.join(outDir, '3_ref_tray_12x.png') });
  console.log('Saved 3_ref_tray_12x.png');

  // 8. Close tray via close button
  const btnClose = page.locator('#btn-ref-close');
  await btnClose.click();
  await page.waitForSelector('#ref-tray', { state: 'hidden' });
  console.log('Closed Reference Tray');

  // 9. Enter Night Defence and verify tab is also accessible in-game
  const nightCard = page.locator('button.hub-card[data-game="night-defense"]');
  await nightCard.click();
  await page.waitForTimeout(1500);

  await tab.click();
  await page.waitForSelector('#ref-tray:not(.hidden)', { timeout: 3000 });
  await page.waitForTimeout(300);

  await page.screenshot({ path: path.join(outDir, '4_ref_tray_in_game.png') });
  console.log('Saved 4_ref_tray_in_game.png');

  await browser.close();
  console.log('All Reference Tray tests completed successfully!');
}

testReferenceTray();
