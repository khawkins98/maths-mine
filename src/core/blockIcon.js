// core/blockIcon.js — draws an isometric block as a data URL, for the hub cards.
//
// The cards used emoji (a brick, a die, a detective), which had nothing to do
// with what the games are made of. Each game now shows its own material, and
// the three of them read as a progression a Minecraft player already knows:
//
//   dirt and grass  ->  stone  ->  emerald
//
// Drawn rather than shipped as images: the palettes come from the same place as
// the in-game textures, so the icon cannot drift away from the block it stands
// for, and there are no binaries in the repo.

const SPECKLE = 26; // pixel flecks per face, matching the blocks' chunky look

// `top`, `left`, `right` are the three visible faces, lightest to darkest.
export function blockIconDataURL({ top, left, right, fleckTop, fleckSide }, size = 128) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d');
  const S = size;

  // A proper isometric cube. `w` is the half-width of the lid rhombus; its
  // depth is 2*(w/2) = w, and the walls stand `h` tall. The first attempt made
  // the walls shorter than the lid was deep, which reads as a flat slab rather
  // than a block.
  const cx = S * 0.5;
  const w = S * 0.36;
  const y0 = S * 0.10;      // apex of the lid
  const h = S * 0.40;       // wall height
  const midY = y0 + w / 2;  // the lid's left/right corners
  const lidY = y0 + w;      // the lid's near corner, where the walls meet

  const LID = [[cx, y0], [cx + w, midY], [cx, lidY], [cx - w, midY]];
  const LEFT = [[cx - w, midY], [cx, lidY], [cx, lidY + h], [cx - w, midY + h]];
  const RIGHT = [[cx + w, midY], [cx, lidY], [cx, lidY + h], [cx + w, midY + h]];

  const path = (pts) => {
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
  };
  const face = (pts, fill) => { path(pts); c.fillStyle = fill; c.fill(); };

  face(LID, top);
  face(LEFT, left);
  face(RIGHT, right);

  // chunky flecks, clipped to each face so the pixel character carries over
  const speckle = (pts, colours) => {
    c.save();
    path(pts);
    c.clip();
    const px = S / 16;
    for (let i = 0; i < SPECKLE; i++) {
      c.fillStyle = colours[(Math.random() * colours.length) | 0];
      c.fillRect(
        Math.round((Math.random() * S) / px) * px,
        Math.round((Math.random() * S) / px) * px,
        px, px,
      );
    }
    c.restore();
  };
  speckle(LID, fleckTop);
  speckle(LEFT, fleckSide);
  speckle(RIGHT, fleckSide);

  // dark outline, the same seam the in-game blocks carry
  c.strokeStyle = 'rgba(26, 15, 6, 0.55)';
  c.lineWidth = Math.max(2, S * 0.022);
  c.lineJoin = 'round';
  for (const pts of [LID, LEFT, RIGHT]) { path(pts); c.stroke(); }

  return cv.toDataURL('image/png');
}

// The three materials, in the order the games step through them.
export const ICON_PALETTES = {
  dirt: {
    top: '#57ab3b', left: '#7a4622', right: '#5f3519',
    fleckTop: ['#4a962f', '#69c24a', '#3f8a2a'],
    fleckSide: ['#623718', '#8a5730', '#4f2c13'],
  },
  stone: {
    top: '#b0b0ad', left: '#9d9d9a', right: '#7e7e7b',
    fleckTop: ['#a3a3a0', '#bcbcb9', '#949491'],
    fleckSide: ['#8d8d8a', '#adadaa', '#6f6f6c'],
  },
  emerald: {
    top: '#41d47f', left: '#2fbf6d', right: '#22a05a',
    fleckTop: ['#35c471', '#5ae596', '#2bb267'],
    fleckSide: ['#27a95e', '#41d47f', '#1e9152'],
  },
};
