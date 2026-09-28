// ============================================================================
// Phase 3 — Deterministic Seeded 2D & 3D Simplex Noise & Terrain Parameters
// ============================================================================

export const TERRAIN_CONFIG = {
  seed: 133742, // Reusable deterministic seed (also used for Phase 5 diff saves)
  scale: 0.022, // Horizontal frequency: smaller = broader rolling hills
  octaves: 3, // Multi-octave fractal detail
  persistence: 0.48,
  lacunarity: 2.1,
  baseHeight: 4, // Minimum valley floor height (blocks)
  amplitude: 9, // Peak hill height offset above baseHeight (range ~4..13)
  caveScale: 0.08, // 3D Simplex frequency for underground cave tunnels
  caveThreshold: 0.62, // Carve caves only where 3D ridge value exceeds threshold
};

/**
 * Fast, deterministic 2D and 3D Simplex Noise generator seeded by an integer.
 */
export class SeededSimplexNoise {
  constructor(seed = TERRAIN_CONFIG.seed) {
    this.seed = seed;
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    this._initPermutation(seed);
  }

  _initPermutation(seed) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;

    // Mulberry32 PRNG for deterministic shuffle from seed
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

  /**
   * 2D Simplex Noise in range [-1, 1]
   */
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

  /**
   * 3D Simplex Noise in range [-1, 1] (used for Task 3D underground cave generation)
   */
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
   * Multi-octave 2D Fractal Brownian Motion (fBm) normalized to [0, 1].
   * Always pass WORLD coordinates (wx, wz) so chunks stitch seamlessly!
   */
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
   * Computes the deterministic integer surface height at world column (wx, wz).
   */
  getSurfaceHeight(wx, wz) {
    const h = this.fbm2D(wx, wz);
    return Math.round(TERRAIN_CONFIG.baseHeight + h * TERRAIN_CONFIG.amplitude);
  }

  /**
   * Task 3D: Determines whether an underground block at (wx, wy, wz) is carved
   * out by a 3D Simplex cave tunnel.
   */
  isCaveVoid(wx, wy, wz, surfaceY) {
    // Keep bedrock at y=0 intact and avoid punching holes in every hilltop
    if (wy <= 0 || wy >= surfaceY - 1) return false;
    const s = TERRAIN_CONFIG.caveScale;
    const n = this.noise3D(wx * s, wy * s * 1.25, wz * s);
    return n > TERRAIN_CONFIG.caveThreshold;
  }

  /**
   * Returns the natural procedural block type at world coordinate (wx, wy, wz),
   * or null for empty air / cave void.
   */
  getNaturalBlockAt(wx, wy, wz) {
    if (wy < 0) return null;
    const surfaceY = this.getSurfaceHeight(wx, wz);
    if (wy > surfaceY) return null;

    if (wy === 0) return 'cobblestone'; // Solid foundation layer
    if (this.isCaveVoid(wx, wy, wz, surfaceY)) return null;

    if (wy === surfaceY) {
      return surfaceY <= 5 ? 'sand' : 'grass';
    }
    if (wy >= surfaceY - 2) {
      return surfaceY <= 5 ? 'sand' : 'dirt';
    }
    return 'stone';
  }
}

SeededSimplexNoise.GRAD3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);
