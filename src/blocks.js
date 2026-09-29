import * as THREE from 'three';

// ============================================================================
// Phases U2, U3 & U6.3 — HD Texture Atlas Registry, Minecraft Blocks & Icons
// ============================================================================

export const ATLAS_TILE_INDEX = {
  grass_top_a: 0,
  grass_top_b: 1,
  grass_top_c: 2,
  grass_side: 3,
  dirt_a: 4,
  dirt_b: 5,
  dirt_c: 6,
  stone_a: 7,
  stone_b: 8,
  stone_c: 9,
  cobble: 10,
  sand_a: 11,
  sand_b: 12,
  gravel: 13,
  snow: 14,
  snow_side: 15,
  ice: 16,
  log_oak_side: 17,
  log_oak_top: 18,
  log_birch_side: 19,
  log_birch_top: 20,
  log_pine_side: 21,
  log_pine_top: 22,
  planks_oak: 23,
  planks_birch: 24,
  planks_pine: 25,
  leaves_oak: 26,
  leaves_oak_b: 27,
  leaves_birch: 28,
  leaves_pine: 29,
  water: 30,
  lava: 31,
  glass: 32,
  bricks: 33,
  ore_coal: 34,
  ore_iron: 35,
  ore_gold: 36,
  ore_crystal: 37,
  tall_grass: 38,
  flower_red: 39,
  flower_yellow: 40,
  flower_blue: 41,
  cactus_side: 42,
  cactus_top: 43,
  crack_0: 44,
  crack_1: 45,
  crack_2: 46,
  crack_3: 47,
  crack_4: 48,
  crack_5: 49,
  crack_6: 50,
  crack_7: 51,
  crack_8: 52,
  crack_9: 53,
  bedrock: 54,
  obsidian: 55,
  glowstone: 56,
  crafting_top: 57,
  crafting_side: 58,
  furnace_front: 59,
  tnt_top: 60,
  tnt_side: 61,
  bookshelf_side: 62,
  mossy_cobble: 63,
  stone_bricks: 64,
  sandstone_side: 65,
  ore_redstone: 66,
  ore_emerald: 67,
  pumpkin_top: 68,
  pumpkin_side: 69,
  melon_side: 70,
};

const T = ATLAS_TILE_INDEX;

