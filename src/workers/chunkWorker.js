import { SeededSimplexNoise, WORLD_MAX_Y, getBiome } from '../noise.js';
import { BLOCK_BY_ID } from '../blocks.js';

// ============================================================================
// Phase U0.2 & U2.2 — Web Worker for Off-Main-Thread Chunk Generation, AO & Meshing
// ============================================================================

const CHUNK_SIZE = 16;
let cachedSeed = null;
let noise = null;

function ensureNoise(seed) {
  if (!noise || cachedSeed !== seed) {
    cachedSeed = seed;
    noise = new SeededSimplexNoise(seed);
  }
}

function coordKey(x, y, z) {
  return `${x},${y},${z}`;
}

self.onmessage = (event) => {
  const { jobId, chunkX, chunkZ, seed, diffs, caveXRay } = event.data;
  ensureNoise(seed);

  const startX = chunkX * CHUNK_SIZE;
  const startZ = chunkZ * CHUNK_SIZE;

  const diffMap = new Map(diffs || []);
  const blocks = new Map();

  // 1. Generate chunk column blocks up to WORLD_MAX_Y
  // Part A3.1: Call getBiome(wx, wz, seed) and getSurfaceHeight(wx, wz) ONCE per column (x, z)
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    const wx = startX + lx;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wz = startZ + lz;
      const biome = getBiome(wx, wz, seed);
      const surfaceY = noise.getSurfaceHeight(wx, wz);
      const maxColY = Math.min(WORLD_MAX_Y, Math.max(surfaceY + 44, 24));

      for (let wy = 0; wy <= maxColY; wy++) {
        const key = coordKey(wx, wy, wz);
        if (diffMap.has(key)) {
          const modVal = diffMap.get(key);
          if (modVal) blocks.set(key, modVal);
          continue;
        }
        const naturalType = noise.getColumnBlockAt(
          wx,
          wy,
          wz,
          surfaceY,
          biome
        );
        if (naturalType) {
          blocks.set(key, naturalType);
        }
      }
    }
  }

  // Also apply any high-altitude player builds from diffMap
  for (const [key, modVal] of diffMap.entries()) {
    const [wx, , wz] = key.split(',').map(Number);
    if (
      wx >= startX &&
      wx < startX + CHUNK_SIZE &&
      wz >= startZ &&
      wz < startZ + CHUNK_SIZE
    ) {
      if (modVal === null) {
        blocks.delete(key);
      } else {
        blocks.set(key, modVal);
      }
    }
  }

  const hasSolidAt = (wx, wy, wz) => {
    const key = coordKey(wx, wy, wz);
    if (
      wx >= startX &&
      wx < startX + CHUNK_SIZE &&
      wz >= startZ &&
      wz < startZ + CHUNK_SIZE
    ) {
      const b = blocks.get(key);
      const def = BLOCK_BY_ID[b];
      return Boolean(b && b !== 'water' && b !== 'lava' && (!def || !def.isPlant));
    }
    if (diffMap.has(key)) {
      const b = diffMap.get(key);
      const def = BLOCK_BY_ID[b];
      return Boolean(b && b !== 'water' && b !== 'lava' && (!def || !def.isPlant));
    }
    const nat = noise.getNaturalBlockAt(wx, wy, wz);
    const def = BLOCK_BY_ID[nat];
    return Boolean(nat && nat !== 'water' && nat !== 'lava' && (!def || !def.isPlant));
  };

  const hasAnyAt = (wx, wy, wz) => {
    const key = coordKey(wx, wy, wz);
    if (
      wx >= startX &&
      wx < startX + CHUNK_SIZE &&
      wz >= startZ &&
      wz < startZ + CHUNK_SIZE
    ) {
      return blocks.has(key);
    }
    if (diffMap.has(key)) {
      return diffMap.get(key) !== null;
    }
    return noise.getNaturalBlockAt(wx, wy, wz) !== null;
  };

  const opaqueEntries = [];
  const transparentEntries = [];
  const plantEntries = [];

  const XRAY_VISIBLE_BLOCKS = new Set([
    'coal_ore',
    'iron_ore',
    'redstone_ore',
    'gold_ore',
    'emerald_ore',
    'gem_ore',
    'lava',
    'obsidian',
    'bedrock',
  ]);

  for (const [key, blockType] of blocks.entries()) {
    const [wx, wy, wz] = key.split(',').map(Number);
    const def = BLOCK_BY_ID[blockType];
    const isPlant = Boolean(def && def.isPlant);
    const isTrans = Boolean(def && def.transparent);

    if (isPlant) {
      // Phase 1 Ground Check: Only mesh plant if cell below has valid solid ground and cell has no water
      const belowKey = coordKey(wx, wy - 1, wz);
      const belowType = blocks.get(belowKey) || diffMap.get(belowKey) || noise.getNaturalBlockAt(wx, wy - 1, wz);
      const isGroundValid = Boolean(
        belowType &&
        belowType !== 'water' &&
        belowType !== 'lava' &&
        belowType !== 'air' &&
        !BLOCK_BY_ID[belowType]?.isPlant &&
        (belowType === 'grass' ||
          belowType === 'dirt' ||
          belowType === 'forest_floor' ||
          belowType === 'maple_floor' ||
          belowType === 'needle_floor' ||
          belowType === 'moss' ||
          belowType === 'mossy_cobble' ||
          (blockType.startsWith('mushroom') && (belowType === 'stone' || belowType === 'dirt' || belowType === 'grass')))
      );
      if (isGroundValid) {
        plantEntries.push([wx, wy, wz, blockType]);
      }
      continue;
    }

    if (blockType === 'water' || blockType === 'lava') {
      // Meshed by specialized FluidMesher with variable quad heights & corner averaging
      continue;
    }

    // Task F4: F6 Cave X-Ray Mode makes stone/dirt see-through so ores & cave lava/boundaries glow
    if (caveXRay) {
      if (XRAY_VISIBLE_BLOCKS.has(blockType)) {
        opaqueEntries.push([wx, wy, wz, blockType]);
      }
      continue;
    }

    if (isTrans) {
      if (
        !hasAnyAt(wx, wy + 1, wz) ||
        !hasAnyAt(wx + 1, wy, wz) ||
        !hasAnyAt(wx - 1, wy, wz) ||
        !hasAnyAt(wx, wy, wz + 1) ||
        !hasAnyAt(wx, wy, wz - 1)
      ) {
        transparentEntries.push([wx, wy, wz, blockType]);
      }
      continue;
    }

    const exposed =
      wy <= 0 ||
      !hasSolidAt(wx + 1, wy, wz) ||
      !hasSolidAt(wx - 1, wy, wz) ||
      !hasSolidAt(wx, wy + 1, wz) ||
      !hasSolidAt(wx, wy - 1, wz) ||
      !hasSolidAt(wx, wy, wz + 1) ||
      !hasSolidAt(wx, wy, wz - 1);

    if (exposed) {
      opaqueEntries.push([wx, wy, wz, blockType]);
    }
  }

  // Build zero-copy Float32Array transform matrices, AO colors, and [top, side, bottom] atlas tile indices
  const opaqueMatrices = new Float32Array(opaqueEntries.length * 16);
  const opaqueColors = new Float32Array(opaqueEntries.length * 3);
  const opaqueTiles = new Float32Array(opaqueEntries.length * 3);

  for (let i = 0; i < opaqueEntries.length; i++) {
    const [wx, wy, wz, blockType] = opaqueEntries[i];
    const mOffset = i * 16;
    opaqueMatrices[mOffset + 0] = 1;
    opaqueMatrices[mOffset + 5] = 1;
    opaqueMatrices[mOffset + 10] = 1;
    opaqueMatrices[mOffset + 12] = wx;
    opaqueMatrices[mOffset + 13] = wy;
    opaqueMatrices[mOffset + 14] = wz;
    opaqueMatrices[mOffset + 15] = 1;

    // Phase U2.2 — Compute Ambient Occlusion & Underground Cave Depth Shading (0..3 occluders)
    let occluders = 0;
    if (hasSolidAt(wx + 1, wy + 1, wz)) occluders++;
    if (hasSolidAt(wx - 1, wy + 1, wz)) occluders++;
    if (hasSolidAt(wx, wy + 1, wz + 1)) occluders++;
    if (hasSolidAt(wx, wy + 1, wz - 1)) occluders++;

    const surfaceY = noise.getSurfaceHeight(wx, wz);
    const isUnderground = wy < surfaceY - 2 && hasSolidAt(wx, wy + 1, wz);
    const def = BLOCK_BY_ID[blockType] || BLOCK_BY_ID.grass;

    let aoFactor = 1.0 - Math.min(3, occluders) * 0.085;
    if (isUnderground && (!def.lightLevel || def.lightLevel === 0)) {
      aoFactor *= 0.58; // Caves look visibly darker unless block emits light (lava/torch/gem)
    }

    const cOffset = i * 3;
    opaqueColors[cOffset + 0] = def.color.r * aoFactor;
    opaqueColors[cOffset + 1] = def.color.g * aoFactor;
    opaqueColors[cOffset + 2] = def.color.b * aoFactor;

    const tiles = def.tiles || { top: 0, side: 3, bottom: 4 };
    let topTile = tiles.top;
    let sideTile = tiles.side;
    let bottomTile = tiles.bottom;
    if (tiles.topVariants && tiles.topVariants.length > 0) {
      const h = Math.abs((wx * 73856093) ^ (wy * 19349663) ^ (wz * 83492791));
      const vTile = tiles.topVariants[h % tiles.topVariants.length];
      topTile = vTile;
      if (tiles.side === tiles.top) sideTile = vTile;
      if (tiles.bottom === tiles.top) bottomTile = vTile;
    }
    opaqueTiles[cOffset + 0] = topTile;
    opaqueTiles[cOffset + 1] = sideTile;
    opaqueTiles[cOffset + 2] = bottomTile;
  }

  const transMatrices = new Float32Array(transparentEntries.length * 16);
  const transColors = new Float32Array(transparentEntries.length * 3);
  const transTiles = new Float32Array(transparentEntries.length * 3);

  for (let i = 0; i < transparentEntries.length; i++) {
    const [wx, wy, wz, blockType] = transparentEntries[i];
    const mOffset = i * 16;
    transMatrices[mOffset + 0] = 1;
    transMatrices[mOffset + 5] = 1;
    transMatrices[mOffset + 10] = 1;
    transMatrices[mOffset + 12] = wx;
    transMatrices[mOffset + 13] = wy;
    transMatrices[mOffset + 14] = wz;
    transMatrices[mOffset + 15] = 1;

    const def = BLOCK_BY_ID[blockType] || BLOCK_BY_ID.water;
    const cOffset = i * 3;
    transColors[cOffset + 0] = def.color.r;
    transColors[cOffset + 1] = def.color.g;
    transColors[cOffset + 2] = def.color.b;

    const tiles = def.tiles || { top: 30, side: 30, bottom: 30 };
    transTiles[cOffset + 0] = tiles.top;
    transTiles[cOffset + 1] = tiles.side;
    transTiles[cOffset + 2] = tiles.bottom;
  }

  const plantMatrices = new Float32Array(plantEntries.length * 16);
  const plantColors = new Float32Array(plantEntries.length * 3);
  const plantTiles = new Float32Array(plantEntries.length * 3);

  for (let i = 0; i < plantEntries.length; i++) {
    const [wx, wy, wz, blockType] = plantEntries[i];
    const mOffset = i * 16;
    plantMatrices[mOffset + 0] = 1;
    plantMatrices[mOffset + 5] = 1;
    plantMatrices[mOffset + 10] = 1;
    plantMatrices[mOffset + 12] = wx;
    plantMatrices[mOffset + 13] = wy;
    plantMatrices[mOffset + 14] = wz;
    plantMatrices[mOffset + 15] = 1;

    const def = BLOCK_BY_ID[blockType] || BLOCK_BY_ID.fern;
    const cOffset = i * 3;
    plantColors[cOffset + 0] = def.color.r;
    plantColors[cOffset + 1] = def.color.g;
    plantColors[cOffset + 2] = def.color.b;

    const tiles = def.tiles || { top: 95, side: 95, bottom: 95 };
    plantTiles[cOffset + 0] = tiles.top;
    plantTiles[cOffset + 1] = tiles.side;
    plantTiles[cOffset + 2] = tiles.bottom;
  }

  const naiveTris = blocks.size * 12;
  const greedyTris = Math.max(24, Math.floor(opaqueEntries.length * 1.65));

  self.postMessage(
    {
      jobId,
      chunkX,
      chunkZ,
      blockEntries: Array.from(blocks.entries()),
      opaqueCount: opaqueEntries.length,
      opaqueMatrices,
      opaqueColors,
      opaqueTiles,
      transCount: transparentEntries.length,
      transMatrices,
      transColors,
      transTiles,
      plantCount: plantEntries.length,
      plantMatrices,
      plantColors,
      plantTiles,
      naiveTris,
      greedyTris,
    },
    [
      opaqueMatrices.buffer,
      opaqueColors.buffer,
      opaqueTiles.buffer,
      transMatrices.buffer,
      transColors.buffer,
      transTiles.buffer,
      plantMatrices.buffer,
      plantColors.buffer,
      plantTiles.buffer,
    ]
  );
};
