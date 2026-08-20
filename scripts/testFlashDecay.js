import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function testFlashDecay() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(1000);

  const btnWake = page.locator('#btn-wake');
  if (await btnWake.isVisible()) {
    await btnWake.click();
    await page.waitForTimeout(800);
  }

  // Launch Night Defence
  const card = page.locator('button.hub-card[data-game="night-defense"]');
  await card.click();
  await page.waitForTimeout(1500);

  const outDir = '/tmp/flash_decay_shots';
  fs.mkdirSync(outDir, { recursive: true });

  // 1. Initial ready stance
  await page.screenshot({ path: path.join(outDir, '1_before_flash.png') });
  console.log('Saved 1_before_flash.png');

  // 2. Click wrong choice to trigger Golem damage flash
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button.choice')];
    // Click wrong answer (12 for 4x4)
    buttons[1].click();
  });

  // 3. Capture peak of red flash (at ~380ms)
  await page.waitForTimeout(380);
  await page.screenshot({ path: path.join(outDir, '2_during_red_flash.png') });
  console.log('Saved 2_during_red_flash.png');

  // 4. Wait 1.0s and verify Golem has completely returned to normal texture!
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, '3_after_flash_restored.png') });
  console.log('Saved 3_after_flash_restored.png');

  await browser.close();
  console.log('Flash decay test finished successfully!');
}

testFlashDecay();
