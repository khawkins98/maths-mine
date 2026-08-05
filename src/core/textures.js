// core/textures.js — procedural CanvasTextures (no image assets).
// Chunky Minecraft-style HARD-PIXEL textures via NearestFilter for the
// dirt/grass blocks, dice pips, dice tray wood; a soft round puff (dust +
// Bolt's blob shadow), a crisp pixel slot tile for the empty mold cells, a soft
// ground texture, and the sky gradient.
//
// createTextures() returns a bag of ready-to-use THREE.CanvasTexture objects.
// These are SHARED and long-lived: games must NOT dispose them on teardown.

import * as THREE from 'three';

export function makeCanvasTex(size, draw, { nearest = true, repeat = 0 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (nearest) { tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; }
  if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat, repeat); }
  return tex;
}

// 64x64 base colour + chunky 4-8px flecks — NearestFilter keeps it pixel-crisp.
// (Kept for the platform tiles, which want a denser scatter than the blocks.)
export function fleckTex(base, flecks, n = 80, opts) {
  return makeCanvasTex(64, (ctx) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = flecks[(Math.random() * flecks.length) | 0];
      const s = 4 + ((Math.random() * 5) | 0);
      ctx.fillRect((Math.random() * 64) | 0, (Math.random() * 64) | 0, s, s);
    }
  }, opts);
}

// HARD-PIXEL block texture: a strict CELL-aligned grid so every texel is a solid
// chunky square (true Minecraft look). `bias` weights how often a cell keeps the
// base colour vs. a fleck. NearestFilter + no mipmaps keeps the edges razor
// sharp; high-contrast palettes read crisp instead of smudgy.
export function pixelTex(base, palette, { size = 64, cell = 8, bias = 0.6, edge = 0 } = {}) {
  return makeCanvasTex(size, (ctx) => {
    for (let y = 0; y < size; y += cell) {
      for (let x = 0; x < size; x += cell) {
        ctx.fillStyle = Math.random() < bias ? base : palette[(Math.random() * palette.length) | 0];
        ctx.fillRect(x, y, cell, cell);
      }
    }
    // Optional darkened rim. Each block face maps exactly one copy of this
    // texture, so a border here draws an outline around every individual cube.
    // Without it a stacked column of dirt reads as one solid slab and a child
    // cannot count the blocks, which is the entire point of the array.
    if (edge > 0) {
      const b = cell * 0.75; // thinner than a full texel: a seam, not a frame
      ctx.fillStyle = `rgba(30, 17, 7, ${edge})`;
      ctx.fillRect(0, 0, size, b);
      ctx.fillRect(0, size - b, size, b);
      ctx.fillRect(0, 0, b, size);
      ctx.fillRect(size - b, 0, b, size);
    }
  }, { nearest: true });
}

