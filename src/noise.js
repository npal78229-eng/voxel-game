import { evaluateCaveAt } from './world/gen/caves.js';
import { DeterministicOreGenerator } from './world/gen/ores.js';

// ============================================================================
// Phase U3 & Task F4 — Multi-Biome Seeded Simplex Terrain, 3D Caves, Vein Ores & Trees
// ============================================================================

export const SEA_LEVEL = 18;
export const WORLD_MAX_Y = 72; // Supports tall alpine mountains & multi-sub-chunk columns

export const TERRAIN_CONFIG = {
  seed: 133742,
  scale: 0.015,
  octaves: 4,
  persistence: 0.48,
  lacunarity: 2.1,
  baseHeight: 14,
  amplitude: 28,
  caveScale: 0.044,
  caveThreshold: 0.14,
};

export class SeededSimplexNoise {
  constructor(seed = TERRAIN_CONFIG.seed) {
    this.seed = seed;
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    this._initPermutation(seed);
    this.oreGen = new DeterministicOreGenerator(this.seed, this);
  }

  _initPermutation(seed) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;

    let s = seed >>> 0;
    const rand = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }

    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  noise2D(xin, yin) {
    const grad3 = SeededSimplexNoise.GRAD3;
    const perm = this.perm;
    const permMod12 = this.permMod12;

    const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
    const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;

    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;

    const X0 = i - t;
    const Y0 = j - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;

    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;

    const ii = i & 255;
    const jj = j & 255;
    const gi0 = permMod12[ii + perm[jj]] * 3;
    const gi1 = permMod12[ii + i1 + perm[jj + j1]] * 3;
    const gi2 = permMod12[ii + 1 + perm[jj + 1]] * 3;

    let n0 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      t0 *= t0;
      n0 = t0 * t0 * (grad3[gi0] * x0 + grad3[gi0 + 1] * y0);
    }

    let n1 = 0;
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      t1 *= t1;
      n1 = t1 * t1 * (grad3[gi1] * x1 + grad3[gi1 + 1] * y1);
    }

    let n2 = 0;
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      t2 *= t2;
      n2 = t2 * t2 * (grad3[gi2] * x2 + grad3[gi2 + 1] * y2);
    }

    return 70.0 * (n0 + n1 + n2);
  }

  noise3D(xin, yin, zin) {
    const grad3 = SeededSimplexNoise.GRAD3;
    const perm = this.perm;
    const permMod12 = this.permMod12;

    const F3 = 1.0 / 3.0;
    const G3 = 1.0 / 6.0;

    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;

    const X0 = i - t;
    const Y0 = j - t;
    const Z0 = k - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;
    const z0 = zin - Z0;

    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      } else if (x0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
      } else {
        i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
      }
    } else {
      if (y0 < z0) {
        i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
      } else if (x0 < z0) {
        i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
      } else {
        i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      }
    }

    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2.0 * G3;
    const y2 = y0 - j2 + 2.0 * G3;
    const z2 = z0 - k2 + 2.0 * G3;
    const x3 = x0 - 1.0 + 3.0 * G3;
    const y3 = y0 - 1.0 + 3.0 * G3;
    const z3 = z0 - 1.0 + 3.0 * G3;

    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    const gi0 = permMod12[ii + perm[jj + perm[kk]]] * 3;
    const gi1 = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
    const gi2 = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
    const gi3 = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;

    let n0 = 0;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 >= 0) {
      t0 *= t0;
      n0 = t0 * t0 * (grad3[gi0] * x0 + grad3[gi0 + 1] * y0 + grad3[gi0 + 2] * z0);
    }

    let n1 = 0;
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 >= 0) {
      t1 *= t1;
      n1 = t1 * t1 * (grad3[gi1] * x1 + grad3[gi1 + 1] * y1 + grad3[gi1 + 2] * z1);
    }

    let n2 = 0;
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 >= 0) {
      t2 *= t2;
      n2 = t2 * t2 * (grad3[gi2] * x2 + grad3[gi2 + 1] * y2 + grad3[gi2 + 2] * z2);
    }

    let n3 = 0;
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 >= 0) {
      t3 *= t3;
      n3 = t3 * t3 * (grad3[gi3] * x3 + grad3[gi3 + 1] * y3 + grad3[gi3 + 2] * z3);
    }

    return 32.0 * (n0 + n1 + n2 + n3);
  }

  /**
   * Part A3.1 & A3.2 — Large organic biome regions (~200-260 block feature size)
   * driven by two low-frequency domain-warped noise fields: temperature and moisture.
   */
  getBiomeAt(wx, wz) {
    // Organic domain warp (~26 block amplitude) so region borders wiggle naturally
    const warpX = this.noise2D(wx * 0.0085 + 73.1, wz * 0.0085 - 41.7) * 26.0;
    const warpZ = this.noise2D(wx * 0.0085 - 91.3, wz * 0.0085 + 59.9) * 26.0;
    const sx = wx + warpX;
    const sz = wz + warpZ;

    // Low-frequency temperature & moisture (feature size ~220 blocks -> zero 5-block specks)
    const temp = this.noise2D(sx * 0.0024 + 120, sz * 0.0024 + 120); // [-1, 1]
    const moisture = this.noise2D(sx * 0.0024 - 240, sz * 0.0024 - 240); // [-1, 1]

    // Map (temp, moisture) to the canonical biomes in BIOME_TABLE
    if (temp < -0.45) {
      return moisture < -0.05 ? BIOME_TABLE.tundra : BIOME_TABLE.taiga;
    }
    if (temp < -0.15) {
      if (moisture < -0.22) return BIOME_TABLE.mountains;
      if (moisture > 0.38) return BIOME_TABLE.redwood; // Cool, very humid: Redwood Giant Forest
      if (moisture > 0.16) return BIOME_TABLE.maple_forest; // Cool temperate: Autumn Maple Forest
      if (moisture > -0.05) return BIOME_TABLE.taiga;
      return BIOME_TABLE.birch_forest;
    }
    if (temp < 0.22) {
      if (moisture < -0.38) return BIOME_TABLE.ocean;
      if (moisture < 0.0) return BIOME_TABLE.plains;
      if (moisture > 0.36) return BIOME_TABLE.darkwood; // Temperate, very humid: Darkwood Forest
      if (moisture < 0.20) return BIOME_TABLE.forest;
      return BIOME_TABLE.birch_forest;
    }
    if (temp < 0.48) {
      if (moisture < -0.25) return BIOME_TABLE.savanna;
      if (moisture > 0.22) return BIOME_TABLE.swamp;
      return BIOME_TABLE.plains;
    }
    // Hot region (temp >= 0.48)
    return moisture < 0.08 ? BIOME_TABLE.desert : BIOME_TABLE.savanna;
  }

  fbm2D(wx, wz) {
    let total = 0;
    let frequency = TERRAIN_CONFIG.scale;
    let amplitude = 1;
    let maxValue = 0;

    for (let o = 0; o < TERRAIN_CONFIG.octaves; o++) {
      total += this.noise2D(wx * frequency, wz * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= TERRAIN_CONFIG.persistence;
      frequency *= TERRAIN_CONFIG.lacunarity;
    }

    const normalized = (total / maxValue + 1) * 0.5;
    return Math.max(0, Math.min(1, normalized));
  }

  /**
   * Part A3.4 — Smooth Height Borders:
   * Evaluates biome baseHeight and roughness on a 16-block grid and interpolates them
   * with C1-continuous smoothstep (3t^2 - 2t^3), guaranteeing zero wall-like cliffs
   * across biome borders while surface block types change sharply at the exact border.
   */
  getSurfaceHeight(wx, wz) {
    const grid = 16.0;
    const x0 = Math.floor(wx / grid) * grid;
    const z0 = Math.floor(wz / grid) * grid;
    const x1 = x0 + grid;
    const z1 = z0 + grid;

    const tx = (wx - x0) / grid;
    const tz = (wz - z0) / grid;
    const sx = tx * tx * (3.0 - 2.0 * tx);
    const sz = tz * tz * (3.0 - 2.0 * tz);

    const b00 = this.getBiomeAt(x0, z0);
    const b10 = this.getBiomeAt(x1, z0);
    const b01 = this.getBiomeAt(x0, z1);
    const b11 = this.getBiomeAt(x1, z1);

    const base0 = b00.baseHeight * (1 - sx) + b10.baseHeight * sx;
    const base1 = b01.baseHeight * (1 - sx) + b11.baseHeight * sx;
    const blendedBase = base0 * (1 - sz) + base1 * sz;

    const rough0 = b00.roughness * (1 - sx) + b10.roughness * sx;
    const rough1 = b01.roughness * (1 - sx) + b11.roughness * sx;
    const blendedRough = rough0 * (1 - sz) + rough1 * sz;

    const h = this.fbm2D(wx, wz) - 0.5; // [-0.5, 0.5]
    const detail = this.noise2D(wx * 0.035, wz * 0.035) * 1.1;
    return Math.max(4, Math.round(blendedBase + h * blendedRough * 2.1 + detail));
  }

  isCaveVoid(wx, wy, wz, surfaceY, biomeId = 'plains') {
    const res = evaluateCaveAt(this, wx, wy, wz, surfaceY, SEA_LEVEL, biomeId);
    return res !== null;
  }

  /**
   * Deterministic hash in [0, 1) for tree & ore placement at integer coords.
   */
  _hash2(wx, wz) {
    let n = Math.imul(wx, 374761393) + Math.imul(wz, 668265263) + this.seed;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  /**
   * Deterministic cross-chunk tree candidate in an 8x8 cell (cx, cz).
   */
  _getTreeInCell(cx, cz) {
    const cellSeed = Math.imul(cx, 1610612741) ^ Math.imul(cz, 805306457) ^ this.seed;
    const hash = ((cellSeed ^ (cellSeed >>> 13)) * 1274126177) >>> 0;

    // Jittered trunk coordinates within the 8x8 cell
    const jx = 1 + (hash % 6);
    const jz = 1 + ((hash >>> 4) % 6);
    const tx = cx * 8 + jx;
    const tz = cz * 8 + jz;

    const biome = this.getBiomeAt(tx, tz);
    if (!biome.treeType || biome.treeChance <= 0) return null;

    const surfaceY = this.getSurfaceHeight(tx, tz);
    if (surfaceY <= SEA_LEVEL) return null;
    if (biome.snowLineY && surfaceY >= biome.snowLineY) return null;

    const roll = ((hash >>> 8) % 1000) / 1000;
    const treeChance = Math.min(0.88, biome.treeChance * 16.0); // Calibrated for 8x8 cells

    if (roll < treeChance) {
      // Tree candidate
      let height = 6;
      let leafVariant = 0;
      if (biome.treeType === 'redwood') {
        height = 24 + ((hash >>> 12) % 17); // 24 to 40 blocks!
      } else if (biome.treeType === 'dark_oak') {
        height = 7 + ((hash >>> 12) % 5); // 7 to 11
      } else if (biome.treeType === 'maple') {
        height = 6 + ((hash >>> 12) % 4); // 6 to 9
        leafVariant = (hash >>> 16) % 3; // 0=red, 1=orange, 2=yellow
      } else if (biome.treeType === 'pine') {
        height = 6 + ((hash >>> 12) % 5); // 6 to 10
      } else if (biome.treeType === 'birch') {
        height = 5 + ((hash >>> 12) % 4); // 5 to 8
      } else if (biome.treeType === 'cactus') {
        height = 2 + ((hash >>> 12) % 3); // 2 to 4
      } else {
        // Oak
        height = 5 + ((hash >>> 12) % 5); // 5 to 9
      }
      return {
        type: 'tree',
        treeType: biome.treeType,
        tx,
        tz,
        surfaceY,
        height,
        leafVariant,
      };
    } else {
      // Forest ground detail: fallen logs, stumps, or mossy rocks
      const detailRoll = (hash >>> 16) % 100;
      if (detailRoll < 8 && (biome.id === 'darkwood' || biome.id === 'redwood' || biome.id === 'forest')) {
        return {
          type: 'stump',
          treeType: biome.treeType,
          tx,
          tz,
          surfaceY,
          height: 1 + (detailRoll % 2),
        };
      } else if (detailRoll < 18 && (biome.id === 'darkwood' || biome.id === 'redwood' || biome.id === 'maple_forest')) {
        return {
          type: 'fallen_log',
          treeType: biome.treeType,
          tx,
          tz,
          surfaceY,
          dir: (hash >>> 20) % 2 === 0 ? 'X' : 'Z',
          length: 3 + ((hash >>> 22) % 2),
        };
      } else if (detailRoll < 24 && (biome.id === 'darkwood' || biome.id === 'maple_forest' || biome.id === 'swamp')) {
        return {
          type: 'mossy_rock',
          tx,
          tz,
          surfaceY,
        };
      }
      return null;
    }
  }

  _getTreeBlockAt(wx, wy, wz) {
    // Check neighboring 8x8 cells within max canopy radius (5 blocks)
    const minCX = Math.floor((wx - 5) / 8);
    const maxCX = Math.floor((wx + 5) / 8);
    const minCZ = Math.floor((wz - 5) / 8);
    const maxCZ = Math.floor((wz + 5) / 8);

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cz = minCZ; cz <= maxCZ; cz++) {
        const feature = this._getTreeInCell(cx, cz);
        if (!feature) continue;

        const { type, treeType, tx, tz, surfaceY } = feature;
        const relY = wy - surfaceY;
        if (relY < 1) continue;

        if (type === 'stump') {
          if (wx === tx && wz === tz && relY <= feature.height) {
            return treeType === 'dark_oak' ? 'log_darkoak' : treeType === 'redwood' ? 'log_redwood' : 'wood';
          }
          continue;
        }

        if (type === 'fallen_log') {
          if (relY === 1) {
            const logBlock =
              treeType === 'dark_oak'
                ? 'log_darkoak'
                : treeType === 'redwood'
                ? 'log_redwood'
                : treeType === 'maple'
                ? 'log_maple'
                : 'wood';
            if (feature.dir === 'X' && wz === tz && wx >= tx && wx < tx + feature.length) {
              return logBlock;
            }
            if (feature.dir === 'Z' && wx === tx && wz >= tz && wz < tz + feature.length) {
              return logBlock;
            }
          }
          continue;
        }

        if (type === 'mossy_rock') {
          if (relY === 1 && Math.abs(wx - tx) + Math.abs(wz - tz) <= 1) {
            return (wx + wz) % 2 === 0 ? 'moss' : 'mossy_cobble';
          }
          continue;
        }

        // Standard or Giant Tree
        const height = feature.height;
        if (relY > height + 2) continue;

        if (treeType === 'cactus') {
          if (wx === tx && wz === tz && relY <= height) return 'cactus';
          continue;
        }

        if (treeType === 'dark_oak') {
          // 2x2 trunk: (tx, tz), (tx+1, tz), (tx, tz+1), (tx+1, tz+1)
          const isTrunk = (wx === tx || wx === tx + 1) && (wz === tz || wz === tz + 1);
          if (isTrunk && relY <= height) {
            return 'log_darkoak';
          }
          // Wide 3-layer flat canopy (radius 4.5)
          if (relY >= height - 2 && relY <= height + 1) {
            const dx = wx - (tx + 0.5);
            const dz = wz - (tz + 0.5);
            const dist = Math.hypot(dx, dz);
            const maxR = relY === height + 1 ? 2.5 : relY === height ? 4.8 : 3.8;
            if (dist <= maxR) return 'leaves_darkoak';
          }
          continue;
        }

        if (treeType === 'redwood') {
          // 2x2 base up to 40% height, 1x1 above
          const splitY = Math.floor(height * 0.4);
          const isBase2x2 = (wx === tx || wx === tx + 1) && (wz === tz || wz === tz + 1);
          const isUpper1x1 = wx === tx && wz === tz;
          if (relY <= splitY && isBase2x2) {
            return 'log_redwood';
          }
          if (relY > splitY && relY <= height && isUpper1x1) {
            return 'log_redwood';
          }
          // Cone canopy from 40% height to top
          if (relY >= splitY && relY <= height + 1) {
            const coneProgress = (relY - splitY) / (height - splitY + 1); // 0 to 1
            const coneRadius = (1.0 - coneProgress) * 4.2 + 0.8;
            const dx = wx - tx;
            const dz = wz - tz;
            if (Math.hypot(dx, dz) <= coneRadius) {
              return 'leaves_redwood';
            }
          }
          continue;
        }

        if (treeType === 'maple') {
          // 1x1 trunk
          if (wx === tx && wz === tz && relY <= height) {
            return 'log_maple';
          }
          // Oval canopy
          const leafMat =
            feature.leafVariant === 0
              ? 'leaves_maple_red'
              : feature.leafVariant === 1
              ? 'leaves_maple_orange'
              : 'leaves_maple_yellow';
          const dy = Math.abs(relY - (height - 1));
          if (relY >= 3 && relY <= height + 1) {
            const rad = Math.max(0, 3.6 - dy * 0.85);
            if (Math.hypot(wx - tx, wz - tz) <= rad) {
              return leafMat;
            }
          }
          continue;
        }

        if (treeType === 'birch') {
          if (wx === tx && wz === tz && relY <= height) return 'birch_wood';
          if (relY >= height - 2 && relY <= height + 1) {
            const rad = relY === height + 1 ? 1.5 : 2.5;
            if (Math.hypot(wx - tx, wz - tz) <= rad) return 'birch_leaves';
          }
          continue;
        }

        if (treeType === 'pine') {
          if (wx === tx && wz === tz && relY <= height) return 'pine_log';
          if (relY >= 2 && relY <= height + 1) {
            const layer = height + 1 - relY;
            const rad = Math.max(0.8, (layer % 2 === 0 ? 2.5 : 1.6) - (relY / height) * 1.2);
            if (Math.hypot(wx - tx, wz - tz) <= rad) return 'pine_leaves';
          }
          continue;
        }

        // Standard Oak (improved variety)
        if (wx === tx && wz === tz && relY <= height) return 'wood';
        if (relY >= height - 2 && relY <= height + 1) {
          const rad = relY === height + 1 ? 1.8 : 2.8;
          if (Math.hypot(wx - tx, wz - tz) <= rad) return 'leaves';
        }
      }
    }
    return null;
  }

  /**
   * Deterministic undergrowth plants (fern, tall_grass, mushrooms, forest flowers)
   */
  _getPlantAt(wx, wz, surfaceY, biome) {
    if (surfaceY <= SEA_LEVEL) return null;
    const h = this._hash2(wx * 48271, wz * 1399);

    if (biome.id === 'darkwood') {
      if (h < 0.10) return 'fern';
      if (h < 0.16) return 'mushroom_red';
      if (h < 0.22) return 'mushroom_brown';
      return null;
    }
    if (biome.id === 'maple_forest') {
      if (h < 0.09) return 'fern';
      if (h < 0.18) return 'tall_grass_plant';
      if (h < 0.24) return 'flower_violet';
      return null;
    }
    if (biome.id === 'redwood') {
      if (h < 0.15) return 'fern';
      return null;
    }
    if (biome.id === 'forest') {
      if (h < 0.08) return 'tall_grass_plant';
      if (h < 0.13) return 'flower_bluebell';
      if (h < 0.18) return 'flower_violet';
      if (h < 0.23) return 'flower_anemone';
      return null;
    }
    if (biome.id === 'plains') {
      if (h < 0.10) return 'tall_grass_plant';
      if (h < 0.15) return 'flower_bluebell';
      if (h < 0.19) return 'flower_anemone';
      return null;
    }
    if (biome.id === 'swamp') {
      if (h < 0.10) return 'tall_grass_plant';
      if (h < 0.16) return 'mushroom_brown';
      return null;
    }
    return null;
  }

  /**
   * Part A3.1 & A3.3 — Evaluates the block at (wx, wy, wz) using pre-computed column
   * (surfaceY, biome) so chunkWorker only calls getBiomeAt/getSurfaceHeight ONCE per column.
   */
  getColumnBlockAt(wx, wy, wz, surfaceY, biome) {
    if (wy < 0) return null;
    if (wy === 0) return 'bedrock';

    // Above solid ground: water up to SEA_LEVEL (or tundra ice), biome-matched trees, and plants
    if (wy > surfaceY) {
      if (wy <= SEA_LEVEL) {
        return biome.id === 'tundra' && wy === SEA_LEVEL ? 'ice' : 'water';
      }
      if (wy <= surfaceY + 44) {
        const treeBlock = this._getTreeBlockAt(wx, wy, wz);
        if (treeBlock) return treeBlock;
      }
      if (wy === surfaceY + 1 && surfaceY > SEA_LEVEL) {
        return this._getPlantAt(wx, wz, surfaceY, biome);
      }
      return null;
    }

    // Strict Surface & Subsurface Biome Ownership (top 4 blocks: surfaceY down to surfaceY - 3)
    // Caves and ores NEVER replace these top layers.
    if (wy === surfaceY) {
      if (surfaceY <= SEA_LEVEL) {
        return biome.underwaterFloor;
      }
      if (biome.snowLineY && surfaceY >= biome.snowLineY) {
        return 'snow';
      }
      return biome.surface;
    }

    if (wy >= surfaceY - 3) {
      if (surfaceY <= SEA_LEVEL) {
        return biome.underwaterFloor;
      }
      return biome.sub;
    }

    if (wy === surfaceY - 4) {
      return biome.deepSub || biome.sub;
    }

    // Below subsurface (wy <= surfaceY - 5): Caves & Seeded Vein Ores
    const caveStatus = evaluateCaveAt(
      this,
      wx,
      wy,
      wz,
      surfaceY,
      SEA_LEVEL,
      biome.id
    );
    if (caveStatus !== null) {
      return caveStatus === 'lava' ? 'lava' : null;
    }

    if (wy <= 3 && this._hash2(wx + wy, wz - wy) < 0.14) {
      return wy <= 2 ? 'obsidian' : 'mossy_cobble';
    }

    const isAdjacentToCave =
      evaluateCaveAt(this, wx + 1, wy, wz, surfaceY, SEA_LEVEL, biome.id) === 'air' ||
      evaluateCaveAt(this, wx - 1, wy, wz, surfaceY, SEA_LEVEL, biome.id) === 'air' ||
      evaluateCaveAt(this, wx, wy + 1, wz, surfaceY, SEA_LEVEL, biome.id) === 'air' ||
      evaluateCaveAt(this, wx, wy - 1, wz, surfaceY, SEA_LEVEL, biome.id) === 'air';

    const oreType = this.oreGen.getOreAt(
      wx,
      wy,
      wz,
      surfaceY,
      isAdjacentToCave
    );
    if (oreType) {
      return oreType;
    }

    return 'stone';
  }

  /**
   * Returns the natural procedural block type at world coordinate (wx, wy, wz).
   */
  getNaturalBlockAt(wx, wy, wz) {
    if (wy < 0) return null;
    if (wy === 0) return 'bedrock';
    const surfaceY = this.getSurfaceHeight(wx, wz);
    const biome = this.getBiomeAt(wx, wz);
    return this.getColumnBlockAt(wx, wy, wz, surfaceY, biome);
  }
}

