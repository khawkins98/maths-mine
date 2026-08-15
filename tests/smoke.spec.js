import { test, expect } from '@playwright/test';
import { boot, pick, waitForState, state, answer } from './helpers.js';

// End-to-end smoke tests: each game must be playable from the hub through one
// full round, and every game must tear down cleanly when the child leaves.
//
// These exist to catch regressions during refactoring. They deliberately drive
// the games through the documented `window.__*` debug hooks rather than
// pixel-hunting a WebGL canvas.

test.describe('boot + hub', () => {
  test('a synchronously available Firefox-style voice list does not block startup', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        value: {
          getVoices: () => [{ name: 'Test Voice', lang: 'en-GB', localService: true }],
          addEventListener() {},
          speak() {},
          cancel() {},
        },
      });
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await expect(page.locator('#hub')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('gate leads to a hub listing available games', async ({ page }) => {
    const errors = await boot(page);
    const { games } = await page.evaluate(() => window.__hub());
    expect(games).toEqual(['block-builder', 'spot-the-wrongun']);
    await expect(page.locator('.hub-card')).toHaveCount(2);
    expect(errors).toEqual([]);
  });
});

test.describe('Block Builder', () => {
  test('builds a wall, answers correctly, and advances', async ({ page }) => {
    const errors = await boot(page);
    await pick(page, 'block-builder', '__bb');

    const round = await state(page, '__bb');
    expect(round.phase).toBe('building');
    expect(round.C).toBeGreaterThan(0);
    expect(round.R).toBeGreaterThan(0);

    // Fill the mould group by group, the way a child does.
    await page.evaluate(({ C, R }) => {
      for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) window.__place(c, r);
    }, round);

    await waitForState(page, '__bb', "s.phase === 'asking'");
    const asking = await state(page, '__bb');
    expect(asking.placed).toBe(round.C * round.R);
    expect(asking.choices).toContain(asking.answer);

    await answer(page, asking.answer);

    // × rounds go to the commutativity rotate; ÷ rounds go straight to next.
    await waitForState(page, '__bb', "s.phase === 'rotate' || s.phase === 'next'");
    expect(errors).toEqual([]);
  });

  // A child does not fill column by column, and the caption must never claim a
  // multiplication that is not on the board yet.
  test('the running caption stays truthful during a scattered fill', async ({ page }) => {
    await boot(page);
    await pick(page, 'block-builder', '__bb');
    const { C, R, groupSize } = await state(page, '__bb');
    const tally = () => page.locator('#tally').textContent();

    // fill row-wise, so no group closes until the very last row
    let placed = 0;
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        await page.evaluate(([cc, rr]) => window.__place(cc, rr), [c, r]);
        placed++;
        const text = await tally();
        const complete = Math.floor(placed / groupSize) === 0 ? 0
          : (r === R - 1 ? Math.floor(placed / groupSize) : 0);
        if (complete === 0 && placed < C * R) {
          // no group closed yet: a count, never an equation
          expect(text).toMatch(/^\d+ blocks?$/);
          expect(text).not.toContain('group');
        }
      }
    }
    // and the total it eventually states is the real one
    await waitForState(page, '__bb', "s.phase === 'asking'");
    expect((await state(page, '__bb')).placed).toBe(C * R);
  });

  test('division rounds ask how many in each group', async ({ page }) => {
    await boot(page);
    await pick(page, 'block-builder', '__bb');

    // Play one × round so a fact is known well enough to unlock its ÷ sibling.
    const first = await state(page, '__bb');
    await page.evaluate(({ C, R }) => {
      for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) window.__place(c, r);
    }, first);
    await waitForState(page, '__bb', "s.phase === 'asking'");
    await answer(page, (await state(page, '__bb')).answer);
    await waitForState(page, '__bb', "s.phase === 'rotate' || s.phase === 'next'");

    // Force the next round to division and start it.
    await page.evaluate(() => window.__nextMode('div'));
    await page.locator('#btn-confirm').click();          // Rotate 🔄 or Next →
    await waitForState(page, '__bb', "s.phase === 'rotate' || s.phase === 'next' || s.phase === 'building'");
    if ((await state(page, '__bb')).phase !== 'building') {
      await page.locator('#btn-confirm').click();        // Next → after the rotate
    }
    await waitForState(page, '__bb', "s.phase === 'building' && s.op === 'div'");

    const div = await state(page, '__bb');
    expect(div.op).toBe('div');
    expect(div.answer).toBe(div.C); // ÷ asks how many in each group = column count

    await page.evaluate(({ C, R }) => {
      for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) window.__place(c, r);
    }, div);
    await waitForState(page, '__bb', "s.phase === 'asking'");
    await expect(page.locator('#askeq')).toHaveText(
      `${div.C * div.R} ÷ ${div.R} = ?`,
    );

    await answer(page, div.answer);
    await waitForState(page, '__bb', "s.phase === 'next'");
    const revealed = await state(page, '__bb');
    expect(revealed.divisionGap).toBeGreaterThan(0);
    for (let r = 1; r < revealed.rowYs.length; r++) {
      expect(revealed.rowYs[r] - revealed.rowYs[r - 1]).toBeGreaterThan(1.15);
    }
  });
});


