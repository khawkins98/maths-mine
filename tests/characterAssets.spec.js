import { test, expect } from '@playwright/test';
import { boot, pick } from './helpers.js';

async function loadInBlankPage(page, route) {
  const warnings = [];
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('Character assets unavailable')) {
      warnings.push(message.text());
    }
  });
  if (route) await route();
  await page.route(/^http:\/\/localhost:\d+\/$/, (request) => request.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><title>character loader test</title>',
  }));
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { loadCharacterAssets } = await import('/src/core/characters.js');
    const assets = await loadCharacterAssets();
    const character = assets.create('a');
    const meshes = [];
    character.traverse((node) => { if (node.isMesh) meshes.push(node); });
    const joints = character.userData.joints;
    return {
      textureAlias: assets.textures.b === assets.textures.steve,
      textureCount: Object.values(assets.textures).filter(Boolean).length,
      mapMissing: meshes.every((mesh) => mesh.material.map == null),
      geometryCount: assets.geometries.size,
      allGeometriesShared: meshes.every((mesh) => assets.geometries.has(mesh.geometry)),
      distinctFactoryRoots: assets.create('a') !== character,
      joints: {
        neck: !!joints.neck,
        leftShoulder: !!joints.shoulders['-1'],
        rightShoulder: !!joints.shoulders['1'],
        leftHip: !!joints.hips['-1'],
        rightHip: !!joints.hips['1'],
        body: !!joints.body,
        eyes: Array.isArray(joints.eyes),
      },
    };
  });
  return { result, warnings };
}

test.describe('fail-soft character assets', () => {
  test('a missing skin aliases to the loaded Steve skin with one warning', async ({ page }) => {
    const { result, warnings } = await loadInBlankPage(page, () => page.route(
      '**/assets/characters/Textures/texture-b.png',
      (request) => request.abort('failed'),
    ));

    expect(result.textureAlias).toBe(true);
    expect(result.textureCount).toBe(9);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('texture-b.png');
  });

  test('no loaded skins uses a solid material without rejecting', async ({ page }) => {
    const { result, warnings } = await loadInBlankPage(page, () => page.route(
      '**/assets/characters/Textures/*.png',
      (request) => request.abort('failed'),
    ));

    expect(result.textureCount).toBe(0);
    expect(result.mapMissing).toBe(true);
    expect(warnings).toHaveLength(1);
  });

  test('a missing model returns reusable owned geometry and the full joints contract', async ({ page }) => {
    const { result, warnings } = await loadInBlankPage(page, () => page.route(
      '**/assets/characters/**',
      (request) => request.abort('failed'),
    ));

    expect(result.geometryCount).toBe(4);
    expect(result.allGeometriesShared).toBe(true);
    expect(result.distinctFactoryRoots).toBe(true);
    expect(result.joints).toEqual({
      neck: true,
      leftShoulder: true,
      rightShoulder: true,
      leftHip: true,
      rightHip: true,
      body: true,
      eyes: true,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('character.glb');
  });

  test('total character asset failure never bricks the hub or game routing', async ({ page }) => {
    await page.route('**/assets/characters/**', (request) => request.abort('failed'));
    const warnings = [];
    page.on('console', (message) => {
      if (message.type() === 'warning' && message.text().includes('Character assets unavailable')) {
        warnings.push(message.text());
      }
    });
    const errors = await boot(page);

    await pick(page, 'block-builder', '__bb');
    await page.locator('#btn-back').click();
    await expect(page.locator('#hub')).toBeVisible();
    await pick(page, 'spot-the-wrongun', '__stw');
    await page.locator('#btn-back').click();
    await expect(page.locator('#hub')).toBeVisible();
    await pick(page, 'night-defense', '__night');
    await page.locator('#btn-back').click();
    await expect(page.locator('#hub')).toBeVisible();

    expect(warnings).toHaveLength(1);
    expect(errors).toEqual([]);
  });
});
