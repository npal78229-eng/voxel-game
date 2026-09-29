// ============================================================================
// Centralized Mob & Combat Configuration (Tasks F1, F2, F3)
// All ranges, hitboxes, windup times, cooldowns, damage & behavior classes
// live here. No magic numbers inside AI or combat loops.
// ============================================================================

export const PLAYER_COMBAT_CONFIG = {
  width: 0.6,
  height: 1.8,
  depth: 0.6,
  eyeOffsetY: 1.62,
  chestOffsetY: 1.0,
  invulnerabilitySeconds: 0.5, // Post-hit i-frame window so one attack = 1 damage event
};

/**
 * Behavior Classes (Task F2):
 * - 'passive': never attacks, flees when hit
 * - 'neutral': ignores player until hit, then fights back
 * - 'wild_predator': attacks on sight ANY time of day (day & night)
 * - 'night_monster': spawns ONLY at night (24..64 blocks away), burns/despawns at dawn
 */
export const MOB_CONFIGS = {
  // --------------------------------------------------------------------------
  // PASSIVE ANIMALS (Daytime surface groups on grass)
  // --------------------------------------------------------------------------
  Pig: {
    id: 'Pig',
    label: 'Sculpted Pig',
    behaviorClass: 'passive',
    attackType: 'melee',
    maxHp: 12,
    speed: 1.35,
    hitbox: { width: 0.85, height: 0.95, depth: 1.1 },
    meleeRange: 1.0,
    reachY: 1.0,
    windupTime: 0.45,
    cooldown: 1.4,
    damage: 0,
    knockback: 0,
    senseRange: 10,
    drop: 'dirt',
    biomes: ['plains', 'forest', 'birch_forest'],
  },
  Cow: {
    id: 'Cow',
    label: 'Spotted Dairy Cow',
    behaviorClass: 'passive',
    attackType: 'melee',
    maxHp: 14,
    speed: 1.15,
    hitbox: { width: 0.95, height: 1.3, depth: 1.35 },
    meleeRange: 1.0,
    reachY: 1.0,
    windupTime: 0.5,
    cooldown: 1.5,
    damage: 0,
    knockback: 0,
    senseRange: 10,
    drop: 'dirt',
    biomes: ['plains', 'savanna'],
  },
  Sheep: {
    id: 'Sheep',
    label: 'Fluffy Wool Sheep',
    behaviorClass: 'passive',
    attackType: 'melee',
    maxHp: 12,
    speed: 1.25,
    hitbox: { width: 0.85, height: 1.15, depth: 1.15 },
    meleeRange: 1.0,
    reachY: 1.0,
    windupTime: 0.45,
    cooldown: 1.4,
    damage: 0,
    knockback: 0,
    senseRange: 10,
    drop: 'snow',
    biomes: ['plains', 'mountains', 'taiga'],
  },
  Rabbit: {
    id: 'Rabbit',
    label: 'Cotton-Tail Rabbit',
    behaviorClass: 'passive',
    attackType: 'melee',
    maxHp: 8,
    speed: 1.85,
    hitbox: { width: 0.55, height: 0.65, depth: 0.65 },
    meleeRange: 0.9,
    reachY: 0.9,
    windupTime: 0.4,
    cooldown: 1.2,
    damage: 0,
    knockback: 0,
    senseRange: 10,
    drop: 'grass',
    biomes: ['plains', 'forest', 'tundra', 'desert'],
  },
  Bird: {
    id: 'Bird',
    label: 'Crimson Falcon',
    behaviorClass: 'passive',
    attackType: 'melee',
    maxHp: 10,
    speed: 1.9,
    hitbox: { width: 0.65, height: 0.75, depth: 0.75 },
    meleeRange: 1.0,
    reachY: 1.2,
    windupTime: 0.4,
    cooldown: 1.2,
    damage: 0,
    knockback: 0,
    senseRange: 12,
    drop: 'sand',
    biomes: ['mountains', 'forest', 'savanna'],
  },
  Cat: {
    id: 'Cat',
    label: 'Ginger & Cream Cat',
    behaviorClass: 'passive',
    attackType: 'melee',
    maxHp: 10,
    speed: 1.65,
    hitbox: { width: 0.6, height: 0.7, depth: 0.85 },
    meleeRange: 1.0,
    reachY: 0.9,
    windupTime: 0.4,
    cooldown: 1.2,
    damage: 0,
    knockback: 0,
    senseRange: 10,
    drop: 'sand',
    biomes: ['plains', 'birch_forest'],
  },
  Chicken: {
    id: 'Chicken',
    label: 'Farm Clucker',
    behaviorClass: 'passive',
    attackType: 'melee',
    maxHp: 6,
    speed: 1.5,
    hitbox: { width: 0.55, height: 0.7, depth: 0.6 },
    meleeRange: 0.9,
    reachY: 0.9,
    windupTime: 0.4,
    cooldown: 1.2,
    damage: 0,
    knockback: 0,
    senseRange: 9,
    drop: 'sand',
    biomes: ['plains', 'forest', 'swamp'],
  },

  // --------------------------------------------------------------------------
  // NEUTRAL COMPANION (Fights only when provoked)
  // --------------------------------------------------------------------------
  Dog: {
    id: 'Dog',
    label: 'Shepherd Hound',
    behaviorClass: 'neutral',
    attackType: 'melee',
    maxHp: 18,
    speed: 1.85,
    hitbox: { width: 0.75, height: 1.0, depth: 1.15 },
    meleeRange: 1.15,
    reachY: 1.0,
    windupTime: 0.4,
    cooldown: 1.25,
    damage: 3,
    knockback: 0.45,
    senseRange: 12,
    drop: 'wood',
    biomes: ['plains', 'forest', 'taiga'],
  },

  // --------------------------------------------------------------------------
  // WILD PREDATORS (Attack on sight ANY time of day — Day & Night)
  // --------------------------------------------------------------------------
  Wolf: {
    id: 'Wolf',
    label: 'Fang Wolf',
    behaviorClass: 'wild_predator',
    attackType: 'melee',
    maxHp: 14,
    speed: 2.25,
    hitbox: { width: 0.8, height: 1.05, depth: 1.2 },
    meleeRange: 1.2, // Edge-to-edge reach (cheat sheet: 1.2 blocks)
    reachY: 1.0,
    windupTime: 0.38,
    cooldown: 1.15,
    damage: 3,
    knockback: 0.55,
    senseRange: 14,
    loseInterestSeconds: 10,
    packSize: [2, 4],
    drop: 'coal_ore',
    biomes: ['forest', 'taiga', 'tundra'],
  },
  Monkey: {
    id: 'Monkey',
    label: 'Treeswing Ape',
    behaviorClass: 'wild_predator',
    attackType: 'melee',
    maxHp: 16,
    speed: 2.45,
    hitbox: { width: 0.85, height: 1.25, depth: 0.85 },
    meleeRange: 1.25, // Fast snatch-and-bite melee reach
    reachY: 1.15,
    windupTime: 0.34,
    cooldown: 1.05,
    damage: 2, // Low damage, high speed, hits and retreats
    knockback: 0.4,
    retreatDuration: 1.1, // Hits and retreats briefly after strike
    senseRange: 14,
    loseInterestSeconds: 10,
    packSize: [2, 3],
    drop: 'wood',
    biomes: ['forest', 'swamp', 'savanna'],
  },

  // --------------------------------------------------------------------------
  // NIGHT MONSTERS (Spawn ONLY at night 24..64 blocks away; burn/despawn at dawn)
  // --------------------------------------------------------------------------
  ShadowStalker: {
    id: 'ShadowStalker',
    label: 'Shadow Stalker (Wendigo)',
    behaviorClass: 'night_monster',
    burnsInSunlight: true,
    attackType: 'melee',
    maxHp: 40,
    speed: 2.1,
    hitbox: { width: 0.85, height: 1.95, depth: 0.85 },
    meleeRange: 1.5, // Cheat sheet: Shambler melee range = 1.5 blocks edge-to-edge
    reachY: 1.0,
    windupTime: 0.48,
    cooldown: 1.35,
    damage: 4,
    knockback: 0.65,
    senseRange: 22,
    drop: 'obsidian',
    biomes: ['all'],
  },
  BloodCrawler: {
    id: 'BloodCrawler',
    label: 'Blood Crawler (Abyssal Spider)',
    behaviorClass: 'night_monster',
    burnsInSunlight: true,
    attackType: 'melee',
    maxHp: 20,
    speed: 2.35,
    hitbox: { width: 1.1, height: 0.85, depth: 1.1 },
    meleeRange: 1.5,
    reachY: 1.0,
    windupTime: 0.4,
    cooldown: 1.2,
    damage: 3,
    knockback: 0.45,
    senseRange: 20,
    drop: 'redstone_ore',
    biomes: ['all'],
  },
  FleshGhoul: {
    id: 'FleshGhoul',
    label: 'Flesh Ghoul (Mutant Brute)',
    behaviorClass: 'night_monster',
    burnsInSunlight: true,
    attackType: 'melee',
    maxHp: 50,
    speed: 1.85,
    hitbox: { width: 1.05, height: 1.85, depth: 1.05 },
    meleeRange: 1.8, // Large brute (1.5..2.0 edge-to-edge)
    reachY: 1.1,
    windupTime: 0.58,
    cooldown: 1.6,
    damage: 5,
    knockback: 0.85,
    senseRange: 20,
    drop: 'mossy_cobble',
    biomes: ['all'],
  },
  Hexcaster: {
    id: 'Hexcaster',
    label: 'Hexcaster Mage',
    behaviorClass: 'night_monster',
    burnsInSunlight: true,
    attackType: 'ranged',
    rangedStyle: 'magic_bolt',
    maxHp: 12, // Task F3: low health (default 12) so rushing or shooting is a real choice
    speed: 1.85,
    hitbox: { width: 0.8, height: 1.85, depth: 0.8 },
    meleeRange: 1.2,
    castRange: 14.0, // Task F3: cast range 14 blocks
    minComfortDist: 6.0, // Task F3: backs away (kites) when player comes closer than 6 blocks
    reachY: 8.0,
    windupTime: 1.0, // Task F3: CASTING 1.0s telegraph (glowing hands, rising sound)
    cooldown: 2.5, // Task F3: COOLDOWN 2.5s
    damage: 3, // Task F3: default 3 (1.5 hearts)
    projectileSpeed: 14.0, // Task F3: 14 blocks/s, no gravity
    projectileLifetime: 3.0, // Task F3: 3.0s lifetime
    projectileRadius: 0.3, // Task F3: 0.3 hitbox size
    applySlowEffect: true,
    knockback: 0.35,
    senseRange: 22,
    drop: 'gem_ore',
    biomes: ['all'],
  },
  GrimWraith: {
    id: 'GrimWraith',
    label: 'Grim Wraith (Soul Reaper)',
    behaviorClass: 'night_monster',
    burnsInSunlight: true,
    attackType: 'ranged',
    rangedStyle: 'magic_bolt',
    maxHp: 30,
    speed: 1.75,
    hitbox: { width: 0.85, height: 1.85, depth: 0.85 },
    meleeRange: 1.5,
    castRange: 20.0,
    minComfortDist: 6.0,
    reachY: 8.0,
    windupTime: 1.0,
    cooldown: 2.5,
    damage: 4,
    projectileSpeed: 14.0,
    projectileLifetime: 3.0,
    projectileRadius: 0.3,
    applySlowEffect: true,
    knockback: 0.4,
    senseRange: 24,
    drop: 'gem_ore',
    biomes: ['all'],
  },
  Bonewalker: {
    id: 'Bonewalker',
    label: 'Summoned Skeleton',
    behaviorClass: 'night_monster',
    burnsInSunlight: true,
    attackType: 'melee',
    rangedStyle: 'arrow_arc',
    maxHp: 10,
    speed: 1.9,
    hitbox: { width: 0.75, height: 1.85, depth: 0.75 },
    meleeRange: 1.5,
    castRange: 15.0,
    minComfortDist: 5.5,
    reachY: 1.2,
    windupTime: 0.45,
    cooldown: 1.35,
    damage: 2,
    projectileSpeed: 16.0,
    projectileGravity: 6.5, // Real ballistic arc for arrows
    projectileLifetime: 3.0,
    projectileRadius: 0.28,
    knockback: 0.4,
    senseRange: 22,
    drop: 'iron_ore',
    biomes: ['all'],
  },
};

