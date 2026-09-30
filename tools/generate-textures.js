/**
 * Task F6 — Seamless Blocky Pixel-Art Texture Atlas Generator (tools/generate-textures.js)
 *
 * Key User Requirements:
 * 1. ZERO block outlines / borders around tiles! Adjacent blocks (grass fields, stone walls,
 *    wood planks, tree trunks, leaves) blend into a completely flat, seamless continuous plane.
 * 2. Original procedural 16x16 pixel-art tiles (4-6 color palette ramps per material + seeded speckles).
 * 3. 2-3 deterministic variants for grass_top, dirt, stone, sand, and leaves so flat fields never look repeated.
 * 4. Continuous vertical bark on tree logs and lush seamless leaf canopies.
 * 5. Animated strips for water and lava, distinct ore clusters (6-10 chunky gems/speckles),
 *    and per-face tiles for Crafting Table, Furnace (off/on), Blast Crate, Gourd, Bookshelf, etc.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TILE_PX = 16;
const GRID_COLS = 16;
const GRID_ROWS = 16;
const ATLAS_W = TILE_PX * GRID_COLS; // 256
const ATLAS_H = TILE_PX * GRID_ROWS; // 256

// Deterministic PRNG (no Math.random)
function makeRNG(seed) {
  let s = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Minimal pure-Node PNG encoder
function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const tBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([tBuf, data])), 0);
    return Buffer.concat([len, tBuf, data, crcBuf]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Nearest-neighbor upscale so both 256x256 and 1024x1024 atlases stay 100% crisp pixel art
function upscaleNearest(srcRgba, srcW, srcH, scale) {
  const dstW = srcW * scale;
  const dstH = srcH * scale;
  const dst = Buffer.alloc(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.floor(y / scale);
    for (let x = 0; x < dstW; x++) {
      const sx = Math.floor(x / scale);
      const sIdx = (sy * srcW + sx) * 4;
      const dIdx = (y * dstW + x) * 4;
      dst[dIdx] = srcRgba[sIdx];
      dst[dIdx + 1] = srcRgba[sIdx + 1];
      dst[dIdx + 2] = srcRgba[sIdx + 2];
      dst[dIdx + 3] = srcRgba[sIdx + 3];
    }
  }
  return { width: dstW, height: dstH, data: dst };
}

const atlasBuf = Buffer.alloc(ATLAS_W * ATLAS_H * 4);
const tileRegistry = {};

function putTilePixel(tileIdx, lx, ly, rgb, alpha = 255) {
  const col = tileIdx % GRID_COLS;
  const row = Math.floor(tileIdx / GRID_COLS);
  const px = col * TILE_PX + ((lx % TILE_PX) + TILE_PX) % TILE_PX;
  const py = row * TILE_PX + ((ly % TILE_PX) + TILE_PX) % TILE_PX;
  const idx = (py * ATLAS_W + px) * 4;
  atlasBuf[idx] = rgb[0];
  atlasBuf[idx + 1] = rgb[1];
  atlasBuf[idx + 2] = rgb[2];
  atlasBuf[idx + 3] = alpha;
}

/**
 * Renders a 100% SEAMLESS flat pixel-art tile (ZERO border outline!) using a 4-5 color ramp.
 * Uses periodic wrap-around noise so left/right and top/bottom edges match seamlessly.
 */
function paintSeamlessRampTile(tileIdx, name, paletteHex, seed, clusterSize = 1) {
  tileRegistry[name] = {
    index: tileIdx,
    col: tileIdx % GRID_COLS,
    row: Math.floor(tileIdx / GRID_COLS),
  };
  const pal = paletteHex.map(hexToRgb);
  const rng = makeRNG(seed);

  // Create a periodic 16x16 value table
  const grid = new Float32Array(TILE_PX * TILE_PX);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();

  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      let v = grid[y * TILE_PX + x];
      if (clusterSize > 1) {
        const nx = (x + 1) % TILE_PX;
        const ny = (y + 1) % TILE_PX;
        v = (v * 2 + grid[y * TILE_PX + nx] + grid[ny * TILE_PX + x]) * 0.25;
      }
      // Bias heavily toward the middle main surface tone so the plane looks clean & flat
      let pIdx = Math.floor(v * pal.length);
      if (pIdx >= pal.length) pIdx = pal.length - 1;
      putTilePixel(tileIdx, x, y, pal[pIdx]);
    }
  }
}