test.describe("Spot the Wrong'un", () => {
  test('judge tier: scores a true/false claim', async ({ page }) => {
    const errors = await boot(page);
    await pick(page, 'spot-the-wrongun', '__stw');
    await page.evaluate(() => window.__stwTier('judge'));

    await waitForState(page, '__stw', "s.phase === 'judging'");
    const jr = await state(page, '__stw');
    expect(jr.tier).toBe('judge');

    await page.evaluate((truth) => window.__judge(truth), jr.isTrue);
    await waitForState(page, '__stw', "s.phase === 'revealing' || s.phase === 'done'");
    expect(errors).toEqual([]);
  });

  test('imposter tier: accusing the fibbing sign resolves the round', async ({ page }) => {
    const errors = await boot(page);
    await pick(page, 'spot-the-wrongun', '__stw');
    await page.evaluate(() => window.__stwTier('imposter'));

    await waitForState(page, '__stw', "s.phase === 'accusing'");
    const r = await state(page, '__stw');
    expect(r.crew.length).toBeGreaterThan(1);
    expect(r.crew.filter((n) => n.imposter)).toHaveLength(1);

    await page.evaluate((i) => window.__accuse(i), r.imposterIndex);
    await waitForState(page, '__stw', "s.phase === 'ejecting' || s.phase === 'done'");
    expect(errors).toEqual([]);
  });
});

test.describe('progress', () => {
  test('mastery survives a reload', async ({ page }) => {
    await boot(page);
    await pick(page, 'block-builder', '__bb');

    // Play one round correctly so there is progress worth keeping.
    const round = await state(page, '__bb');
    await page.evaluate(({ C, R }) => {
      for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) window.__place(c, r);
    }, round);
    await waitForState(page, '__bb', "s.phase === 'asking'");
    await answer(page, (await state(page, '__bb')).answer);
    await waitForState(page, '__bb', "s.phase === 'rotate' || s.phase === 'next'");

    const saved = await page.evaluate(() => localStorage.getItem('mastery.v1'));
    expect(saved).toBeTruthy();
    expect(JSON.parse(saved).totalCorrect).toBe(1);

    // Reload: the ledger — and so Bolt's oxidation — must come back.
    await boot(page);
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('mastery.v1')));
    expect(after.totalCorrect).toBe(1);
    expect(after.facts.length).toBeGreaterThan(0);
  });

  // Bolts used to be a local in each game module, so they reset to zero on
  // every game switch and every reload. There is no on-screen counter any more
  // (a readout a child does not care about, wearing button chrome), so this
  // checks the ledger behind it rather than the HUD.
  test('bolts survive a game switch and a reload', async ({ page }) => {
    await boot(page);
    await pick(page, 'block-builder', '__bb');

    const round = await state(page, '__bb');
    await page.evaluate(({ C, R }) => {
      for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) window.__place(c, r);
    }, round);
    await waitForState(page, '__bb', "s.phase === 'asking'");
    await answer(page, (await state(page, '__bb')).answer);
    await waitForState(page, '__bb', "s.phase === 'rotate' || s.phase === 'next'");

    const earned = (await state(page, '__bb')).bolts;
    expect(earned).toBeGreaterThan(0);

    // switch games: the count must carry, not reset
    await page.locator('#btn-back').click();
    await expect(page.locator('#hub')).toBeVisible();
    await pick(page, 'spot-the-wrongun', '__stw');
    expect((await state(page, '__stw')).bolts).toBe(earned);

    // and survive a reload
    await boot(page);
    await pick(page, 'block-builder', '__bb');
    expect((await state(page, '__bb')).bolts).toBe(earned);
  });
});

