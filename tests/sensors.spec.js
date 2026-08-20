import { test, expect } from '@playwright/test';
import { boot, pick } from './helpers.js';

async function installOrientation(page, outcome) {
  await page.addInitScript((permissionOutcome) => {
    window.__motionTest = { calls: 0, calledInGesture: false, dispatching: false };
    if (permissionOutcome === 'unsupported') {
      Reflect.deleteProperty(window, 'DeviceOrientationEvent');
      return;
    }

    class FakeDeviceOrientationEvent extends Event {
      constructor(type, init = {}) {
        super(type);
        this.beta = init.beta;
        this.gamma = init.gamma;
      }
    }
    FakeDeviceOrientationEvent.requestPermission = () => {
      window.__motionTest.calls++;
      window.__motionTest.calledInGesture ||= window.__motionTest.dispatching;
      if (permissionOutcome === 'throw') throw new Error('permission unavailable');
      return Promise.resolve(permissionOutcome);
    };
    Object.defineProperty(window, 'DeviceOrientationEvent', {
      configurable: true,
      value: FakeDeviceOrientationEvent,
    });
  }, outcome);
}

async function gesture(page) {
  await page.locator('.hub-card[data-game="block-builder"]').evaluate((node) => {
    window.__motionTest.dispatching = true;
    node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    window.__motionTest.dispatching = false;
  });
}

test.describe('motion input wiring', () => {
  test('first gesture grants once and real data enables tilt across routes', async ({ page }) => {
    await installOrientation(page, 'granted');
    const errors = await boot(page);

    await gesture(page);
    await expect.poll(() => page.evaluate(() => window.__sensors().enabled)).toBe(true);
    expect(await page.evaluate(() => window.__motionTest)).toMatchObject({
      calls: 1,
      calledInGesture: true,
    });
    expect(await page.evaluate(() => window.__sensors().usingSensors)).toBe(false);

    await page.evaluate(() => window.dispatchEvent(
      new DeviceOrientationEvent('deviceorientation', { beta: 20, gamma: 5 }),
    ));
    expect(await page.evaluate(() => window.__sensors())).toMatchObject({
      enabled: true,
      available: true,
      usingSensors: true,
    });

    await pick(page, 'block-builder', '__bb');
    await page.locator('#btn-back').click();
    await pick(page, 'spot-the-wrongun', '__stw');
    await page.locator('#btn-back').click();
    await gesture(page);
    expect(await page.evaluate(() => window.__motionTest.calls)).toBe(1);

    await page.evaluate(() => window.dispatchEvent(
      new DeviceOrientationEvent('deviceorientation', { beta: 25, gamma: 12 }),
    ));
    expect(await page.evaluate(() => window.__sensors().usingSensors)).toBe(true);
    expect(errors).toEqual([]);
  });

  for (const outcome of ['denied', 'throw', 'unsupported']) {
    test(`${outcome} permission silently keeps pointer fallback`, async ({ page }) => {
      await installOrientation(page, outcome);
      const errors = await boot(page);
      await gesture(page);
      await expect.poll(() => page.evaluate(() => window.__sensors().enabled)).toBe(false);

      await page.locator('.hub-card[data-game="block-builder"]').click();
      await page.waitForFunction(() => typeof window.__bb === 'function');
      expect((await page.evaluate(() => window.__bb())).phase).toBe('building');
      expect(await page.evaluate(() => window.__sensors().usingSensors)).toBe(false);
      expect(await page.evaluate(() => window.__motionTest.calls)).toBe(
        outcome === 'unsupported' ? 0 : 1,
      );
      expect(errors).toEqual([]);
    });
  }
});
