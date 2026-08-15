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
| `iron_golem.png` | Texture Map | Official 128×128 pixel texture atlas for the articulated Iron Golem |
| `villager.glb` | 3D Model | Villager mob model (honest crew in Spot the Wrong'un) |
| `zombie.glb` | 3D Model | Zombie mob model (imposter in Spot the Wrong'un) |
| `ghast.glb` | 3D Model | Ghast mob model (floating Nether guardian) |
| `enderman.glb` | 3D Model | Enderman mob model (slender Ender mob with purple eyes) |

---

## Live Dev Preview

Test and inspect all models in 360° with the interactive sandbox:
👉 **`http://localhost:5173/models.html`**
