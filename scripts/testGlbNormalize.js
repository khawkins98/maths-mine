// scripts/testGlbNormalize.js
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:5173/models.html');
  await page.waitForTimeout(1500);

  const outDir = '/tmp/model_shots_v2';
  fs.mkdirSync(outDir, { recursive: true });

  const models = ['golem', 'villager', 'zombie', 'creeper', 'ghast', 'enderman', 'steve'];

  for (const m of models) {
    await page.click(`button[data-model="${m}"]`);
    await page.waitForTimeout(600);

    const shotPath = path.join(outDir, `${m}.png`);
    await page.screenshot({ path: shotPath });
    console.log('Saved', shotPath);
  }

  await browser.close();
}

run();
