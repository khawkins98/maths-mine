import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function testGolemAttackAnimation() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  await page.goto('http://localhost:5173/');

  // Wait for Hub cards to be rendered
  await page.waitForSelector('.hub-card', { timeout: 15000 });
  await page.waitForTimeout(500);

  const outDir = '/tmp/golem_attack_shots';
  fs.mkdirSync(outDir, { recursive: true });

  // Click Night Defence card
  await page.evaluate(() => {
    const card = document.querySelector('button.hub-card[data-game="night-defense"]') ||
                 [...document.querySelectorAll('.hub-card')].find(c => c.textContent.includes('Night'));
    if (card) card.click();
  });

  // Wait for combat scene and choices to appear
  await page.waitForSelector('button.choice', { timeout: 10000 });
  await page.waitForTimeout(400);

  // 1. Initial ready standoff
  await page.screenshot({ path: path.join(outDir, '1_golem_ready.png') });
  console.log('Saved 1_golem_ready.png');

  // 2. Click the CORRECT answer to trigger the Iron Golem Uppercut
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button.choice')];
    const eqText = document.querySelector('#askeq')?.textContent || '';
    const parts = eqText.match(/(\d+)\s*([×÷])\s*(\d+)/);
    if (parts) {
      const a = parseInt(parts[1]), b = parseInt(parts[3]), op = parts[2];
      const correct = op === '×' ? a * b : Math.round(a / b);
      const correctBtn = buttons.find(b => parseInt(b.textContent) === correct);
      if (correctBtn) correctBtn.click();
    } else {
      // Find answer if match failed
      buttons[buttons.length - 1].click();
    }
  });

  // 3. Capture Golem Uppercut swing (at ~350ms)
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(outDir, '2_golem_uppercut_swing.png') });
  console.log('Saved 2_golem_uppercut_swing.png');

  // 4. Capture Mob launched skyward (at ~650ms)
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(outDir, '3_mob_launch_skyward.png') });
  console.log('Saved 3_mob_launch_skyward.png');

  // 5. Next round ready
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(outDir, '4_round_settled.png') });
  console.log('Saved 4_round_settled.png');

  await browser.close();
  console.log('Iron Golem attack animation test completed successfully!');
}

testGolemAttackAnimation();
