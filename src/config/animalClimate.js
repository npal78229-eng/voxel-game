// ============================================================================
// Animal Climate Modifiers, Biome Affinities & Flying Bird Config (src/config/animalClimate.js)
// ============================================================================

export const ANIMAL_CLIMATE_CONFIG = {
  EVALUATION_INTERVAL: 1.0, // Staggered 1-second interval per mob
  SHELTER_SAMPLE_POINTS: 12,
  SHELTER_RADIUS: 16,
  SHELTER_CACHE_SECONDS: 10.0,
  DRINK_SEARCH_RADIUS: 20,
  DRINK_DURATION_SECONDS: 3.0,
  HUDDLE_RADIUS: 8.0,
  HUDDLE_MIN_NEIGHBORS: 2,

  // Biome Affinity Spawn Weights (0..10)
  BIOME_AFFINITY_WEIGHTS: {
    Pig: { forest: 8, darkwood: 9, swamp: 6, plains: 4, birch_forest: 4, maple_forest: 5, redwood: 4, ocean: 0 },
    Cow: { plains: 9, forest: 5, savanna: 6, birch_forest: 4, maple_forest: 4, ocean: 0 },
    Sheep: { plains: 10, mountains: 7, forest: 4, birch_forest: 4, savanna: 4, ocean: 0 },
    Rabbit: { plains: 8, forest: 6, tundra: 7, maple_forest: 5, darkwood: 3, desert: 2, ocean: 0 },
    Chicken: { plains: 8, forest: 6, birch_forest: 5, swamp: 4, ocean: 0 },
    Cat: { plains: 6, forest: 5, birch_forest: 4, savanna: 4, ocean: 0 },
    Dog: { plains: 7, forest: 6, taiga: 5, mountains: 4, ocean: 0 },
    Wolf: { taiga: 10, tundra: 8, forest: 6, darkwood: 7, mountains: 5, redwood: 5, plains: 2, ocean: 0 },
    Monkey: { swamp: 8, forest: 5, darkwood: 6, plains: 2, ocean: 0 },
    Bird: {
      plains: 8,
      forest: 9,
      birch_forest: 8,
      darkwood: 7,
      maple_forest: 10,
      redwood: 9,
      taiga: 6,
      mountains: 7,
      ocean: 0,
    },
  },

  // Seasonal Mob Multipliers
  SEASON_SPAWN_MULTIPLIERS: {
    spring: { Bird: 1.6, Rabbit: 1.4, default: 1.1, babyChance: 0.20 },
    summer: { Bird: 1.3, Rabbit: 1.2, default: 1.0, babyChance: 0.05 },
    autumn: { Bird: 0.6, Wolf: 1.1, default: 0.95, babyChance: 0.0 }, // Birds migrating
    winter: { Bird: 0.2, Wolf: 1.4, default: 0.75, babyChance: 0.0 }, // Wolf pack bonus
  },

  // Bird Flight Dynamics
  BIRD_FLIGHT: {
    cruiseSpeedMin: 5.5,
    cruiseSpeedMax: 8.0,
    climbRate: 3.5,
    minCruiseAltitude: 8.0,
    maxCruiseAltitude: 25.0,
    bankRollMax: 0.45,
    obstacleRayDistance: 6.0,
    fleePlayerDistance: 6.0,
    perchDurationMin: 10.0,
    perchDurationMax: 40.0,
    flockSeparationDist: 3.0,
    flockAlignmentWeight: 1.1,
    flockCohesionWeight: 0.85,
    flockSeparationWeight: 1.4,
    spatialHashCell: 10.0,
    wingFlapSpeedCruise: 8.0,
    wingFlapSpeedClimb: 16.0,
    wingFlapSpreadSoar: 0.0,
  },
};
