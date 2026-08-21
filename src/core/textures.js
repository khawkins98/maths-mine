// core/textures.js — shared authored world tiles plus procedural UI/fx textures.
// Chunky Minecraft-style HARD-PIXEL textures via NearestFilter for the
// dirt/grass blocks, dice pips, dice tray wood; a soft round puff (dust +
// Bolt's blob shadow), a crisp pixel slot tile for the empty mold cells, a soft
// ground texture, and the sky gradient.
//
// createTextures() returns a bag of ready-to-use THREE.CanvasTexture objects.
// These are SHARED and long-lived: games must NOT dispose them on teardown.

import * as THREE from 'three';

export const WORLD_TEXTURE_SPEC = Object.freeze({
  tileSize: 16,
  colorSpace: 'srgb',
  magFilter: 'nearest',
  minFilter: 'nearest',
  generateMipmaps: false,
  terrainWrap: 'repeat',
  lighting: 'top-left highlight, bottom-right shade',
});

const WORLD_TILE_BASE = `${import.meta.env.BASE_URL}assets/textures/world/`;
const worldLoader = new THREE.TextureLoader();

// A tile that fails to load must not take the app down with it. Paint a
// stand-in at the spec's tile size, keyed off the name so the same missing
// tile is always the same colour and the world stays readable rather than
// going black or invisible.
function paintMissingTile(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  const size = WORLD_TEXTURE_SPEC.tileSize;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = `hsl(${hue} 32% 46%)`;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = `hsl(${hue} 32% 38%)`;
  for (let i = 0; i < size * 2; i++) {
    ctx.fillRect((hash >> (i % 12)) % size, (hash >> ((i + 5) % 12)) % size, 1, 1);
    hash = (hash * 1103515245 + 12345) >>> 0;
  }
  return cv;
}

