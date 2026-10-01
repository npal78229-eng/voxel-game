// ============================================================================
// Centralized Animal Spawning Configuration (Phase 4)
// Group sizes: Random 1 to 4 animals
// Maximum 4 of the same species within a 32-block radius
// ============================================================================

export const ANIMAL_SPAWN_CONFIG = {
  ANIMAL_GROUP_MIN: 1,
  ANIMAL_GROUP_MAX: 4,
  MAX_SAME_SPECIES_NEARBY: 4,
  SAME_SPECIES_RADIUS: 32,
};

export const ANIMAL_GROUP_MIN = 1;
export const ANIMAL_GROUP_MAX = 4;
export const MAX_SAME_SPECIES_NEARBY = 4;
export const SAME_SPECIES_RADIUS = 32;

/**
 * Rolls a random animal group size between ANIMAL_GROUP_MIN (1) and ANIMAL_GROUP_MAX (4).
 */
export function rollAnimalGroupSize() {
  return Math.floor(Math.random() * (ANIMAL_GROUP_MAX - ANIMAL_GROUP_MIN + 1)) + ANIMAL_GROUP_MIN;
}
