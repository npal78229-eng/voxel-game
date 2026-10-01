// ============================================================================
// Centralized Master Time & Day/Night Cycle Configuration (Phase 5)
// Standard Day Length: 1200 seconds (20 real-time minutes, matching Minecraft)
//
// Cycle Breakdown:
// - Day:   50% (0.00 to 0.50) [Noon at 0.25]
// - Dusk:   8% (0.50 to 0.58) [Sunset transition]
// - Night: 34% (0.58 to 0.92) [Hostile mob spawns, Midnight at 0.75]
// - Dawn:   8% (0.92 to 1.00) [Sunrise transition, monster burn/despawn]
// ============================================================================

export const DAY_LENGTH_SECONDS = 1200; // 20 real minutes per day cycle

export const TIME_CONFIG = {
  DAY_LENGTH_SECONDS: 1200,
  DAY_FRACTION: 0.50,
  DUSK_FRACTION: 0.08,
  NIGHT_FRACTION: 0.34,
  DAWN_FRACTION: 0.08,

  // Absolute normalized cycle checkpoints [0.0 .. 1.0]
  DAY_START: 0.00,
  NOON: 0.25,
  DUSK_START: 0.50,
  NIGHT_START: 0.58,
  MIDNIGHT: 0.75,
  NIGHT_END: 0.92,
  SUNRISE_START: 0.92,
  CYCLE_END: 1.00,
};

/**
 * Returns true if timeOfDay falls within active hostile night [0.58 .. 0.92].
 */
export function isNightFraction(timeOfDay) {
  const t = ((timeOfDay % 1) + 1) % 1;
  return t >= TIME_CONFIG.NIGHT_START && t <= TIME_CONFIG.NIGHT_END;
}

/**
 * Returns true if timeOfDay is during sunrise/dawn burn window [0.92 .. 1.00] or [0.00 .. 0.04].
 */
export function isDawnFraction(timeOfDay) {
  const t = ((timeOfDay % 1) + 1) % 1;
  return t >= TIME_CONFIG.SUNRISE_START || t < 0.04;
}
