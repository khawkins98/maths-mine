# Minecraft Mob GLB Models

Place downloaded `.glb` files here. The game automatically uses them if present,
and gracefully falls back to procedural voxel models if not.

## How to Download

All models are **CC-BY 4.0** (free to use with attribution — see THIRD_PARTY_NOTICES.md).

1. Open each Sketchfab link below in your browser
2. Click **Download** → choose **Auto-converted glTF** (or original if it offers .glb)
3. Unzip and rename the file to the name shown below
4. Place the file in this folder

| Filename | Sketchfab URL |
|---|---|
| `villager.glb` | https://sketchfab.com/3d-models/villager-minecraft-sonic-racing-crossworlds-f24d56a793e54d60b4ce9e680e8cbe58 |
| `zombie.glb` | https://sketchfab.com/3d-models/zombie-minecraft-sonic-racing-crossworlds-44bec31939524459ad11e48eb7d1396f |
| `ghast.glb` | https://sketchfab.com/3d-models/ghast-minecraft-sonic-racing-crossworlds-5b27f5cfa6034b84b335f696de7e5b64 |
| `enderman.glb` | https://sketchfab.com/3d-models/enderman-minecraft-sonic-racing-crossworlds-142aa13b035248879b39288dd16c0c2d |
| `iron-golem.glb` | https://sketchfab.com/3d-models/minecraft-iron-golem-a34d28d5761040559d669e77090cbfaf |

## Usage in Code

```js
// In src/core/mobs.js — already wired
const { villager, zombie, ghast, enderman } = await loadMobs();
const villagerInstance = villager(); // clones the GLB (or returns procedural fallback)
```

## Console Messages

When the server starts you'll see in the browser console:
- `[mobs] ✅ Loaded villager.glb` — GLB found and in use
- `[mobs] ⚠️  villager.glb not found — using procedural fallback` — file missing, fallback active
