import { expect } from '@playwright/test';

// Boot the app past the "Wake up Bolt!" gate and land in the hub.
//
// That single tap is the app's permission/audio gate. Headless Chromium has no
// motion sensors, so the app falls back to tap mode — which is exactly the path
// these tests drive.
export async function boot(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/');
  await page.locator('#btn-wake').click();
  await expect(page.locator('#hub')).toBeVisible();
  await page.waitForFunction(() => window.__hub && window.__hub().games.length > 0);
  return errors;
}

// Start a game from the hub and wait for it to install its debug hook — proof
// that `start()` ran to completion.
export async function pick(page, id, readyHook) {
  await page.evaluate((gid) => window.__pick(gid), id);
  await page.waitForFunction((h) => typeof window[h] === 'function', readyHook);
}

// Poll a game's debug-state getter until `expr` (a JS expression over `s`, the
// state object) is truthy. Passed as a string because it is evaluated in the
// browser, not in Node.
export function waitForState(page, hook, expr, timeout = 20_000) {
  return page.waitForFunction(
    ({ h, e }) => {
      const s = window[h] && window[h]();
      return !!s && Boolean(eval(e)); // eslint-disable-line no-eval
    },
    { h: hook, e: expr },
    { timeout },
  );
}

// Read a game's debug state.
export const state = (page, hook) => page.evaluate((h) => window[h](), hook);

// Tap the answer card showing `value`.
export function answer(page, value) {
  return page.locator('.choice', { hasText: new RegExp(`^${value}$`) }).first().click();
}
