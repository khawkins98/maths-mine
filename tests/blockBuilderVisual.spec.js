import { test, expect } from '@playwright/test';
import { boot, pick, state, answer, waitForState } from './helpers.js';

async function openRound(page, C, R, biome) {
  await page.evaluate((id) => window.__biome(id), biome);
  await pick(page, 'block-builder', '__bb');
  return page.evaluate(([cols, rows]) => window.__bbForceRound(cols, rows, 'mul'), [C, R]);
}

test.describe('Block Builder target and material clarity', () => {
  test('target cells keep a two-tone silhouette across every biome', async ({ page }) => {
    await boot(page);
    await pick(page, 'block-builder', '__bb');
    for (const biome of ['flat', 'hills', 'forest', 'desert', 'snow', 'nether', 'end']) {
      await page.evaluate((id) => window.__biome(id), biome);
      const visual = (await state(page, '__bb')).targetStyle;
      expect(visual.frameColor, biome).toBe('17130d');
      expect(visual.fillColor, biome).toBe('fff0b5');
      expect(visual.frameOpacity, biome).toBeGreaterThanOrEqual(0.8);
      expect(visual.fillOpacity, biome).toBeGreaterThanOrEqual(0.3);
      expect(visual.fillOpacity, biome).toBeLessThan(0.7);
    }
  });

  test('oak blocks render bark sides and end grain distinct from dirt', async ({ page }) => {
    await boot(page);
    await openRound(page, 2, 2, 'flat');
    await page.evaluate(() => window.__place(0, 0));
    const wood = (await state(page, '__bb')).materialIdentity;
    expect(wood).toMatchObject({ blueprintMaterialKey: 'logTex', blueprintCapKey: 'logTopTex' });
    expect(wood.renderedBodyMap).toBe(wood.expectedBodyMap);
    expect(wood.renderedCapMap).toBe(wood.expectedCapMap);
    expect(wood.renderedBodyMap).not.toBe(wood.dirtMap);
    expect(wood.renderedCapMap).not.toBe(wood.dirtMap);
    expect(wood.renderedBodyMap).not.toBe(wood.renderedCapMap);

    await page.evaluate(() => window.__bbForceRound(8, 3, 'mul'));
    await page.evaluate(() => window.__place(0, 0));
    const dirt = (await state(page, '__bb')).materialIdentity;
    expect(dirt.blueprintMaterialKey).toBe('dirtTex');
    expect(dirt.renderedBodyMap).toBe(dirt.dirtMap);
    expect(dirt.renderedBodyMap).not.toBe(wood.renderedBodyMap);
  });

  test('reduced motion uses a static restrained guided-cell highlight', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await boot(page);
    await openRound(page, 2, 2, 'flat');
    await page.waitForFunction(() => window.__bb().targetStyle.fillOpacity === 0.52);
    const samples = [];
    for (let i = 0; i < 4; i++) {
      samples.push((await state(page, '__bb')).targetStyle.fillOpacity);
      await page.waitForTimeout(120);
    }
    expect(samples).toEqual([0.52, 0.52, 0.52, 0.52]);
  });

  test('wood maps survive multiplication rotation and division separation', async ({ page }) => {
    await boot(page);
    await openRound(page, 2, 2, 'flat');
    const finishWoodRound = async () => {
      await page.evaluate(() => { for (let c = 0; c < 2; c++) for (let r = 0; r < 2; r++) window.__place(c, r); });
      await waitForState(page, '__bb', "s.phase === 'asking'");
      await answer(page, (await state(page, '__bb')).answer);
    };

    await finishWoodRound();
    await waitForState(page, '__bb', "s.phase === 'rotate'");
    await page.locator('#btn-confirm').click();
    await waitForState(page, '__bb', "s.phase === 'next'");
    let identity = (await state(page, '__bb')).materialIdentity;
    expect(identity.renderedBodyMaps).toEqual(Array(4).fill(identity.expectedBodyMap));
    expect(identity.renderedCapMaps.every((map) => [identity.expectedBodyMap, identity.expectedCapMap].includes(map))).toBe(true);
    expect(identity.renderedCapMaps.filter((map) => map === identity.expectedCapMap)).toHaveLength(2);

    await page.evaluate(() => window.__bbForceRound(2, 2, 'div'));
    await finishWoodRound();
    await waitForState(page, '__bb', "s.phase === 'next'");
    identity = (await state(page, '__bb')).materialIdentity;
    expect(identity.renderedBodyMaps).toEqual(Array(4).fill(identity.expectedBodyMap));
    expect(identity.renderedCapMaps).toEqual(Array(4).fill(identity.expectedCapMap));
  });

  test('per-round block geometry has exactly-once ownership through empty switches and teardown', async ({ page }) => {
    await boot(page);
    await openRound(page, 2, 2, 'flat');
    const inspect = await page.evaluateHandle(() => window.__bb);
    for (const [C, R] of [[3, 3], [8, 3], [4, 5], [2, 2]]) {
      const lifecycle = await page.evaluate(([cols, rows]) => {
        window.__bbForceRound(cols, rows, 'mul');
        return window.__bb().roundKitLifecycle;
      }, [C, R]);
      expect(lifecycle.disposed).toBe(lifecycle.created - 1);
    }

    await page.evaluate(() => window.__pick('spot-the-wrongun'));
    const afterTeardown = await inspect.evaluate((getState) => getState().roundKitLifecycle);
    expect(afterTeardown.disposed).toBe(afterTeardown.created);
  });

  for (const sample of [
    { name: 'desktop-flat', width: 1440, height: 900, biome: 'flat' },
    { name: 'phone-nether', width: 390, height: 844, biome: 'nether' },
  ]) {
    test(`${sample.name} target remains visible beside a placed wood block`, async ({ page }) => {
      await page.setViewportSize({ width: sample.width, height: sample.height });
      // Static reduced-motion guidance makes image pixels independent of rAF
      // pulse phase while retaining the same high-contrast visual contract.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      // Texture flecks are intentionally organic in production; seed them in
      // this visual contract so only the target/material treatment can move it.
      await page.addInitScript(() => {
        let seed = 0x4d494e45;
        Math.random = () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          return seed / 0x100000000;
        };
      });
      await boot(page);
      await openRound(page, 2, 2, sample.biome);
      await page.evaluate(() => window.__place(0, 0));
      await page.waitForTimeout(400);

      // Real canvas coordinates and a pointer click retain the existing picking
      // contract; the image snapshot protects the target/wood visual treatment.
      const point = await page.evaluate(() => window.__cellXY(1, 1));
      await page.mouse.click(point.x, point.y);
      expect((await state(page, '__bb')).placed).toBe(2);
      const clip = await page.evaluate(() => {
        const points = [window.__cellXY(0, 0), window.__cellXY(0, 1), window.__cellXY(1, 0), window.__cellXY(1, 1)];
        const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
        const pad = Math.max(12, Math.abs(points[0].x - points[3].x) * 0.45);
        const x = Math.max(0, Math.min(...xs) - pad);
        const y = Math.max(0, Math.min(...ys) - pad);
        return {
          x, y,
          width: Math.min(innerWidth - x, Math.max(...xs) - x + pad),
          height: Math.min(innerHeight - y, Math.max(...ys) - y + pad),
        };
      });
      await expect(page).toHaveScreenshot(`block-builder-${sample.name}.png`, {
        animations: 'disabled',
        clip,
        maxDiffPixelRatio: 0.025,
      });
    });
  }
});
