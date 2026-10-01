// ============================================================================
// Lightning Strikes Configuration (Phase 6)
// Targets: living 30 (17.6%), tree 60 (35.3%), block 80 (47.1%)
// Strikes occur only in rain (thunderstorm: 8..20s, light rain: 90..180s)
// ============================================================================

export const LIGHTNING_CONFIG = {
  // Strike frequency intervals in seconds
  STRIKE_INTERVAL_STORM: [8, 20],        // 8..20 seconds during heavy rain or thunderstorms
  STRIKE_INTERVAL_LIGHT_RAIN: [90, 180], // 90..180 seconds during light rain

  // Target selection weights (sum = 170)
  // Living: 30 / 170 = 17.65%
  // Tree:   60 / 170 = 35.29%
  // Block:  80 / 170 = 47.06%
  TARGET_WEIGHTS: {
    LIVING: 30,
    TREE: 60,
    BLOCK: 80,
  },

  // Combat & Damage parameters
  PLAYER_DAMAGE: 5,        // 5 HP (2.5 hearts)
  ANIMAL_DAMAGE: 20,       // Lethal / high damage to animals
  SPLASH_RADIUS: 3.5,      // Blocks
  FIRE_BURN_DURATION: 8,   // Seconds of status effect / burning

  // Audio & Visual parameters
  THUNDER_SPEED_OF_SOUND: 60, // Blocks per second for delayed thunder audio
  BOLT_LIFETIME: 0.35,        // Visual bolt duration with flickers
  SEARCH_RADIUS_LIVING: 48,   // Search radius for mobs/player around player
  SEARCH_RADIUS_TREE: 40,     // Search radius for tree canopies
  SEARCH_RADIUS_BLOCK: 48,    // Search radius for surface ground blocks
};
