# World texture specification

## Rendering contract

- Production world tiles are original 16×16 sRGB PNGs.
- `NearestFilter` is used for minification and magnification; mipmaps are off.
- Terrain tiles use repeat wrapping. Countable lesson blocks and props clamp to
  one tile per face so their material UUIDs remain distinct and stable.
- Palette: 4–7 principal colours per tile, medium contrast, restrained noise.
- Lighting assumption: subtle top-left highlight and bottom-right shade.
- Materials keep their silhouettes and semantic colours: green plant surfaces,
  brown earth/wood, neutral stone, pale sand/snow/End, red Nether, violet-black
  obsidian, and orange emissive lava.

## Production inventory

| Family | Tiles | Importance / consumers |
| --- | --- | --- |
| Overworld ground | grass top/side, dirt, stone, sand, sandstone, snow, ice | Core: continuous `terrain.js`; dirt/stone also Block Builder |
| Overworld scenery | oak bark/end-grain/planks/leaves, birch bark, cactus | Core: `trees.js`, `house.js`, Block Builder wood |
| Nether / End | netherrack, crimson stem/cap, End stone, obsidian, portal, lava | Core: biome platform/terrain/scenery; reward house and Block Builder |
| Building / ore | cobblestone, brick, glass, iron, emerald, diamond, gold, redstone, hay, pumpkin | Secondary: reward house, blueprints, Spot the Wrong'un |
| Non-raster environment | cubic clouds | Geometry/material colour only; no raster contract to replace |
| Soft effects / UI | puff, slot guide, ground/sky gradients | Intentionally retained; not world materials. Slot guide contrast is unchanged. |

`textures.js` preserves the pre-existing exported texture keys and synchronous
creation API, and exposes a `ready` promise so the renderer never sees an empty
image during initial upload. Production materials therefore keep separate texture UUIDs, and
game teardown/resource ownership is unchanged.

## Image generation provenance

Built-in ImageGen produced both non-destructive source atlases, retained under
`docs/assets/world-textures/` so they do not ship in the public runtime output.
The curated 16×16 production PNGs are crops/downsamples of those sources.

### Primary atlas prompt

```text
Use case: stylized-concept
Asset type: production source atlas for an original voxel/pixel-art educational game's world textures
Primary request: Create a perfectly orthographic 4 by 4 grid of sixteen square, seamless-looking pixel-art material swatches, each cell clearly separated by a 4-pixel neutral charcoal gutter. Cells in row-major order: grass top, grass side over dirt, dirt, stone; sand, sandstone, snow, pale blue ice; dark oak bark, warm oak planks, circular log end-grain, straight vertical cactus skin; deep red netherrack, pale alien end stone, purple-black obsidian, glowing orange lava.
Style/medium: original hand-authored 16-bit voxel pixel art, Minecraft-inspired genre language but not copying or closely reproducing any copyrighted game texture; crisp square pixels, no antialiasing, no photographic detail.
Composition/framing: exact front-facing square atlas, 4 equal columns by 4 equal rows; every material fills its cell edge-to-edge inside gutters; no perspective, no blocks/cubes, no labels.
Lighting/mood: consistent subtle top-left highlight and bottom-right shadow across every tile; mostly matte; lava emissive.
Color palette: disciplined shared palette, 4 to 7 colors per tile, medium contrast; grass distinct from cactus; dirt distinct from wood; snow retains pale blue shadows.
Materials/textures: chunky but detailed 1-pixel clusters, readable at 16 by 16, restrained noise, edge-continuous patterns suitable for repeat tiling.
Constraints: square output; exact 4x4 atlas organization; no text, letters, numerals, logos, watermark, characters, objects, UI, gradients, blur, antialiasing, or copyrighted texture reproduction.
Avoid: realistic rendering, 3D cubes, perspective, irregular cell sizes, decorative border, muddy low contrast, excessive speckle, resemblance to exact Minecraft resource-pack pixels.
```

### Secondary atlas prompt

```text
Use case: stylized-concept
Asset type: production companion atlas for an original voxel/pixel-art educational game's secondary block textures
Primary request: Create a perfectly orthographic 4 by 4 grid of sixteen square pixel-art material swatches, each separated by a 4-pixel neutral charcoal gutter. Row-major cells: leafy oak foliage, pale birch bark, rounded gray cobblestone, pale iron block; green emerald ore/block, cyan crystal ore/block, warm gold block, red mineral circuitry stone; warm red clay brick, bundled golden hay, pale translucent-looking glass, orange carved-pumpkin skin; dark crimson fungus stem, crimson fungus cap, violet portal energy, deep tilled farmland.
Style/medium: original hand-authored 16-bit voxel pixel art matching a cohesive world-texture family; genre-inspired but do not copy or closely reproduce copyrighted game textures; crisp square pixels, no antialiasing.
Composition/framing: exact front-facing square atlas, 4 equal columns by 4 equal rows, materials fill cells inside gutters, no perspective, blocks, cubes, labels, or objects.
Lighting/mood: consistent subtle top-left highlight and bottom-right shade; mostly matte; portal softly emissive.
Color palette: disciplined, 4 to 7 colors per tile, medium-high readability; dirt/wood/brick remain clearly distinct; gems retain strong identities.
Materials/textures: readable at 16 by 16, restrained noise, edge-continuous repeatable patterns.
Constraints: square output; exact 4x4 organization; no text, logos, watermark, gradients, blur, antialiasing, UI, characters, or copyrighted texture reproduction.
Avoid: realistic rendering, perspective, irregular cells, muddy contrast, excessive speckle, resemblance to exact Minecraft resource-pack pixels.
```