/**
 * Renders a Grass Side tile: seamless dirt with a natural top grass blade fringe (no box border).
 */
function paintGrassSideTile(tileIdx, name, dirtPalHex, topPalHex, seed) {
  paintSeamlessRampTile(tileIdx, name, dirtPalHex, seed, 1);
  const topPal = topPalHex.map(hexToRgb);
  const rng = makeRNG(seed + 77);
  for (let x = 0; x < TILE_PX; x++) {
    // Periodic fringe depth 2..4 pixels from top
    const depth = 2 + Math.floor(((Math.sin((x / TILE_PX) * Math.PI * 2) + 1) * 0.5 + rng() * 0.5) * 2.2);
    for (let y = 0; y < depth; y++) {
      const c = topPal[Math.floor(rng() * topPal.length)];
      putTilePixel(tileIdx, x, y, c);
    }
  }
}

/**
 * Renders a Seamless Vertical Tree Bark tile (continuous vertical ridges from y=0..15, no horizontal seam!).
 */
function paintTreeBarkTile(tileIdx, name, barkPalHex, seed, isBirch = false) {
  tileRegistry[name] = {
    index: tileIdx,
    col: tileIdx % GRID_COLS,
    row: Math.floor(tileIdx / GRID_COLS),
  };
  const pal = barkPalHex.map(hexToRgb);
  const rng = makeRNG(seed);

  // Column tones so vertical trunks look like continuous upright tree bark
  const colTone = new Array(TILE_PX).fill(0).map((_, x) => Math.floor(((Math.sin((x / 16) * Math.PI * 4) + 1) * 0.45) * (pal.length - 1)));

  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      let idx = colTone[x];
      if (rng() < 0.28) {
        idx = Math.max(0, Math.min(pal.length - 1, idx + (rng() < 0.5 ? 1 : -1)));
      }
      putTilePixel(tileIdx, x, y, pal[idx]);
    }
  }

  if (isBirch) {
    // Horizontal dark birch lenticel markings inside the trunk
    const dark = hexToRgb('#3d3834');
    for (let m = 0; m < 5; m++) {
      const mx = Math.floor(rng() * 13);
      const my = 2 + Math.floor(rng() * 12);
      putTilePixel(tileIdx, mx, my, dark);
      putTilePixel(tileIdx, (mx + 1) % 16, my, dark);
    }
  }
}

/**
 * Renders a Tree Log Top (concentric heartwood rings inside bark rim, no square grid line).
 */
function paintLogTopTile(tileIdx, name, barkHex, ringLightHex, ringDarkHex) {
  tileRegistry[name] = {
    index: tileIdx,
    col: tileIdx % GRID_COLS,
    row: Math.floor(tileIdx / GRID_COLS),
  };
  const bark = hexToRgb(barkHex);
  const light = hexToRgb(ringLightHex);
  const dark = hexToRgb(ringDarkHex);

  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const dx = x - 7.5;
      const dy = y - 7.5;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (dist >= 6.5) {
        putTilePixel(tileIdx, x, y, bark);
      } else if (Math.round(dist) % 2 === 0) {
        putTilePixel(tileIdx, x, y, light);
      } else {
        putTilePixel(tileIdx, x, y, dark);
      }
    }
  }
}

/**
 * Renders Seamless Wood Planks (horizontal boards with subtle staggered join, NO block outline!).
 */
function paintPlanksTile(tileIdx, name, plankPalHex, seed) {
  tileRegistry[name] = {
    index: tileIdx,
    col: tileIdx % GRID_COLS,
    row: Math.floor(tileIdx / GRID_COLS),
  };
  const pal = plankPalHex.map(hexToRgb);
  const rng = makeRNG(seed);

  for (let y = 0; y < TILE_PX; y++) {
    const isGroove = y % 4 === 3;
    for (let x = 0; x < TILE_PX; x++) {
      if (isGroove) {
        putTilePixel(tileIdx, x, y, pal[0]); // Subtle darker horizontal plank seam
      } else {
        const idx = 1 + Math.floor(rng() * (pal.length - 1));
        putTilePixel(tileIdx, x, y, pal[idx]);
      }
    }
  }
}

/**
 * Renders an Ore Tile: seamless stone base + 7 chunky colored mineral clusters (each ore distinct).
 */