export const BLOCK_DEFINITIONS = [
  {
    id: 'grass',
    name: 'Grass Block',
    key: 1,
    colorHex: '#5aa03a',
    sideHex: '#6b4527',
    bottomHex: '#55351f',
    color: new THREE.Color('#ffffff'),
    tiles: {
      top: T.grass_top_a,
      side: T.grass_side,
      bottom: T.dirt_a,
      topVariants: [T.grass_top_a, T.grass_top_b, T.grass_top_c],
    },
    hardness: 0.6,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'dirt',
    name: 'Dirt',
    key: 2,
    colorHex: '#815630',
    sideHex: '#6b4527',
    bottomHex: '#55351f',
    color: new THREE.Color('#ffffff'),
    tiles: {
      top: T.dirt_a,
      side: T.dirt_a,
      bottom: T.dirt_a,
      topVariants: [T.dirt_a, T.dirt_b, T.dirt_c],
    },
    hardness: 0.5,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'stone',
    name: 'Stone',
    key: 3,
    colorHex: '#7f828a',
    sideHex: '#6c6f78',
    bottomHex: '#5a5d66',
    color: new THREE.Color('#ffffff'),
    tiles: {
      top: T.stone_a,
      side: T.stone_a,
      bottom: T.stone_a,
      topVariants: [T.stone_a, T.stone_b, T.stone_c],
    },
    hardness: 1.2,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'cobblestone',
    name: 'Cobblestone',
    key: 4,
    colorHex: '#6c6f78',
    sideHex: '#5a5d66',
    bottomHex: '#484b54',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.cobble, side: T.cobble, bottom: T.cobble },
    hardness: 1.4,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'wood',
    name: 'Oak Log',
    key: 5,
    colorHex: '#b3854a',
    sideHex: '#553a1f',
    bottomHex: '#b3854a',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.log_oak_top, side: T.log_oak_side, bottom: T.log_oak_top },
    hardness: 1.0,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'planks',
    name: 'Oak Planks',
    key: 6,
    colorHex: '#ab7e3f',
    sideHex: '#94692f',
    bottomHex: '#7d5528',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.planks_oak, side: T.planks_oak, bottom: T.planks_oak },
    hardness: 0.9,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'brick',
    name: 'Bricks',
    key: 7,
    colorHex: '#a04630',
    sideHex: '#8a3626',
    bottomHex: '#742a1e',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.bricks, side: T.bricks, bottom: T.bricks },
    hardness: 1.5,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'sand',
    name: 'Sand',
    key: 8,
    colorHex: '#d8cb88',
    sideHex: '#c9b976',
    bottomHex: '#b9a866',
    color: new THREE.Color('#ffffff'),
    tiles: {
      top: T.sand_a,
      side: T.sand_a,
      bottom: T.sand_a,
      topVariants: [T.sand_a, T.sand_b],
    },
    hardness: 0.45,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'torch',
    name: 'Glowstone Lamp',
    key: 9,
    colorHex: '#fde676',
    sideHex: '#f2b838',
    bottomHex: '#c7831e',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.glowstone, side: T.glowstone, bottom: T.glowstone },
    hardness: 0.3,
    transparent: false,
    lightLevel: 15,
  },
  // Extended Minecraft Biomes, Woods, Planks, Leaves, Ores & Craftables
  {
    id: 'gravel',
    name: 'Gravel',
    key: 0,
    colorHex: '#8f8a83',
    sideHex: '#77736e',
    bottomHex: '#5c5a58',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.gravel, side: T.gravel, bottom: T.gravel },
    hardness: 0.55,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'snow',
    name: 'Snowy Grass',
    key: 0,
    colorHex: '#eff6fc',
    sideHex: '#c4d6e9',
    bottomHex: '#6b4527',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.snow, side: T.snow_side, bottom: T.dirt_a },
    hardness: 0.5,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'snow_block',
    name: 'Snow Block',
    key: 0,
    colorHex: '#ffffff',
    sideHex: '#dce9f5',
    bottomHex: '#c4d6e9',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.snow, side: T.snow, bottom: T.snow },
    hardness: 0.4,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'ice',
    name: 'Packed Ice',
    key: 0,
    colorHex: '#9fcbea',
    sideHex: '#7fb6e0',
    bottomHex: '#5f9fd0',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.ice, side: T.ice, bottom: T.ice },
    hardness: 0.6,
    transparent: true,
    lightLevel: 0,
  },
  {
    id: 'water',
    name: 'Water',
    key: 0,
    colorHex: '#3f81c9',
    sideHex: '#2f6db4',
    bottomHex: '#1b4b8f',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.water, side: T.water, bottom: T.water },
    hardness: 999,
    transparent: true,
    lightLevel: 0,
  },
  {
    id: 'glass',
    name: 'Glass Block',
    key: 0,
    colorHex: '#d6eef4',
    sideHex: '#c3e6ef',
    bottomHex: '#bfe4ee',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.glass, side: T.glass, bottom: T.glass },
    hardness: 0.3,
    transparent: true,
    lightLevel: 0,
  },
  {
    id: 'leaves',
    name: 'Oak Leaves',
    key: 0,
    colorHex: '#449833',
    sideHex: '#347f29',
    bottomHex: '#276820',
    color: new THREE.Color('#ffffff'),
    tiles: {
      top: T.leaves_oak,
      side: T.leaves_oak,
      bottom: T.leaves_oak,
      topVariants: [T.leaves_oak, T.leaves_oak_b],
    },
    hardness: 0.25,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'birch_leaves',
    name: 'Birch Leaves',
    key: 0,
    colorHex: '#85b846',
    sideHex: '#6c9f38',
    bottomHex: '#55882c',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.leaves_birch, side: T.leaves_birch, bottom: T.leaves_birch },
    hardness: 0.25,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'pine_leaves',
    name: 'Spruce Leaves',
    key: 0,
    colorHex: '#2b7551',
    sideHex: '#205f41',
    bottomHex: '#184c35',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.leaves_pine, side: T.leaves_pine, bottom: T.leaves_pine },
    hardness: 0.25,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'birch_wood',
    name: 'Birch Log',
    key: 0,
    colorHex: '#cfbd8b',
    sideHex: '#eeebe0',
    bottomHex: '#cfbd8b',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.log_birch_top, side: T.log_birch_side, bottom: T.log_birch_top },
    hardness: 1.0,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'pine_log',
    name: 'Spruce Log',
    key: 0,
    colorHex: '#996a44',
    sideHex: '#3b261a',
    bottomHex: '#996a44',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.log_pine_top, side: T.log_pine_side, bottom: T.log_pine_top },
    hardness: 1.0,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'birch_planks',
    name: 'Birch Planks',
    key: 0,
    colorHex: '#d5c48f',
    sideHex: '#c3af7d',
    bottomHex: '#b09a6a',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.planks_birch, side: T.planks_birch, bottom: T.planks_birch },
    hardness: 0.9,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'pine_planks',
    name: 'Spruce Planks',
    key: 0,
    colorHex: '#926440',
    sideHex: '#7c5231',
    bottomHex: '#664024',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.planks_pine, side: T.planks_pine, bottom: T.planks_pine },
    hardness: 0.9,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'coal_ore',
    name: 'Coal Ore',
    key: 0,
    colorHex: '#3d3d47',
    sideHex: '#2a2a32',
    bottomHex: '#1a1a20',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.ore_coal, side: T.ore_coal, bottom: T.ore_coal },
    hardness: 1.6,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'iron_ore',
    name: 'Iron Ore',
    key: 0,
    colorHex: '#cf8b63',
    sideHex: '#b0704f',
    bottomHex: '#8f5b42',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.ore_iron, side: T.ore_iron, bottom: T.ore_iron },
    hardness: 1.8,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'gold_ore',
    name: 'Gold Ore',
    key: 0,
    colorHex: '#eab92a',
    sideHex: '#cc9a14',
    bottomHex: '#a87a0c',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.ore_gold, side: T.ore_gold, bottom: T.ore_gold },
    hardness: 2.0,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'gem_ore',
    name: 'Diamond Crystal Ore',
    key: 0,
    colorHex: '#3fd0dc',
    sideHex: '#16afc4',
    bottomHex: '#0c8aa0',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.ore_crystal, side: T.ore_crystal, bottom: T.ore_crystal },
    hardness: 2.4,
    transparent: false,
    lightLevel: 4,
  },
  {
    id: 'redstone_ore',
    name: 'Redstone Ore',
    key: 0,
    colorHex: '#f22e2e',
    sideHex: '#c41414',
    bottomHex: '#850a0a',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.ore_redstone, side: T.ore_redstone, bottom: T.ore_redstone },
    hardness: 2.1,
    transparent: false,
    lightLevel: 6,
  },
  {
    id: 'emerald_ore',
    name: 'Emerald Ore',
    key: 0,
    colorHex: '#38df76',
    sideHex: '#14ad52',
    bottomHex: '#0b7a38',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.ore_emerald, side: T.ore_emerald, bottom: T.ore_emerald },
    hardness: 2.4,
    transparent: false,
    lightLevel: 3,
  },
  {
    id: 'cactus',
    name: 'Cactus',
    key: 0,
    colorHex: '#3b8b45',
    sideHex: '#2f7539',
    bottomHex: '#256030',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.cactus_top, side: T.cactus_side, bottom: T.cactus_top },
    hardness: 0.4,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'crafting_table',
    name: 'Crafting Table',
    key: 0,
    colorHex: '#ab7e3f',
    sideHex: '#a32e26',
    bottomHex: '#7d5528',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.crafting_top, side: T.crafting_side, bottom: T.planks_oak },
    hardness: 1.0,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'furnace',
    name: 'Smelting Furnace',
    key: 0,
    colorHex: '#7f828a',
    sideHex: '#f0620f',
    bottomHex: '#5a5d66',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.stone_a, side: T.furnace_front, bottom: T.stone_a },
    hardness: 1.5,
    transparent: false,
    lightLevel: 10,
  },
  {
    id: 'tnt',
    name: 'TNT Explosive',
    key: 0,
    colorHex: '#c92c20',
    sideHex: '#d93429',
    bottomHex: '#a12016',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.tnt_top, side: T.tnt_side, bottom: T.tnt_top },
    hardness: 0.3,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'bookshelf',
    name: 'Bookshelf',
    key: 0,
    colorHex: '#ab7e3f',
    sideHex: '#b0251e',
    bottomHex: '#7d5528',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.planks_oak, side: T.bookshelf_side, bottom: T.planks_oak },
    hardness: 0.9,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'mossy_cobble',
    name: 'Mossy Cobblestone',
    key: 0,
    colorHex: '#589c42',
    sideHex: '#587846',
    bottomHex: '#3a752c',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.mossy_cobble, side: T.mossy_cobble, bottom: T.mossy_cobble },
    hardness: 1.4,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'stone_bricks',
    name: 'Stone Bricks',
    key: 0,
    colorHex: '#7f828a',
    sideHex: '#6c6f78',
    bottomHex: '#4c5059',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.stone_bricks, side: T.stone_bricks, bottom: T.stone_bricks },
    hardness: 1.5,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'sandstone',
    name: 'Chiseled Sandstone',
    key: 0,
    colorHex: '#e5d99c',
    sideHex: '#d8cb88',
    bottomHex: '#c9b976',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.sand_a, side: T.sandstone_side, bottom: T.sand_a },
    hardness: 0.9,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    key: 0,
    colorHex: '#311d54',
    sideHex: '#1f1238',
    bottomHex: '#120a21',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.obsidian, side: T.obsidian, bottom: T.obsidian },
    hardness: 4.5,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'pumpkin',
    name: 'Pumpkin',
    key: 0,
    colorHex: '#ea7b1e',
    sideHex: '#d46214',
    bottomHex: '#b04a0c',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.pumpkin_top, side: T.pumpkin_side, bottom: T.pumpkin_top },
    hardness: 0.7,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'melon',
    name: 'Melon Block',
    key: 0,
    colorHex: '#68a838',
    sideHex: '#458226',
    bottomHex: '#2e611c',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.melon_side, side: T.melon_side, bottom: T.melon_side },
    hardness: 0.7,
    transparent: false,
    lightLevel: 0,
  },
  {
    id: 'lava',
    name: 'Molten Lava',
    key: 0,
    colorHex: '#fa9a1e',
    sideHex: '#f0620f',
    bottomHex: '#c93a04',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.lava, side: T.lava, bottom: T.lava },
    hardness: 999,
    transparent: false,
    lightLevel: 15,
  },
  {
    id: 'bedrock',
    name: 'Bedrock',
    key: 0,
    colorHex: '#252832',
    sideHex: '#16181f',
    bottomHex: '#090a0d',
    color: new THREE.Color('#ffffff'),
    tiles: { top: T.bedrock, side: T.bedrock, bottom: T.bedrock },
    hardness: Infinity,
    transparent: false,
    lightLevel: 0,
  },
];

