import { test, expect } from '@playwright/test';
import { boot, pick, state, waitForState, answer } from './helpers.js';

test.describe('continuous procedural terrain', () => {
  test('is deterministic and keeps the protected footprint plus buffer flat', async ({ page }) => {
    const errors = await boot(page);
    const initialDefault = await page.evaluate(() => {
      const terrain = window.__terrain();
      const signature = [];
      for (let z = -44; z <= 28; z += 8) for (let x = -32; x <= 32; x += 8) signature.push(terrain.sample(x, z));
      return { seed: terrain.seed, biome: terrain.biome, signature };
    });
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
    expect(result.state.seedPersistence).toBe('ephemeral-debug; reload resets the default seed');
    await page.evaluate(() => window.__terrainSetSeed(7654321));
    expect((await page.evaluate(() => window.__terrain().seed))).toBe(7654321);
    await page.reload();
    await page.waitForFunction(() => window.__terrain && window.__terrain().columnCount > 0);
    const reloaded = await page.evaluate(() => {
      const terrain = window.__terrain();
      const signature = [];
      for (let z = -44; z <= 28; z += 8) for (let x = -32; x <= 32; x += 8) signature.push(terrain.sample(x, z));
      return { seed: terrain.seed, biome: terrain.biome, signature };
    });
    expect(reloaded).toEqual(initialDefault);
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
          p.bounds.maxX < e.minX || p.bounds.minX > e.maxX
          || p.bounds.maxZ < e.minZ || p.bounds.minZ > e.maxZ
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
    const playMultiplication = async (C, R) => {
      const round = await page.evaluate(([cols, rows]) => window.__bbForceRound(cols, rows, 'mul'), [C, R]);
      expect(round).toMatchObject({ C, R, visualC: C, visualR: R, phase: 'building' });
      for (const [c, r] of [[0, 0], [C - 1, R - 1]]) {
        const mapped = await page.evaluate(([cc, rr]) => window.__cellXY(cc, rr), [c, r]);
        expect(mapped.x).toBeGreaterThan(0); expect(mapped.x).toBeLessThan(await page.evaluate(() => innerWidth));
        expect(mapped.y).toBeGreaterThan(0); expect(mapped.y).toBeLessThan(await page.evaluate(() => innerHeight));
        await page.mouse.click(mapped.x, mapped.y);
      }
      expect((await state(page, '__bb')).placed).toBe(2);
      await page.evaluate(({ C: cols, R: rows }) => {
        for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) window.__place(c, r);
      }, round);
      await waitForState(page, '__bb', "s.phase === 'asking'");
      await answer(page, (await state(page, '__bb')).answer);
      await waitForState(page, '__bb', "s.phase === 'rotate'");
      await page.locator('#btn-confirm').click();
      await waitForState(page, '__bb', "s.phase === 'next'");
      expect(await state(page, '__bb')).toMatchObject({ visualC: R, visualR: C });
    };
    await playMultiplication(2, 2);
    await playMultiplication(10, 6);

    const round = await page.evaluate(() => window.__bbForceRound(10, 6, 'div'));
    expect(round).toMatchObject({ C: 10, R: 6, op: 'div', phase: 'building',
      a: 10, b: 6, dividend: 60, divisor: 6, quotient: 10 });
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
          window.__bolt.playWalk(true);
          window.__bolt.resetPlacement();
        }, { nextStage: stage, nextBiome: biome });
        const view = await page.evaluate(() => {
          const engine = window.__engine();
          const house = engine.projectBoundsToScreen(engine.house.group);
          const bolt = engine.projectBoundsToScreen(window.__bolt.group);
          const boltState = window.__bolt.debugState();
          return { house, bolt, boltVisible: boltState.visible, boltWalking: boltState.walking,
            terrain: window.__terrain() };
        });
        expect(view.boltVisible, `${width}x${height} stage ${stage} Bolt visibility`).toBe(true);
        expect(view.boltWalking, `${width}x${height} stage ${stage} synchronous Bolt reset`).toBe(false);
        for (const [kind, bounds] of [['house', view.house], ['bolt', view.bolt]]) {
          const margin = 6; // keeps silhouettes off the crop and touch-safe HUD edges
          expect(bounds.minX, `${width}x${height} stage ${stage} ${kind}`).toBeGreaterThanOrEqual(margin);
          expect(bounds.maxX, `${width}x${height} stage ${stage} ${kind}`).toBeLessThanOrEqual(width - margin);
          expect(bounds.minY, `${width}x${height} stage ${stage} ${kind}`).toBeGreaterThanOrEqual(margin);
          expect(bounds.maxY, `${width}x${height} stage ${stage} ${kind}`).toBeLessThanOrEqual(height - margin);
        }
      }
      await pick(page, 'block-builder', '__bb');
      const round = await page.evaluate(() => window.__bbForceRound(10, 6, 'mul'));
      const corners = await page.evaluate(({ C, R }) => [window.__cellXY(0, 0), window.__cellXY(C - 1, R - 1)], round);
      for (const point of corners) {
        expect(point.x).toBeGreaterThanOrEqual(8); expect(point.x).toBeLessThanOrEqual(width - 8);
        expect(point.y).toBeGreaterThanOrEqual(8); expect(point.y).toBeLessThanOrEqual(height - 8);
      }
      const sightlines = await page.evaluate(() => [[-12, 0.1, -8], [8, 0.1, 6], [0, 0.1, 0]]
        .map(([x, y, z]) => window.__terrainSightline(x, y, z)));
      expect(sightlines.every((line) => line.checkedTerrain && line.terrainClear && line.groveClear
        && line.clear && line.depth >= -1 && line.depth <= 1)).toBe(true);
      await page.locator('#btn-back').click();
      await page.waitForFunction(() => window.__hub().open);
    }

    const actorCheck = await page.evaluate(() => {
      const engine = window.__engine();
      engine.house.setStage(4);
      const terrain = window.__terrain();
      const position = (object) => {
        object.updateWorldMatrix(true, false);
        const e = object.matrixWorld.elements;
        return { x: e[12], y: e[13], z: e[14] };
      };
      const golem = engine.scene.getObjectByName('iron-golem');
      const phases = [0, 1, 2, 3, 4].map((cycle) => {
        engine.house.update(0, cycle / 0.65);
        return position(golem);
      });
      const bolt = position(window.__bolt.group);
      const safe = (p) => terrain.sample(p.x, p.z) === 0 && terrain.fluidCells.length === 0
        && terrain.treeCells.every((tree) => p.x < tree.bounds.minX || p.x > tree.bounds.maxX
          || p.z < tree.bounds.minZ || p.z > tree.bounds.maxZ);
      return { phases, bolt, safe: phases.every(safe) && safe(bolt), boltState: window.__bolt.debugState() };
    });
    expect(actorCheck.phases.map((p) => Number(p.x.toFixed(3)))).toEqual([-5.06, -3.764, -2.468, -3.764, -5.06]);
    expect(actorCheck.phases.every((p) => Math.abs(p.y) < 1e-6)).toBe(true);
    expect(actorCheck.safe).toBe(true);
    expect(actorCheck.boltState.hasTranslationPath).toBe(false);
    await pick(page, 'block-builder', '__bb');
    await page.waitForTimeout(150);
    await page.locator('#btn-back').click(); // tear the game down while the golem is mid-patrol
    await page.waitForFunction(() => window.__hub().open);
    const resetBolt = await page.evaluate(() => window.__bolt.debugState());
    expect(resetBolt.home).toEqual({ x: -4.8, y: 0, z: 1.8 });
    expect(resetBolt.hasTranslationPath).toBe(false);
    expect(resetBolt.walking).toBe(false);
    expect(await page.evaluate(() => !!window.__engine().scene.getObjectByName('iron-golem'))).toBe(true);
    expect(errors).toEqual([]);
  });

  test('stabilizes renderer resources and grove ownership through 20 world/game cycles', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = await boot(page);
    const cycle = async (index) => {
      await page.evaluate((i) => {
        const biomes = ['flat', 'hills', 'forest', 'desert', 'snow', 'nether', 'end'];
        window.__biome(biomes[i % biomes.length]);
        window.__terrainSetSeed(1000 + i);
        window.__terrainRender(); // deterministically register this biome state
        window.__pick('block-builder');
      }, index);
      await page.waitForFunction(() => typeof window.__bb === 'function');
      await page.evaluate(() => window.__terrainRender()); // register game-owned geometry before teardown
      await page.evaluate(() => document.querySelector('#btn-back').click());
      await page.waitForFunction(() => window.__hub().open);
      await page.waitForTimeout(80);
      return page.evaluate(() => {
        const memory = window.__terrainRender();
        const geometryClasses = {};
        const geometryIds = new Set();
        window.__engine().scene.traverse((object) => {
          if (!object.geometry || geometryIds.has(object.geometry.uuid)) return;
          geometryIds.add(object.geometry.uuid);
          const kind = object.geometry.type || object.type;
          geometryClasses[kind] = (geometryClasses[kind] || 0) + 1;
        });
        return { ...memory, biome: window.__terrain().biome,
          stage: window.__engine().house.getStage(), hubOpen: window.__hub().open,
          gameActive: typeof window.__bb === 'function', groveCount: window.__terrain().groveCount,
          liveGeometries: geometryIds.size, geometryClasses };
      });
    };
    // Warm every biome and the largest house until two complete, identically
    // ordered biome passes end on the same renderer counts. This proves the
    // async/lazy WebGL vocabulary has reached a plateau before measurement.
    await page.evaluate(() => window.__engine().house.setStage(8));
    let nextCycle = 0;
    let previousEndpoint = null;
    let plateau = null;
    for (let epoch = 0; epoch < 3 && !plateau; epoch++) {
      let endpoint;
      for (let i = 0; i < 14; i++) endpoint = await cycle(nextCycle++);
      console.log(`terrain resource epoch ${epoch + 1}: ${JSON.stringify(endpoint)}`);
      if (previousEndpoint && endpoint.geometries === previousEndpoint.geometries
        && endpoint.textures === previousEndpoint.textures) plateau = endpoint;
      previousEndpoint = endpoint;
    }
    expect(plateau, 'renderer counts must plateau across complete biome passes').not.toBeNull();
    const counts = [];
    for (let i = 0; i < 20; i++) counts.push(await cycle(nextCycle++));
    const final = await page.evaluate(() => window.__terrain());
    expect(final.groveCount).toBeLessThanOrEqual(1);
    const geometries = counts.map((entry) => entry.geometries);
    const textures = counts.map((entry) => entry.textures);
    // A biome swap replaces exactly two owned terrain geometries; renderer.info
    // can observe either side of that disposal on an animation-frame boundary.
    expect(Math.max(...geometries) - Math.min(...geometries)).toBeLessThanOrEqual(2);
    expect(geometries.at(-1)).toBeLessThanOrEqual(geometries[0]);
    expect(Math.max(...textures) - Math.min(...textures)).toBe(0);
    expect(errors).toEqual([]);
  });
});
