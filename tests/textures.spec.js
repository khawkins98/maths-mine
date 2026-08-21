import { test, expect } from '@playwright/test';
import { boot, pick } from './helpers.js';

test.describe('coherent world texture contract', () => {
  test('all authored world tiles are 16px, nearest-filtered, and terrain wraps', async ({ page }) => {
    const errors = await boot(page);
    const result = await page.evaluate(async () => {
      const { createTextures, WORLD_TEXTURE_SPEC } = await import('/src/core/textures.js');
      const textures = createTextures();
      const keys = [
        'dirtTex', 'grassTex', 'grassSideTex', 'stoneTex', 'woodTex', 'logTex', 'logTopTex',
        'cactusTex', 'obsidianTex', 'lavaTex', 'platGrassTex', 'platDirtTex', 'platSandTex',
        'platSandstoneTex', 'platSnowTex', 'platIceTex', 'platNetherrackTex', 'platEndstoneTex',
      ];
      const files = ['grass-top', 'grass-side', 'dirt', 'stone', 'sand', 'sandstone', 'snow', 'ice', 'oak-bark', 'oak-planks', 'oak-end', 'cactus', 'netherrack', 'end-stone', 'obsidian', 'lava'];
      const dimensions = await Promise.all(files.map((file) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve([image.naturalWidth, image.naturalHeight]);
        image.onerror = reject;
        image.src = new URL(`assets/textures/world/${file}.png`, document.baseURI).href;
      })));
      return {
        spec: WORLD_TEXTURE_SPEC,
        dimensions,
        tiles: keys.map((key) => ({
          key,
          mag: textures[key].magFilter,
          min: textures[key].minFilter,
          mipmaps: textures[key].generateMipmaps,
          wraps: textures[key].wrapS === 1000 && textures[key].wrapT === 1000,
        })),
      };
    });
    expect(result.spec.tileSize).toBe(16);
    expect(result.dimensions.every(([width, height]) => width === 16 && height === 16)).toBe(true);
    for (const tile of result.tiles) {
      expect([tile.mag, tile.min, tile.mipmaps]).toEqual([1003, 1003, false]);
      expect(tile.wraps).toBe(tile.key.startsWith('plat'));
    }
    expect(errors).toEqual([]);
  });

  test('cacti are straight bounded columns and Block Builder keeps distinct material identities', async ({ page }) => {
    const errors = await boot(page);
    const contract = await page.evaluate(async () => {
      const { makeCactus } = await import('/src/core/trees.js');
      const cactus = makeCactus({ height: 4, materials: { cactus: {} } });
      const { createTextures } = await import('/src/core/textures.js');
      const textures = createTextures();
      return {
        count: cactus.children.length,
        xs: cactus.children.map((child) => child.position.x),
        zs: cactus.children.map((child) => child.position.z),
        scales: cactus.children.map((child) => child.scale.toArray()),
        minY: Math.min(...cactus.children.map((child) => child.position.y - 0.36 * child.scale.y)),
        maxY: Math.max(...cactus.children.map((child) => child.position.y + 0.36 * child.scale.y)),
        uniqueMaterialUUIDs: new Set([
          textures.dirtTex.uuid, textures.woodTex.uuid, textures.stoneTex.uuid, textures.obsidianTex.uuid,
        ]).size,
        grassSideTile: textures.grassSideTex.userData.worldTile,
        logSideTile: textures.logTex.userData.worldTile,
        logEndTile: textures.logTopTex.userData.worldTile,
        logFacesDistinct: textures.logTex.uuid !== textures.logTopTex.uuid,
      };
    });
    expect(contract).toEqual({
      count: 1, xs: [0], zs: [0], scales: [[0.84, 4, 0.84]], minY: 0, maxY: 2.88,
      uniqueMaterialUUIDs: 4, grassSideTile: 'grass-side', logSideTile: 'oak-bark',
      logEndTile: 'oak-end', logFacesDistinct: true,
    });

    await pick(page, 'block-builder', '__bb');
    await expect(page.locator('#app canvas')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('continuous terrain selects semantic top and side tiles for every representative biome', async ({ page }) => {
    const errors = await boot(page);
    const expected = {
      flat: ['grass-top', 'grass-side'],
      forest: ['grass-top', 'grass-side'],
      desert: ['sand', 'sandstone'],
      snow: ['snow', 'dirt'],
      nether: ['netherrack', 'netherrack'],
      end: ['end-stone', 'obsidian'],
    };
    for (const [biome, materialTiles] of Object.entries(expected)) {
      await page.evaluate((id) => window.__biome(id), biome);
      expect((await page.evaluate(() => window.__terrain().materialTiles)), biome).toEqual({
        top: materialTiles[0], side: materialTiles[1],
      });
    }
    expect(errors).toEqual([]);
  });
  // A tile that 404s on a subpath deploy, or drops off flaky tablet Wi-Fi, used
  // to reject inside the Promise.all that boot awaits at module scope: an
  // unhandled throw before anything rendered, and a white screen with no way
  // back. The character loader already fails soft; the world has to as well.
  test('a missing world tile resolves to a stand-in instead of rejecting', async ({ page }) => {
    const warnings = [];
    page.on('console', (message) => {
      if (message.type() === 'warning' && message.text().includes('World tiles unavailable')) {
        warnings.push(message.text());
      }
    });
    await page.route('**/assets/textures/world/dirt.png', (request) => request.abort('failed'));
    await page.route(/^http:\/\/localhost:\d+\/$/, (request) => request.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>world tile loader test</title>',
    }));
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const { createTextures } = await import('/src/core/textures.js');
      const textures = createTextures();
      const missing = await textures.ready;
      return {
        missing,
        recorded: textures.missingTiles,
        standIn: textures.dirtTex.image instanceof HTMLCanvasElement,
        standInSize: [textures.dirtTex.image.width, textures.dirtTex.image.height],
        neighbourStillReal: textures.stoneTex.image instanceof HTMLImageElement,
      };
    });

    expect(result.missing).toEqual(['dirt']);
    expect(result.recorded).toEqual(['dirt']);
    expect(result.standIn).toBe(true);
    expect(result.standInSize).toEqual([16, 16]);
    expect(result.neighbourStillReal).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('dirt');
  });

  test('total world texture failure never stops the app booting', async ({ page }) => {
    await page.route('**/assets/textures/world/**', (request) => request.abort('failed'));
    const errors = await boot(page);

    await pick(page, 'block-builder', '__bb');
    await page.locator('#btn-back').click();
    await expect(page.locator('#hub')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
