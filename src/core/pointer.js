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

export function createPointerInput(dom, {
  onDown = noop, onMove = noop, onUp = noop, onCancel = onUp,
} = {}) {
  let down = false;
  const begin = (x, y) => { down = true; onDown(x, y); };
  const finish = (fn) => { if (!down) return; down = false; fn(); };
  const hPointerDown = (e) => begin(e.clientX, e.clientY);
  const hPointerMove = (e) => onMove(e.clientX, e.clientY);
  const hPointerUp = () => finish(onUp);
  const hPointerCancel = () => finish(onCancel);
  const hTouchStart = (e) => { const t = e.touches[0]; if (t) begin(t.clientX, t.clientY); };
  const hTouchMove = (e) => { const t = e.touches[0]; if (t) onMove(t.clientX, t.clientY); };
  const hTouchEnd = hPointerUp;

  let attached = false;
  const pointerEvents = typeof window !== 'undefined' && typeof window.PointerEvent === 'function';

  function attach() {
    if (attached) return;
    attached = true;
    if (pointerEvents) {
      dom.addEventListener('pointerdown', hPointerDown);
      window.addEventListener('pointermove', hPointerMove);
      window.addEventListener('pointerup', hPointerUp);
      window.addEventListener('pointercancel', hPointerCancel);
    } else {
      dom.addEventListener('touchstart', hTouchStart, { passive: true });
      window.addEventListener('touchmove', hTouchMove, { passive: true });
      window.addEventListener('touchend', hTouchEnd);
      window.addEventListener('touchcancel', hPointerCancel);
    }
    window.addEventListener('blur', hPointerCancel);
  }

  function detach() {
    if (!attached) return;
    attached = false;
    if (pointerEvents) {
      dom.removeEventListener('pointerdown', hPointerDown);
      window.removeEventListener('pointermove', hPointerMove);
      window.removeEventListener('pointerup', hPointerUp);
      window.removeEventListener('pointercancel', hPointerCancel);
    } else {
      dom.removeEventListener('touchstart', hTouchStart);
      window.removeEventListener('touchmove', hTouchMove);
      window.removeEventListener('touchend', hTouchEnd);
      window.removeEventListener('touchcancel', hPointerCancel);
    }
    window.removeEventListener('blur', hPointerCancel);
    down = false;
  }

  return { attach, detach };
}
