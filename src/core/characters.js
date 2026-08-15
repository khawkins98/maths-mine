// Shared, professionally-authored block-character assets.
// Kenney's pack uses one small rigid-part model and interchangeable skins.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const SKINS = ['a', 'b', 'c', 'e', 'f', 'k', 'm', 'q', 'steve'];
const BASE = `${import.meta.env.BASE_URL}assets/characters/`;

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

export async function loadCharacterAssets() {
  const [gltf, ...loadedTextures] = await Promise.all([
    new GLTFLoader().loadAsync(`${BASE}character.glb`),
    ...SKINS.map((skin) => new THREE.TextureLoader().loadAsync(`${BASE}Textures/texture-${skin}.png`)),
  ]);
  const textures = Object.fromEntries(SKINS.map((skin, i) => [skin, prepareTexture(loadedTextures[i])]));
  const geometries = new Set();
  gltf.scene.traverse((node) => { if (node.isMesh) geometries.add(node.geometry); });

  function create(skin = 'steve') {
    const model = gltf.scene.clone(true);
    const material = new THREE.MeshStandardMaterial({
      map: textures[skin] || textures.steve || textures.m,
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