export const BIOME_EDGE_BLEND = 0;

/**
 * Part A3.3 — Canonical 10-Biome Table.
 * Every biome strictly owns its surface, subsurface (3–4 deep), and underwater floor blocks.
 */
export const BIOME_TABLE = {
  plains: {
    id: 'plains',
    name: 'Verdant Meadows',
    surface: 'grass',
    sub: 'dirt',
    deepSub: 'dirt',
    underwaterFloor: 'sand',
    baseHeight: 21,
    roughness: 5.5,
    treeType: 'oak',
    treeChance: 0.005,
    mapColor: '#4ade80',
  },
  forest: {
    id: 'forest',
    name: 'Timberland Woods',
    surface: 'grass',
    sub: 'dirt',
    deepSub: 'dirt',
    underwaterFloor: 'dirt',
    baseHeight: 22,
    roughness: 7.0,
    treeType: 'oak',
    treeChance: 0.025,
    mapColor: '#16a34a',
  },
  darkwood: {
    id: 'darkwood',
    name: 'Darkwood Forest',
    surface: 'forest_floor',
    sub: 'dirt',
    deepSub: 'dirt',
    underwaterFloor: 'dirt',
    baseHeight: 22,
    roughness: 6.5,
    treeType: 'dark_oak',
    treeSpecies: 'dark_oak',
    treeChance: 0.035,
    mapColor: '#1e3a1e',
    deciduous: true,
    plantChance: 0.22,
  },
  maple_forest: {
    id: 'maple_forest',
    name: 'Autumn Maple Forest',
    surface: 'maple_floor',
    sub: 'dirt',
    deepSub: 'dirt',
    underwaterFloor: 'dirt',
    baseHeight: 23,
    roughness: 7.0,
    treeType: 'maple',
    treeSpecies: 'maple',
    treeChance: 0.028,
    mapColor: '#b45309',
    deciduous: true,
    plantChance: 0.20,
  },
  redwood: {
    id: 'redwood',
    name: 'Redwood Giant Forest',
    surface: 'needle_floor',
    sub: 'dirt',
    deepSub: 'dirt',
    underwaterFloor: 'dirt',
    baseHeight: 24,
    roughness: 8.0,
    treeType: 'redwood',
    treeSpecies: 'redwood',
    treeChance: 0.020,
    mapColor: '#7c2d12',
    deciduous: false,
    plantChance: 0.18,
  },
  birch_forest: {
    id: 'birch_forest',
    name: 'Silver Birch Grove',
    surface: 'grass',
    sub: 'dirt',
    deepSub: 'dirt',
    underwaterFloor: 'dirt',
    baseHeight: 22,
    roughness: 6.0,
    treeType: 'birch',
    treeChance: 0.024,
    mapColor: '#86efac',
  },
  taiga: {
    id: 'taiga',
    name: 'Boreal Pine Taiga',
    surface: 'grass',
    sub: 'dirt',
    deepSub: 'dirt',
    underwaterFloor: 'gravel',
    baseHeight: 23,
    roughness: 8.0,
    treeType: 'pine',
    treeChance: 0.022,
    mapColor: '#15803d',
  },
  tundra: {
    id: 'tundra',
    name: 'Frostbound Tundra',
    surface: 'snow',
    sub: 'dirt',
    deepSub: 'dirt',
    underwaterFloor: 'gravel',
    baseHeight: 20,
    roughness: 4.5,
    treeType: 'pine',
    treeChance: 0.002,
    mapColor: '#e2e8f0',
  },
  desert: {
    id: 'desert',
    name: 'Golden Dunes',
    surface: 'sand',
    sub: 'sand',
    deepSub: 'sandstone',
    underwaterFloor: 'sand',
    baseHeight: 21,
    roughness: 5.5,
    treeType: 'cactus',
    treeChance: 0.006,
    mapColor: '#facc15',
  },
  savanna: {
    id: 'savanna',
    name: 'Sunscorched Savanna',
    surface: 'grass',
    sub: 'dirt',
    deepSub: 'dirt',
    underwaterFloor: 'sand',
    baseHeight: 21,
    roughness: 4.5,
    treeType: 'oak',
    treeChance: 0.008,
    mapColor: '#a3e635',
  },
  mountains: {
    id: 'mountains',
    name: 'Craggy Alpine Peaks',
    surface: 'stone',
    sub: 'stone',
    deepSub: 'stone',
    underwaterFloor: 'gravel',
    snowLineY: 38,
    baseHeight: 30,
    roughness: 14.5,
    treeType: 'pine',
    treeChance: 0.003,
    mapColor: '#94a3b8',
  },
  swamp: {
    id: 'swamp',
    name: 'Misty Fenland',
    surface: 'grass',
    sub: 'dirt',
    deepSub: 'dirt',
    underwaterFloor: 'dirt',
    baseHeight: 19,
    roughness: 3.5,
    treeType: 'oak',
    treeChance: 0.015,
    mapColor: '#0d9488',
  },
  ocean: {
    id: 'ocean',
    name: 'Sapphire Sea',
    surface: 'sand',
    sub: 'sand',
    deepSub: 'sandstone',
    underwaterFloor: 'sand',
    baseHeight: 13,
    roughness: 3.0,
    treeType: null,
    treeChance: 0,
    mapColor: '#0284c7',
  },
};

const _biomeNoiseCache = new Map();
function _getNoiseForSeed(seed = TERRAIN_CONFIG.seed) {
  let n = _biomeNoiseCache.get(seed);
  if (!n) {
    n = new SeededSimplexNoise(seed);
    _biomeNoiseCache.set(seed, n);
  }
  return n;
}

/**
 * Part A3.1 — One biome lookup function, world coordinates only:
 *   getBiome(wx, wz, seed) -> returns the biome entry from BIOME_TABLE.
 */
export function getBiome(wx, wz, seed = TERRAIN_CONFIG.seed) {
  const noise = _getNoiseForSeed(seed);
  return noise.getBiomeAt(wx, wz);
}

SeededSimplexNoise.GRAD3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);
