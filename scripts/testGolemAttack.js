import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function testGolemAttack() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:5173/models.html');
  await page.waitForTimeout(1000);

  const outDir = '/tmp/golem_test';
  fs.mkdirSync(outDir, { recursive: true });

  await page.click('button[data-model="golem"]');
  await page.waitForTimeout(400);

  // 1. Rest shot
  await page.screenshot({ path: path.join(outDir, '1_rest.png') });
  console.log('Saved 1_rest.png');

  // Trigger attack
  await page.click('#btn-attack');

  // 2. Windup shot (~120ms)
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(outDir, '2_windup.png') });
  console.log('Saved 2_windup.png');

  // 3. Peak uppercut shot (~350ms more)
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(outDir, '3_peak.png') });
  console.log('Saved 3_peak.png');

  // 4. Completed attack shot (~650ms more)
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(outDir, '4_after_complete.png') });
  console.log('Saved 4_after_complete.png');

  await browser.close();
  console.log('Golem attack test completed!');
}

testGolemAttack();