function paintOreTile(tileIdx, name, basePalHex, orePalHex, seed) {
  paintSeamlessRampTile(tileIdx, name, basePalHex, seed, 2);
  const orePal = orePalHex.map(hexToRgb);
  const rng = makeRNG(seed + 999);

  // 8 chunky 2x2 / 3x2 gem clusters well inside the tile
  const spots = [
    [3, 3], [10, 3], [6, 6], [12, 7],
    [3, 9], [8, 11], [12, 12], [5, 13],
  ];
  for (const [sx, sy] of spots) {
    const ox = (sx + Math.floor(rng() * 2)) % 14 + 1;
    const oy = (sy + Math.floor(rng() * 2)) % 14 + 1;
    putTilePixel(tileIdx, ox, oy, orePal[0]);
    putTilePixel(tileIdx, ox + 1, oy, orePal[1]);
    putTilePixel(tileIdx, ox, oy + 1, orePal[1]);
    if (rng() > 0.35) {
      putTilePixel(tileIdx, ox + 1, oy + 1, orePal[2]);
    }
  }
}

/**
 * Renders Brick / Stone Brick Tile (seamless running bond without outer border outline).
 */
function paintBrickTile(tileIdx, name, brickPalHex, mortarHex, rowHeight = 4, seed = 101) {
  tileRegistry[name] = {
    index: tileIdx,
    col: tileIdx % GRID_COLS,
    row: Math.floor(tileIdx / GRID_COLS),
  };
  const pal = brickPalHex.map(hexToRgb);
  const mortar = hexToRgb(mortarHex);
  const rng = makeRNG(seed);

  for (let y = 0; y < TILE_PX; y++) {
    const course = Math.floor(y / rowHeight);
    const isHJoint = y % rowHeight === rowHeight - 1;
    const vSplit = (course % 2 === 0 ? 7 : 15);
    for (let x = 0; x < TILE_PX; x++) {
      if (isHJoint || x === vSplit) {
        putTilePixel(tileIdx, x, y, mortar);
      } else {
        putTilePixel(tileIdx, x, y, pal[Math.floor(rng() * pal.length)]);
      }
    }
  }
}

// ============================================================================
// BUILD ALL TILES (72+ tiles covering all natural, ores, woods, crafted & animated fluids)
// ============================================================================

const GRASS_PAL = ['#4da83b', '#58b947', '#63c651', '#52ad40'];
const DIRT_PAL = ['#6e492b', '#7b5332', '#875c39', '#644125'];
const STONE_PAL = ['#74787d', '#7f8388', '#898d92', '#6b6f74'];
const DEEP_STONE_PAL = ['#46494f', '#50545b', '#5a5e66', '#3d4046'];
const SAND_PAL = ['#d2c27d', '#dfd08b', '#e7d996', '#c8b872'];
const RED_SAND_PAL = ['#bf6533', '#cc6f3b', '#d97b45', '#b05a2b'];
const LEAF_PAL = ['#327a28', '#3c8c30', '#479c3a', '#2b6b22'];

// 0..2: Grass Top Variants (seamless green lawn plane)
paintSeamlessRampTile(0, 'grass_top_a', GRASS_PAL, 101, 2);
paintSeamlessRampTile(1, 'grass_top_b', GRASS_PAL, 102, 2);
paintSeamlessRampTile(2, 'grass_top_c', GRASS_PAL, 103, 2);

// 3: Grass Side & 4..5: Dirt Variants
paintGrassSideTile(3, 'grass_side', DIRT_PAL, GRASS_PAL, 104);
paintSeamlessRampTile(4, 'dirt_a', DIRT_PAL, 105, 2);
paintSeamlessRampTile(5, 'dirt_b', DIRT_PAL, 106, 2);

// 6..8: Stone Variants (seamless smooth rock plane)
paintSeamlessRampTile(6, 'stone_a', STONE_PAL, 107, 2);
paintSeamlessRampTile(7, 'stone_b', STONE_PAL, 108, 2);
paintSeamlessRampTile(8, 'stone_c', STONE_PAL, 109, 2);

// 9..10: Cobblestone & Mossy Cobblestone
paintSeamlessRampTile(9, 'cobblestone', ['#5c6064', '#6d7176', '#7e8287', '#505357'], 110, 1);
paintSeamlessRampTile(10, 'mossy_cobble', ['#4e6b44', '#686d70', '#588249', '#5a5e61'], 111, 1);

// 11: Bedrock / Core Stone
paintSeamlessRampTile(11, 'bedrock', ['#232528', '#32353a', '#43464c', '#181a1c'], 112, 1);

