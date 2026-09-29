import { CAVE_CONFIG } from '../../config/caves.js';

// ============================================================================
// Task F4 — Continuous 3D World-Space Cave Generator (Spaghetti, Caverns, Entrances)
// ============================================================================

/**
 * Evaluates whether world coordinate (wx, wy, wz) is carved out by a cave.
 * Returns:
 *   - null if solid (not a cave)
 *   - 'air' if open cave tunnel / cavern / entrance
 *   - 'lava' if deep cave floor magma pool (wy <= 2 or deep pocket <= lavaPoolMaxY)
 */
export function evaluateCaveAt(noise, wx, wy, wz, surfaceY, seaLevel = 18, biomeId = 'plains') {
  // 1. Never carve into the bottom unbreakable bedrock layer (y <= 0)
  if (wy < CAVE_CONFIG.minCaveY || wy > surfaceY) {
    return null;
  }

  // 2. Spawn Protection Radius: Never carve within 12 blocks of world spawn (8, 11)
  const dxSpawn = wx - CAVE_CONFIG.spawnX;
  const dzSpawn = wz - CAVE_CONFIG.spawnZ;
  if (dxSpawn * dxSpawn + dzSpawn * dzSpawn <= CAVE_CONFIG.spawnProtectionRadius * CAVE_CONFIG.spawnProtectionRadius) {
    return null;
  }

  // 3. Ocean / Lake Floor Protection: Do not carve near or under oceans/lakes so water cannot flood
  if (surfaceY <= seaLevel + 1 || biomeId === 'ocean' || biomeId === 'beach') {
    if (wy >= surfaceY - 8) {
      return null;
    }
  }

  // 4. Surface Depth Rule (Part A3.6): Keep at least 3 solid blocks under the top
  //    so caves never punch holes in the surface biome pattern or expose stone on top.
  const depthBelowSurface = surfaceY - wy;
  if (depthBelowSurface < 3) {
    return null;
  }
  if (depthBelowSurface < CAVE_CONFIG.minDepthBelowSurface) {
    if (surfaceY <= seaLevel + 4) return null;
    const entranceNoise = noise.noise2D(wx * 0.032 + 310, wz * 0.032 - 310);
    if (entranceNoise < 1.0 - CAVE_CONFIG.entranceChance * 9.0) {
      return null;
    }
  }

  // 5. SPAGHETTI TUNNELS: Region where two independent 3D noise fields are BOTH near zero.
  //    Evaluated strictly in world coordinates (wx, wy, wz) for seamless cross-chunk continuity.
  const sf = CAVE_CONFIG.spaghettiFreq;
  const sfy = CAVE_CONFIG.spaghettiFreqY;
  const n1 = noise.noise3D(wx * sf, wy * sfy, wz * sf);
  const n2 = noise.noise3D(wx * sf + 97.3, wy * sfy - 53.1, wz * sf + 141.7);

  // Modulate tunnel radius slightly along length (1.5 to 3 blocks)
  const radiusMod = 1.0 + 0.25 * noise.noise3D(wx * 0.015, wy * 0.015, wz * 0.015);
  const thresh = CAVE_CONFIG.spaghettiThreshold * radiusMod;
  const isSpaghetti = Math.abs(n1) < thresh && Math.abs(n2) < thresh;

  // 6. CAVERN ROOMS: Lower-frequency 3D noise threshold creating open chambers between y=10 and y=40
  let isCavern = false;
  if (
    wy >= CAVE_CONFIG.cavernMinY &&
    wy <= CAVE_CONFIG.cavernMaxY &&
    depthBelowSurface >= 6
  ) {
    const cf = CAVE_CONFIG.cavernFreq;
    const cn = noise.noise3D(wx * cf - 210, wy * cf * 1.15, wz * cf + 210);
    if (cn > CAVE_CONFIG.cavernThreshold) {
      isCavern = true;
    }
  }

  // 7. OPTIONAL RAVINES: Rare narrow vertical canyons underground (y=12..surfaceY-5)
  let isRavine = false;
  if (wy >= 12 && depthBelowSurface >= 5) {
    const rf = CAVE_CONFIG.ravineFreq;
    const rWarp = noise.noise2D(wx * 0.02, wz * 0.02) * 3.0;
    const rField = noise.noise2D((wx + rWarp) * rf + 500, (wz - rWarp) * rf - 500);
    const rMask = noise.noise2D(wx * 0.008 - 120, wz * 0.008 + 120);
    if (rMask > 0.68 && Math.abs(rField) < CAVE_CONFIG.ravineThreshold) {
      isRavine = true;
    }
  }

  if (!isSpaghetti && !isCavern && !isRavine) {
    return null;
  }

  // 8. Lower cave floors below y=8 (especially y <= 2) hold glowing lava pools
  if (wy <= 2) {
    return 'lava';
  }
  if (wy <= CAVE_CONFIG.lavaPoolMaxY) {
    const lavaPocket = noise.noise2D(wx * 0.09 + 77, wz * 0.09 - 77);
    if (lavaPocket > 0.45 && wy <= 5) {
      return 'lava';
    }
  }

  return 'air';
}
