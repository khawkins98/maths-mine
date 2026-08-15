# 3D Minecraft Models & Asset Pipeline Guide

This document describes the 3D model formats, asset pipeline, download procedures, and animation system used in *The Maths Mine*.

---

## 1. Supported 3D Formats (Ranked)

| Format | Extension | Compatibility | Recommendation | Details |
|---|---|---|---|---|
| **glTF 2.0 Binary** | `.glb` | ⭐⭐⭐⭐⭐ Best | **Recommended for 3D meshes** | Self-contained single binary file containing mesh geometry, skeleton bones, embedded materials/textures, and animations. Supported natively by Three.js `GLTFLoader`. |
| **Texture Atlas + Box Rig** | `.png` (64x64 or 128x128) | ⭐⭐⭐⭐⭐ Best | **Recommended for Minecraft voxel mobs** | Canonical Minecraft skin texture mapped to Three.js `BoxGeometry` limbs. Tiny payload (<10KB), 0ms load time, 100% pixel-perfect nearest-neighbor rendering, full procedural joint control. |
| **glTF Separate** | `.gltf` + `.bin` + `textures/` | ⭐⭐⭐⭐ Good | Supported | Standard glTF folder package. Requires keeping relative paths to `.bin` and texture PNGs intact. |
| **FBX** | `.fbx` | ⭐⭐⭐ Moderate | Needs conversion | Autodesk exchange format. Often embeds Z-up / Y-up axis differences; recommend converting to `.glb` via Blender before use. |
| **USDZ** | `.usdz` | ❌ Incompatible | Avoid for WebGL | Apple AR QuickLook container format. Not supported natively in standard Three.js WebGL rendering pipelines. |
| **Wavefront OBJ** | `.obj` + `.mtl` | ⭐⭐ Poor | Avoid | Static mesh only; lacks joint hierarchies, armatures, and bone rigs needed for character animation. |

---

## 2. Sketchfab Download Instructions

When downloading Minecraft CC-BY models from Sketchfab:

1. Open the model link on Sketchfab.
2. Click **Download 3D Model**.
3. Choose format in this order of preference:
   - **glTF / GLB** (Auto-converted or Original).
   - If downloaded as a `.zip`, extract it to obtain the `.glb` or `.gltf` + `.bin` + `.png`.
4. Rename and place in `public/assets/mobs/`:

| Mob | Target Filename | Sketchfab Source (CC-BY 4.0) |
|---|---|---|
| 🟤 **Villager** | `public/assets/mobs/villager.glb` | [Villager (Sonic Racing Crossworlds)](https://sketchfab.com/3d-models/villager-minecraft-sonic-racing-crossworlds-f24d56a793e54d60b4ce9e680e8cbe58) |
| 🟢 **Zombie** | `public/assets/mobs/zombie.glb` | [Zombie (Sonic Racing Crossworlds)](https://sketchfab.com/3d-models/zombie-minecraft-sonic-racing-crossworlds-44bec31939524459ad11e48eb7d1396f) |
| ⬜ **Ghast** | `public/assets/mobs/ghast.glb` | [Ghast (Sonic Racing Crossworlds)](https://sketchfab.com/3d-models/ghast-minecraft-sonic-racing-crossworlds-5b27f5cfa6034b84b335f696de7e5b64) |
| ⬛ **Enderman** | `public/assets/mobs/enderman.glb` | [Enderman (Sonic Racing Crossworlds)](https://sketchfab.com/3d-models/enderman-minecraft-sonic-racing-crossworlds-142aa13b035248879b39288dd16c0c2d) |
| 🪨 **Iron Golem** | `public/assets/mobs/iron_golem.png` | [Minecraft Iron Golem Texture & Model](https://sketchfab.com/3d-models/minecraft-iron-golem-a34d28d5761040559d669e77090cbfaf) |

---

## 3. Fallback & Architecture Pattern

All mobs in `src/core/mobs.js` follow a **Zero-Crash Graceful Fallback** architecture:
1. **Parallel Load Attempt**: When the engine starts, `loadMobs()` attempts to load `.glb` files from `public/assets/mobs/`.
2. **Procedural Fallback**: If a `.glb` file is missing, a procedural voxel mob with matching joints (`neck`, `shoulders`, `hips`, `body`) is generated automatically so the game never crashes.
3. **Hot Swap**: As soon as a `.glb` or texture file is dropped into `public/assets/mobs/`, the game automatically uses the enhanced model on reload.

---

## 4. Interactive Dev Sandbox

Use the dedicated 3D model inspector tool to preview models, adjust scales, and test limb animations:

👉 **URL**: `http://localhost:5173/models.html`

### Controls Available in Dev Sandbox:
- **OrbitControls**: Left-click drag to rotate, right-click drag to pan, scroll to zoom.
- **Limb Animation Toggle**: Test idle vs walking / patrol limb swing cycles.
- **Speed & Scale Sliders**: Live tuning of animation speed and model scale.
- **Wireframe Toggle**: Inspect 3D polygon topology.
- **Texture Map Preview**: Live preview of the active texture atlas with nearest-neighbor filtering.