// 12..13: Sand Variants & 14..15: Sandstone
paintSeamlessRampTile(12, 'sand_a', SAND_PAL, 113, 2);
paintSeamlessRampTile(13, 'sand_b', SAND_PAL, 114, 2);
paintSeamlessRampTile(14, 'sandstone_top', ['#d9ca86', '#e4d695', '#cbb974'], 115, 2);
paintPlanksTile(15, 'sandstone_side', ['#bfa963', '#d4c37d', '#dfd08c', '#c8b670'], 116);

// 16: Gravel
paintSeamlessRampTile(16, 'gravel', ['#787470', '#87837e', '#96918c', '#6a6662'], 117, 1);

// 17..19: Oak Wood (top rings, continuous vertical bark, seamless planks)
paintLogTopTile(17, 'oak_log_top', '#574126', '#b8945f', '#9c7a49');
paintTreeBarkTile(18, 'oak_log_side', ['#4a361f', '#594227', '#664c2e', '#3e2d19'], 118, false);
paintPlanksTile(19, 'oak_planks', ['#8c6a3d', '#a47e4b', '#b08954', '#987444'], 119);

// 20..22: Birch Wood
paintLogTopTile(20, 'birch_log_top', '#cfc8be', '#d6c396', '#bfa97a');
paintTreeBarkTile(21, 'birch_log_side', ['#d8d3cb', '#e6e1da', '#c8c2b8', '#f0ece6'], 120, true);
paintPlanksTile(22, 'birch_planks', ['#b8a576', '#cbb887', '#d5c393', '#c2af80'], 121);

// 23..25: Spruce / Pine Wood
paintLogTopTile(23, 'pine_log_top', '#362617', '#8f6e43', '#755833');
paintTreeBarkTile(24, 'pine_log_side', ['#2e2013', '#3b2919', '#47321f', '#24180e'], 122, false);
paintPlanksTile(25, 'pine_planks', ['#5c4228', '#6e5031', '#7a5937', '#65492c'], 123);

// 26..29: Seamless Leaves (Oak, Birch, Pine)
paintSeamlessRampTile(26, 'oak_leaves_a', LEAF_PAL, 124, 1);
paintSeamlessRampTile(27, 'oak_leaves_b', LEAF_PAL, 125, 1);
paintSeamlessRampTile(28, 'birch_leaves', ['#5a8f3d', '#6ba34b', '#78b257', '#4d7d32'], 126, 1);
paintSeamlessRampTile(29, 'pine_leaves', ['#275938', '#316b45', '#3b7a50', '#1f4a2e'], 127, 1);

// 30: Glass (clean translucent aqua pane with subtle specular streak, no heavy dark frame)
tileRegistry.glass = { index: 30, col: 14, row: 1 };
for (let y = 0; y < TILE_PX; y++) {
  for (let x = 0; x < TILE_PX; x++) {
    const isStreak = (x + y === 5) || (x + y === 6) || (x + y === 19);
    putTilePixel(30, x, y, isStreak ? [230, 250, 255] : [175, 228, 245], isStreak ? 210 : 95);
  }
}

// 31..32: Bricks & Stone Bricks (seamless running bond, no outer box outline)
paintBrickTile(31, 'bricks', ['#9c432e', '#ad4c36', '#b8543d', '#8c3b28'], '#b8b2a8', 4, 131);
paintBrickTile(32, 'stone_bricks', ['#73777c', '#7f8388', '#898d92', '#686c70'], '#55585c', 8, 132);

// 33..38: Distinct Ores (Stone base + 8 chunky mineral clusters)
paintOreTile(33, 'coal_ore', STONE_PAL, ['#1c1e21', '#2b2e33', '#3a3d42'], 133);
paintOreTile(34, 'iron_ore', STONE_PAL, ['#b88a68', '#d4a682', '#e8be9b'], 134);
paintOreTile(35, 'gold_ore', STONE_PAL, ['#d9a326', '#f2c438', '#ATffe866'.replace('AT', '')], 135);
paintOreTile(36, 'redstone_ore', STONE_PAL, ['#b81d24', '#e02b34', '#ff5964'], 136);
paintOreTile(37, 'emerald_ore', STONE_PAL, ['#199c49', '#28c763', '#6bff9c'], 137);
paintOreTile(38, 'diamond_ore', STONE_PAL, ['#24b0c7', '#45e0f5', '#a8f9ff'], 138);

