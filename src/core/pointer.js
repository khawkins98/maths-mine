// core/pointer.js — unified pointer + touch input for a game.
//
// Games only ever care about "a finger/mouse went down / moved / came up at
// these screen coordinates". Getting there previously meant six hand-written
// adapter functions per game and a matching six-line removal in teardown — a
// pairing that leaks the moment the two lists drift apart.
//
//   const input = createPointerInput(ctx.renderer.domElement, {
//     onDown: (x, y) => …,
//     onMove: (x, y) => …,
//     onUp:   () => …,
//   });
//   function start()    { input.attach(); }
//   function teardown() { input.detach(); }
//
// Down/start binds to the canvas (so HUD taps don't fall through to the game);
// move and up bind to the window (so a drag that leaves the canvas still
// tracks, and a release anywhere still ends the drag).

const noop = () => {};

export function createPointerInput(dom, { onDown = noop, onMove = noop, onUp = noop } = {}) {
  const hPointerDown = (e) => onDown(e.clientX, e.clientY);
  const hPointerMove = (e) => onMove(e.clientX, e.clientY);
  const hPointerUp = () => onUp();
  const hTouchStart = (e) => { const t = e.touches[0]; if (t) onDown(t.clientX, t.clientY); };
  const hTouchMove = (e) => { const t = e.touches[0]; if (t) onMove(t.clientX, t.clientY); };
  const hTouchEnd = () => onUp();

  let attached = false;

  function attach() {
    if (attached) return;
    attached = true;
    dom.addEventListener('pointerdown', hPointerDown);
    window.addEventListener('pointermove', hPointerMove);
    window.addEventListener('pointerup', hPointerUp);
    dom.addEventListener('touchstart', hTouchStart, { passive: true });
    window.addEventListener('touchmove', hTouchMove, { passive: true });
    window.addEventListener('touchend', hTouchEnd);
  }

  function detach() {
    if (!attached) return;
    attached = false;
    dom.removeEventListener('pointerdown', hPointerDown);
    window.removeEventListener('pointermove', hPointerMove);
    window.removeEventListener('pointerup', hPointerUp);
    dom.removeEventListener('touchstart', hTouchStart);
    window.removeEventListener('touchmove', hTouchMove);
    window.removeEventListener('touchend', hTouchEnd);
  }

  return { attach, detach };
}
