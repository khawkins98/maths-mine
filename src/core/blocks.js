// core/blocks.js — the voxel array block, shared by every game that draws a
// multiplication array out of blocks (Block Builder and Spot the Wrong'un).
//
// A block is a rounded dirt body with a flat cap on top. The cap swaps between
// dirt and grass so only the EXPOSED top of a wall is grassy and the interior
// reads as solid earth — the detail that makes a stack look Minecraft-ish
// rather than like floating cubes.
//
// The kit owns its two geometries and hands back a `sharedGeos` set so a game's
// teardown can tell "my per-round geometry" (dispose it) from "the kit's"
// (dispose once, via kit.dispose()).
//
//   const blocks = createBlockKit(ctx.textures);
//   const b = blocks.makeBlock();
//   blocks.setCapGrass(b, true);
//   // teardown: blocks.dispose()

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const CELL = 1.0;              // grid spacing
// Inset within its cell, so neighbouring blocks are separated by a visible
// gap rather than fusing into one slab. Widened from 0.92 after playtesting:
// a six-tall column read as a single column of dirt and could not be counted.
export const BLOCK = CELL * 0.86;
export const CAP_H = 0.2 * BLOCK;     // grass cap thickness
export const BODY_H = BLOCK - CAP_H;  // dirt body height

export function createBlockKit(textures) {
  const { dirtTex, grassTex } = textures;

  const bodyGeo = new RoundedBoxGeometry(BLOCK, BODY_H, BLOCK, 2, 0.03);
  const capGeo = new THREE.BoxGeometry(BLOCK, CAP_H, BLOCK);
  const sharedGeos = new Set([bodyGeo, capGeo]);

  // Each block gets its own slightly jittered material so a wall has natural
  // variation instead of looking like one flat repeated texture.
  function jittered(map) {
    const m = new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0 });
    m.color.offsetHSL(
      (Math.random() - 0.5) * 0.02,
      (Math.random() - 0.5) * 0.05,
      (Math.random() - 0.5) * 0.06,
    );
    return m;
  }

  function makeBlock() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, jittered(dirtTex));
    body.position.y = -BLOCK / 2 + BODY_H / 2;
    const cap = new THREE.Mesh(capGeo, jittered(grassTex));
    cap.position.y = BLOCK / 2 - CAP_H / 2;
    body.castShadow = cap.castShadow = true;
    body.receiveShadow = true;
    g.add(body, cap);
    g.userData.cap = cap;
    setCapGrass(g, false); // capped dirt until something is known to sit on top
    return g;
  }

  // Grass on top, dirt inside. The slight scale-up on grass gives the wall a
  // rim that catches the light along its exposed edge.
  function setCapGrass(block, grassy) {
    const cap = block.userData.cap;
    cap.material.map = grassy ? grassTex : dirtTex;
    const s = grassy ? 1.045 : 0.995;
    cap.scale.set(s, 1, s);
  }

  function dispose() { bodyGeo.dispose(); capGeo.dispose(); }

  return { makeBlock, setCapGrass, sharedGeos, dispose, bodyGeo, capGeo };
}
