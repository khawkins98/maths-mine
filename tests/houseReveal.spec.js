import { test, expect } from '@playwright/test';
import { boot, pick } from './helpers.js';

async function seedBuild(page, stage = 0, bolts = 100) {
  await page.addInitScript(({ savedStage, savedBolts }) => {
    localStorage.setItem('house_stage.v1', JSON.stringify({ stage: savedStage }));
    localStorage.setItem('bolts.v1', JSON.stringify({ bolts: savedBolts }));
  }, { savedStage: stage, savedBolts: bolts });
}

test.describe('cottage construction reveal', () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1180, height: 720 }]) {
    test(`${viewport.width}x${viewport.height} clears the hub chrome at the build midpoint`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await seedBuild(page);
      const errors = await boot(page);
      await page.locator('#btn-build-house').click();

      // Wait for the midpoint and sample it in the SAME task. Waiting first and
      // reading in a second round trip raced the 1450ms clear: on a loaded
      // machine the reveal was already over by the time the state came back,
      // and `building` read false.
      const state = await page.waitForFunction(() => {
        if (window.__hub().revealPhase !== 'showing') return null;
        // The chrome fade is a CSS transition, so it advances a frame at a
        // time. A loaded machine can reach 'showing' with the compositor not
        // yet caught up; that is a slow box, not a broken fade, so wait for
        // the faded state rather than sampling whatever is on screen the
        // instant the phase flips.
        if (Number(getComputedStyle(document.querySelector('#hub-cards')).opacity) >= 0.15) return null;
        const hub = document.querySelector('#hub');
        const house = window.__engine().projectBoundsToScreen(window.__engine().house.group);
        return {
          building: window.__hub().building,
          chromeOpacity: getComputedStyle(document.querySelector('#hub-cards')).opacity,
          dimmerOpacity: getComputedStyle(hub, '::before').opacity,
          house,
        };
      }).then((handle) => handle.jsonValue());
      expect(state.building).toBe(true);
      expect(Number(state.chromeOpacity)).toBeLessThan(0.15);
      expect(Number(state.dimmerOpacity)).toBeLessThan(0.3);
      expect(state.house.minX).toBeGreaterThanOrEqual(0);
      expect(state.house.maxX).toBeLessThanOrEqual(viewport.width);
      expect(state.house.minY).toBeGreaterThanOrEqual(0);
      expect(state.house.maxY).toBeLessThanOrEqual(viewport.height);
      expect(errors).toEqual([]);
    });
  }

  test('rapid activation spends once and restores focus to the updated action', async ({ page }) => {
    await seedBuild(page, 0, 100);
    await boot(page);
    const button = page.locator('#btn-build-house');
    await button.evaluate((node) => { node.click(); node.click(); node.click(); });
    await expect.poll(() => page.evaluate(() => window.__engine().house.getStage())).toBe(1);
    await page.waitForFunction(() => !window.__hub().building);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bolts.v1')).bolts)).toBe(95);
    await expect(button).toBeFocused();
    await expect(button).not.toHaveAttribute('aria-busy');
  });

  test('starting a game tears down an in-flight reveal without stale restoration', async ({ page }) => {
    await seedBuild(page);
    await boot(page);
    await page.locator('#btn-build-house').click();
    await page.evaluate(() => window.__pick('block-builder'));
    await expect(page.locator('#hub')).toBeHidden();
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => window.__hub())).toMatchObject({ open: false, building: false, revealPhase: 'idle' });
    expect(await page.locator('#hub').evaluate((hub) => [...hub.classList]
      .filter((name) => name.startsWith('house-reveal')))).toEqual([]);
    await expect(page.locator('#hub-cards')).not.toHaveAttribute('inert');
    await expect(page.locator('#house-bar')).not.toHaveAttribute('inert');
  });

  test('hidden hub controls cannot receive keyboard focus or activate a game', async ({ page }) => {
    await seedBuild(page);
    await boot(page);
    const build = page.locator('#btn-build-house');
    await build.focus();
    const hiddenState = await build.evaluate((node) => {
      node.click();
      return {
        cards: document.querySelector('#hub-cards').hasAttribute('inert'),
        houseBar: document.querySelector('#house-bar').hasAttribute('inert'),
        phase: window.__hub().revealPhase,
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      };
    });
    expect(hiddenState).toEqual({ cards: true, houseBar: true, phase: 'fading', reduced: false });

    // The focus half is checked in one synchronous evaluate. The reveal ends on
    // a timer, and a timer cannot interleave with a synchronous function, so
    // the window cannot close half way through. Spread across separate round
    // trips this raced: on a loaded machine the reveal finished first, inert
    // came back off, the card took focus, and the suite went red over correct
    // behaviour.
    //
    // Programmatic focus stands in for the Tab press: `inert` takes an element
    // out of the tab order by the same mechanism that refuses .focus(), so
    // this is the stricter of the two. It deliberately does NOT click the card
    // -- inert blocks user interaction and focus, but never stopped
    // element.click() dispatching straight to the listener, so a scripted click
    // would assert something the platform does not promise and no child could
    // do.
    const focusDuringReveal = await page.evaluate(() => {
      const cards = document.querySelector('#hub-cards');
      const buildBtn = document.querySelector('#btn-build-house');
      const card = document.querySelector('.hub-card[data-game="block-builder"]');
      const open = () => window.__hub().building && cards.hasAttribute('inert');
      const openBefore = open();

      document.activeElement?.blur();
      buildBtn.focus();
      const buildTookFocus = document.activeElement === buildBtn;

      document.activeElement?.blur();
      card.focus();
      const cardTookFocus = document.activeElement === card;

      return { openBefore, buildTookFocus, cardTookFocus, openAfter: open() };
    });
    expect(focusDuringReveal).toEqual({
      openBefore: true,
      buildTookFocus: false,
      cardTookFocus: false,
      openAfter: true,
    });

    // Real keyboard input, and not time-sensitive: nothing holds focus after
    // the block above, so Enter activates nothing whether or not the reveal has
    // finished by now.
    await page.keyboard.press('Enter');
    await expect(page.locator('#hub')).toBeVisible();
    expect(await page.evaluate(() => typeof window.__bb)).toBe('undefined');
    await expect(page.locator('#ref-tray')).not.toHaveClass(/open/);

    await page.waitForFunction(() => !window.__hub().building);
    await expect(page.locator('#hub-cards')).not.toHaveAttribute('inert');
    await expect(page.locator('#house-bar')).not.toHaveAttribute('inert');

    // ...and the same card is focusable and playable again once it is over.
    const blockBuilder = page.locator('.hub-card[data-game="block-builder"]');
    await blockBuilder.focus();
    await expect(blockBuilder).toBeFocused();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => typeof window.__bb === 'function');
  });

  test('returning from every game restores the village camera', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedBuild(page, 4);
    await boot(page);
    for (const [id, hook] of [
      ['block-builder', '__bb'],
      ['spot-the-wrongun', '__stw'],
      ['night-defense', '__night'],
    ]) {
      await pick(page, id, hook);
      await page.locator('#btn-back').click();
      await page.waitForFunction(() => window.__hub().open);
      const bounds = await page.evaluate(() => window.__engine()
        .projectBoundsToScreen(window.__engine().house.group));
      expect(bounds.minX, `${id} minX`).toBeGreaterThanOrEqual(0);
      expect(bounds.maxX, `${id} maxX`).toBeLessThanOrEqual(390);
      expect(bounds.minY, `${id} minY`).toBeGreaterThanOrEqual(0);
      expect(bounds.maxY, `${id} maxY`).toBeLessThanOrEqual(844);
    }
  });

  test('reduced motion upgrades immediately with a brief static highlight', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedBuild(page);
    await boot(page);
    const button = page.locator('#btn-build-house');
    const immediate = await button.evaluate((node) => {
      node.click();
      return {
        stage: window.__engine().house.getStage(),
        className: document.querySelector('#hub').className,
        phase: window.__hub().revealPhase,
      };
    });
    expect(immediate).toEqual({ stage: 1, className: 'house-reveal-static', phase: 'showing' });
    await expect(page.locator('#hub-cards')).toHaveCSS('opacity', '1');
    await page.waitForFunction(() => !window.__hub().building);
    await expect(button).toBeFocused();
  });
});