export function createTextures() {
  // --- game blocks: chunky, high-contrast, hard-pixel (match platform texel) ---
  const dirtTex = pixelTex('#7a4622', ['#623718', '#8a5730', '#4f2c13', '#96633a'], { cell: 8, bias: 0.55, edge: 0.42 });
  const grassTex = pixelTex('#57ab3b', ['#4a962f', '#69c24a', '#3f8a2a', '#7ad257'], { cell: 8, bias: 0.55, edge: 0.3 });
  // stone counters for Shake-a-Batch: deliberately plain, because their whole
  // job is to be counted. Same rim treatment as the dirt blocks so each one
  // reads as a separate cube in a grid.
  const stoneTex = pixelTex('#9d9d9a', ['#8d8d8a', '#adadaa', '#7f7f7c', '#b6b6b3'], { cell: 8, bias: 0.6, edge: 0.34 });
  // emerald, for Spot the Wrong'un: the array a child counts there is the most
  // advanced of the three, so it is made of the most precious block.
  const emeraldTex = pixelTex('#2fbf6d', ['#27a95e', '#41d47f', '#1e9152', '#59e493'], { cell: 8, bias: 0.55, edge: 0.4 });
  const emeraldTopTex = pixelTex('#41d47f', ['#35c471', '#5ae596', '#2bb267', '#77f0ad'], { cell: 8, bias: 0.55, edge: 0.32 });
  // subtle ground texture (soft-filtered so it doesn't shimmer at distance)
  const groundTex = fleckTex('#7CC860', ['#74C158', '#84D06A', '#6FBE52'], 60, { nearest: false, repeat: 42 });
  // soft round puff, used for dust sprites + Bolt's blob shadow
  const puffTex = makeCanvasTex(64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  }, { nearest: false });
  // crisp pixel slot tile for the empty mold cells — a hard-edged hollow square
  // (no soft white glow): a faint fill + a chunky pixel frame, NearestFilter.
  const slotTex = makeCanvasTex(32, (ctx) => {
    ctx.clearRect(0, 0, 32, 32);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(4, 4, 24, 24);            // faint inner fill
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillRect(4, 4, 24, 4);             // top edge
    ctx.fillRect(4, 24, 24, 4);            // bottom edge
    ctx.fillRect(4, 4, 4, 24);             // left edge
    ctx.fillRect(24, 4, 4, 24);            // right edge
  }, { nearest: true });
  // daytime sky: a near-flat pale Minecraft blue with a very subtle 2-band.
  const skyTex = makeCanvasTex(8, (ctx) => {
    ctx.fillStyle = '#88C4EF'; ctx.fillRect(0, 0, 8, 5);
    ctx.fillStyle = '#A6D6F4'; ctx.fillRect(0, 5, 8, 3);
  }, { nearest: false });

  // --- wood plank texture (dice tray, and any wooden prop) — hard pixel ---
  // Horizontal planks with a darker seam every few rows + chunky grain flecks.
  const woodTex = makeCanvasTex(64, (ctx) => {
    const planks = ['#9c6b39', '#8a5d30', '#a5743f', '#946434'];
    const plankH = 16;
    for (let py = 0; py < 64; py += plankH) {
      ctx.fillStyle = planks[((py / plankH) | 0) % planks.length];
      ctx.fillRect(0, py, 64, plankH);
      // grain flecks (chunky, aligned to a 4px grid)
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = Math.random() < 0.5 ? 'rgba(90,55,25,0.5)' : 'rgba(180,130,80,0.4)';
        const gx = ((Math.random() * 16) | 0) * 4;
        const gy = py + ((Math.random() * (plankH / 4)) | 0) * 4;
        ctx.fillRect(gx, gy, 4 + 4 * ((Math.random() * 2) | 0), 4);
      }
      // dark seam between planks
      ctx.fillStyle = 'rgba(60,38,18,0.85)';
      ctx.fillRect(0, py + plankH - 2, 64, 2);
    }
  }, { nearest: true });

  // ---- voxel build-plot textures (NOT the shared 1-block dirt/grass above) ----
  // Separate, RepeatWrapping-enabled instances so the platform can tile its faces
  // without mutating the game blocks' textures (which keep repeat 1,1). Chunky
  // pixels via NearestFilter, same texel style as the game blocks.
  const platGrassTex = fleckTex('#5FBF4A', ['#4EA83C', '#78D060', '#57B742', '#69C853'], 120);
  platGrassTex.wrapS = platGrassTex.wrapT = THREE.RepeatWrapping;
  const platDirtTex = fleckTex('#8B5A2B', ['#7A4A22', '#9C6B38', '#6B4226', '#5C3A1F'], 120);
  platDirtTex.wrapS = platDirtTex.wrapT = THREE.RepeatWrapping;

  return { dirtTex, grassTex, stoneTex, emeraldTex, emeraldTopTex, groundTex, puffTex, slotTex, skyTex, woodTex, platGrassTex, platDirtTex };
}
