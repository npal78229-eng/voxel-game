import { ORE_CONFIGS } from '../../config/ores.js';

// ============================================================================
// Task F4 — Deterministic Seeded Cross-Chunk Vein Ore Generator
// ============================================================================

const CHUNK_SIZE = 16;

/**
 * Pure deterministic 32-bit PRNG seeded from (worldSeed, chunkX, chunkZ, salt).
 * Never uses Math.random().
 */
export function createSeededRNG(worldSeed, chunkX, chunkZ, salt = 0) {
  let state =
    (Math.imul(worldSeed ^ 0x9e3779b9, 2654435761) +
      Math.imul(chunkX, 374761393) +
      Math.imul(chunkZ, 668265263) +
      Math.imul(salt, 1274126177)) >>>
    0;

  return function nextFloat() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Samples a triangular distribution in [minY, maxY] centered near peakY.
 */
function sampleTriangularY(rng, minY, maxY, peakY) {
  const u = rng();
  const v = rng();
  const tri = (u + v) * 0.5; // [0, 1] peaked at 0.5
  const normPeak = Math.max(0.1, Math.min(0.9, (peakY - minY) / Math.max(1, maxY - minY)));
  const shifted = tri < 0.5
    ? (tri / 0.5) * normPeak
    : normPeak + ((tri - 0.5) / 0.5) * (1.0 - normPeak);
  return Math.round(minY + shifted * (maxY - minY));
}

/**
 * Generates a lookup Map of ore blocks (`"wx,wy,wz"` -> oreId) for chunk (chunkX, chunkZ),
 * including veins originating in the 8 neighboring chunks that walk across the chunk border!
 */
export class DeterministicOreGenerator {
  constructor(worldSeed, noise) {
    this.worldSeed = worldSeed >>> 0;
    this.noise = noise;
    this.chunkVeinCache = new Map();
  }

  _getChunkKey(cx, cz) {
    return `${cx},${cz}`;
  }

  /**
   * Generates all vein blocks whose origin lies in chunk (originCX, originCZ).
   * Veins can walk +-3 blocks outside the origin chunk so adjacent chunks receive them seamlessly.
   */
  _getOriginChunkVeins(originCX, originCZ) {
    const key = this._getChunkKey(originCX, originCZ);
    if (this.chunkVeinCache.has(key)) {
      return this.chunkVeinCache.get(key);
    }

    // Cap cache size to avoid unbounded memory
    if (this.chunkVeinCache.size > 256) {
      const oldest = this.chunkVeinCache.keys().next().value;
      this.chunkVeinCache.delete(oldest);
    }

    const veinMap = new Map();
    const baseWx = originCX * CHUNK_SIZE;
    const baseWz = originCZ * CHUNK_SIZE;
    const centerBiome = this.noise.getBiomeAt(baseWx + 8, baseWz + 8);

    for (let oreIdx = 0; oreIdx < ORE_CONFIGS.length; oreIdx++) {
      const cfg = ORE_CONFIGS[oreIdx];
      const rng = createSeededRNG(
        this.worldSeed,
        originCX,
        originCZ,
        (oreIdx + 1) * 7919
      );

      const biomeMult =
        (cfg.biomeBonus && cfg.biomeBonus[centerBiome.id]) || 1.0;
      const totalVeins = Math.max(
        1,
        Math.round(cfg.veinsPerChunk * biomeMult)
      );

      for (let v = 0; v < totalVeins; v++) {
        if (rng() > cfg.rarity) continue;

        let vx = baseWx + Math.floor(rng() * CHUNK_SIZE);
        let vy = sampleTriangularY(rng, cfg.minY, cfg.maxY, cfg.peakY);
        let vz = baseWz + Math.floor(rng() * CHUNK_SIZE);

        const veinSize =
          cfg.veinSizeMin +
          Math.floor(rng() * (cfg.veinSizeMax - cfg.veinSizeMin + 1));

        for (let step = 0; step < veinSize; step++) {
          if (vy >= cfg.minY && vy <= cfg.maxY) {
            const coordKey = `${vx},${vy},${vz}`;
            if (!veinMap.has(coordKey)) {
              veinMap.set(coordKey, cfg.id);
            }
          }
          // 3D random walk step along a axis
          const dir = Math.floor(rng() * 6);
          if (dir === 0) vx += 1;
          else if (dir === 1) vx -= 1;
          else if (dir === 2) vy += 1;
          else if (dir === 3) vy -= 1;
          else if (dir === 4) vz += 1;
          else vz -= 1;
        }
      }
    }

    this.chunkVeinCache.set(key, veinMap);
    return veinMap;
  }

  /**
   * Returns the deterministic ore block ID at (wx, wy, wz), or null if stone.
   * Also applies a small bonus roll for stone blocks directly adjacent to a cave void!
   */
  getOreAt(wx, wy, wz, surfaceY, isAdjacentToCave = false) {
    if (wy < 4 || wy >= surfaceY - 2) return null;

    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    const coordKey = `${wx},${wy},${wz}`;

    // 1. Check current chunk's veins
    const mainVeins = this._getOriginChunkVeins(cx, cz);
    if (mainVeins.has(coordKey)) {
      return mainVeins.get(coordKey);
    }

    // 2. If within 3 blocks of a chunk border, check the neighboring chunk(s) so veins are never sliced
    const minDx = lx < 3 ? -1 : 0;
    const maxDx = lx >= CHUNK_SIZE - 3 ? 1 : 0;
    const minDz = lz < 3 ? -1 : 0;
    const maxDz = lz >= CHUNK_SIZE - 3 ? 1 : 0;

    if (minDx !== 0 || maxDx !== 0 || minDz !== 0 || maxDz !== 0) {
      for (let dcx = minDx; dcx <= maxDx; dcx++) {
        for (let dcz = minDz; dcz <= maxDz; dcz++) {
          if (dcx === 0 && dcz === 0) continue;
          const neighborVeins = this._getOriginChunkVeins(cx + dcx, cz + dcz);
          if (neighborVeins.has(coordKey)) {
            return neighborVeins.get(coordKey);
          }
        }
      }
    }

    // 3. Cave-wall exposure bonus roll so caves reward exploration
    if (isAdjacentToCave) {
      const rng = createSeededRNG(this.worldSeed, wx, wz, wy * 31337);
      const roll = rng();
      let cumulative = 0;
      for (const cfg of ORE_CONFIGS) {
        if (wy >= cfg.minY && wy <= cfg.maxY) {
          cumulative += cfg.caveExposureBonus || 0.015;
          if (roll < cumulative) {
            return cfg.id;
          }
        }
      }
    }

    return null;
  }
}
