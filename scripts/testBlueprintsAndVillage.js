import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function testBlueprintsAndVillage() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(1000);

  const outDir = '/tmp/village_blueprint_shots';
  fs.mkdirSync(outDir, { recursive: true });

  const btnWake = page.locator('#btn-wake');
  if (await btnWake.isVisible()) {
    await btnWake.click();
    await page.waitForTimeout(1000);
  }

  // ── TEST 1: Village Expansion (Stages 4 through 8) ──
  console.log('Testing Village Expansion...');
  await page.evaluate(() => {
    // Add plenty of bolts and upgrade village to Stage 8
    const wallet = window.__bolt ? window.__referenceTray : null; // wallet is internal
    localStorage.setItem('bolts.v1', JSON.stringify({ bolts: 9999 }));
    localStorage.setItem('house_stage.v1', JSON.stringify({ stage: 4 }));
    location.reload();
  });
  await page.waitForTimeout(1500);

  const btnWake2 = page.locator('#btn-wake');
  if (await btnWake2.isVisible()) {
    await btnWake2.click();
    await page.waitForTimeout(1000);
  }

  // Screenshot Stage 4 (Iron Golem)
  await page.screenshot({ path: path.join(outDir, '1_village_stage4_golem.png') });
  console.log('Saved 1_village_stage4_golem.png');

  // Set Stage 6 (Windmill & Farmland)
  await page.evaluate(() => {
    localStorage.setItem('house_stage.v1', JSON.stringify({ stage: 6 }));
    location.reload();
  });
  await page.waitForTimeout(1500);
  if (await page.locator('#btn-wake').isVisible()) {
    await page.locator('#btn-wake').click();
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: path.join(outDir, '2_village_stage6_farm_windmill.png') });
  console.log('Saved 2_village_stage6_farm_windmill.png');

  // Set Stage 8 (Nether Portal, Beacon, Wolf, Forge, Windmill)
  await page.evaluate(() => {
    localStorage.setItem('house_stage.v1', JSON.stringify({ stage: 8 }));
    location.reload();
  });
  await page.waitForTimeout(1500);
  if (await page.locator('#btn-wake').isVisible()) {
    await page.locator('#btn-wake').click();
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: path.join(outDir, '3_village_stage8_complete.png') });
  console.log('Saved 3_village_stage8_complete.png');

  // ── TEST 2: Block Builder Blueprint Mode ──
  console.log('Testing Block Builder Blueprint Mode...');
  const blockCard = page.locator('button.hub-card[data-game="block-builder"]');
  await blockCard.click();
  await page.waitForTimeout(1200);

  // Screenshot Blueprint prompt
  await page.screenshot({ path: path.join(outDir, '4_blueprint_start.png') });
  console.log('Saved 4_blueprint_start.png');

  // Click cells on canvas to fill the wall
  const canvas = page.locator('#app canvas');
  const box = await canvas.boundingBox();
  if (box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    // Click across grid area to place blueprint blocks
    for (let dx = -150; dx <= 150; dx += 35) {
      for (let dy = -80; dy <= 80; dy += 35) {
        await page.mouse.click(cx + dx, cy + dy);
        await page.waitForTimeout(40);
      }
    }
  }

  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(outDir, '5_blueprint_blocks_placed.png') });
  console.log('Saved 5_blueprint_blocks_placed.png');

  await browser.close();
  console.log('All Blueprint & Village tests completed successfully!');
}

testBlueprintsAndVillage();
