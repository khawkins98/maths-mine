# Minecraft Mob Assets (`/public/assets/mobs/`)

This directory holds the 3D models and textures for Minecraft mobs (Iron Golem, Villager, Zombie, Ghast, Enderman).

For the full format comparison, technical guide, and architecture docs, see [docs/MODELS_AND_ASSETS.md](../../../docs/MODELS_AND_ASSETS.md).

---

## Preferred Format

- **glTF 2.0 Binary (`.glb`)** is the recommended format for full 3D models with embedded textures and armature rigs.
- **Texture Maps (`.png`)** in standard 64×64 or 128×128 pixel dimensions are used for Box-rigged mobs.

---

## File Names

Place downloaded assets here using these exact filenames:

| File | Type | Description |
|---|---|---|
| `creeper.glb` | 3D Model | Creeper mob model |
| `enderman.glb` | 3D Model | Enderman mob model (slender Ender mob with purple eyes) |
| `ghast.glb` | 3D Model | Ghast mob model (floating Nether guardian) |
| `iron-golem.glb` | 3D Model | Iron Golem model for the articulated village guardian |
| `iron_golem.png` | Texture Map | 128x128 texture atlas for the box-rigged Iron Golem |
| `steve.glb` | 3D Model | Steve, the player mascot |
| `villager.glb` | 3D Model | Villager mob model (honest crew in Spot the Wrong'un) |
| `zombie.glb` | 3D Model | Zombie mob model (imposter in Spot the Wrong'un) |

Every `.glb` here is a CC-BY 4.0 Sketchfab download and must be credited by
author. See [THIRD_PARTY_NOTICES.md](../../../THIRD_PARTY_NOTICES.md), which
also records which of the sibling `.png` atlases have no known source.

---

## Live Dev Preview

Test and inspect all models in 360° with the interactive sandbox:
👉 **`http://localhost:5173/models.html`**
