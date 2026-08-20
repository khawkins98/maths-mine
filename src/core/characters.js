// Shared, professionally-authored block-character assets.
// Kenney's pack uses one small rigid-part model and interchangeable skins.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const SKINS = ['a', 'b', 'c', 'e', 'f', 'k', 'm', 'q', 'steve'];
const BASE = `${import.meta.env.BASE_URL}assets/characters/`;
const FALLBACK_COLORS = {
  a: 0x67a9d8, b: 0xd49a67, c: 0x7fb069, e: 0xb77ac4,
  f: 0xd66f6f, k: 0xe2bf63, m: 0x6f83bd, q: 0x79b7a5,
  steve: 0x49a9b8,
};

function prepareTexture(texture) {
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  // Kenney's UVs intentionally extend outside 0–1; glTF samplers repeat by
  // default, while manually loaded Three textures otherwise clamp and smear a
  // dark atlas edge across faces and clothing.
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function proceduralAssets() {
  const geometries = {
    head: new THREE.BoxGeometry(0.62, 0.62, 0.62),
    body: new THREE.BoxGeometry(0.66, 0.72, 0.34),
    arm: new THREE.BoxGeometry(0.22, 0.72, 0.22),
    leg: new THREE.BoxGeometry(0.25, 0.68, 0.25),
  };
  const sharedGeometries = new Set(Object.values(geometries));

  function create(skin = 'steve') {
    const model = new THREE.Group();
    model.name = 'character-fallback';
    const material = new THREE.MeshStandardMaterial({
      color: FALLBACK_COLORS[skin] || FALLBACK_COLORS.steve,
      roughness: 0.92,
      metalness: 0,
    });
    material.userData.characterSkin = true;

    const body = new THREE.Mesh(geometries.body, material);
    body.position.y = 1.04;
    const neck = new THREE.Group();
    neck.position.y = 1.68;
    neck.add(new THREE.Mesh(geometries.head, material));
    const shoulders = { '-1': new THREE.Group(), '1': new THREE.Group() };
    shoulders['-1'].position.set(-0.45, 1.35, 0);
    shoulders['1'].position.set(0.45, 1.35, 0);
    shoulders['-1'].add(new THREE.Mesh(geometries.arm, material));
    shoulders['1'].add(new THREE.Mesh(geometries.arm, material));
    const hips = { '-1': new THREE.Group(), '1': new THREE.Group() };
    hips['-1'].position.set(-0.18, 0.68, 0);
    hips['1'].position.set(0.18, 0.68, 0);
    hips['-1'].add(new THREE.Mesh(geometries.leg, material));
    hips['1'].add(new THREE.Mesh(geometries.leg, material));
    model.add(body, neck, shoulders['-1'], shoulders['1'], hips['-1'], hips['1']);
    model.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
    });
    model.userData.joints = { neck, shoulders, hips, body, eyes: [] };
    return model;
  }

  return { create, geometries: sharedGeometries, textures: {}, clips: [] };
}

export async function loadCharacterAssets() {
  const results = await Promise.allSettled([
    new GLTFLoader().loadAsync(`${BASE}character.glb`),
    ...SKINS.map((skin) => new THREE.TextureLoader().loadAsync(`${BASE}Textures/texture-${skin}.png`)),
  ]);
  const [modelResult, ...textureResults] = results;
  const failed = [];
  if (modelResult.status === 'rejected') failed.push('character.glb');
  const loadedTextures = {};
  textureResults.forEach((result, i) => {
    if (result.status === 'fulfilled') loadedTextures[SKINS[i]] = prepareTexture(result.value);
    else failed.push(`texture-${SKINS[i]}.png`);
  });
  if (failed.length) console.warn(`Character assets unavailable; using fallbacks for: ${failed.join(', ')}`);
  if (modelResult.status === 'rejected') {
    // The procedural factory owns no loaded textures. Release any skins that
    // happened to finish before the model failed rather than retaining orphaned
    // GPU resources for the lifetime of the app.
    Object.values(loadedTextures).forEach((texture) => texture.dispose());
    return proceduralAssets();
  }

  const gltf = modelResult.value;
  const defaultTexture = loadedTextures.steve || Object.values(loadedTextures)[0] || null;
  const textures = Object.fromEntries(SKINS.map((skin) => [skin, loadedTextures[skin] || defaultTexture]));
  const geometries = new Set();
  gltf.scene.traverse((node) => { if (node.isMesh) geometries.add(node.geometry); });

  function create(skin = 'steve') {
    const model = gltf.scene.clone(true);
    const material = new THREE.MeshStandardMaterial({
      map: textures[skin] || defaultTexture,
      color: defaultTexture ? 0xffffff : (FALLBACK_COLORS[skin] || FALLBACK_COLORS.steve),
      roughness: 0.92,
      metalness: 0,
    });
    material.userData.characterSkin = true;
    model.traverse((node) => {
      if (!node.isMesh) return;
      node.material = material;
      node.castShadow = true;
      node.receiveShadow = true;
    });
    model.userData.joints = {
      neck: model.getObjectByName('head'),
      shoulders: {
        '-1': model.getObjectByName('arm-right'),
        '1': model.getObjectByName('arm-left'),
      },
      hips: {
        '-1': model.getObjectByName('leg-right'),
        '1': model.getObjectByName('leg-left'),
      },
      body: model.getObjectByName('torso'),
      eyes: [],
    };
    return model;
  }

  return { create, geometries, textures, clips: gltf.animations };
}
