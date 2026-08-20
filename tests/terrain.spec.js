import { test, expect } from '@playwright/test';
import { boot, pick } from './helpers.js';

test.describe('continuous procedural terrain', () => {
  test('is deterministic and keeps the protected footprint plus buffer flat', async ({ page }) => {
    const errors = await boot(page);
    const result = await page.evaluate(() => {
      const terrain = window.__terrain();
      const sampleMap = () => {
        const values = [];
        for (let z = -46; z <= 46; z += 2) {
          for (let x = -46; x <= 46; x += 2) values.push(terrain.sample(x, z));
        }
        return values;
      };
      const first = sampleMap();
      window.__terrainSetSeed(123456);
      const seededA = sampleMap();
      const seededGeneration = window.__terrain().generation;
      window.__terrainSetSeed(123456);
      const sameSeedGeneration = window.__terrain().generation;
      const seededB = sampleMap();
      return { first, seededA, seededB, seededGeneration, sameSeedGeneration, state: window.__terrain() };
    });
    expect(result.seededA).toEqual(result.seededB);
    expect(result.seededA).not.toEqual(result.first);
    expect(result.sameSeedGeneration).toBe(result.seededGeneration);
    expect(result.state.groundName).toBe('terrain-surface');
    // 2-unit cells meet face-to-face; the asymmetric rear-heavy field spends
    // its bounded instance budget where the camera can actually see it.
    expect(result.state.dimensions).toEqual({ cell: 2, columnsX: 35, columnsZ: 39 });
    expect(result.state.coverage).toEqual({ minX: -35, maxX: 35, minZ: -47, maxZ: 31 });

    const { sample, bounds } = await page.evaluate(() => {
      const t = window.__terrain();
      const points = [];
      for (let z = t.bounds.envelope.minZ; z <= t.bounds.envelope.maxZ; z += 2) {
        for (let x = t.bounds.envelope.minX; x <= t.bounds.envelope.maxX; x += 2) points.push(t.sample(x, z));
      }
      return { sample: points, bounds: t.bounds };
    });
    expect(bounds.protected).toEqual({ minX: -12, maxX: 8, minZ: -8, maxZ: 6 });
    expect(sample.every((height) => height === 0)).toBe(true);
    const rayHits = await page.evaluate(() => {
      const values = [];
      for (let z = -10; z <= 8; z += 1) {
        for (let x = -14; x <= 10; x += 1) values.push(window.__terrainGroundHit(x, z));
      }
      return values;
    });
    expect(rayHits.every((height) => Math.abs(height) < 1e-6)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('limits slopes and keeps decorations and fluids outside the envelope', async ({ page }) => {
    const errors = await boot(page);
    for (const biome of ['flat', 'hills', 'forest', 'desert', 'snow', 'nether', 'end']) {
      await page.evaluate((id) => window.__biome(id), biome);
      const result = await page.evaluate(() => {
        const t = window.__terrain();
        let maxSlope = 0;
        for (let z = -44; z <= 44; z += 2) {
          for (let x = -44; x <= 44; x += 2) {
            maxSlope = Math.max(maxSlope,
              Math.abs(t.sample(x, z) - t.sample(x + 2, z)),
              Math.abs(t.sample(x, z) - t.sample(x, z + 2)));
          }
        }
        return { maxSlope, treesSafe: t.treeCells.every((p) => t.decorationAllowed(p.x, p.z)), fluids: t.fluidCells };
      });
      expect(result.maxSlope, biome).toBeLessThanOrEqual(1);
      expect(result.treesSafe, biome).toBe(true);
      expect(result.fluids, biome).toEqual([]);
    }
    expect(errors).toEqual([]);
  });

  test('preserves Block Builder cell picking and has idempotent teardown', async ({ page }) => {
    const errors = await boot(page);
    await pick(page, 'block-builder', '__bb');
    await page.waitForFunction(() => window.__cellXY && window.__bb().phase === 'building');
    const mapped = await page.evaluate(() => window.__cellXY(0, 0));
    expect(mapped).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
    await page.evaluate(() => window.__hub && window.__terrainDispose());
    const state = await page.evaluate(() => window.__terrain());
    expect(state.disposed).toBe(true);
    expect(state.columnCount).toBe(0);
    expect(state.meshCount).toBe(0);
    expect(errors).toEqual([]);
  });
});
