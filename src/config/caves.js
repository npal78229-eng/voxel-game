// ============================================================================
// Centralized Cave Generation Configuration (Task F4)
// ============================================================================

export const CAVE_CONFIG = {
  // Spaghetti tunnels: where two 3D noise fields (n1, n2) are both near zero
  spaghettiFreq: 0.044,
  spaghettiFreqY: 0.055,
  spaghettiThreshold: 0.14, // Forms continuous 1.5..3.0 block radius tubes across chunk borders

  // Large cavern rooms between y=10 and y=40
  cavernFreq: 0.024,
  cavernMinY: 10,
  cavernMaxY: 40,
  cavernThreshold: 0.64,
  cavernChance: 0.35,

  // Vertical ravines (rare long thin vertical cracks)
  ravineFreq: 0.018,
  ravineThreshold: 0.038,

  // Placement & safety constraints
  minDepthBelowSurface: 4, // Stay at least 4 blocks below surface unless entrance
  entranceChance: 0.025, // Rare hillside cave entrances opening to surface
  spawnProtectionRadius: 12, // Never carve within 12 blocks of world spawn (8, 11)
  spawnX: 8,
  spawnZ: 11,
  lavaPoolMaxY: 8, // Cave floors at or below y=8 hold glowing lava pools
  minCaveY: 1, // Never carve into bottom unbreakable bedrock layer (y=0)
};
