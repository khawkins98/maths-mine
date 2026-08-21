// games/blueprints.js — Iconic Minecraft Blueprint catalog for Block Builder.
// Maps multiplication/division arrays to real structures with custom voxel materials,
// construction lore, and celebration activation effects!

export const BLUEPRINTS = {
  // Nether Portal (4x5 or 5x4)
  '4x5': {
    id: 'nether_portal',
    name: 'Obsidian Nether Portal',
    icon: '🔮',
    materialKey: 'obsidianTex',
    capKey: 'obsidianTex',
    lore: 'Channeling the Nether realm...',
    activationVFX: 'portal',
    bonusBolts: 6,
  },
  '5x4': {
    id: 'nether_portal',
    name: 'Obsidian Nether Portal',
    icon: '🔮',
    materialKey: 'obsidianTex',
    capKey: 'obsidianTex',
    lore: 'Channeling the Nether realm...',
    activationVFX: 'portal',
    bonusBolts: 6,
  },

  // Diamond Beacon Base (3x3)
  '3x3': {
    id: 'beacon_pyramid',
    name: 'Diamond Beacon Base',
    icon: '💎',
    materialKey: 'diamondTex',
    capKey: 'diamondTex',
    lore: 'Channeling skyward beam power...',
    activationVFX: 'beacon',
    bonusBolts: 5,
  },

  // Gold Treasure Vault (4x4 or 5x5)
  '4x4': {
    id: 'gold_vault',
    name: 'Gilded Vault Door',
    icon: '👑',
    materialKey: 'goldTex',
    capKey: 'goldTex',
    lore: 'Forging golden vault hinges...',
    activationVFX: 'sparkle',
    bonusBolts: 5,
  },
  '5x5': {
    id: 'treasure_vault',
    name: 'Royal Treasury Wall',
    icon: '👑',
    materialKey: 'goldTex',
    capKey: 'goldTex',
    lore: 'Stacking solid gold bullion...',
    activationVFX: 'sparkle',
    bonusBolts: 7,
  },

  // Castle Ramparts / Watchtower (4x6 or 6x4)
  '4x6': {
    id: 'castle_rampart',
    name: 'Castle Watchtower Rampart',
    icon: '🏰',
    materialKey: 'stoneTex',
    capKey: 'cobbleTex',
    lore: 'Fortifying the village defenses...',
    activationVFX: 'torches',
    bonusBolts: 6,
  },
  '6x4': {
    id: 'castle_rampart',
    name: 'Castle Watchtower Rampart',
    icon: '🏰',
    materialKey: 'stoneTex',
    capKey: 'cobbleTex',
    lore: 'Fortifying the village defenses...',
    activationVFX: 'torches',
    bonusBolts: 6,
  },

  // Redstone Logic Gate (3x6 or 6x3)
  '3x6': {
    id: 'redstone_engine',
    name: 'Redstone Piston Engine',
    icon: '⚡',
    materialKey: 'redstoneTex',
    capKey: 'redstoneTex',
    lore: 'Powering automated redstone circuits...',
    activationVFX: 'redstone',
    bonusBolts: 5,
  },
  '6x3': {
    id: 'redstone_engine',
    name: 'Redstone Piston Engine',
    icon: '⚡',
    materialKey: 'redstoneTex',
    capKey: 'redstoneTex',
    lore: 'Powering automated redstone circuits...',
    activationVFX: 'redstone',
    bonusBolts: 5,
  },

  // Village Farm Plot (3x8 or 8x3)
  '3x8': {
    id: 'wheat_field',
    name: 'Village Crop Farmland',
    icon: '🌾',
    materialKey: 'dirtTex',
    capKey: 'hayTex',
    lore: 'Cultivating golden wheat harvests...',
    activationVFX: 'wheat',
    bonusBolts: 7,
  },
  '8x3': {
    id: 'wheat_field',
    name: 'Village Crop Farmland',
    icon: '🌾',
    materialKey: 'dirtTex',
    capKey: 'hayTex',
    lore: 'Cultivating golden wheat harvests...',
    activationVFX: 'wheat',
    bonusBolts: 7,
  },

  // Blacksmith Hearth (2x5 or 5x2)
  '2x5': {
    id: 'blacksmith_hearth',
    name: 'Blacksmith Smelting Hearth',
    icon: '🔨',
    materialKey: 'brickTex',
    capKey: 'lavaTex',
    lore: 'Heating lava coals for iron forging...',
    activationVFX: 'fire',
    bonusBolts: 5,
  },
  '5x2': {
    id: 'blacksmith_hearth',
    name: 'Blacksmith Smelting Hearth',
    icon: '🔨',
    materialKey: 'brickTex',
    capKey: 'lavaTex',
    lore: 'Heating lava coals for iron forging...',
    activationVFX: 'fire',
    bonusBolts: 5,
  },

  // Emerald Master Monument (6x6)
  '6x6': {
    id: 'emerald_monument',
    name: 'Emerald Master Monument',
    icon: '❇️',
    materialKey: 'emeraldTex',
    capKey: 'emeraldTopTex',
    lore: 'Channeling ancient emerald energy...',
    activationVFX: 'emerald',
    bonusBolts: 8,
  },

  // Desert Temple Facade (6x7 or 7x6)
  '6x7': {
    id: 'desert_temple',
    name: 'Desert Temple Stepped Wall',
    icon: '🏺',
    materialKey: 'platSandstoneTex',
    capKey: 'platSandstoneTex',
    lore: 'Uncovering ancient glyph ruins...',
    activationVFX: 'sand',
    bonusBolts: 8,
  },
  '7x6': {
    id: 'desert_temple',
    name: 'Desert Temple Stepped Wall',
    icon: '🏺',
    materialKey: 'platSandstoneTex',
    capKey: 'platSandstoneTex',
    lore: 'Uncovering ancient glyph ruins...',
    activationVFX: 'sand',
    bonusBolts: 8,
  },
};

/**
 * Returns a matching blueprint for the fact dimensions, or a dynamic default.
 */
export function getBlueprint(cols, rows) {
  const key = `${cols}x${rows}`;
  if (BLUEPRINTS[key]) return BLUEPRINTS[key];

  // Unmatched facts use the warm, countable wood/end-grain identity. Obsidian
  // remains special to the explicitly authored Nether Portal blueprints rather
  // than turning every common large-table fact into a near-black wall.
  return {
    id: 'wood_shelter',
    name: 'Cottage Wall Section',
    icon: '🪵',
    materialKey: 'logTex',
    capKey: 'logTopTex',
    lore: 'Building oak structural timbers...',
    activationVFX: 'sparkle',
    bonusBolts: 3,
  };
}
