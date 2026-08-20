// core/terrain.js — Procedural background terrain & mountain ranges.
// Generates voxel-styled background mountains, snow-capped peaks, rolling hills,
// desert mesas, nether spires, and end void structures.

import * as THREE from 'three';

const BLOCK_XZ = 3.2;
const BLOCK_Y = 1.8;

export function createBackgroundTerrain({ scene, textures }) {
  const containerGroup = new THREE.Group();
  containerGroup.name = 'background-terrain';
  scene.add(containerGroup);

  let currentGroup = null;

  function disposeCurrent() {
    if (!currentGroup) return;
    containerGroup.remove(currentGroup);
    currentGroup.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m && m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
    currentGroup = null;
  }

  function buildTerrainForBiome(biome) {
    disposeCurrent();

    const style = biome.mountainStyle || 'hills';
    if (style === 'none') return;

    currentGroup = new THREE.Group();
    currentGroup.name = `terrain-${biome.id}`;

    // Select materials matching the biome
    const topTex = textures[biome.topTexKey] || textures.platGrassTex;
    const sideTex = textures[biome.sideTexKey] || textures.platDirtTex;

    const topMat = new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.85, metalness: 0 });
    const sideMat = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.9, metalness: 0 });
    const snowMat = new THREE.MeshStandardMaterial({ map: textures.platSnowTex, roughness: 0.85, metalness: 0 });

    // Grid coordinates for distant background (placed further back on horizon)
    const X_MIN = -90, X_MAX = 90;
    const Z_MIN = -85, Z_MAX = -42;
    const cols = Math.floor((X_MAX - X_MIN) / BLOCK_XZ);
    const rows = Math.floor((Z_MAX - Z_MIN) / BLOCK_XZ);

    const bodyTransforms = [];
    const topTransforms = [];
    const snowCapTransforms = [];

    const m4 = new THREE.Matrix4();

    for (let r = 0; r < rows; r++) {
      const z = Z_MIN + r * BLOCK_XZ;
      for (let c = 0; c < cols; c++) {
        const x = X_MIN + c * BLOCK_XZ;

        let heightLayers = 0;
        let isSnowPeak = false;

        if (style === 'flat') {
          // Flat grasslands: low subtle horizon rise
          const n = Math.sin(x * 0.05) * Math.cos(z * 0.05);
          heightLayers = n > 0.6 ? 1 : 0;
        } else if (style === 'hills') {
          // Rolling home hills: gentle green background hills (1 to 3 layers)
          const wave = Math.sin(x * 0.06) * Math.cos(z * 0.07) + Math.sin(x * 0.03 + z * 0.03);
          heightLayers = Math.max(1, Math.floor(1.2 + wave * 1.5));
        } else if (style === 'forest_mountains') {
          // Forested mountain range: 2 to 5 layers
          const wave = Math.sin(x * 0.05) * Math.sin((z + 10) * 0.06) + Math.cos(x * 0.03);
          heightLayers = Math.max(1, Math.floor(2.0 + wave * 2.2));
        } else if (style === 'mesas') {
          // Desert canyon mesas: stepped flat top plateaus
          const wave = Math.sin(x * 0.05) * Math.cos(z * 0.06);
          const rawH = Math.floor(2.0 + wave * 3.0);
          heightLayers = rawH > 3 ? 4 : rawH > 1 ? 2 : 1;
        } else if (style === 'snow_peaks') {
          // Towering snow-capped mountain peaks along the horizon
          const peak1 = Math.max(0, 1 - Math.hypot(x + 50, z + 65) / 35);
          const peak2 = Math.max(0, 1 - Math.hypot(x + 15, z + 70) / 40);
          const peak3 = Math.max(0, 1 - Math.hypot(x - 22, z + 60) / 32);
          const peak4 = Math.max(0, 1 - Math.hypot(x - 55, z + 68) / 36);
          const maxPeak = Math.max(peak1, peak2, peak3, peak4);

          const ridgeNoise = (Math.sin(x * 0.1) * Math.cos(z * 0.1) + 1) * 0.15;
          const hVal = (maxPeak + ridgeNoise) * 8.0;
          heightLayers = Math.max(1, Math.floor(hVal));
          if (heightLayers >= 4) isSnowPeak = true;
        } else if (style === 'nether_spires') {
          // Nether jagged spires
          const spire = Math.abs(Math.sin(x * 0.12) * Math.cos(z * 0.12));
          heightLayers = spire > 0.5 ? Math.floor(spire * 6) : 1;
        } else if (style === 'end_void') {
          // Floating end stone island peaks
          const island = Math.sin(x * 0.06) * Math.cos(z * 0.06);
          heightLayers = island > 0.25 ? Math.floor(island * 5) : 0;
        }

        if (heightLayers <= 0) continue;

        // Build continuous column from ground Y=-3.2 up to heightLayers
        for (let y = 0; y < heightLayers; y++) {
          const posY = y * BLOCK_Y - 3.2;
          m4.makeTranslation(x, posY, z);

          const isTop = (y === heightLayers - 1);
          if (isTop) {
            if (style === 'snow_peaks' && isSnowPeak && y >= 3) {
              snowCapTransforms.push(m4.clone());
            } else {
              topTransforms.push(m4.clone());
            }
          } else {
            bodyTransforms.push(m4.clone());
          }
        }
      }
    }

    const boxGeo = new THREE.BoxGeometry(BLOCK_XZ, BLOCK_Y, BLOCK_XZ);
    // Multi-material geometry: top face uses topMat/snowMat, sides & bottom use sideMat
    const topBoxMaterials = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
    const snowBoxMaterials = [sideMat, sideMat, snowMat, sideMat, sideMat, sideMat];

    // 1. Body blocks
    if (bodyTransforms.length > 0) {
      const bodyMesh = new THREE.InstancedMesh(boxGeo, sideMat, bodyTransforms.length);
      bodyTransforms.forEach((mat, i) => bodyMesh.setMatrixAt(i, mat));
      bodyMesh.instanceMatrix.needsUpdate = true;
      bodyMesh.castShadow = false;
      bodyMesh.receiveShadow = false;
      currentGroup.add(bodyMesh);
    }

    // 2. Top surface blocks
    if (topTransforms.length > 0) {
      const topMesh = new THREE.InstancedMesh(boxGeo, topBoxMaterials, topTransforms.length);
      topTransforms.forEach((mat, i) => topMesh.setMatrixAt(i, mat));
      topMesh.instanceMatrix.needsUpdate = true;
      topMesh.castShadow = false;
      topMesh.receiveShadow = false;
      currentGroup.add(topMesh);
    }

    // 3. Snow-capped peak blocks
    if (snowCapTransforms.length > 0) {
      const snowCapMesh = new THREE.InstancedMesh(boxGeo, snowBoxMaterials, snowCapTransforms.length);
      snowCapTransforms.forEach((mat, i) => snowCapMesh.setMatrixAt(i, mat));
      snowCapMesh.instanceMatrix.needsUpdate = true;
      snowCapMesh.castShadow = false;
      snowCapMesh.receiveShadow = false;
      currentGroup.add(snowCapMesh);
    }

    containerGroup.add(currentGroup);
  }

  return {
    group: containerGroup,
    updateBiome: (biome) => buildTerrainForBiome(biome),
    dispose: disposeCurrent,
  };
}