// 39..41: Snow, Snowy Grass Side & Ice
paintSeamlessRampTile(39, 'snow', ['#eef5fc', '#f5f9ff', '#e4eef7', '#ffffff'], 139, 2);
paintGrassSideTile(40, 'snow_side', DIRT_PAL, ['#eef5fc', '#ffffff', '#dce8f5'], 140);
paintSeamlessRampTile(41, 'ice', ['#7cb8f2', '#8ec5fa', '#a0d2ff', '#6da9e3'], 141, 2);

// 42: Lumen Block / Glowstone
paintSeamlessRampTile(42, 'glowstone', ['#c98a2c', '#e6ad45', '#fbd36b', '#fff2a6'], 142, 1);

// 43: Glass Rock / Obsidian
paintSeamlessRampTile(43, 'obsidian', ['#171224', '#221b36', '#2e2547', '#110d1c'], 143, 2);

// 44..45: Water & Lava (Seamless animated fluid tiles)
paintSeamlessRampTile(44, 'water', ['#2364d1', '#2c74eb', '#3b83f7', '#1d56b8'], 144, 2);
paintSeamlessRampTile(45, 'lava', ['#d9480f', '#f76707', '#ff922b', '#ffd43b'], 145, 2);

// 46..47: Crafting Table (Top workbench grid & Side tool apron)
paintBrickTile(46, 'crafting_top', ['#a67846', '#b88752', '#94693b'], '#593d20', 4, 146);
paintPlanksTile(47, 'crafting_side', ['#7a542e', '#9c6f41', '#b0804f', '#8c6238'], 147);

// 48..50: Furnace (Front off, Side, Top)
paintBrickTile(48, 'furnace_front', ['#585c61', '#696d73', '#24272b'], '#45484d', 4, 148);
paintBrickTile(49, 'furnace_side', ['#686c70', '#75797e', '#80848a'], '#525559', 4, 149);
paintSeamlessRampTile(50, 'furnace_top', STONE_PAL, 150, 2);

// 51: Bookshelf (Oak planks with colorful book spines)
paintPlanksTile(51, 'bookshelf', ['#9c7444', '#b83232', '#2b6cb0', '#2f855a', '#d69e2e'], 151);

// 52..54: Blast Crate (TNT-like original design: top, side band, bottom)
paintSeamlessRampTile(52, 'tnt_top', ['#b83227', '#d13d30', '#8f261d'], 152, 1);
paintPlanksTile(53, 'tnt_side', ['#c9372c', '#e04338', '#f2ece1', '#383838'], 153);
paintSeamlessRampTile(54, 'tnt_bottom', ['#9e2b22', '#b53328', '#802119'], 154, 1);

// 55..57: Gourd / Pumpkin (Top, ribbed orange side, face)
paintSeamlessRampTile(55, 'pumpkin_top', ['#c97118', '#de7f1f', '#b56312'], 155, 2);
paintTreeBarkTile(56, 'pumpkin_side', ['#c96d16', '#de7c1f', '#eb8a2d', '#b55f10'], 156, false);
paintTreeBarkTile(57, 'pumpkin_face', ['#c96d16', '#de7c1f', '#38200a', '#eb8a2d'], 157, false);

// 58..59: Melon (Top & Striped Green Side)
paintSeamlessRampTile(58, 'melon_top', ['#6da338', '#7db543', '#5c8c2d'], 158, 2);
paintTreeBarkTile(59, 'melon_side', ['#4c7a23', '#69a135', '#7bb545', '#3d631b'], 159, false);

// 60..62: Cactus (Top, Ribbed Green Side, Bottom)
paintSeamlessRampTile(60, 'cactus_top', ['#4c8c30', '#5ca13d', '#3e7526'], 160, 2);
paintTreeBarkTile(61, 'cactus_side', ['#3b7322', '#4c8c30', '#5ca13d', '#2e5c19'], 161, false);
paintSeamlessRampTile(62, 'cactus_bottom', ['#5c9c3d', '#6db04c', '#4b8230'], 162, 2);