export const BLOCK_BY_ID = Object.fromEntries(
  BLOCK_DEFINITIONS.map((block) => [block.id, block])
);

// Minecraft naming aliases so both internal and atlas.json IDs resolve seamlessly
BLOCK_BY_ID.cobble = BLOCK_BY_ID.cobblestone;
BLOCK_BY_ID.oak_log = BLOCK_BY_ID.wood;
BLOCK_BY_ID.oak_planks = BLOCK_BY_ID.planks;
BLOCK_BY_ID.oak_leaves = BLOCK_BY_ID.leaves;
BLOCK_BY_ID.birch_log = BLOCK_BY_ID.birch_wood;
BLOCK_BY_ID.bricks = BLOCK_BY_ID.brick;
BLOCK_BY_ID.crystal_ore = BLOCK_BY_ID.gem_ore;
BLOCK_BY_ID.glowstone = BLOCK_BY_ID.torch;
BLOCK_BY_ID.snowy_grass = BLOCK_BY_ID.snow;

const iconCache = new Map();
let loadedAtlasImage = null;

if (typeof window !== 'undefined' && typeof Image !== 'undefined') {
  const img = new Image();
  img.src = './assets/blocks/atlas.png';
  img.onload = () => {
    loadedAtlasImage = img;
    iconCache.clear();
    document.querySelectorAll('img.iso-icon[data-block-id]').forEach((el) => {
      const id = el.getAttribute('data-block-id');
      if (id) el.src = getBlockIconDataURL(id);
    });
  };
}

