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
   * Phase U3.2 — Computes temperature, humidity, continentalness & biome at world (wx, wz).
   */
  getBiomeAt(wx, wz) {
    const temp = this.noise2D(wx * 0.0045 + 120, wz * 0.0045 + 120); // [-1, 1]
    const humid = this.noise2D(wx * 0.0045 - 240, wz * 0.0045 - 240); // [-1, 1]
    const cont = this.noise2D(wx * 0.007, wz * 0.007);
    const ridge = 1.0 - Math.abs(this.noise2D(wx * 0.012 + 50, wz * 0.012 - 50));

    if (cont < -0.36) {
      return { id: 'ocean', name: 'Sapphire Sea', surface: 'sand', sub: 'sand', treeChance: 0 };
    }
    if (cont < -0.24) {
      return { id: 'beach', name: 'Sunlit Shore', surface: 'sand', sub: 'sand', treeChance: 0 };
    }
    if (ridge > 0.78 && cont > 0.15) {
      return {
        id: 'mountains',
        name: 'Craggy Alpine Peaks',
        surface: temp < 0 ? 'snow' : 'stone',
        sub: 'stone',
        treeChance: 0.004,
      };
    }
    if (temp < -0.35) {
      return humid > 0
        ? { id: 'taiga', name: 'Boreal Pine Taiga', surface: 'snow', sub: 'dirt', treeChance: 0.022 }
        : { id: 'tundra', name: 'Frostbound Tundra', surface: 'snow', sub: 'dirt', treeChance: 0.003 };
    }
    if (temp > 0.38) {
      return humid < -0.1
        ? { id: 'desert', name: 'Golden Dunes', surface: 'sand', sub: 'sand', treeChance: 0.006 }
        : { id: 'savanna', name: 'Sunscorched Savanna', surface: 'grass', sub: 'dirt', treeChance: 0.01 };
    }
    if (humid > 0.35) {
      return temp > 0.05
        ? { id: 'swamp', name: 'Misty Fenland', surface: 'grass', sub: 'dirt', treeChance: 0.016 }
        : { id: 'birch_forest', name: 'Silver Birch Grove', surface: 'grass', sub: 'dirt', treeChance: 0.026 };
    }
    if (humid > 0.02) {
      return { id: 'forest', name: 'Timberland Woods', surface: 'grass', sub: 'dirt', treeChance: 0.028 };
    }
    return { id: 'plains', name: 'Verdant Meadows', surface: 'grass', sub: 'dirt', treeChance: 0.007 };
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

  getSurfaceHeight(wx, wz) {
    const h = this.fbm2D(wx, wz);
    const ridge = Math.max(0, 1.0 - Math.abs(this.noise2D(wx * 0.011, wz * 0.011)) - 0.5) * 18;
    return Math.round(TERRAIN_CONFIG.baseHeight + h * TERRAIN_CONFIG.amplitude + ridge);
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

  _hasTreeRootAt(tx, tz) {
    const surfaceY = this.getSurfaceHeight(tx, tz);
    if (surfaceY <= SEA_LEVEL + 1 || surfaceY > 42) return null;
    const biome = this.getBiomeAt(tx, tz);
    if (biome.treeChance <= 0) return null;

    if ((tx & 3) !== 0 || (tz & 3) !== 0) return null;
    if (this._hash2(tx, tz) < biome.treeChance * 4) {
      return { surfaceY, biomeId: biome.id };
    }
    return null;
  }

  _getTreeBlockAt(wx, wy, wz) {
    const baseTx = wx & ~3;
    const baseTz = wz & ~3;

    for (let gx = baseTx - 4; gx <= baseTx + 4; gx += 4) {
      for (let gz = baseTz - 4; gz <= baseTz + 4; gz += 4) {
        const dx = wx - gx;
        const dz = wz - gz;
        if (Math.abs(dx) > 2 || Math.abs(dz) > 2) continue;

        const tree = this._hasTreeRootAt(gx, gz);
        if (!tree) continue;

        const relY = wy - tree.surfaceY;
        if (relY < 1 || relY > 6) continue;

        if (tree.biomeId === 'desert') {
          if (dx === 0 && dz === 0 && relY <= 3) return 'cactus';
          continue;
        }

        const isBirch = tree.biomeId === 'birch_forest';
        const isPine =
          tree.biomeId === 'taiga' ||
          tree.biomeId === 'tundra' ||
          tree.biomeId === 'mountains';
        const logType = isBirch ? 'birch_wood' : isPine ? 'pine_log' : 'wood';
        const leafType = isBirch
          ? 'birch_leaves'
          : isPine
          ? 'pine_leaves'
          : 'leaves';

        if (dx === 0 && dz === 0 && relY <= 4) {
          return logType;
        }
        if (relY >= 3 && relY <= 5) {
          const dist = Math.abs(dx) + Math.abs(dz);
          if (relY === 5 && dist <= 1) return leafType;
          if (relY <= 4 && dist <= 3) return leafType;
        }
      }
    }
    return null;
  }

  /**
   * Returns the natural procedural block type at world coordinate (wx, wy, wz).
   */
  getNaturalBlockAt(wx, wy, wz) {
    if (wy < 0) return null;
    if (wy === 0) return 'bedrock';

    const surfaceY = this.getSurfaceHeight(wx, wz);
    const biome = this.getBiomeAt(wx, wz);

    // Above solid ground: check water sea level, rare pumpkins/melons, or deterministic trees
    if (wy > surfaceY) {
      if (wy <= SEA_LEVEL) {
        return biome.id === 'tundra' && wy === SEA_LEVEL ? 'ice' : 'water';
      }
      if (
        wy === surfaceY + 1 &&
        surfaceY > SEA_LEVEL + 1 &&
        (wx & 15) === 7 &&
        (wz & 15) === 7
      ) {
        const patchHash = this._hash2(wx + 31, wz - 17);
        if (patchHash < 0.08 && biome.id === 'plains') return 'pumpkin';
        if (
          patchHash >= 0.08 &&
          patchHash < 0.15 &&
          (biome.id === 'swamp' || biome.id === 'forest')
        )
          return 'melon';
      }
      if (wy <= surfaceY + 6) {
        return this._getTreeBlockAt(wx, wy, wz);
      }
      return null;
    }

    // Task F4: Continuous 3D Spaghetti Tunnels, Cavern Chambers, Hillside Entrances & Lava Pools
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

    // Surface & Subsurface Biome Blocks
    if (wy === surfaceY) {
      if (surfaceY <= SEA_LEVEL + 1) {
        return this._hash2(wx, wz) < 0.28 ? 'gravel' : 'sand';
      }
      return biome.surface;
    }
    if (wy >= surfaceY - 2) {
      if (surfaceY <= SEA_LEVEL + 1) return 'gravel';
      if (biome.id === 'desert') return 'sandstone';
      return biome.sub;
    }

    // Deep obsidian & mossy cobblestone near underground magma level
    if (wy <= 3 && this._hash2(wx + wy, wz - wy) < 0.14) {
      return wy <= 2 ? 'obsidian' : 'mossy_cobble';
    }

    // Task F4: Deterministic Cross-Chunk Seeded Vein Ores + Cave Wall Exposure Bonus
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
}

SeededSimplexNoise.GRAD3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);