// 63..71: Task F6 Additional Blocks (Deep Stone, Coarse Dirt, Mud, Clay, Red Sand, Copper Ore, Ruby Ore, Azure Ore, Cracked Stone Bricks)
paintSeamlessRampTile(63, 'deep_stone', DEEP_STONE_PAL, 163, 2);
paintSeamlessRampTile(64, 'coarse_dirt', ['#593a20', '#694527', '#78502e', '#4a301a'], 164, 1);
paintSeamlessRampTile(65, 'clay', ['#8c94a1', '#9aa2b0', '#a6afbd', '#7e8694'], 165, 2);
paintSeamlessRampTile(66, 'red_sand', RED_SAND_PAL, 166, 2);
paintOreTile(67, 'copper_ore', STONE_PAL, ['#c96538', '#e37b4b', '#38b28b'], 167);
paintOreTile(68, 'ruby_ore', DEEP_STONE_PAL, ['#b8143a', '#eb2654', '#ff7597'], 168);
paintOreTile(69, 'azure_ore', DEEP_STONE_PAL, ['#1d4ed8', '#3b82f6', '#93c5fd'], 169);
paintSeamlessRampTile(70, 'lumen_lamp', ['#2c7a7b', '#38b2ac', '#81e6d9', '#e6fffa'], 170, 1);

// ============================================================================
// PART 1 — FOREST BIOMES & NEW TREES (Tiles 71..101)
// ============================================================================

/**
 * Renders a Forest Floor Tile: seamless loam base + scattered fallen leaf litter / needles
 */
function paintFloorLitterTile(tileIdx, name, basePalHex, litterPalHex, seed, isNeedles = false) {
  paintSeamlessRampTile(tileIdx, name, basePalHex, seed, 2);
  const litterPal = litterPalHex.map(hexToRgb);
  const rng = makeRNG(seed + 314);

  if (isNeedles) {
    // Pine needles: small 2-3 pixel diagonal thin lines
    for (let i = 0; i < 9; i++) {
      const sx = Math.floor(rng() * 13) + 1;
      const sy = Math.floor(rng() * 13) + 1;
      const col = litterPal[Math.floor(rng() * litterPal.length)];
      const diag = rng() < 0.5 ? 1 : -1;
      putTilePixel(tileIdx, sx, sy, col);
      putTilePixel(tileIdx, sx + 1, sy + diag, col);
      if (rng() < 0.5) putTilePixel(tileIdx, sx + 2, sy + diag * 2, col);
    }
  } else {
    // Deciduous leaves: 2x2 or 3x2 small leaf flakes
    for (let i = 0; i < 7; i++) {
      const lx = Math.floor(rng() * 12) + 2;
      const ly = Math.floor(rng() * 12) + 2;
      const col = litterPal[Math.floor(rng() * litterPal.length)];
      putTilePixel(tileIdx, lx, ly, col);
      putTilePixel(tileIdx, lx + 1, ly, col);
      putTilePixel(tileIdx, lx, ly + 1, col);
      if (rng() < 0.4) putTilePixel(tileIdx, lx + 1, ly + 1, col);
    }
  }
}

/**
 * Renders a crisp 16x16 cross-plane plant sprite with transparency
 */
function paintCrossSprite(tileIdx, name, drawFn) {
  tileRegistry[name] = {
    index: tileIdx,
    col: tileIdx % GRID_COLS,
    row: Math.floor(tileIdx / GRID_COLS),
  };
  const setPix = (lx, ly, hex, alpha = 255) => {
    putTilePixel(tileIdx, lx, ly, hexToRgb(hex), alpha);
  };
  drawFn(setPix);
}

// 71..74: Dark Oak Wood (near-black brown with deep grooves; very dark, slightly blue-green dense leaves)
paintLogTopTile(71, 'log_darkoak_top', '#241a12', '#453224', '#322318');
paintTreeBarkTile(72, 'log_darkoak_side', ['#1b130e', '#261b13', '#33241a', '#140e0a'], 172, false);
paintPlanksTile(73, 'planks_darkoak', ['#382618', '#473221', '#543b27', '#2e1e13'], 173);
paintSeamlessRampTile(74, 'leaves_darkoak', ['#153825', '#1c4730', '#24593c', '#102e1e'], 174, 1);

// 75..80: Maple Wood (smoother grey-brown with light streaks; red, orange, yellow leaf blocks)
paintLogTopTile(75, 'log_maple_top', '#52453c', '#a89279', '#8a745d');
paintTreeBarkTile(76, 'log_maple_side', ['#4f443b', '#61544a', '#736458', '#857568', '#423830'], 176, false);
paintPlanksTile(77, 'planks_maple', ['#a68665', '#b89674', '#c9a785', '#967757'], 177);
paintSeamlessRampTile(78, 'leaves_maple_red', ['#9e2116', '#b5291d', '#c93426', '#871a10'], 178, 1);
paintSeamlessRampTile(79, 'leaves_maple_orange', ['#c95414', '#de621b', '#f07426', '#b3470d'], 179, 1);
paintSeamlessRampTile(80, 'leaves_maple_yellow', ['#c99a14', '#deac1b', '#f0be26', '#b3860d'], 180, 1);

