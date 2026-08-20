import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function testUppercut() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(1000);

  const outDir = '/tmp/night_defense_shots';
  fs.mkdirSync(outDir, { recursive: true });

  const btnWake = page.locator('#btn-wake');
  if (await btnWake.isVisible()) {
    await btnWake.click();
    await page.waitForTimeout(1000);
  }

  // Click Night Defence card
  const nightCard = page.locator('button.hub-card[data-game="night-defense"]');
  await nightCard.click();

  await page.waitForSelector('.choices button.choice', { timeout: 5000 });
  await page.waitForTimeout(400);

  // Read equation text from #askeq to find correct answer
  const eqText = await page.locator('#askeq').textContent();
  console.log('Active equation:', eqText);

  // Parse target answer (e.g. "18 ÷ 2 = ?" -> 9, or "6 × 7 = ?" -> 42)
  let target = 0;
  if (eqText.includes('÷')) {
    const parts = eqText.split('÷');
    const a = parseInt(parts[0].trim(), 10);
    const b = parseInt(parts[1].split('=')[0].trim(), 10);
    target = a / b;
  } else if (eqText.includes('×')) {
    const parts = eqText.split('×');
    const a = parseInt(parts[0].trim(), 10);
    const b = parseInt(parts[1].split('=')[0].trim(), 10);
    target = a * b;
  }

  console.log('Target answer is:', target);

  // Click correct choice
  const correctChoice = page.locator(`.choices button.choice:has-text("${target}")`);
  await correctChoice.click();

  // Wait 400ms to capture mid-air uppercut & particle explosion!
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, '5_golem_uppercut_launch.png') });
  console.log('Saved 5_golem_uppercut_launch.png');

  await browser.close();
  console.log('Uppercut test complete!');
}

testUppercut();
