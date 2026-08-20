// Deterministic continuous voxel terrain with a protected gameplay clearing.
import * as THREE from 'three';

export const TERRAIN_SEED = 0x4d415448;
export const TERRAIN_CELL = 2;
export const TERRAIN_X_RADIUS = 34;
export const TERRAIN_MIN_Z = -46;
export const TERRAIN_MAX_Z = 30;
export const PROTECTED_BOUNDS = Object.freeze({ minX: -12, maxX: 8, minZ: -8, maxZ: 6 });
export const ENVELOPE_BOUNDS = Object.freeze({ minX: -14, maxX: 10, minZ: -10, maxZ: 8 });
const TERRAIN_BASE_Y = -7;

function hash2(x, z, seed) {
  let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263) + seed) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function isInsideBounds(x, z, bounds = PROTECTED_BOUNDS) {
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

export function distanceFromEnvelope(x, z) {
  return Math.max(ENVELOPE_BOUNDS.minX - x, x - ENVELOPE_BOUNDS.maxX,
    ENVELOPE_BOUNDS.minZ - z, z - ENVELOPE_BOUNDS.maxZ, 0);
}

export function isTerrainDecorationAllowed(x, z) {
  return distanceFromEnvelope(x, z) >= TERRAIN_CELL * 2;
}

/** Pure production height model. The distance cap guarantees <= 1:1 slope. */
export function sampleTerrainHeight(x, z, { seed = TERRAIN_SEED, style = 'hills' } = {}) {
  const distance = distanceFromEnvelope(x, z);
  if (distance === 0) return 0;
  let amplitude = 3, bias = 0.25;
  if (style === 'flat') { amplitude = 1; bias = 0; }
  else if (style === 'forest_mountains') { amplitude = 4; bias = 0.7; }
  else if (style === 'mesas') { amplitude = 3.5; bias = 0.4; }
  else if (style === 'snow_peaks') { amplitude = 5; bias = 1; }
  else if (style === 'nether_spires') { amplitude = 4; bias = 0.2; }
  else if (style === 'end_void') { amplitude = 3.5; bias = 0.4; }
  // Seeded phases make this deterministic while the long wavelengths put a
  // strict upper bound below one vertical unit per TERRAIN_CELL step.
  const phaseX = hash2(0, 0, seed) * Math.PI * 2;
  const phaseZ = hash2(1, 1, seed) * Math.PI * 2;
  const broad = Math.sin(x / 24 + phaseX) * 0.7 + Math.cos(z / 22 + phaseZ) * 0.3;
  let desired = broad * amplitude + bias;
  if (style === 'nether_spires') desired += Math.max(0, Math.sin((x + z) / 30 + phaseZ));
  const maxRise = Math.floor(distance / TERRAIN_CELL);
  return Math.max(-maxRise, Math.min(maxRise, Math.round(desired)));
}

export function createProceduralTerrain({ scene, textures, seed = TERRAIN_SEED }) {
  const group = new THREE.Group();
  group.name = 'procedural-terrain';
  scene.add(group);
  let activeSeed = seed | 0;
  let current = null;
  let cacheKey = null;
  let disposed = false;
  let generation = 0;

  function disposeCurrent() {
    if (!current) return;
    group.remove(current.group);
    current.geometries.forEach((geometry) => geometry.dispose());
    current.materials.forEach((m) => m.dispose());
    current = null;
    cacheKey = null;
  }

  function build(biome) {
    const nextKey = `${activeSeed}:${biome.id}`;
    if (current && cacheKey === nextKey) return current.surface;
    disposeCurrent();
    disposed = false;
    const terrainGroup = new THREE.Group();
    terrainGroup.name = `terrain-${biome.id}`;
    const topMaterial = new THREE.MeshStandardMaterial({ map: textures[biome.topTexKey] || textures.platGrassTex, roughness: 0.9 });
    const sideMaterial = new THREE.MeshStandardMaterial({ map: textures[biome.sideTexKey] || textures.platDirtTex, roughness: 1 });
    const surfaceGeometry = new THREE.PlaneGeometry(TERRAIN_CELL, TERRAIN_CELL);
    surfaceGeometry.rotateX(-Math.PI / 2);
    const columns = [];
    for (let z = TERRAIN_MIN_Z; z <= TERRAIN_MAX_Z; z += TERRAIN_CELL) {
      for (let x = -TERRAIN_X_RADIUS; x <= TERRAIN_X_RADIUS; x += TERRAIN_CELL) {
        columns.push({ x, z, height: sampleTerrainHeight(x, z, { seed: activeSeed, style: biome.mountainStyle }) });
      }
    }
    const surface = new THREE.InstancedMesh(surfaceGeometry, topMaterial, columns.length);
    surface.name = 'terrain-surface';
    surface.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    columns.forEach(({ x, z, height }, index) => {
      matrix.compose(new THREE.Vector3(x, height, z), rotation, new THREE.Vector3(1, 1, 1));
      surface.setMatrixAt(index, matrix);
    });
    surface.instanceMatrix.needsUpdate = true;
    // Emit only exposed vertical faces, rather than drawing buried cube faces.
    const heightAt = new Map(columns.map((c) => [`${c.x},${c.z}`, c.height]));
    const sidePositions = [];
    const sideUvs = [];
    const addSide = (a, b, bottom) => {
      sidePositions.push(...a, ...b, b[0], bottom, b[2], ...a, b[0], bottom, b[2], a[0], bottom, a[2]);
      sideUvs.push(0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0);
    };
    for (const { x, z, height } of columns) {
      const half = TERRAIN_CELL / 2;
      const neighbours = [
        { key: `${x + TERRAIN_CELL},${z}`, a: [x + half, height, z - half], b: [x + half, height, z + half] },
        { key: `${x - TERRAIN_CELL},${z}`, a: [x - half, height, z + half], b: [x - half, height, z - half] },
        { key: `${x},${z + TERRAIN_CELL}`, a: [x + half, height, z + half], b: [x - half, height, z + half] },
        { key: `${x},${z - TERRAIN_CELL}`, a: [x - half, height, z - half], b: [x + half, height, z - half] },
      ];
      for (const neighbour of neighbours) {
        const adjacent = heightAt.has(neighbour.key) ? heightAt.get(neighbour.key) : TERRAIN_BASE_Y;
        if (adjacent < height) addSide(neighbour.a, neighbour.b, adjacent);
      }
    }
    const sideGeometry = new THREE.BufferGeometry();
    sideGeometry.setAttribute('position', new THREE.Float32BufferAttribute(sidePositions, 3));
    sideGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(sideUvs, 2));
    sideGeometry.computeVertexNormals();
    const sides = new THREE.Mesh(sideGeometry, sideMaterial);
    sides.name = 'terrain-sides';
    terrainGroup.add(sides, surface);
    group.add(terrainGroup);
    current = { group: terrainGroup, surface, geometries: [surfaceGeometry, sideGeometry], materials: [topMaterial, sideMaterial], columns };
    cacheKey = nextKey;
    generation += 1;
    return surface;
  }

  function setSeed(nextSeed, biome) {
    const normalized = Number.isFinite(nextSeed) ? nextSeed | 0 : TERRAIN_SEED;
    if (normalized === activeSeed) return current && current.surface;
    activeSeed = normalized;
    return biome ? build(biome) : null;
  }

  function dispose() {
    if (disposed) return;
    disposeCurrent();
    scene.remove(group);
    disposed = true;
  }

  return {
    group, build, setSeed, dispose,
    surface: () => current && current.surface,
    inspect: () => ({ seed: activeSeed, biomeKey: cacheKey, disposed,
      dimensions: { cell: TERRAIN_CELL, columnsX: TERRAIN_X_RADIUS + 1,
        columnsZ: (TERRAIN_MAX_Z - TERRAIN_MIN_Z) / TERRAIN_CELL + 1 },
      coverage: { minX: -TERRAIN_X_RADIUS - TERRAIN_CELL / 2, maxX: TERRAIN_X_RADIUS + TERRAIN_CELL / 2,
        minZ: TERRAIN_MIN_Z - TERRAIN_CELL / 2, maxZ: TERRAIN_MAX_Z + TERRAIN_CELL / 2 },
      bounds: { protected: PROTECTED_BOUNDS, envelope: ENVELOPE_BOUNDS },
      generation, columnCount: current ? current.columns.length : 0,
      meshCount: current ? current.group.children.length : 0,
      groundName: current ? current.surface.name : null }),
  };
}