test.describe('answer choices', () => {
  // An audit found the answer was ALWAYS the numerically middle option, and
  // landed in the first slot for 60% of facts (100% on the 3, 6 and 9 tables).
  // "Tap the middle number" scored full marks without any arithmetic, and the
  // ledger recorded mastery the child did not have. Guessing must not work.
  test('the answer is not guessable by value or by position', async ({ page }) => {
    await boot(page);
    const stats = await page.evaluate(async () => {
      const { buildChoiceSet } = await import('/src/core/choices.js');
      let median = 0, n = 0, malformed = 0;
      const slots = [0, 0, 0];
      for (let a = 2; a <= 10; a++) {
        for (let b = 2; b <= 6; b++) {
          for (let r = 0; r < 40; r++) {
            const answer = a * b;
            const set = buildChoiceSet(answer, b);
            if (set.length !== 3 || new Set(set).size !== 3
              || !set.includes(answer) || set.some((v) => v <= 0)) malformed++;
            if ([...set].sort((x, y) => x - y)[1] === answer) median++;
            slots[set.indexOf(answer)]++;
            n++;
          }
        }
      }
      return { median: median / n, slots: slots.map((s) => s / n), malformed, n };
    });

    expect(stats.malformed).toBe(0);
    // no strategy should beat chance by much
    expect(stats.median).toBeLessThan(0.45);
    for (const share of stats.slots) {
      expect(share).toBeGreaterThan(0.25);
      expect(share).toBeLessThan(0.42);
    }
  });
});

test.describe('narration', () => {
  // The Web Speech API's cancel() is not synchronous: utterances submitted in
  // the SAME task fall inside the cancelled window and die too. Games naturally
  // write reset() then speak() at a round boundary, which silently killed the
  // line they had just queued — a child heard "five times ten is—" then silence
  // then "true, or false?".
  test('a line spoken right after a reset is not eaten by the cancel', async ({ page }) => {
    await boot(page);

    const result = await page.evaluate(async () => {
      const log = [];
      const orig = speechSynthesis.speak.bind(speechSynthesis);
      speechSynthesis.speak = (u) => {
        log.push({ ev: 'submit', text: u.text });
        u.addEventListener('error', (e) => log.push({ ev: 'error', text: u.text, why: e.error }));
        u.addEventListener('end', () => log.push({ ev: 'end', text: u.text }));
        orig(u);
      };
      const s = window.__speech;
      s.reset(); s.speak('Five times ten is fifteen. Let us count!');
      await new Promise((r) => setTimeout(r, 400));
      s.reset(); s.speak('Is that right? True, or false?');
      await new Promise((r) => setTimeout(r, 6000));
      speechSynthesis.speak = orig;
      return log;
    });

    // CI runners have no speech engine at all, so every utterance errors with
    // something like 'synthesis-unavailable'. That is not the bug under test.
    const unavailable = result.some((e) => e.ev === 'error'
      && e.why && e.why !== 'interrupted' && e.why !== 'canceled');
    test.skip(unavailable, 'no speech engine on this machine');

    // every phrase of the line spoken after the reset must survive
    for (const want of ['Is that right?', 'True, or false?']) {
      const submitted = result.some((e) => e.ev === 'submit' && e.text === want);
      // only an INTERRUPTION means the cancel window ate it
      const killed = result.some((e) => e.ev === 'error' && e.text === want
        && (e.why === 'interrupted' || e.why === 'canceled'));
      expect(submitted, `"${want}" was never submitted`).toBe(true);
      expect(killed, `"${want}" was cancelled mid-flight`).toBe(false);
    }
  });

  // A sentence is either fully spoken or not spoken at all: shedding backlog
  // must never remove the middle of one.
  test('backlog sheds whole lines, never half a sentence', async ({ page }) => {
    await boot(page);
    const spoken = await page.evaluate(async () => {
      const log = [];
      const orig = speechSynthesis.speak.bind(speechSynthesis);
      speechSynthesis.speak = (u) => { log.push(u.text); orig(u); };
      const s = window.__speech;
      s.reset();
      s.speak('First line. Second part of first.');
      for (let i = 1; i <= 8; i++) s.speak(`${i * 10}.`);
      s.speak('The question. Is that right?');
      // Wait for the queue to DRAIN rather than for a fixed stretch of wall
      // clock: real synthesis is slower on a loaded machine, and a fixed wait
      // made this flaky in a full run while passing on its own.
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        const st = s.debugState();
        if (!st.groups && !st.speaking) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      speechSynthesis.speak = orig;
      return log;
    });
    // With no speech engine the queue drains instantly and shedding differs;
    // the property under test is about a working engine.
    test.skip(!spoken.length, 'no speech engine on this machine');

    // the newest line always survives, whole
    expect(spoken).toContain('The question.');
    expect(spoken).toContain('Is that right?');
    // and no line is represented by only its tail
    if (spoken.includes('Second part of first.')) expect(spoken).toContain('First line.');
  });
});

