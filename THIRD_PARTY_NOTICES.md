# Third-party notices

Everything below is bundled with, or loaded by, *The Maths Mine*. The world
textures under `public/assets/textures/world/` are not listed here: they are
original artwork made for this project, in a Minecraft-like style but not
derived from Mojang's files.

*The Maths Mine* is not affiliated with, endorsed by, or sponsored by Mojang
Studios or Microsoft. "Minecraft" is a trademark of Mojang Studios.

## three.js

Bundled into the shipped build. MIT licence.
<https://github.com/mrdoob/three.js>

## Kenney Blocky Characters

The model and character textures under `public/assets/characters/` come from
[Kenney's Blocky Characters](https://kenney.nl/assets/blocky-characters).

They are released under Creative Commons CC0. The pack's original license file
is included at `public/assets/characters/LICENSE.txt`.

One file in that directory is **not** part of the Kenney pack and is not CC0:
`public/assets/characters/Textures/texture-steve.png`, which is a duplicate of
`public/assets/mobs/steve.png` (see "Textures of unresolved provenance" below).

## Sketchfab mob models (CC-BY 4.0)

The `.glb` files under `public/assets/mobs/` are the models as downloaded from
Sketchfab, not recreations of them. Each is licensed
[CC-BY 4.0](http://creativecommons.org/licenses/by/4.0/), which requires
attribution to the author named below. The same author, title, source and
licence are recorded inside each file's own glTF `asset.extras` block, which is
the authority if this list and the files ever disagree.

| File | Title | Author | Source |
|---|---|---|---|
| `creeper.glb` | Minecraft Creeper | [keithandmarchant](https://sketchfab.com/nebraskabirdwatching) | [Sketchfab](https://sketchfab.com/3d-models/minecraft-creeper-c986450b4d884c2c94c0d3168671c543) |
| `enderman.glb` | Enderman Minecraft (Sonic Racing: CrossWorlds) | [Guilherme Navarro](https://sketchfab.com/guinavarro.al) | [Sketchfab](https://sketchfab.com/3d-models/enderman-minecraft-sonic-racing-crossworlds-142aa13b035248879b39288dd16c0c2d) |
| `ghast.glb` | Ghast Minecraft (Sonic Racing: CrossWorlds) | [Guilherme Navarro](https://sketchfab.com/guinavarro.al) | [Sketchfab](https://sketchfab.com/3d-models/ghast-minecraft-sonic-racing-crossworlds-5b27f5cfa6034b84b335f696de7e5b64) |
| `iron-golem.glb` | Minecraft - Iron Golem | [Vincent Yanez](https://sketchfab.com/vinceyanez) | [Sketchfab](https://sketchfab.com/3d-models/minecraft-iron-golem-b7f1a9a021654c84a67a1ead67291793) |
| `steve.glb` | Minecraft Steve | [Cheese](https://sketchfab.com/cheeselmaolol) | [Sketchfab](https://sketchfab.com/3d-models/minecraft-steve-2938c7d498ab4356b0d6e0f47660ef94) |
| `villager.glb` | Villager Minecraft (Sonic Racing: CrossWorlds) | [Guilherme Navarro](https://sketchfab.com/guinavarro.al) | [Sketchfab](https://sketchfab.com/3d-models/villager-minecraft-sonic-racing-crossworlds-f24d56a793e54d60b4ce9e680e8cbe58) |
| `zombie.glb` | Zombie Minecraft (Sonic Racing: CrossWorlds) | [Guilherme Navarro](https://sketchfab.com/guinavarro.al) | [Sketchfab](https://sketchfab.com/3d-models/zombie-minecraft-sonic-racing-crossworlds-44bec31939524459ad11e48eb7d1396f) |

A CC-BY grant covers the uploader's own modelling work. It cannot grant rights
in the underlying Minecraft character designs, which remain Mojang's.

### Sibling textures

`enderman.png`, `ghast.png`, `villager.png` and `zombie.png` are byte-identical
to the textures embedded in the matching `.glb` above, so the same attribution
covers them.

### Textures of unresolved provenance

`creeper.png`, `iron_golem.png` and `steve.png` do **not** match the textures
embedded in the models they sit beside. These three are the atlases actually
rendered at runtime by `src/core/minecraftMobRig.js`, and they sit at canonical
Minecraft skin dimensions (64x32, 128x128 and 256x256 respectively).

`iron_golem.png` came from a second, earlier Sketchfab download of a
*different* Iron Golem model than the one shipped as `iron-golem.glb`. That
download has the shape of a Sketchfab export (a `source/*.fbx` and an
`internal_ground_ao_texture.jpeg`) but carries no `license.txt`, so its author
is unconfirmed. It is plausibly the imnamedgamer model these notices used to
cite, which is CC-BY 4.0 -- but "plausibly" is not an attribution, and it is
not currently safe to credit anyone for it.

`creeper.png` and `steve.png` have no traceable source at all.

Until each is resolved, all three should be treated as unlicensed. The fix is
to redraw them in the same original style as the world tiles, or to use the
CC-BY textures already embedded in the models.