export const MOB_ALIASES = {
  pig: 'Pig',
  snorter: 'Pig',
  cow: 'Cow',
  moobeast: 'Cow',
  sheep: 'Sheep',
  woolback: 'Sheep',
  rabbit: 'Rabbit',
  bird: 'Bird',
  cat: 'Cat',
  chicken: 'Chicken',
  cluck: 'Chicken',
  dog: 'Dog',
  wolf: 'Wolf',
  fangwolf: 'Wolf',
  monkey: 'Monkey',
  treeswingape: 'Monkey',
  ape: 'Monkey',
  shambler: 'ShadowStalker',
  shadowstalker: 'ShadowStalker',
  wendigo: 'ShadowStalker',
  crawler: 'BloodCrawler',
  bloodcrawler: 'BloodCrawler',
  bloater: 'FleshGhoul',
  brute: 'FleshGhoul',
  fleshghoul: 'FleshGhoul',
  hexcaster: 'Hexcaster',
  mage: 'Hexcaster',
  wraith: 'GrimWraith',
  grimwraith: 'GrimWraith',
  bonewalker: 'Bonewalker',
  skeleton: 'Bonewalker',
};

export function getMobConfig(typeOrAlias) {
  if (!typeOrAlias) return MOB_CONFIGS.Pig;
  if (typeof typeOrAlias === 'object' && typeOrAlias.id) {
    return MOB_CONFIGS[typeOrAlias.id] || typeOrAlias;
  }
  const clean = String(typeOrAlias).toLowerCase().replace(/[\s_-]/g, '');
  const mapped = MOB_ALIASES[clean];
  if (mapped && MOB_CONFIGS[mapped]) return MOB_CONFIGS[mapped];
  const direct = Object.values(MOB_CONFIGS).find(
    (c) => c.id.toLowerCase() === clean
  );
  return direct || MOB_CONFIGS.Pig;
}