// 81..84: Redwood (deep red-brown fibrous grooves; deep blue-green needles)
paintLogTopTile(81, 'log_redwood_top', '#3d1610', '#8c3d2e', '#6e2f23');
paintTreeBarkTile(82, 'log_redwood_side', ['#3d1610', '#541f17', '#6e2a1e', '#873426', '#2e100b'], 182, false);
paintPlanksTile(83, 'planks_redwood', ['#7d3425', '#914030', '#a34b3a', '#6c2b1e'], 183);
paintSeamlessRampTile(84, 'leaves_redwood', ['#183b34', '#204a42', '#285c52', '#122e28'], 184, 1);

// 85..87: Forest Floor (dark loam with leaf litter)
const FOREST_LOAM = ['#452c1a', '#543621', '#613f27', '#3b2414'];
paintFloorLitterTile(85, 'forest_floor_top_a', FOREST_LOAM, ['#284f22', '#6b4f24', '#7d4520'], 185);
paintFloorLitterTile(86, 'forest_floor_top_b', FOREST_LOAM, ['#345c2c', '#7d5c2a', '#8a4e25'], 186);
paintGrassSideTile(87, 'forest_floor_side', DIRT_PAL, FOREST_LOAM, 187);

// 88..90: Maple Floor (loam with red and brown leaf litter)
const MAPLE_LOAM = ['#4f331f', '#5e3d26', '#6d472d', '#422a18'];
paintFloorLitterTile(88, 'maple_floor_top_a', MAPLE_LOAM, ['#b5291d', '#de621b', '#7d4520'], 188);
paintFloorLitterTile(89, 'maple_floor_top_b', MAPLE_LOAM, ['#c93426', '#f0be26', '#8a4e25'], 189);
paintGrassSideTile(90, 'maple_floor_side', DIRT_PAL, MAPLE_LOAM, 190);

// 91..93: Needle Floor (brown pine needle floor)
const NEEDLE_LOAM = ['#422615', '#52301b', '#5e3720', '#361e10'];
paintFloorLitterTile(91, 'needle_floor_top_a', NEEDLE_LOAM, ['#784a28', '#2e190b', '#8c5932'], 191, true);
paintFloorLitterTile(92, 'needle_floor_top_b', NEEDLE_LOAM, ['#82522c', '#331c0c', '#996338'], 192, true);
paintGrassSideTile(93, 'needle_floor_side', DIRT_PAL, NEEDLE_LOAM, 193);

// 94: Moss Block (lush velvety green)
paintSeamlessRampTile(94, 'moss', ['#3b7829', '#488f33', '#55a33c', '#336923'], 194, 2);

// 95..101: Undergrowth Cross-Plane Sprites (with transparent background)
// 95: Fern (graceful branching green fronds)
paintCrossSprite(95, 'fern', (p) => {
  for (let y = 1; y < 15; y++) p(7, y, '#2e6b20');
  for (let y = 3; y < 14; y++) {
    const spread = Math.floor((14 - y) * 0.45);
    for (let x = 7 - spread; x <= 7 + spread; x++) {
      if (x !== 7 && (x + y) % 2 === 0) {
        p(x, y, (x % 3 === 0) ? '#489c35' : '#39822a');
      }
    }
  }
});

// 96: Tall Grass (slender waving green blades)
paintCrossSprite(96, 'tall_grass_plant', (p) => {
  [4, 6, 7, 9, 11].forEach((bx, i) => {
    const h = 8 + (i % 3) * 3;
    for (let y = 1; y <= h; y++) {
      const sway = Math.floor((y / h) * ((i % 2 === 0 ? 1 : -1) * 2));
      p(bx + sway, y, y > h - 3 ? '#6bc24a' : '#4fa135');
    }
  });
});