/**
 * Phase U6.3 — Renders an isometric 3D cube icon onto an offscreen canvas
 * using the 64x64 3D Blender-sculpted top and side tiles from public/assets/blocks/atlas.png
 * (or pre-baked ./assets/blocks/<blockId>_render.png).
 */
export function getBlockIconDataURL(blockId) {
  if (iconCache.has(blockId)) {
    return iconCache.get(blockId);
  }

  const block = BLOCK_BY_ID[blockId] || BLOCK_DEFINITIONS[0];
  // Check if pre-rendered 3D Blender isometric PNG exists for this block id
  if (block && block.id && !loadedAtlasImage) {
    return `./assets/blocks/${block.id}_render.png`;
  }

  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;

  const cx = size / 2;
  const cy = size / 2;
  const r = 24;
  const dy = 13;

  if (loadedAtlasImage && block.tiles) {
    const T_PX = 64;
    const COLS = 16;
    const drawTileRect = (tileIdx, shadeAlpha = 0) => {
      const sx = (tileIdx % COLS) * T_PX;
      const sy = Math.floor(tileIdx / COLS) * T_PX;
      ctx.drawImage(loadedAtlasImage, sx, sy, T_PX, T_PX, 0, 0, 1, 1);
      if (shadeAlpha > 0) {
        ctx.fillStyle = `rgba(0, 0, 0, ${shadeAlpha})`;
        ctx.fillRect(0, 0, 1, 1);
      }
    };

    // 1. Top Diamond (+Y): map [0,1]x[0,1] -> top diamond
    ctx.save();
    ctx.setTransform(r, dy, -r, dy, cx, cy - r);
    drawTileRect(block.tiles.top, 0.0);
    ctx.restore();

    // 2. Left Face (-X/+Z sunlit side)
    ctx.save();
    ctx.setTransform(r, dy, 0, r, cx - r, cy - r + dy);
    drawTileRect(block.tiles.side, 0.14);
    ctx.restore();

    // 3. Right Face (+X/-Z shaded side)
    ctx.save();
    ctx.setTransform(r, -dy, 0, r, cx, cy - r + dy * 2);
    drawTileRect(block.tiles.side, 0.32);
    ctx.restore();
  } else {
    // Fallback polygon rendering
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy - r + dy);
    ctx.lineTo(cx, cy - r + dy * 2);
    ctx.lineTo(cx - r, cy - r + dy);
    ctx.closePath();
    ctx.fillStyle = block.colorHex;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx - r, cy - r + dy);
    ctx.lineTo(cx, cy - r + dy * 2);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy + r - dy);
    ctx.closePath();
    ctx.fillStyle = block.sideHex;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx, cy - r + dy * 2);
    ctx.lineTo(cx + r, cy - r + dy);
    ctx.lineTo(cx + r, cy + r - dy);
    ctx.lineTo(cx, cy + r);
    ctx.closePath();
    ctx.fillStyle = block.bottomHex || block.sideHex;
    ctx.fill();
  }

  const url = canvas.toDataURL();
  iconCache.set(blockId, url);
  return url;
}
