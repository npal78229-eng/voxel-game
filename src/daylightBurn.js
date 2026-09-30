import { WORLD_MAX_Y } from './noise.js';

// ============================================================================
// Section 7 — Daylight Burning & Shade-Seeking System (src/daylightBurn.js)
// ============================================================================

export const MOB_BURN_RATES = {
  BloodCrawler: 3.0, // Fragile, dies fast
  Bonewalker: 4.0, // Summoned skeleton: crumbles almost instantly
  SoulSkeleton: 4.0,
  Skeleton: 4.0,
  ShadowStalker: 2.0, // Screeches when it ignites
  FleshGhoul: 1.5, // Tanky, takes longest among non-Wraiths
  GrimWraith: 1.0, // Cloak smolders, slowest burn
  Hexcaster: 2.0,
};

/**
 * Checks whether a mob's head at (wx, wy, wz) has unobstructed open sky above it
 * and is NOT standing in water.
 */
export function isMobExposedToSun(world, wx, wy, wz) {
  if (!world || typeof world.getBlock !== 'function') return true;

  const ix = Math.floor(wx + 0.5);
  const iy = Math.floor(wy);
  const iz = Math.floor(wz + 0.5);

  // 1. Standing in water extinguishes fire
  const feetBlock = world.getBlock(ix, iy, iz);
  const bodyBlock = world.getBlock(ix, iy + 1, iz);
  if (feetBlock === 'water' || bodyBlock === 'water') {
    return false;
  }

  // 2. Raycast straight up from head to WORLD_MAX_Y for roof / cave ceiling / tree canopy
  for (let checkY = iy + 2; checkY <= WORLD_MAX_Y; checkY++) {
    const b = world.getBlock(ix, checkY, iz);
    if (b && b !== 'glass') {
      // Any solid block or tree leaves overhead provides shade!
      return false;
    }
  }
  return true;
}

/**
 * Searches within 20 blocks (sampled grid) for a shaded or water spot.
 */
export function findNearestShadeOrWater(world, startX, startY, startZ) {
  if (!world) return null;
  let bestSpot = null;
  let bestDistSq = Infinity;

  for (let dx = -16; dx <= 16; dx += 4) {
    for (let dz = -16; dz <= 16; dz += 4) {
      if (dx === 0 && dz === 0) continue;
      const dSq = dx * dx + dz * dz;
      if (dSq >= bestDistSq || dSq > 20 * 20) continue;

      const tx = startX + dx;
      const tz = startZ + dz;
      const sy = world.getSurfaceHeight ? world.getSurfaceHeight(tx, tz) : startY;
      if (!isMobExposedToSun(world, tx, sy + 0.5, tz)) {
        bestDistSq = dSq;
        bestSpot = { x: tx, z: tz };
      }
    }
  }
  return bestSpot;
}

export class DaylightBurnSystem {
  constructor(world, particles = null, sfx = null) {
    this.world = world;
    this.particles = particles;
    this.sfx = sfx;
    this.checkTimer = 0; // Runs open-sky check every 0.5s (not every frame)
  }

  /**
   * Updates sunlight exposure, dawn shade-seeking, and burning damage for all night mobs.
   */
  update(deltaTime, mobs, timeOfDay, isNight, playerPosition) {
    this.checkTimer += deltaTime;
    const runSkyCheck = this.checkTimer >= 0.5;
    if (runSkyCheck) {
      this.checkTimer = 0;
    }

    // Dawn warning period: timeOfDay in [0.95..1.0] or [0.0..0.10]
    const t = ((timeOfDay % 1) + 1) % 1;
    const isDawnWarning = !isNight && (t > 0.94 || t < 0.11);
    const isFullDay = !isNight && !isDawnWarning;

    for (let i = mobs.length - 1; i >= 0; i--) {
      const mob = mobs[i];
      if (!mob || mob.hp <= 0) continue;

      const type = mob.spec?.type || mob.spec?.id || mob.type;
      const burnRate = MOB_BURN_RATES[type];
      if (!burnRate && mob.spec?.behaviorClass !== 'night_monster' && !mob.isSummonedSkeleton) {
        continue;
      }

      // 1. Every 0.5s, re-evaluate open-sky exposure & shade target
      if (runSkyCheck) {
        if (isNight) {
          mob.isSunlit = false;
          mob.burning = false;
          mob.shadeTarget = null;
        } else {
          mob.isSunlit = isMobExposedToSun(
            this.world,
            mob.group.position.x,
            mob.group.position.y,
            mob.group.position.z
          );
          if (mob.isSunlit && !mob.shadeTarget) {
            mob.shadeTarget = findNearestShadeOrWater(
              this.world,
              mob.group.position.x,
              mob.group.position.y,
              mob.group.position.z
            );
          } else if (!mob.isSunlit) {
            mob.shadeTarget = null;
          }
        }
      }

      // 2. Dawn warning: flicker eyes/smoke and seek shade if not in close combat
      if (isDawnWarning && mob.isSunlit) {
        mob.burning = false;
        if (runSkyCheck && this.particles) {
          this.particles.spawnBurst(
            mob.group.position.x,
            mob.group.position.y + 1.1,
            mob.group.position.z,
            'coal_ore'
          );
        }
      }

      // 3. Full Day + Sunlit -> BURNING state!
      if (isFullDay && mob.isSunlit) {
        if (!mob.burning) {
          mob.burning = true;
          if (type === 'ShadowStalker' && this.sfx?.playScreech) {
            this.sfx.playScreech();
          } else if (this.sfx?.playBurnSizzle) {
            this.sfx.playBurnSizzle();
          }
        }

        const dps = burnRate || 2.0;
        mob.hp -= dps * deltaTime;

        // Visual orange/red fire flicker + periodic flame/ash particles
        if (mob.bodyMat) {
          mob.bodyMat.color.setHex(
            Math.floor(performance.now() / 110) % 2 === 0 ? 0xf97316 : 0xef4444
          );
        }
        if (runSkyCheck && this.particles) {
          this.particles.spawnBurst(
            mob.group.position.x,
            mob.group.position.y + 0.9,
            mob.group.position.z,
            'torch'
          );
        }

        // Check if mob died from sunlight
        if (mob.hp <= 0) {
          mob.hp = 0;
          mob.deadTimer = 0.45;
          mob.diedBySunlight = true;
          if (this.particles) {
            this.particles.spawnBurst(
              mob.group.position.x,
              mob.group.position.y + 0.8,
              mob.group.position.z,
              'coal_ore'
            );
          }
          // If GrimWraith dies, all its summoned skeletons crumble immediately!
          if (Array.isArray(mob.summoned)) {
            for (const skel of mob.summoned) {
              if (skel && skel.hp > 0) {
                skel.hp = 0;
                skel.deadTimer = 0.25;
              }
            }
            mob.summoned.length = 0;
          }
        }
      } else if (mob.burning) {
        // Reached shade or water -> extinguish fire!
        mob.burning = false;
        if (mob.bodyMat && mob.baseColor) {
          mob.bodyMat.color.copy(mob.baseColor);
        }
      }
    }
  }
}
