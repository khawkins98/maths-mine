import { test, expect } from '@playwright/test';
import { boot, pick, state, waitForState, answer } from './helpers.js';

test.describe('continuous procedural terrain', () => {
  test('is deterministic and keeps the protected footprint plus buffer flat', async ({ page }) => {
    const errors = await boot(page);
    const combinations = [];
    for (const biome of ['flat', 'hills', 'forest', 'desert', 'snow', 'nether', 'end']) {
      await page.evaluate((id) => window.__biome(id), biome);
      for (const seed of [7, 123456, -90210]) {
        combinations.push(await page.evaluate((nextSeed) => {
          window.__terrainSetSeed(nextSeed);
          const terrain = window.__terrain();
          const signature = [];
          for (let z = -44; z <= 28; z += 8) for (let x = -32; x <= 32; x += 8) signature.push(terrain.sample(x, z));
          const generation = terrain.generation;
          window.__terrainSetSeed(nextSeed);
          return { biome: terrain.biome, seed: nextSeed, signature,
            generation, repeatedGeneration: window.__terrain().generation };
        }, seed));
      }
    }
    for (const entry of combinations) expect(entry.repeatedGeneration).toBe(entry.generation);
    const roundTrip = await page.evaluate(() => {
      window.__biome('flat'); window.__terrainSetSeed(7);
      const terrain = window.__terrain();
      const signature = [];
      for (let z = -44; z <= 28; z += 8) for (let x = -32; x <= 32; x += 8) signature.push(terrain.sample(x, z));
      return signature;
    });
    expect(roundTrip).toEqual(combinations[0].signature);
    const result = { state: await page.evaluate(() => window.__terrain()) };
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
        const e = t.bounds.envelope;
        const treesSafe = t.treeCells.every((p) => (
          p.x + p.radius < e.minX || p.x - p.radius > e.maxX
          || p.z + p.radius < e.minZ || p.z - p.radius > e.maxZ
        ));
        return { maxSlope, treesSafe, trees: t.treeCells, groveCount: t.groveCount, fluids: t.fluidCells };
      });
      expect(result.maxSlope, biome).toBeLessThanOrEqual(1);
      expect(result.treesSafe, biome).toBe(true);
      expect(result.groveCount, biome).toBeLessThanOrEqual(1);
      expect(result.fluids, biome).toEqual([]);
    }
    expect(errors).toEqual([]);
  });

  test('real corner taps survive multiplication rotation and division split', async ({ page }) => {
    const errors = await boot(page);
    await pick(page, 'block-builder', '__bb');
    await page.waitForFunction(() => window.__cellXY && window.__bb().phase === 'building');
    let round = await state(page, '__bb');
    for (const [c, r] of [[0, 0], [round.C - 1, round.R - 1]]) {
      const mapped = await page.evaluate(([cc, rr]) => window.__cellXY(cc, rr), [c, r]);
      expect(mapped.x).toBeGreaterThan(0); expect(mapped.x).toBeLessThan(await page.evaluate(() => innerWidth));
      expect(mapped.y).toBeGreaterThan(0); expect(mapped.y).toBeLessThan(await page.evaluate(() => innerHeight));
      await page.mouse.click(mapped.x, mapped.y);
    }
    expect((await state(page, '__bb')).placed).toBe(round.C * round.R === 1 ? 1 : 2);
    await page.evaluate(({ C, R }) => { for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) window.__place(c, r); }, round);
    await waitForState(page, '__bb', "s.phase === 'asking'");
    await answer(page, (await state(page, '__bb')).answer);
    await waitForState(page, '__bb', "s.phase === 'rotate' || s.phase === 'next'");
    if ((await state(page, '__bb')).phase === 'rotate') await page.locator('#btn-confirm').click();
    await waitForState(page, '__bb', "s.phase === 'next'");
    await page.evaluate(() => window.__nextMode('div'));
    await page.locator('#btn-confirm').click();
    await waitForState(page, '__bb', "s.phase === 'building' && s.op === 'div'");
    round = await state(page, '__bb');
    await page.evaluate(({ C, R }) => { for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) window.__place(c, r); }, round);
    await waitForState(page, '__bb', "s.phase === 'asking'");
    await answer(page, (await state(page, '__bb')).answer);
    await waitForState(page, '__bb', "s.phase === 'next'");
    expect((await state(page, '__bb')).divisionGap).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('has idempotent teardown', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__hub && window.__terrainDispose());
    const state = await page.evaluate(() => window.__terrain());
    expect(state.disposed).toBe(true);
    expect(state.columnCount).toBe(0);
    expect(state.meshCount).toBe(0);
  });

  test('keeps stages, actors, and array corners visible and on safe ground', async ({ page }) => {
    const errors = await boot(page);
    for (const { width, height } of [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize({ width, height });
      for (const [stage, biome] of [[0, 'flat'], [4, 'forest'], [8, 'nether']]) {
        await page.evaluate(({ nextStage, nextBiome }) => {
          const engine = window.__engine();
          engine.house.setStage(nextStage);
          window.__biome(nextBiome);
          engine.resize();
          engine.resetCamera();
          window.__bolt.resetPlacement();
        }, { nextStage: stage, nextBiome: biome });
        await page.waitForTimeout(80);
        const view = await page.evaluate(() => {
          const engine = window.__engine();
          const house = engine.projectBoundsToScreen(engine.house.group);
          const bolt = engine.projectBoundsToScreen(window.__bolt.group);
          return { house, bolt, terrain: window.__terrain() };
        });
        for (const [kind, bounds] of [['house', view.house], ['bolt', view.bolt]]) {
          expect(bounds.maxX, `${width}x${height} stage ${stage} ${kind}`).toBeGreaterThan(0);
          expect(bounds.minX, `${width}x${height} stage ${stage} ${kind}`).toBeLessThan(width);
          expect(bounds.maxY, `${width}x${height} stage ${stage} ${kind}`).toBeGreaterThan(0);
          expect(bounds.minY, `${width}x${height} stage ${stage} ${kind}`).toBeLessThan(height);
        }
      }
      await pick(page, 'block-builder', '__bb');
      const round = await state(page, '__bb');
      const corners = await page.evaluate(({ C, R }) => [window.__cellXY(0, 0), window.__cellXY(C - 1, R - 1)], round);
      for (const point of corners) {
        expect(point.x).toBeGreaterThan(0); expect(point.x).toBeLessThan(width);
        expect(point.y).toBeGreaterThan(0); expect(point.y).toBeLessThan(height);
      }
      await page.locator('#btn-back').click();
      await page.waitForFunction(() => window.__hub().open);
    }

    const actorCheck = await page.evaluate(async () => {
      const engine = window.__engine();
      engine.house.setStage(4);
      const terrain = window.__terrain();
      const position = (object) => {
        object.updateWorldMatrix(true, false);
        const e = object.matrixWorld.elements;
        return { x: e[12], y: e[13], z: e[14] };
      };
      const before = position(engine.scene.getObjectByName('iron-golem'));
      await new Promise((resolve) => setTimeout(resolve, 350));
      const after = position(engine.scene.getObjectByName('iron-golem'));
      const bolt = position(window.__bolt.group);
      const safe = (p) => terrain.sample(p.x, p.z) === 0 && terrain.fluidCells.length === 0
        && terrain.treeCells.every((tree) => Math.hypot(tree.x - p.x, tree.z - p.z) > tree.radius);
      return { before, after, bolt, beforeSafe: safe(before), afterSafe: safe(after), boltSafe: safe(bolt) };
    });
    expect(actorCheck.after.x).not.toBe(actorCheck.before.x);
    expect(actorCheck.before.y).toBeCloseTo(0); expect(actorCheck.after.y).toBeCloseTo(0);
    expect(actorCheck.beforeSafe && actorCheck.afterSafe && actorCheck.boltSafe).toBe(true);
    await pick(page, 'block-builder', '__bb');
    await page.waitForTimeout(150);
    await page.locator('#btn-back').click(); // tear the game down while the golem is mid-patrol
    await page.waitForFunction(() => window.__hub().open);
    expect(await page.evaluate(() => !!window.__engine().scene.getObjectByName('iron-golem'))).toBe(true);
    expect(errors).toEqual([]);
  });

  test('stabilizes renderer resources and grove ownership through 20 world/game cycles', async ({ page }) => {
    const errors = await boot(page);
    const cycle = async (index) => {
      await page.evaluate((i) => {
        const biomes = ['flat', 'hills', 'forest', 'desert', 'snow', 'nether', 'end'];
        window.__biome(biomes[i % biomes.length]);
        window.__terrainSetSeed(1000 + i);
        window.__pick('block-builder');
      }, index);
      await page.waitForFunction(() => typeof window.__bb === 'function');
      await page.locator('#btn-back').click();
      await page.waitForFunction(() => window.__hub().open);
      await page.waitForTimeout(30);
    };
    // Warm each scenery geometry once; stabilization means no growth after the
    // complete biome vocabulary has reached the renderer.
    for (let i = 0; i < 7; i++) await cycle(i);
    const baseline = await page.evaluate(() => window.__terrain());
    for (let i = 7; i < 17; i++) await cycle(i);
    const midpoint = await page.evaluate(() => window.__terrain());
    for (let i = 17; i < 27; i++) await cycle(i);
    const final = await page.evaluate(() => window.__terrain());
    expect(final.groveCount).toBeLessThanOrEqual(1);
    // Three.js lazily registers a few async character/house geometries during
    // the early cycles; the second ten must remain tightly bounded, not grow
    // in proportion to game entries or terrain regenerations.
    expect(final.rendererMemory.geometries).toBeLessThanOrEqual(midpoint.rendererMemory.geometries + 4);
    expect(final.rendererMemory.geometries).toBeLessThanOrEqual(baseline.rendererMemory.geometries + 14);
    expect(final.rendererMemory.textures).toBeLessThanOrEqual(baseline.rendererMemory.textures + 1);
    expect(errors).toEqual([]);
  });
});