test.describe('teardown', () => {
  // The regression guard for the timer leak: leaving mid-round must not let a
  // pending setTimeout fire against a torn-down game.
  test('leaving a game mid-round is clean, and games can be re-entered', async ({ page }) => {
    const errors = await boot(page);

    for (const [id, hook] of [
      ['block-builder', '__bb'],
      ['spot-the-wrongun', '__stw'],
    ]) {
      await pick(page, id, hook);
      await page.locator('#btn-back').click();
      await expect(page.locator('#hub')).toBeVisible();
      // the game must remove its own debug hooks on teardown
      expect(await page.evaluate((h) => typeof window[h], hook)).toBe('undefined');
    }

    // Re-enter the first game — a leaked timer from the earlier visit would
    // fire around now and throw against a null round.
    await pick(page, 'block-builder', '__bb');
    const round = await state(page, '__bb');
    await page.evaluate(({ C, R }) => window.__place(0, 0) && C && R, round);
    await page.waitForTimeout(1500);
    expect(errors).toEqual([]);
  });

  // The commutativity rotate animates on its own requestAnimationFrame chain,
  // outside the engine loop and outside the cancellable timer pool, so leaving
  // mid-spin left it running against a torn-down round.
  test('leaving during the commutativity rotate does not throw', async ({ page }) => {
    const errors = await boot(page);
    await pick(page, 'block-builder', '__bb');

    // play a multiplication round through to the rotate offer
    for (let attempt = 0; attempt < 4; attempt++) {
      const r = await state(page, '__bb');
      await page.evaluate(({ C, R }) => {
        for (let c = 0; c < C; c++) for (let x = 0; x < R; x++) window.__place(c, x);
      }, r);
      await waitForState(page, '__bb', "s.phase === 'asking'");
      await answer(page, (await state(page, '__bb')).answer);
      await waitForState(page, '__bb', "s.phase === 'rotate' || s.phase === 'next'");
      if ((await state(page, '__bb')).phase === 'rotate') break;
      await page.locator('#btn-confirm').click();          // Next -> another round
      await waitForState(page, '__bb', "s.phase === 'building'");
    }
    expect((await state(page, '__bb')).phase).toBe('rotate');

    // Both clicks in ONE evaluate: going through Playwright adds enough
    // round-trip latency for the 750ms spin to finish first, which is how this
    // bug hid from an earlier version of this test.
    await page.evaluate(() => {
      document.getElementById('btn-confirm').click();      // start the spin
      document.getElementById('btn-back').click();         // ...and bail mid-spin
    });
    await expect(page.locator('#hub')).toBeVisible();
    await page.waitForTimeout(1500);                       // outlive the 750ms spin
    expect(errors).toEqual([]);
  });

  test('answering then immediately leaving does not throw', async ({ page }) => {
    const errors = await boot(page);
    await pick(page, 'block-builder', '__bb');

    const round = await state(page, '__bb');
    await page.evaluate(({ C, R }) => {
      for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) window.__place(c, r);
    }, round);
    await waitForState(page, '__bb', "s.phase === 'asking'");
    await answer(page, (await state(page, '__bb')).answer);

    // Bail out during the reveal, while timers are still pending.
    await page.locator('#btn-back').click();
    await expect(page.locator('#hub')).toBeVisible();
    await page.waitForTimeout(2000); // outlive every pending timeout
    expect(errors).toEqual([]);
  });
});
