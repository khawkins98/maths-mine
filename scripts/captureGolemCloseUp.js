import { chromium } from 'playwright';
import path from 'path';

async function captureGolemCloseUp() {
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
  await page.waitForTimeout(1200);

  const outDir = '/tmp/golem_head_steve_fix';
  await page.screenshot({ path: path.join(outDir, '4_golem_front_view.png') });

  await browser.close();
  console.log('Close-up captured!');
}

captureGolemCloseUp();