export function loadWorldTile(name, { repeat = false } = {}) {
  let settle;
  // Resolves either way: a missing tile is reported through the resolved value,
  // never as a rejection. `textures.ready` is awaited at module scope during
  // boot, so a rejection here would be an unhandled throw and a blank screen.
  const ready = new Promise((resolve) => { settle = resolve; });
  // `tex` is declared before load() rather than assigned from its return value:
  // the error callback closes over it, and a loader that ever reported failure
  // synchronously would hit the temporal dead zone and throw a ReferenceError
  // out of the one path whose whole job is to not throw.
  let tex;
  tex = worldLoader.load(
    `${WORLD_TILE_BASE}${name}.png`,
    () => settle({ name, ok: true }),
    undefined,
    () => {
      if (tex) { tex.image = paintMissingTile(name); tex.needsUpdate = true; }
      settle({ name, ok: false });
    },
  );
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.userData.worldTile = name;
  tex.userData.tileSize = WORLD_TEXTURE_SPEC.tileSize;
  tex.userData.ready = ready;
  return tex;
}

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
  // --- coherent 16px world family (original generated source, curated tiles) ---
  const dirtTex = loadWorldTile('dirt');
  const grassTex = loadWorldTile('grass-top');
  const grassSideTex = loadWorldTile('grass-side');
  // stone blocks: plain stone texture with rim treatment so each one
  // reads as a separate cube in a grid.
  const stoneTex = loadWorldTile('stone');
  // emerald, for Spot the Wrong'un: the array a child counts there is the most
  // advanced of the three, so it is made of the most precious block.
  const emeraldTex = loadWorldTile('emerald');
  const emeraldTopTex = loadWorldTile('emerald');
  // subtle ground texture (soft-filtered so it doesn't shimmer at distance)
  const groundTex = fleckTex('#4ea830', ['#3e8d24', '#59bc38', '#32771d'], 60, { nearest: false, repeat: 42 });
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
  const woodTex = loadWorldTile('oak-planks');

  // Compact scenery uses its own higher-contrast atlases. These are original
  // textures, but follow the same 16px resource-pack discipline as the player
  // skin so bark and leaves read as authored assets rather than flat colours.
  const logTex = loadWorldTile('oak-bark');
  // End grain for Block Builder's oak structural timbers. A square ring and
  // central heartwood make the exposed face read as a cut log, not brown dirt.
  const logTopTex = loadWorldTile('oak-end');
  const birchLogTex = loadWorldTile('birch-bark');
  const leafTex = loadWorldTile('oak-leaves');
  const cactusTex = loadWorldTile('cactus');
  const netherStemTex = loadWorldTile('crimson-stem');
  const netherCapTex = loadWorldTile('crimson-cap');

  // House & Iron Golem reward textures
  const plankTex = loadWorldTile('oak-planks');
  const cobbleTex = loadWorldTile('cobblestone');
  const glassTex = loadWorldTile('glass');
  const ironBlockTex = loadWorldTile('iron');
  const ironGolemTex = pixelTex('#c5c8cb', ['#a2a5a8', '#e2e5e8', '#888b8e', '#9b3030', '#7a2222'], { size: 16, cell: 2, bias: 0.65 });
  const pumpkinTex = loadWorldTile('pumpkin');

  // Authentic Minecraft Blueprint & Village expansion textures
  const obsidianTex = loadWorldTile('obsidian');
  const diamondTex = loadWorldTile('diamond');
  const goldTex = loadWorldTile('gold');
  const redstoneTex = loadWorldTile('redstone');
  const brickTex = loadWorldTile('brick');
  const hayTex = loadWorldTile('hay');
  const lavaTex = loadWorldTile('lava');
  const portalTex = loadWorldTile('portal');

  // ---- voxel build-plot textures (NOT the shared 1-block dirt/grass above) ----
  // Separate, RepeatWrapping-enabled instances so the platform can tile its faces
  // without mutating the game blocks' textures (which keep repeat 1,1). Chunky
  // pixels via NearestFilter, same texel style as the game blocks.
  const platGrassTex = loadWorldTile('grass-top', { repeat: true });
  const platForestGrassTex = loadWorldTile('grass-top', { repeat: true });
  const platDirtTex = loadWorldTile('dirt', { repeat: true });
  const platSandTex = loadWorldTile('sand', { repeat: true });
  const platSandstoneTex = loadWorldTile('sandstone', { repeat: true });
  const platSnowTex = loadWorldTile('snow', { repeat: true });
  const platIceTex = loadWorldTile('ice', { repeat: true });
  const platNetherrackTex = loadWorldTile('netherrack', { repeat: true });
  const platEndstoneTex = loadWorldTile('end-stone', { repeat: true });
  const platObsidianTex = loadWorldTile('obsidian', { repeat: true });

  [platGrassTex, platForestGrassTex, platDirtTex, platSandTex, platSandstoneTex, platSnowTex, platNetherrackTex, platEndstoneTex, platObsidianTex].forEach((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  });

  const textures = {
    dirtTex, grassTex, grassSideTex, stoneTex, emeraldTex, emeraldTopTex, groundTex, puffTex, slotTex, skyTex, woodTex,
    logTex, logTopTex, birchLogTex, leafTex, cactusTex, netherStemTex, netherCapTex,
    plankTex, cobbleTex, glassTex, ironBlockTex, ironGolemTex, pumpkinTex,
    obsidianTex, diamondTex, goldTex, redstoneTex, brickTex, hayTex, lavaTex, portalTex,
    platGrassTex, platForestGrassTex, platDirtTex, platSandTex, platSandstoneTex, platSnowTex, platIceTex, platNetherrackTex, platEndstoneTex, platObsidianTex,
  };
  // Never rejects: every tile promise resolves with {name, ok}, and a tile that
  // failed has already had a stand-in painted into it. The app boots with a
  // patchy world rather than not booting at all.
  textures.ready = Promise.all(
    [...new Set(Object.values(textures).filter((tex) => tex?.userData?.ready))]
      .map((tex) => tex.userData.ready),
  ).then((results) => {
    // Dedupe by name: a few tiles are loaded into more than one texture, and a
    // report that says "dirt, dirt" reads like two separate failures.
    const missing = [...new Set(results.filter((r) => !r.ok).map((r) => r.name))];
    if (missing.length) console.warn(`World tiles unavailable; using fallbacks for: ${missing.join(', ')}`);
    textures.missingTiles = missing;
    return missing;
  });
  textures.missingTiles = [];
  return textures;
}