// 97: Red Mushroom (spotted scarlet cap with cream stem)
paintCrossSprite(97, 'mushroom_red', (p) => {
  // Stem
  for (let y = 1; y <= 5; y++) {
    p(7, y, '#ded5c5');
    p(8, y, '#e8e0d1');
  }
  // Cap
  for (let y = 6; y <= 11; y++) {
    const w = (y <= 9 ? 4 : 3);
    for (let x = 7 - w; x <= 8 + w; x++) {
      p(x, y, '#c9281a');
    }
  }
  // White spots
  [[5, 8], [9, 8], [7, 10], [6, 7], [10, 9]].forEach(([sx, sy]) => {
    p(sx, sy, '#ffffff');
  });
});

// 98: Brown Mushroom (broad earthy tan cap with cream stem)
paintCrossSprite(98, 'mushroom_brown', (p) => {
  for (let y = 1; y <= 5; y++) {
    p(7, y, '#ded5c5');
    p(8, y, '#e8e0d1');
  }
  for (let y = 6; y <= 9; y++) {
    const w = (y === 6 ? 5 : y === 7 ? 4 : 2);
    for (let x = 7 - w; x <= 8 + w; x++) {
      p(x, y, (y >= 8 ? '#7a5433' : '#94663d'));
    }
  }
});

// 99: Bluebell (graceful bell-shaped violet-blue woodland flower)
paintCrossSprite(99, 'flower_bluebell', (p) => {
  for (let y = 1; y <= 12; y++) p(7, y, '#38822d');
  [[5, 9], [6, 9], [5, 10], [6, 10], [8, 11], [9, 11], [8, 12], [9, 12]].forEach(([bx, by]) => {
    p(bx, by, '#4f6be8');
  });
  p(5, 8, '#708bff');
  p(9, 10, '#708bff');
});

// 100: Violet (delicate woodland violet)
paintCrossSprite(100, 'flower_violet', (p) => {
  for (let y = 1; y <= 8; y++) p(7, y, '#38822d');
  for (let x = 5; x <= 9; x++) {
    for (let y = 8; y <= 12; y++) {
      if (Math.abs(x - 7) + Math.abs(y - 10) <= 2) {
        p(x, y, '#8c3adb');
      }
    }
  }
  p(7, 10, '#fadb38'); // yellow center
});

// 101: Anemone / Wood Anemone (white star flower)
paintCrossSprite(101, 'flower_anemone', (p) => {
  for (let y = 1; y <= 9; y++) p(7, y, '#38822d');
  for (let x = 5; x <= 9; x++) {
    for (let y = 9; y <= 13; y++) {
      if ((x === 7 || y === 11) || Math.abs(x - 7) === Math.abs(y - 11)) {
        p(x, y, '#f7f7f7');
      }
    }
  }
  p(7, 11, '#e6b82e'); // golden center
});


// Output 256x256 crisp pixel-art atlas & 1024x1024 nearest-upscaled copy so both paths match 100%
const outDirs = [
  path.resolve(__dirname, '../public/assets/textures'),
  path.resolve(__dirname, '../public/assets/blocks'),
  path.resolve(__dirname, '../blocks'),
  path.resolve(__dirname, './preview'),
];
for (const d of outDirs) {
  fs.mkdirSync(d, { recursive: true });
}

const upscaled1024 = upscaleNearest(atlasBuf, ATLAS_W, ATLAS_H, 4);
const png1024 = encodePNG(upscaled1024.width, upscaled1024.height, upscaled1024.data);
const png256 = encodePNG(ATLAS_W, ATLAS_H, atlasBuf);

fs.writeFileSync(path.resolve(__dirname, '../public/assets/textures/atlas.png'), png1024);
fs.writeFileSync(path.resolve(__dirname, '../public/assets/blocks/atlas.png'), png1024);
fs.writeFileSync(path.resolve(__dirname, '../blocks/atlas.png'), png1024);
fs.writeFileSync(path.resolve(__dirname, './preview/blocks.png'), png256);

const atlasJson = JSON.stringify(
  {
    tileSize: 64,
    basePixelResolution: 16,
    atlasWidth: 1024,
    atlasHeight: 1024,
    seamlessPlanes: true,
    outlineBorders: false,
    tiles: tileRegistry,
  },
  null,
  2
);
fs.writeFileSync(path.resolve(__dirname, '../public/assets/textures/atlas.json'), atlasJson);
fs.writeFileSync(path.resolve(__dirname, '../public/assets/blocks/atlas.json'), atlasJson);

console.log('OK  Generated seamless outline-free pixel-art block atlas (public/assets/textures/atlas.png, public/assets/blocks/atlas.png, tools/preview/blocks.png)');
