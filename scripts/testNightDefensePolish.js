import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function testNightDefensePolish() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(1000);

  const outDir = '/tmp/night_defense_polish';
  fs.mkdirSync(outDir, { recursive: true });

  const btnWake = page.locator('#btn-wake');
  if (await btnWake.isVisible()) {
    await btnWake.click();
    await page.waitForTimeout(1000);
  }

  // Launch Night Defence
  console.log('Launching Night Defence...');
  const card = page.locator('button.hub-card[data-game="night-defense"]');
  await card.click();
  await page.waitForTimeout(1500);

  // 1. Ready stance screenshot (Golem, Creeper, and Steve on sidelines)
  await page.screenshot({ path: path.join(outDir, '1_ready_standoff.png') });
  console.log('Saved 1_ready_standoff.png');

  // 2. Click intentional wrong choice to trigger Golem damage flash
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button.choice')];
    // Find a button with wrong value
    const eqText = document.querySelector('#ask-eq')?.textContent || '';
    const parts = eqText.match(/(\d+)\s*([×÷])\s*(\d+)/);
    if (parts) {
      const a = parseInt(parts[1]), b = parseInt(parts[3]), op = parts[2];
      const correct = op === '×' ? a * b : a / b;
      const wrongBtn = buttons.find(b => parseInt(b.textContent) !== correct);
      if (wrongBtn) wrongBtn.click();
    } else {
      buttons[0].click();
    }
  });

  await page.waitForTimeout(360); // Capture during red damage flash moment
  await page.screenshot({ path: path.join(outDir, '2_golem_damage_flash.png') });
  console.log('Saved 2_golem_damage_flash.png');

  await page.waitForTimeout(1200);

  // 3. Click correct choice to trigger Golem uppercut victory
  const correctChoice = page.locator('button.choice').nth(1);
  await correctChoice.click();
  await page.waitForTimeout(380); // Capture launch moment
  await page.screenshot({ path: path.join(outDir, '3_golem_uppercut_launch.png') });
  console.log('Saved 3_golem_uppercut_launch.png');

  await browser.close();
  console.log('Night Defence polish test complete!');
}

testNightDefensePolish();
