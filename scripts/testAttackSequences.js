import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function testAttacks() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:5173/models.html');
  await page.waitForTimeout(1000);

  const outDir = '/tmp/model_attacks';
  fs.mkdirSync(outDir, { recursive: true });

  const models = ['golem', 'creeper', 'zombie', 'enderman', 'ghast', 'steve', 'villager'];

  for (const m of models) {
    await page.click(`button[data-model="${m}"]`);
    await page.waitForTimeout(400);

    // Trigger attack sequence via button
    await page.click('#btn-attack');
    // Capture mid-attack pose (around 300-400ms into the attack)
    await page.waitForTimeout(350);

    const shotPath = path.join(outDir, `${m}_attack.png`);
    await page.screenshot({ path: shotPath });
    console.log('Saved attack shot:', shotPath);

    // Wait for attack sequence to complete
    await page.waitForTimeout(1200);
  }

  await browser.close();
  console.log('All attack sequence screenshots captured successfully!');
}

testAttacks();
