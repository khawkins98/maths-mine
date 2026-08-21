# Original world texture family

All production tiles in this directory are 16×16 sRGB PNGs authored as one
coherent voxel/pixel-art family. They use nearest-neighbour minification and
magnification, no mipmaps, and repeat wrapping only on terrain surfaces.

Visual rules: 4–7 colours per tile, restrained one-pixel clusters, a subtle
top-left highlight / bottom-right shade, no baked face border, and enough value
separation to keep grass, earth, wood, stone, and target-guide overlays legible.

The non-destructive generated source atlases live outside the runtime bundle in
`docs/assets/world-textures/`. Production uses only the curated 16×16 sibling
tiles here, so existing texture keys and per-material UUID ownership remain
unchanged.
