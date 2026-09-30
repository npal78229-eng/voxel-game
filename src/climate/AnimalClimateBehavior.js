import { isMobExposedToSun, findNearestShadeOrWater } from '../daylightBurn.js';
import { ANIMAL_CLIMATE_CONFIG } from '../config/animalClimate.js';

// ============================================================================
// Climate-Driven Animal Behavior Engine (src/climate/AnimalClimateBehavior.js)
// Staggered 1-Second Evaluation: Shelter, Rest, Drink, Huddle
// ============================================================================

export class AnimalClimateBehavior {
  constructor(world) {
    this.world = world;
    this.cfg = ANIMAL_CLIMATE_CONFIG;
  }

  /**
   * Computes climate modifiers for an animal mob:
   */
  getClimateModifiers(mob, climate, biome) {
    const isNight = climate ? climate.isNight() : false;
    const weather = climate ? climate.weather : 'clear';
    const season = climate ? climate.season : 'spring';
    const precip = climate ? climate.precipIntensity : 0.0;
    const temp = climate && biome ? climate.temperatureAt(biome, mob.basePos?.y || 20) : 18;

    const isPassive = mob.spec?.behaviorClass === 'passive';
    const isWolf = mob.spec?.type === 'Wolf';

    let speedMult = 1.0;
    let wanderRadiusMult = 1.0;
    let activity = 'active'; // 'active' | 'rest' | 'sleep' | 'shelter' | 'drink' | 'huddle'
    let seekShade = false;
    let seekShelter = false;
    let herdTightness = 1.0;
    let aggroRangeMult = 1.0;
    let flightAllowed = true;

    // 1. Weather Modifiers: Rain / Thunderstorm
    if (weather === 'thunderstorm' || weather === 'heavy_rain') {
      seekShelter = true;
      speedMult = 0.85;
      activity = 'shelter';
      flightAllowed = false;
    } else if (weather === 'light_rain') {
      speedMult = 0.9;
      wanderRadiusMult = 0.7;
      if (isPassive && Math.random() < 0.6) {
        seekShelter = true;
        activity = 'shelter';
      }
    }

    // 2. Temperature: Hot midday vs Cold winter
    if (temp >= 28) {
      // Hot: seek shade or drink
      seekShade = true;
      if (isPassive && Math.random() < 0.45) {
        activity = 'drink';
      } else {
        activity = 'rest';
      }
      speedMult = 0.85;
      if (isWolf) aggroRangeMult = 0.8;
    } else if (temp <= 0) {
      // Cold: huddle in groups, smaller wander radius
      wanderRadiusMult = 0.45;
      herdTightness = 2.0;
      if (isPassive) activity = 'huddle';
      if (isWolf) {
        aggroRangeMult = 1.25; // Wolves more aggressive in winter packs
        speedMult = 1.15;
      }
    }

    // 3. Night: Sleep / Rest for passive animals
    if (isNight && isPassive) {
      activity = 'sleep';
      speedMult = 0.2;
      wanderRadiusMult = 0.2;
      flightAllowed = false;
    }

    // 4. Spring / Autumn
    if (season === 'spring' && activity !== 'sleep') {
      wanderRadiusMult = Math.max(wanderRadiusMult, 1.35);
      speedMult = Math.max(speedMult, 1.1);
    } else if (season === 'autumn') {
      herdTightness = 1.4;
    }

    return {
      speedMult,
      wanderRadiusMult,
      activity,
      seekShade,
      seekShelter,
      herdTightness,
      aggroRangeMult,
      flightAllowed,
    };
  }

  /**
   * Evaluates and updates the animal's climate state (Shelter, Rest, Drink, Huddle)
   */
  updateMobClimateState(dt, mob, climate, biome, allMobs = []) {
    // Combat / Flee always overrides climate behavior
    if (mob.state === 'Flee' || mob.state === 'Chase' || mob.state === 'WindupStop' || mob.burning) {
      mob.climateState = 'none';
      return;
    }

    // Staggered 1-second timer per mob
    mob.climateTimer = (mob.climateTimer || 0) + dt;
    if (mob.climateTimer < this.cfg.EVALUATION_INTERVAL) {
      return;
    }
    mob.climateTimer = (mob.id % 10) * 0.08; // Stagger next tick

    const mods = this.getClimateModifiers(mob, climate, biome);
    mob.climateModifiers = mods;

    // Apply activity state
    if (mods.activity === 'shelter' || mods.seekShelter) {
      if (!mob.shelterTarget || mob.shelterTimer <= 0) {
        mob.shelterTarget = this._findCoveredSpot(mob.basePos.x, mob.basePos.y, mob.basePos.z);
        mob.shelterTimer = this.cfg.SHELTER_CACHE_SECONDS;
      }
      if (mob.shelterTarget) {
        mob.climateState = 'Shelter';
        mob.state = 'Wander';
        mob.targetPos = mob.shelterTarget;
        return;
      }
    }

    if (mods.activity === 'drink') {
      if (!mob.drinkTarget || mob.drinkTimer <= 0) {
        mob.drinkTarget = this._findNearbyWater(mob.basePos.x, mob.basePos.y, mob.basePos.z);
      }
      if (mob.drinkTarget) {
        mob.climateState = 'Drink';
        mob.state = 'Wander';
        mob.targetPos = mob.drinkTarget;
        return;
      }
    }

    if (mods.activity === 'huddle') {
      const neighbor = this._findNearestSameSpecies(mob, allMobs);
      if (neighbor) {
        mob.climateState = 'Huddle';
        mob.targetPos = { x: neighbor.basePos.x, z: neighbor.basePos.z };
        return;
      }
    }

    if (mods.activity === 'sleep' || mods.activity === 'rest') {
      mob.climateState = mods.activity === 'sleep' ? 'Sleep' : 'Rest';
      mob.state = 'Idle';
      if (mob.headGroup) {
        // Lower head in resting pose
        mob.headGroup.rotation.x = 0.35;
      }
      return;
    }

    mob.climateState = 'none';
    if (mob.headGroup) mob.headGroup.rotation.x = 0;
  }

  _findCoveredSpot(x, y, z) {
    // Sample candidate spots within SHELTER_RADIUS for roof/canopy above
    for (let r = 4; r <= this.cfg.SHELTER_RADIUS; r += 4) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI * 0.5) {
        const cx = Math.round(x + Math.cos(a) * r);
        const cz = Math.round(z + Math.sin(a) * r);
        const cy = this.world.getSurfaceHeight(cx, cz);
        if (!isMobExposedToSun(this.world, cx, cy, cz)) {
          return { x: cx, y: cy, z: cz };
        }
      }
    }
    return null;
  }

  _findNearbyWater(x, y, z) {
    const r = this.cfg.DRINK_SEARCH_RADIUS;
    for (let dx = -r; dx <= r; dx += 4) {
      for (let dz = -r; dz <= r; dz += 4) {
        const cx = Math.round(x + dx);
        const cz = Math.round(z + dz);
        const b = this.world.getBlock(cx, 18, cz);
        if (b === 'water') {
          return { x: cx, y: 18.5, z: cz };
        }
      }
    }
    return null;
  }

  _findNearestSameSpecies(mob, allMobs) {
    let nearest = null;
    let minD = this.cfg.HUDDLE_RADIUS;
    for (const other of allMobs) {
      if (other === mob || other.spec?.type !== mob.spec?.type) continue;
      const d = Math.hypot(other.basePos.x - mob.basePos.x, other.basePos.z - mob.basePos.z);
      if (d < minD && d > 1.2) {
        minD = d;
        nearest = other;
      }
    }
    return nearest;
  }
}
