// ============================================================================
// Centralized Spawn Configuration & Day/Night Rules (Task F2)
// ============================================================================

export const SPAWN_CONFIG = {
  NIGHT_START: 0.55, // 55% of day cycle
  NIGHT_END: 0.95, // 95% of day cycle
  HOSTILE_SPAWN_IN_CAVES: false, // Task F2: default FALSE (strictly night-only surface spawns)
  MIN_SPAWN_DIST: 24, // Minimum distance from player for night monsters
  MAX_SPAWN_DIST: 64, // Maximum distance from player for night monsters
  SOFT_DESPAWN_DIST: 24, // Dawn gradual despawn distance threshold
  IMMEDIATE_DESPAWN_DIST: 64, // Dawn immediate despawn distance threshold
  HARD_DESPAWN_DIST: 96, // Absolute max distance for any dynamic mob
  SPAWN_INTERVAL_SECONDS: 2.0, // Spawn loop timer interval (not every frame)
  MAX_MOBS_PER_ATTEMPT: 3, // Max mobs spawned per 2-second tick
  SUNLIGHT_BURN_DPS: 4.0, // Damage per second to burning night monsters at dawn
  DAWN_DESPAWN_RATE_PER_SEC: 2.0, // Non-burning night monsters despawned per second at dawn
  ANIMAL_GROUP_SIZE: [3, 4], // Animals always spawn in herds/flocks of 3 or 4
  CAPS: {
    passive: 28,
    neutral: 6,
    wild_predator: 8,
    night_monster: 12,
    global: 54,
  },
  NIGHT_MONSTER_POOL: [
    'ShadowStalker',
    'BloodCrawler',
    'FleshGhoul',
    'Hexcaster',
    'Bonewalker',
    'GrimWraith',
  ],
  WILD_PREDATOR_POOL: ['Wolf', 'Monkey'],
  PASSIVE_POOL: ['Pig', 'Cow', 'Sheep', 'Rabbit', 'Bird', 'Cat', 'Chicken'],
};

import { climateSystem } from '../climate/ClimateSystem.js';

/**
 * Exposes canonical isNight(timeOfDay) check using ClimateSystem getSunTimes().
 */
export function isNightTime(timeOfDay) {
  if (timeOfDay !== undefined) {
    const t = ((timeOfDay % 1) + 1) % 1;
    const { nightStart, nightEnd } = climateSystem.getSunTimes();
    return t >= nightStart && t <= nightEnd;
  }
  return climateSystem.isNight();
}

/**
 * Formats a one-line debug readout of time of day and whether isNight() is true.
 */
export function formatTimeDebugReadout(timeOfDay) {
  const t = ((timeOfDay % 1) + 1) % 1;
  const pct = (t * 100).toFixed(1);
  const night = isNightTime(t);
  return `Clock: ${pct}% | isNight(): ${night ? 'TRUE (Night Spawn Active)' : 'FALSE (Daytime - Night Monsters Blocked)'}`;
}
