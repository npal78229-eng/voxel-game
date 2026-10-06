// ============================================================================
// Centralized Spawn Configuration & Day/Night Rules (Task F2)
// ============================================================================

import { TIME_CONFIG } from './time.js';
import { ANIMAL_GROUP_MIN, ANIMAL_GROUP_MAX } from './animals.js';

export const SPAWN_CONFIG = {
  NIGHT_START: TIME_CONFIG.NIGHT_START, // 0.58
  NIGHT_END: TIME_CONFIG.NIGHT_END, // 0.92
  HOSTILE_SPAWN_IN_CAVES: false, // Task F2: default FALSE (strictly night-only surface spawns)
  MIN_SPAWN_DIST: 24, // Minimum distance from player for night monsters
  MAX_SPAWN_DIST: 64, // Maximum distance from player for night monsters
  SOFT_DESPAWN_DIST: 24, // Dawn gradual despawn distance threshold
  IMMEDIATE_DESPAWN_DIST: 32, // Dawn immediate despawn distance threshold
  HARD_DESPAWN_DIST: 38, // Absolute max distance for dynamic mobs (prevents hoarding)
  SPAWN_INTERVAL_SECONDS: 3.0, // Spawn loop timer interval
  MAX_MOBS_PER_ATTEMPT: 1, // Controlled single mob evaluation
  MAX_ACTIVE_SPECIES: 2, // Maximum 2 different species active simultaneously
  MAX_DYNAMIC_MOBS: 7, // User requirement: Maximum 7 mobs active at a time!
  MOB_LIFESPAN_SECONDS: 45, // Dynamic mob lifespan before peaceful rotation
  SUNLIGHT_BURN_DPS: 4.0, // Damage per second to burning night monsters at dawn
  DAWN_DESPAWN_RATE_PER_SEC: 2.0, // Non-burning night monsters despawned per second at dawn
  ANIMAL_GROUP_SIZE: [1, 2], // Small focused animal clusters
  CAPS: {
    passive: 4,
    neutral: 2,
    wild_predator: 2,
    night_monster: 4,
    global: 7, // Hard cap of 7 dynamic mobs
  },
  NIGHT_MONSTER_POOL: [
    'ShadowStalker',
    'BloodCrawler',
    'FleshGhoul',
  ],
  WILD_PREDATOR_POOL: ['Wolf', 'Monkey'],
  PASSIVE_POOL: ['Pig', 'Cow', 'Sheep'],
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
