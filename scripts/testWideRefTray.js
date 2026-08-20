import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function testWideReferenceTray() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(1000);

  const outDir = '/tmp/ref_tray_wide_shots';
  fs.mkdirSync(outDir, { recursive: true });

  const btnWake = page.locator('#btn-wake');
  if (await btnWake.isVisible()) {
    await btnWake.click();
    await page.waitForTimeout(1000);
  }

  // Open Reference Tray
  const tab = page.locator('#btn-ref-tab');
  await tab.click();
  await page.waitForSelector('#ref-tray.open', { timeout: 3000 });
  await page.waitForTimeout(400);

  // Switch to Table 9 (User's screenshot test case)
  const rail9 = page.locator('.ref-rail-btn[data-table="9"]');
  await rail9.click();
  await page.waitForTimeout(300);

  await page.screenshot({ path: path.join(outDir, '1_ref_tray_9x_wide.png') });
  console.log('Saved 1_ref_tray_9x_wide.png');

  // Switch to Table 3
  const rail3 = page.locator('.ref-rail-btn[data-table="3"]');
  await rail3.click();
  await page.waitForTimeout(300);

  await page.screenshot({ path: path.join(outDir, '2_ref_tray_3x_wide.png') });
  console.log('Saved 2_ref_tray_3x_wide.png');

  // Switch to Table 12
  const rail12 = page.locator('.ref-rail-btn[data-table="12"]');
  await rail12.click();
  await page.waitForTimeout(300);

  // Switch to Table 11 (User's screenshot test case)
  const rail11 = page.locator('.ref-rail-btn[data-table="11"]');
  await rail11.click();
  await page.waitForTimeout(300);

  await page.screenshot({ path: path.join(outDir, '4_ref_tray_11x_grid.png') });
  console.log('Saved 4_ref_tray_11x_grid.png');

  await browser.close();
  console.log('Wide Reference Tray tests completed successfully!');
}

testWideReferenceTray();
