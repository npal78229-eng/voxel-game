import * as THREE from 'three';
import { BLOCK_BY_ID } from './blocks.js';
import {
  createBlenderMobInstance,
  ALL_14_BLENDER_MOB_TYPES,
} from './BlenderMobs.js';
import {
  MOB_CONFIGS,
  PLAYER_COMBAT_CONFIG,
  getMobConfig,
} from './config/mobs.js';
import {
  SPAWN_CONFIG,
  isNightTime,
  formatTimeDebugReadout,
} from './config/spawning.js';
import {
  rollAnimalGroupSize,
  ANIMAL_GROUP_MIN,
  ANIMAL_GROUP_MAX,
  MAX_SAME_SPECIES_NEARBY,
  SAME_SPECIES_RADIUS,
} from './config/animals.js';
import {
  TIME_CONFIG,
  DAY_LENGTH_SECONDS,
  isNightFraction,
  isDawnFraction,
} from './config/time.js';
import {
  getEntityAABB,
  gapDistance,
  inMeleeRange,
  hasLineOfSight,
  getCombatRayEndpoints,
} from './combat/AttackRange.js';
import { MeleeAttack } from './combat/attacks/MeleeAttack.js';
import {
  RangedMagicAttack,
  ProjectileManager,
} from './combat/attacks/RangedMagicAttack.js';
import { AttackController } from './combat/AttackController.js';
import {
  NightMobCombatController,
  NIGHT_MOB_ATTACKS,
  NIGHT_MOB_STATS,
} from './mobAttacks.js';
import { NightProjectileSystem } from './projectiles.js';
import { DaylightBurnSystem } from './daylightBurn.js';
import {
  AUTO_JUMP_IMPULSE,
  AUTO_JUMP_COOLDOWN,
  isChunkLoadedAt,
  getHighestSolidY,
  evaluateObstacleAhead,
  isCliffDropAhead,
  moveEntityWithAABB,
  pushEntityOutOfBlocks,
} from './collision.js';
import { climateSystem } from './climate/ClimateSystem.js';
import { BirdFlightAI } from './ai/BirdFlightAI.js';
import { AnimalClimateBehavior } from './climate/AnimalClimateBehavior.js';

// ============================================================================
// Phases U2.3, U3.6, U5 & Tasks F1, F2, F3 — Combat, Spawning & 16-Mob Suite
// ============================================================================

export class SoundEffectsManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.stepTimer = 0;
  }

  _ensureContext() {
    if (this.muted) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playBreak() {
    const ctx = this._ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * 0.11);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(520, now);
    filter.frequency.exponentialRampToValueAtTime(180, now + 0.1);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.26, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.11);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }

  playPlace() {
    const ctx = this._ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(165, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + 0.065);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.075);
  }

  playAttackHit() {
    const ctx = this._ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.12);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  playWhooshMiss() {
    const ctx = this._ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.14);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.008, now + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  playCastTelegraph() {
    const ctx = this._ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.45);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.46);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.47);
  }

  playScreech() {
    const ctx = this._ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(190, now + 0.38);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.39);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  playBurnSizzle() {
    const ctx = this._ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(310, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.09);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.008, now + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playPlayerHurt() {
    const ctx = this._ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(62, now + 0.16);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  playFootstep() {
    const ctx = this._ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95 + Math.random() * 22, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.055);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.008, now + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  updateFootsteps(deltaTime, isMoving) {
    if (!isMoving) {
      this.stepTimer = 0.25;
      return;
    }
    this.stepTimer += deltaTime;
    if (this.stepTimer >= 0.38) {
      this.stepTimer = 0;
      this.playFootstep();
    }
  }
}

export class DayNightCycle {
  constructor(scene, lights) {
    this.scene = scene;
    this.lights = lights;
    this.climate = climateSystem;
    this.timeOfDay = this.climate.timeOfDay;
    this.dayDurationSeconds = this.climate.dayDurationSeconds;
    this.weather = this.climate.weather;

    this.noonSky = new THREE.Color(0x7cc8f8);
    this.sunsetSky = new THREE.Color(0xf97316);
    this.nightSky = new THREE.Color(0x0b1528);
    this.rainSky = new THREE.Color(0x475569);
    this.currentSky = new THREE.Color();

    this._createCelestialBodies();
    this._createStarField();
    this._createClouds();
    this._createWeatherParticles();
    this._createFireflies();
  }

  _createCelestialBodies() {
    this.celestialGroup = new THREE.Group();
    this.scene.add(this.celestialGroup);

    const sunGeo = new THREE.BoxGeometry(7.5, 7.5, 1.5);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    this.sunDisc = new THREE.Mesh(sunGeo, sunMat);
    this.celestialGroup.add(this.sunDisc);

    const moonGeo = new THREE.BoxGeometry(6.0, 6.0, 1.5);
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0 });
    this.moonDisc = new THREE.Mesh(moonGeo, moonMat);
    this.celestialGroup.add(this.moonDisc);
  }

  _createStarField() {
    const count = 280;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.48;
      const r = 135;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi) + 10;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.35,
      transparent: true,
      opacity: 0,
    });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.scene.add(this.stars);
  }

  _createClouds() {
    this.cloudGroup = new THREE.Group();
    const cloudMat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.82,
    });
    for (let i = 0; i < 18; i++) {
      const w = 8 + (i % 4) * 4;
      const d = 6 + (i % 3) * 4;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 1.6, d), cloudMat);
      mesh.position.set(
        ((i * 23) % 120) - 60,
        54 + (i % 3) * 1.5,
        ((i * 37) % 120) - 60
      );
      this.cloudGroup.add(mesh);
    }
    this.scene.add(this.cloudGroup);
  }

  _createWeatherParticles() {
    const count = 200;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 32;
      positions[i * 3 + 1] = Math.random() * 24;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 32;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.weatherMat = new THREE.PointsMaterial({
      color: 0x93c5fd,
      size: 0.35,
      transparent: true,
      opacity: 0.75,
    });
    this.weatherPoints = new THREE.Points(geo, this.weatherMat);
    this.weatherPoints.visible = false;
    this.scene.add(this.weatherPoints);
  }

  _createFireflies() {
    const count = 60;
    const positions = new Float32Array(count * 3);
    this.fireflyPointsData = [];
    for (let i = 0; i < count; i++) {
      const rx = (Math.random() - 0.5) * 28;
      const ry = 1.0 + Math.random() * 6.0;
      const rz = (Math.random() - 0.5) * 28;
      positions[i * 3] = rx;
      positions[i * 3 + 1] = ry;
      positions[i * 3 + 2] = rz;
      this.fireflyPointsData.push({
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 0.9,
        radX: 1.0 + Math.random() * 2.0,
        radZ: 1.0 + Math.random() * 2.0,
        baseY: ry,
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.fireflyMat = new THREE.PointsMaterial({
      color: 0xccff33,
      size: 0.32,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.fireflies = new THREE.Points(geo, this.fireflyMat);
    this.fireflies.visible = false;
    this.scene.add(this.fireflies);
  }

  setWeather(mode) {
    this.climate.setWeather(mode);
    this.weather = this.climate.weather;
    this.weatherPoints.visible = this.weather !== 'clear';
  }

  advanceTime(step = 0.08) {
    this.climate.timeOfDay = (this.climate.timeOfDay + step) % 1.0;
    this.timeOfDay = this.climate.timeOfDay;
  }

  isNight() {
    return this.climate.isNight();
  }

  getDebugReadout() {
    const info = this.climate.getSunTimes();
    const season = this.climate.season.toUpperCase();
    const day = this.climate.dayCount + 1;
    return `[${season} Day ${day}] ${formatTimeDebugReadout(this.timeOfDay)} (${this.weather})`;
  }

  getLabel() {
    const t = this.timeOfDay;
    const season = this.climate.season.charAt(0).toUpperCase() + this.climate.season.slice(1);
    const day = this.climate.dayCount + 1;
    const w = this.weather !== 'clear' ? ` (${this.weather})` : '';
    let phase = 'Day';
    if (this.isNight()) phase = 'Night';
    else if (t >= TIME_CONFIG.DUSK_START && t < this.climate.getSunTimes().nightStart) phase = 'Dusk';
    else if (t >= TIME_CONFIG.SUNRISE_START || t < 0.08) phase = 'Dawn';
    return `${season} D${day} - ${phase}${w} [${Math.round(t * 100)}%]`;
  }

  update(deltaTime, playerPosition, currentBiome = null) {
    // 1. Advance climate system (seasons, temperature, weather transitions, uniforms & audio)
    this.climate.update(deltaTime, playerPosition, currentBiome);
    this.timeOfDay = this.climate.timeOfDay;
    this.weather = this.climate.weather;

    const sunTimes = this.climate.getSunTimes();
    const sunElevation = sunTimes.sunElevation;
    const sunHorizontal = sunTimes.sunHorizontal;

    const snapX = Math.round(playerPosition.x * 2) / 2;
    const snapZ = Math.round(playerPosition.z * 2) / 2;
    const radius = 56;

    this.lights.sunLight.position.set(
      snapX + sunHorizontal * radius,
      Math.max(8, sunElevation * radius),
      snapZ + 18
    );
    this.lights.sunLight.target.position.set(snapX, 16, snapZ);
    this.lights.sunLight.target.updateMatrixWorld();

    const discRadius = 115;
    this.sunDisc.position.set(
      playerPosition.x + sunHorizontal * discRadius,
      sunElevation * discRadius,
      playerPosition.z - 25
    );
    this.sunDisc.lookAt(playerPosition);

    this.moonDisc.position.set(
      playerPosition.x - sunHorizontal * discRadius,
      -sunElevation * discRadius,
      playerPosition.z - 25
    );
    this.moonDisc.lookAt(playerPosition);

    this.stars.position.set(playerPosition.x, 0, playerPosition.z);
    this.starMat.opacity = Math.max(0, Math.min(0.95, -sunElevation * 1.4));

    // Cloud motion driven by climate wind vector
    const wind = this.climate.windVector;
    const windSpeedX = (wind?.x || 1.0) * (wind?.strength || 0.2) * 12;
    const windSpeedZ = (wind?.z || 0.3) * (wind?.strength || 0.2) * 12;
    for (const cloud of this.cloudGroup.children) {
      cloud.position.x += deltaTime * windSpeedX;
      cloud.position.z += deltaTime * windSpeedZ;
      if (cloud.position.x - playerPosition.x > 65) cloud.position.x -= 130;
      if (cloud.position.x - playerPosition.x < -65) cloud.position.x += 130;
      if (cloud.position.z - playerPosition.z > 65) cloud.position.z -= 130;
      if (cloud.position.z - playerPosition.z < -65) cloud.position.z += 130;
    }

    // Weather precipitation particles: adapt to precipTypeAt(currentBiome)
    const precip = this.climate.precipTypeAt(currentBiome, playerPosition?.y || 20);
    if (precip === 'none') {
      this.weatherPoints.visible = false;
    } else {
      this.weatherPoints.visible = true;
      let fallSpeed = 15.0;
      if (precip === 'snow') {
        this.weatherMat.color.setHex(0xffffff);
        this.weatherMat.size = 0.45;
        fallSpeed = 3.6;
      } else if (precip === 'dust_haze') {
        this.weatherMat.color.setHex(0xd97706);
        this.weatherMat.size = 0.38;
        fallSpeed = 1.8;
      } else {
        // Rain
        this.weatherMat.color.setHex(0x60a5fa);
        this.weatherMat.size = 0.28;
        fallSpeed = 16.0;
      }

      this.weatherPoints.position.set(
        playerPosition.x,
        playerPosition.y - 6,
        playerPosition.z
      );
      const posAttr = this.weatherPoints.geometry.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        let y = posAttr.getY(i) - fallSpeed * deltaTime;
        if (y < 0) y = 24;
        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;
    }

    // Sky & Lighting Color Curve
    if (!this.isNight() && sunElevation > 0.15) {
      const f = Math.min(1, (sunElevation - 0.15) / 0.85);
      this.currentSky.copy(this.sunsetSky).lerp(this.noonSky, f);
      this.lights.sunLight.intensity = 0.7 + 0.75 * f;
      this.lights.ambientLight.intensity = 0.36 + 0.14 * f;
      this.lights.ambientLight.color.setHex(0xffffff);
    } else if (!this.isNight()) {
      const f = Math.max(0, Math.min(1, (sunElevation + 0.25) / 0.4));
      this.currentSky.copy(this.nightSky).lerp(this.sunsetSky, f);
      this.lights.sunLight.intensity = 0.28 + 0.42 * f;
      this.lights.ambientLight.intensity = 0.28 + 0.1 * f;
      this.lights.ambientLight.color.setHex(0xfed7aa);
    } else {
      this.currentSky.copy(this.nightSky);
      this.lights.sunLight.intensity = 0.24;
      this.lights.ambientLight.intensity = 0.25;
      this.lights.ambientLight.color.setHex(0x93c5fd);
    }

    if (this.weather !== 'clear') {
      this.currentSky.lerp(this.rainSky, 0.45);
    }

    // Lightning Flash Integration
    if (this.climate.lightning.flash > 0) {
      const flash = this.climate.lightning.flash;
      this.lights.sunLight.intensity = Math.max(this.lights.sunLight.intensity, 1.8 * flash);
      this.lights.ambientLight.intensity = Math.max(this.lights.ambientLight.intensity, 1.2 * flash);
      this.lights.ambientLight.color.lerp(new THREE.Color(0xffffff), flash);
      this.currentSky.lerp(new THREE.Color(0xffffff), flash * 0.7);
    }

    this.scene.background.copy(this.currentSky);
    if (this.scene.fog) {
      this.scene.fog.color.copy(this.currentSky);
      const bId = currentBiome?.id || '';
      if (bId === 'darkwood' || bId === 'maple_forest' || bId === 'redwood') {
        this.scene.fog.density = 0.015;
      } else {
        this.scene.fog.density = 0.011;
      }
    }

    // Fireflies in Forest Biomes at Night
    const isForest = ['darkwood', 'maple_forest', 'redwood', 'forest'].includes(currentBiome?.id || '');
    if (this.isNight() && isForest) {
      this.fireflyMat.opacity = Math.min(0.85, this.fireflyMat.opacity + deltaTime * 1.5);
    } else {
      this.fireflyMat.opacity = Math.max(0, this.fireflyMat.opacity - deltaTime * 1.5);
    }
    this.fireflies.visible = this.fireflyMat.opacity > 0.01;
    if (this.fireflies.visible) {
      this.fireflies.position.set(playerPosition.x, playerPosition.y - 1.5, playerPosition.z);
      const posAttr = this.fireflies.geometry.attributes.position;
      const tNow = performance.now() * 0.001;
      for (let i = 0; i < this.fireflyPointsData.length; i++) {
        const fd = this.fireflyPointsData[i];
        const ph = fd.phase + tNow * fd.speed;
        const curX = posAttr.getX(i) + Math.cos(ph) * 0.04;
        const curY = fd.baseY + Math.sin(ph * 1.5) * 0.45;
        const curZ = posAttr.getZ(i) + Math.sin(ph) * 0.04;
        posAttr.setXYZ(i, curX, curY, curZ);
      }
      posAttr.needsUpdate = true;
    }
  }
}

export const DayNightWeather = DayNightCycle;

export const MOB_SPECS = Object.values(MOB_CONFIGS);

export class PassiveMobManager {
  constructor(scene, world, sfx = null, particles = null) {
    this.scene = scene;
    this.world = world;
    this.sfx = sfx;
    this.particles = particles;
    this.mobs = [];
    this.cycleIndex = 0;

    // Shared projectile systems (Task F3 & Night Mob 3-Attack Suite)
    this.projectileManager = new ProjectileManager(scene, world, particles);
    this.nightProjectiles = new NightProjectileSystem(scene, world, particles, sfx);
    this.daylightBurn = new DaylightBurnSystem(world, particles, sfx);
    this.aiEnabled = true;
    this.currentTimeOfDay = 0.25;

    // Task F2 Spawn Timer & Telemetry Log
    this.spawnTimer = 0;
    this.dawnDespawnAccum = 0;
    this.lastSpawnAttempts = [];
    this.spawnCountsByClass = {
      passive: 0,
      neutral: 0,
      wild_predator: 0,
      night_monster: 0,
    };

    // Task F1 / F3 Debug View (F4 Toggle & /mobdebug)
    this.debugViewEnabled = false;
    this.debugGroup = new THREE.Group();
    this.scene.add(this.debugGroup);

    // Part 3 & 4: Climate Behavior & Flying Bird AI Engines
    this.birdAI = new BirdFlightAI(this.world, this.sfx);
    this.animalClimate = new AnimalClimateBehavior(this.world);

    // Phase 4: Animals spawn in cohesive herds/flocks of 1 to 4!
    // NEVER spawn night_monsters during daytime or at world generation.
    const initialAnimalHerds = [
      { type: 'Pig', x: 11.0, z: 4.5, count: rollAnimalGroupSize() },
      { type: 'Cow', x: -3.5, z: 5.5, count: rollAnimalGroupSize() },
      { type: 'Sheep', x: 17.5, z: 12.0, count: rollAnimalGroupSize() },
      { type: 'Chicken', x: 3.5, z: 16.5, count: rollAnimalGroupSize() },
      { type: 'Rabbit', x: 14.0, z: 18.0, count: rollAnimalGroupSize() },
      { type: 'Dog', x: 6.8, z: 7.4, count: rollAnimalGroupSize() },
      { type: 'Bird', x: 8.0, z: 14.0, count: rollAnimalGroupSize() },
      // Wild predators spawn in packs of 2
      { type: 'Wolf', x: 24.0, z: 21.0, count: 2 },
      { type: 'Monkey', x: -12.0, z: 22.0, count: 2 },
    ];

    for (const herd of initialAnimalHerds) {
      this.spawnMobGroup(herd.type, herd.x, herd.z, herd.count, true);
    }
    this._recordSpawnLog(
      'INIT',
      `Spawned ${this.mobs.length} animals in groups of 1-4 (max 4 per species within 32m)`
    );
  }

  /**
   * Phase 4: Count living mobs of the same species within a given radius.
   */
  countNearbySameSpecies(typeName, x, z, radius = SAME_SPECIES_RADIUS) {
    const rSq = radius * radius;
    let count = 0;
    const clean = String(typeName).toLowerCase().replace(/[\s_-]/g, '');
    for (const m of this.mobs) {
      if (m.hp > 0) {
        const mType = (m.spec?.type || m.spec?.id || '').toLowerCase().replace(/[\s_-]/g, '');
        if (mType === clean) {
          const mx = m.basePos?.x ?? m.group.position.x;
          const mz = m.basePos?.z ?? m.group.position.z;
          const dSq = (mx - x) ** 2 + (mz - z) ** 2;
          if (dSq <= rSq) {
            count++;
          }
        }
      }
    }
    return count;
  }

  /**
   * Phase 4: Spawns a herd/pack of random 1 to 4 mobs of the same species clustered around (centerX, centerZ).
   * Enforces that never more than 4 of the same species exist within 32 blocks radius.
   */
  spawnMobGroup(typeOrSpec, centerX, centerZ, count = null, enforceDensityCap = true) {
    const cfg = this._resolveSpec(typeOrSpec);
    let targetSize = count !== null ? count : rollAnimalGroupSize();

    if (enforceDensityCap && (cfg.behaviorClass === 'passive' || cfg.reaction === 'panic')) {
      const existing = this.countNearbySameSpecies(cfg.type, centerX, centerZ, SAME_SPECIES_RADIUS);
      if (existing >= MAX_SAME_SPECIES_NEARBY) {
        return [];
      }
      targetSize = Math.min(targetSize, MAX_SAME_SPECIES_NEARBY - existing);
      if (targetSize <= 0) return [];
    }

    const groupSize = targetSize;

    const groupAnchor = { x: centerX, z: centerZ };
    const spawnedList = [];
    for (let i = 0; i < groupSize; i++) {
      const a = (i / groupSize) * Math.PI * 2 + Math.random() * 0.4;
      const r = 1.4 + Math.random() * 1.6;
      const mx = centerX + Math.cos(a) * r;
      const mz = centerZ + Math.sin(a) * r;
      const mob = this._createMob(cfg, this.mobs.length, mx, mz);
      mob.groupAnchor = groupAnchor;
      this.mobs.push(mob);
      spawnedList.push(mob);
    }
    return spawnedList;
  }

  /**
   * Section 1.4 & Part 1: GrimWraith summons SoulSkeleton around itself (Max 3 alive at once).
   */
  summonWraithSkeletons(wraithMob, maxCap = 3) {
    if (!wraithMob.summoned) wraithMob.summoned = [];
    wraithMob.summoned = wraithMob.summoned.filter((s) => s && s.hp > 0);
    const needed = Math.max(0, maxCap - wraithMob.summoned.length);
    if (needed <= 0) return 0;

    const skelCfg = getMobConfig('SoulSkeleton');
    let count = 0;
    for (let i = 0; i < needed; i++) {
      const a = (i / needed) * Math.PI * 2 + Math.random() * 0.5;
      const sx = wraithMob.group.position.x + Math.cos(a) * 2.4;
      const sz = wraithMob.group.position.z + Math.sin(a) * 2.4;
      const skel = this._createMob(skelCfg, this.mobs.length, sx, sz);
      skel.isSummonedSkeleton = true;
      skel.summonedBy = wraithMob.id;
      skel.parentWraith = wraithMob;
      wraithMob.summoned.push(skel);
      this.mobs.push(skel);
      if (this.particles) {
        this.particles.spawnBurst(sx, skel.group.position.y + 0.5, sz, 'gem_ore');
      }
      count++;
    }
    return count;
  }

  /**
   * Section 9: /killmobs — Removes all hostile mobs & summoned skeletons.
   */
  killAllHostileMobs() {
    let removed = 0;
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      if (
        m.spec.behaviorClass === 'night_monster' ||
        m.spec.behaviorClass === 'wild_predator' ||
        m.isSummonedSkeleton
      ) {
        m.nightCombat?.cancel(m, this.nightProjectiles);
        this._removeMobAtIndex(i);
        removed++;
      }
    }
    this.nightProjectiles.setSoulBeam(false);
    return removed;
  }

  _recordSpawnLog(status, reason) {
    this.lastSpawnAttempts.unshift({
      time: new Date().toLocaleTimeString(),
      status,
      reason,
    });
    if (this.lastSpawnAttempts.length > 10) {
      this.lastSpawnAttempts.length = 10;
    }
  }

  _resolveSpec(typeOrSpec) {
    return getMobConfig(typeOrSpec);
  }

  spawnMob(x, z, typeOrSpec = null) {
    const cfg = typeOrSpec
      ? this._resolveSpec(typeOrSpec)
      : MOB_SPECS[this.cycleIndex++ % MOB_SPECS.length];
    const mob = this._createMob(cfg, this.mobs.length, x, z);
    this.mobs.push(mob);
    return mob.spec;
  }

  spawnMobAt(typeOrSpec, x, z) {
    const spec = this.spawnMob(x, z, typeOrSpec);
    return spec.id || spec.type;
  }

  _createMob(cfg, index, customX = null, customZ = null) {
    const typeName = cfg.id || cfg.type || 'Pig';
    const angle = (index / Math.max(1, ALL_14_BLENDER_MOB_TYPES.length)) * Math.PI * 2;
    let x = customX !== null ? customX : 8 + Math.cos(angle) * 14;
    let z = customZ !== null ? customZ : 11 + Math.sin(angle) * 14;

    // Part B3.4 — Spawn on the highest solid block at the chosen column, avoiding water for land mobs
    let topSolidY = getHighestSolidY(this.world, x, z);
    if (
      typeof this.world?.getBlock === 'function' &&
      this.world.getBlock(Math.floor(x + 0.5), topSolidY + 1, Math.floor(z + 0.5)) === 'water'
    ) {
      // Search nearby columns within 6 blocks for dry land
      for (let r = 2; r <= 6; r += 2) {
        let foundDry = false;
        for (const [ox, oz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
          const candY = getHighestSolidY(this.world, x + ox, z + oz);
          if (
            this.world.getBlock(
              Math.floor(x + ox + 0.5),
              candY + 1,
              Math.floor(z + oz + 0.5)
            ) !== 'water'
          ) {
            x += ox;
            z += oz;
            topSolidY = candY;
            foundDry = true;
            break;
          }
        }
        if (foundDry) break;
      }
    }

    const basePos = { x, y: topSolidY + 0.5, z };
    const halfW = Math.max(0.28, (cfg.hitbox?.width || 0.75) * 0.45);
    const colH = Math.max(0.8, cfg.hitbox?.height || 1.2);
    pushEntityOutOfBlocks(this.world, basePos, halfW, colH);

    const rig = createBlenderMobInstance(typeName);
    rig.group.position.set(basePos.x, basePos.y, basePos.z);
    const initYaw = Math.atan2(-(8 - basePos.x), -(11 - basePos.z));
    rig.group.rotation.y = initYaw;
    this.scene.add(rig.group);

    // Instantiate data-driven Attack Controller (Task F1, F3 & Part 1 Multi-Attack)
    const attackController =
      Array.isArray(cfg.attacks) || typeName === 'GrimWraith' || typeName === 'SoulSkeleton'
        ? new AttackController(cfg)
        : cfg.attackType === 'ranged'
        ? new RangedMagicAttack(cfg)
        : new MeleeAttack(cfg);
    const nightCombat =
      typeName !== 'GrimWraith' && NIGHT_MOB_ATTACKS[typeName]
        ? new NightMobCombatController(typeName)
        : null;

    const mobInstance = {
      id: `${typeName}_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
      spec: { ...cfg, type: typeName },
      hitbox: cfg.hitbox,
      halfWidth: halfW,
      colliderHeight: colH,
      basePos,
      velocityY: 0,
      onGround: true,
      jumpCooldown: 0,
      stuckCheckTimer: 0,
      stuckDuration: 0,
      lastStuckCheckPos: { x: basePos.x, z: basePos.z },
      sidestepTimer: 0,
      strafeDir: Math.random() < 0.5 ? 1 : -1,
      reachY: cfg.reachY ?? 1.0,
      group: rig.group,
      bodyMat: rig.bodyMat,
      baseColor: rig.baseColor,
      legs: rig.legs || [],
      arms: rig.arms || [],
      headGroup: rig.headGroup,
      tailPivot: rig.tailPivot,
      hp: cfg.maxHp,
      maxHp: cfg.maxHp,
      state: 'Wander',
      attackPhase: 'IDLE',
      activeAttackName: '',
      phaseTimer: 0,
      attackCooldown: 0,
      lastAttackOutcome: '',
      missAnimTimer: 0,
      provoked: false,
      aggroMemoryTimer: 0,
      retreatTimer: 0,
      burning: false,
      isSunlit: false,
      shadeTarget: null,
      summoned: [],
      yaw: initYaw,
      timer: 1.5 + Math.random() * 2.5,
      hurtTimer: 0,
      animPhase: Math.random() * 10,
      deadTimer: 0,
      attackController,
      nightCombat,
    };

    if (typeName === 'Bird' || cfg.behaviorClass === 'flying') {
      this.birdAI.initBird(mobInstance, basePos.x, basePos.z, topSolidY + 0.5);
    }

    return mobInstance;
  }

  /**
   * Part B3.4 — When the player places a block at (bx, by, bz), push any overlapping mob
   * up or aside so no mob is ever trapped inside a player-placed block.
   */
  pushMobsOutOfBlock(bx, by, bz) {
    let pushedCount = 0;
    for (const mob of this.mobs) {
      if (!mob || mob.hp <= 0) continue;
      const pos = mob.basePos || mob.group.position;
      if (
        Math.abs(pos.x - bx) <= 1.8 &&
        Math.abs(pos.y - by) <= 2.5 &&
        Math.abs(pos.z - bz) <= 1.8
      ) {
        if (
          pushEntityOutOfBlocks(
            this.world,
            pos,
            mob.halfWidth || 0.38,
            mob.colliderHeight || 1.2
          )
        ) {
          mob.group.position.x = pos.x;
          mob.group.position.y = pos.y;
          mob.group.position.z = pos.z;
          mob.velocityY = 0;
          pushedCount++;
        }
      }
    }
    return pushedCount;
  }

  /**
   * Task F2: Saved world loading during the DAY removes any saved night_monster
   * that is not currently near the player.
   */
  cleanupDaytimeSavedMonsters(playerPosition, isNight) {
    if (isNight) return 0;
    let removed = 0;
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];
      if (mob.spec.behaviorClass === 'night_monster') {
        const dx = mob.group.position.x - playerPosition.x;
        const dz = mob.group.position.z - playerPosition.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 6.0 || mob.attackPhase === 'IDLE') {
          this._removeMobAtIndex(i);
          removed++;
        }
      }
    }
    if (removed > 0) {
      this._recordSpawnLog(
        'SAVE_LOAD_CLEANUP',
        `Removed ${removed} leftover night_monsters on daytime load`
      );
    }
    return removed;
  }

  _removeMobAtIndex(idx) {
    const mob = this.mobs[idx];
    if (!mob) return;
    if (mob.group && this.scene) {
      this.scene.remove(mob.group);
    }
    this.mobs.splice(idx, 1);
  }

  tryAttackMob(origin, direction, damage = 4) {
    const dir = direction.clone().normalize();
    let closestMob = null;
    let closestDist = 4.2;

    for (const mob of this.mobs) {
      if (mob.hp <= 0) continue;
      const toMob = mob.group.position
        .clone()
        .add(new THREE.Vector3(0, 0.65, 0))
        .sub(origin);
      const proj = toMob.dot(dir);
      if (proj < 0 || proj > closestDist) continue;

      const perpSq = toMob.lengthSq() - proj * proj;
      if (perpSq <= 0.9 * 0.9) {
        closestDist = proj;
        closestMob = mob;
      }
    }

    if (!closestMob) return null;

    closestMob.hp -= damage;
    closestMob.hurtTimer = 0.24;
    closestMob.bodyMat.color.setHex(0xef4444);

    const kbResist =
      NIGHT_MOB_STATS[closestMob.spec.type]?.knockbackResist ?? 0.0;
    const kb = closestMob.group.position
      .clone()
      .sub(origin)
      .setY(0)
      .normalize();
    closestMob.group.position.addScaledVector(kb, 0.85 * (1.0 - kbResist));

    if (closestMob.spec.reaction === 'panic' || closestMob.spec.behaviorClass === 'passive') {
      this.triggerMobPanic(closestMob, origin);
    } else if (closestMob.spec.reaction === 'retaliate' || closestMob.spec.behaviorClass === 'neutral') {
      closestMob.provoked = true;
      closestMob.aggroMemoryTimer = 12.0;
      closestMob.state = 'Chase';
    } else {
      closestMob.aggroMemoryTimer = 12.0;
    }

    if (closestMob.hp <= 0) {
      closestMob.attackController?.cancel(closestMob);
      closestMob.nightCombat?.cancel(closestMob, this.nightProjectiles);
      // Section 4: If GrimWraith dies, all its summoned skeletons crumble immediately!
      if (Array.isArray(closestMob.summoned)) {
        for (const skel of closestMob.summoned) {
          if (skel && skel.hp > 0) {
            skel.hp = 0;
            skel.deadTimer = 0.25;
          }
        }
        closestMob.summoned.length = 0;
      }
      closestMob.deadTimer = 0.55;
      return {
        killed: true,
        type: closestMob.spec.type,
        drop: closestMob.spec.drop,
        position: closestMob.group.position.clone(),
      };
    }

    return {
      killed: false,
      type: closestMob.spec.type,
      hp: closestMob.hp,
      maxHp: closestMob.maxHp,
    };
  }

  /**
   * Phase 3: Trigger Mob Panic & Herd Alarm
   * Sprints at 1.6x speed for 6..10 seconds, zigzagging every 0.8..1.5s (+/- 60 degrees).
   * Notifies living same-species mobs within 10 blocks (radius 10m) with 0.2..0.6s delay.
   * Birds take flight immediately.
   */
  triggerMobPanic(mob, sourcePos) {
    if (!mob || mob.hp <= 0) return;

    // Bird flight takeoff logic: immediately transition to high-speed escape flight
    if (mob.spec.type === 'Bird' || mob.spec.behaviorClass === 'flying') {
      if (this.birdAI) {
        this.birdAI.setBirdState(mob, 'Flee');
        mob.fleeTimer = 7.0 + Math.random() * 3.0;
      }
    }

    const pos = mob.basePos || mob.group.position;
    const sx = sourcePos ? sourcePos.x : pos.x;
    const sz = sourcePos ? sourcePos.z : pos.z;
    const fdx = pos.x - sx;
    const fdz = pos.z - sz;
    const baseYaw = Math.hypot(fdx, fdz) > 0.05 ? Math.atan2(fdx, fdz) : (mob.yaw + Math.PI);

    const [minDur, maxDur] = mob.spec.panicDuration || [6, 10];
    const duration = minDur + Math.random() * (maxDur - minDur);
    mob.panicTimer = duration;
    mob.state = 'Panic';
    mob.panicBaseYaw = baseYaw;
    mob.yaw = baseYaw + (Math.random() - 0.5) * (Math.PI / 3);
    mob.panicZigzagTimer = 0.8 + Math.random() * 0.7; // 0.8..1.5s
    mob.panicSourcePos = { x: sx, z: sz };

    // Herd Alarm: Alert all living same-species mobs within 10 blocks (radius 10m)
    const ALARM_DIST_SQ = 10.0 * 10.0;
    for (const other of this.mobs) {
      if (other !== mob && other.hp > 0 && other.spec.type === mob.spec.type) {
        const oPos = other.basePos || other.group.position;
        const dSq = (oPos.x - pos.x) ** 2 + (oPos.z - pos.z) ** 2;
        if (dSq <= ALARM_DIST_SQ) {
          const delay = 0.2 + Math.random() * 0.4; // 0.2..0.6s herd alarm reaction delay
          if (!other.pendingPanicTimer || other.pendingPanicTimer > delay) {
            other.pendingPanicTimer = delay;
            other.pendingPanicSource = { x: sx, z: sz };
          }
        }
      }
    }
  }

  /**
   * Task F2: Periodic Spawn Loop (runs every SPAWN_INTERVAL_SECONDS = 2.0s)
   */
  _runSpawnCycle(playerPosition, lookDirection, isNight) {
    // Recount active mobs by behaviorClass
    const counts = {
      passive: 0,
      neutral: 0,
      wild_predator: 0,
      night_monster: 0,
    };
    for (const m of this.mobs) {
      if (m.hp > 0) {
        const cls = m.spec.behaviorClass || 'passive';
        counts[cls] = (counts[cls] || 0) + 1;
      }
    }
    this.spawnCountsByClass = counts;

    if (this.mobs.length >= SPAWN_CONFIG.CAPS.global) {
      this._recordSpawnLog('BLOCKED', `Global cap (${SPAWN_CONFIG.CAPS.global}) reached`);
      return;
    }

    // 1. Attempt Night Monster Spawns
    if (!isNight) {
      this._recordSpawnLog('BLOCKED', 'night_monster skipped: daytime (isNight=false)');
    } else if (counts.night_monster >= SPAWN_CONFIG.CAPS.night_monster) {
      this._recordSpawnLog('BLOCKED', `night_monster cap (${SPAWN_CONFIG.CAPS.night_monster}) reached`);
    } else {
      let spawnedThisTick = 0;
      for (let attempt = 0; attempt < 4 && spawnedThisTick < SPAWN_CONFIG.MAX_MOBS_PER_ATTEMPT; attempt++) {
        const dist =
          SPAWN_CONFIG.MIN_SPAWN_DIST +
          Math.random() * (SPAWN_CONFIG.MAX_SPAWN_DIST - SPAWN_CONFIG.MIN_SPAWN_DIST);
        const angle = Math.random() * Math.PI * 2;
        const sx = playerPosition.x + Math.cos(angle) * dist;
        const sz = playerPosition.z + Math.sin(angle) * dist;

        // Avoid spawning inside player's forward view cone (dot > 0.55) if possible
        if (lookDirection) {
          const toSpotX = Math.cos(angle);
          const toSpotZ = Math.sin(angle);
          const dot = toSpotX * lookDirection.x + toSpotZ * lookDirection.z;
          if (dot > 0.55 && attempt < 3) {
            this._recordSpawnLog('BLOCKED', 'Spot inside player view cone');
            continue;
          }
        }

        const sy = this.world.getSurfaceHeight(sx, sz);
        const groundBlock = this.world.getBlock(Math.floor(sx), sy, Math.floor(sz));
        const air1 = this.world.getBlock(Math.floor(sx), sy + 1, Math.floor(sz));
        const air2 = this.world.getBlock(Math.floor(sx), sy + 2, Math.floor(sz));

        if (!groundBlock || groundBlock === 'water' || air1 || air2) {
          this._recordSpawnLog('BLOCKED', 'Invalid ground or obstructed air above');
          continue;
        }

        const pool = SPAWN_CONFIG.NIGHT_MONSTER_POOL;
        const chosenId = pool[Math.floor(Math.random() * pool.length)];
        const cfg = getMobConfig(chosenId);
        this.mobs.push(this._createMob(cfg, this.mobs.length, sx, sz));
        spawnedThisTick++;
        counts.night_monster++;
        this._recordSpawnLog(
          'SUCCESS',
          `Spawned ${chosenId} (night_monster) at ${dist.toFixed(1)}m`
        );
      }
    }

    // 2. Attempt Passive Animal Herd Spawns (Random 1 to 4, max 4 of same species within 32 blocks)
    if (counts.passive < SPAWN_CONFIG.CAPS.passive) {
      const dist = 16 + Math.random() * 20;
      const angle = Math.random() * Math.PI * 2;
      const sx = playerPosition.x + Math.cos(angle) * dist;
      const sz = playerPosition.z + Math.sin(angle) * dist;
      const pool = SPAWN_CONFIG.PASSIVE_POOL;
      const chosenAnimal = pool[Math.floor(Math.random() * pool.length)];
      const nearby = this.countNearbySameSpecies(chosenAnimal, sx, sz, SAME_SPECIES_RADIUS);
      if (nearby >= MAX_SAME_SPECIES_NEARBY) {
        this._recordSpawnLog(
          'SKIP',
          `Nearby cap (${MAX_SAME_SPECIES_NEARBY}) reached for ${chosenAnimal} within ${SAME_SPECIES_RADIUS}m`
        );
      } else {
        const rawGroup = rollAnimalGroupSize();
        const allowedGroup = Math.min(rawGroup, MAX_SAME_SPECIES_NEARBY - nearby);
        if (allowedGroup > 0) {
          const list = this.spawnMobGroup(chosenAnimal, sx, sz, allowedGroup, true);
          if (list.length > 0) {
            this._recordSpawnLog(
              'SUCCESS',
              `Spawned herd of ${list.length}x ${chosenAnimal} (passive, nearby was ${nearby}) at ${dist.toFixed(1)}m`
            );
          }
        }
      }
    }

    // 3. Attempt Wild Predator Pack Spawns (Groups of 3 or 4, Day or Night)
    if (counts.wild_predator < SPAWN_CONFIG.CAPS.wild_predator) {
      const dist = 22 + Math.random() * 24;
      const angle = Math.random() * Math.PI * 2;
      const sx = playerPosition.x + Math.cos(angle) * dist;
      const sz = playerPosition.z + Math.sin(angle) * dist;
      const biome = this.world.noise.getBiomeAt(sx, sz);
      const predId =
        biome.id === 'swamp' || biome.id === 'savanna' ? 'Monkey' : 'Wolf';
      const packSize = 3 + Math.floor(Math.random() * 2); // 3 or 4
      this.spawnMobGroup(predId, sx, sz, packSize);
      this._recordSpawnLog(
        'SUCCESS',
        `Spawned pack of ${packSize}x ${predId} (wild_predator) in ${biome.id} at ${dist.toFixed(1)}m`
      );
    }
  }

  getSpawnStatsReport(timeOfDay) {
    const counts = {
      passive: 0,
      neutral: 0,
      wild_predator: 0,
      night_monster: 0,
    };
    const byType = {};
    for (const m of this.mobs) {
      if (m.hp > 0) {
        const cls = m.spec.behaviorClass || 'passive';
        counts[cls] = (counts[cls] || 0) + 1;
        byType[m.spec.type] = (byType[m.spec.type] || 0) + 1;
      }
    }
    return {
      clockReadout: formatTimeDebugReadout(timeOfDay),
      isNight: isNightTime(timeOfDay),
      countsByClass: counts,
      countsByType: byType,
      lastAttempts: this.lastSpawnAttempts.slice(0, 10),
    };
  }

  /**
   * Main Frame Update for All Mobs, Projectiles, Sunrise Despawn & F4 Debug Visuals
   */
  update(
    deltaTime,
    playerPosition,
    isNight = false,
    onPlayerDamaged = null,
    playerVelocity = { x: 0, z: 0 },
    lookDirection = null,
    statusEffects = null,
    isGamePaused = false,
    timeOfDay = 0.25,
    playerHp = 20
  ) {
    // Section 1.2: Mobs must not attack through player's inventory/menu screen when paused
    if (isGamePaused) return;

    this.currentTimeOfDay = timeOfDay;

    const playerTarget = {
      isPlayer: true,
      position: playerPosition,
      width: PLAYER_COMBAT_CONFIG.width,
      height: PLAYER_COMBAT_CONFIG.height,
      depth: PLAYER_COMBAT_CONFIG.depth,
      vx: playerVelocity.x || 0,
      vz: playerVelocity.z || 0,
    };

    // 1. Update Pooled Night Mob Projectiles, Puddles & Rings + Task F3 Projectiles
    this.nightProjectiles.update(
      deltaTime,
      playerPosition,
      statusEffects,
      onPlayerDamaged
    );
    this.projectileManager.update(deltaTime, playerTarget, (hitInfo) => {
      if (typeof onPlayerDamaged === 'function') {
        onPlayerDamaged(hitInfo.damage, `${hitInfo.source} (${hitInfo.style})`, {
          applySlowEffect: hitInfo.applySlowEffect,
        });
      }
    });

    if (!this.aiEnabled) {
      this._updateDebugVisuals(playerTarget);
      return;
    }

    // 2. Periodic Spawn Timer (every 2.0s, never every frame)
    this.spawnTimer += deltaTime;
    if (this.spawnTimer >= SPAWN_CONFIG.SPAWN_INTERVAL_SECONDS) {
      this.spawnTimer = 0;
      this._runSpawnCycle(playerPosition, lookDirection, isNight);
    }

    // 3. Section 7: Open-Sky Sunlight Burning & Shade Seeking (every 0.5s check)
    this.daylightBurn.update(
      deltaTime,
      this.mobs,
      timeOfDay,
      isNight,
      playerPosition
    );

    const allBirds = this.mobs.filter((m) => m && m.isFlyingBird && m.hp > 0);

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];

      // Clean up dead summoned skeletons from parent Wraith array
      if (mob.summoned && mob.summoned.length > 0) {
        mob.summoned = mob.summoned.filter((s) => s && s.hp > 0);
      }

      if (mob.hp <= 0) {
        mob.deadTimer -= deltaTime;
        mob.group.rotation.z = Math.min(
          Math.PI / 2,
          mob.group.rotation.z + deltaTime * 4
        );
        if (mob.deadTimer <= 0) {
          this._removeMobAtIndex(i);
        }
        continue;
      }

      const dx = playerPosition.x - mob.group.position.x;
      const dz = playerPosition.z - mob.group.position.z;
      const horizDist = Math.sqrt(dx * dx + dz * dz);

      if (horizDist > SPAWN_CONFIG.HARD_DESPAWN_DIST) {
        this._removeMobAtIndex(i);
        continue;
      }

      // Part 4: Flying bird AI execution (zero-gravity 3D flight & flocking)
      if (mob.isFlyingBird) {
        this.birdAI.updateBird(deltaTime, mob, playerPosition, climateSystem, allBirds);
        continue;
      }

      if (mob.hurtTimer > 0) {
        mob.hurtTimer -= deltaTime;
        if (mob.hurtTimer <= 0 && !mob.burning) {
          mob.bodyMat.color.copy(mob.baseColor);
        }
      }

      const bClass = mob.spec.behaviorClass || 'passive';
      const senseRange = mob.spec.senseRange ?? 18;
      const { from: eyePos, to: chestPos } = getCombatRayEndpoints(
        mob,
        playerTarget
      );
      const hasLOS = hasLineOfSight(this.world, eyePos, chestPos);
      const canSeePlayer = horizDist <= senseRange && hasLOS;

      // Phase 3: Herd Alarm Delayed Reaction Tick
      if (mob.pendingPanicTimer > 0) {
        mob.pendingPanicTimer -= deltaTime;
        if (mob.pendingPanicTimer <= 0) {
          mob.pendingPanicTimer = 0;
          this.triggerMobPanic(mob, mob.pendingPanicSource);
        }
      }

      // Phase 3: Active Panic State Machine Tick
      if (mob.panicTimer > 0) {
        mob.panicTimer -= deltaTime;
        mob.state = 'Panic';
        mob.attackController?.cancel(mob);
        mob.nightCombat?.cancel(mob, this.nightProjectiles);

        mob.panicZigzagTimer = (mob.panicZigzagTimer || 0) - deltaTime;
        if (mob.panicZigzagTimer <= 0) {
          mob.panicZigzagTimer = 0.8 + Math.random() * 0.7; // 0.8..1.5s interval
          const src = mob.panicSourcePos || (mob.basePos ? mob.basePos : mob.group.position);
          const p = mob.basePos || mob.group.position;
          const fdx = p.x - src.x;
          const fdz = p.z - src.z;
          const baseYaw = Math.hypot(fdx, fdz) > 0.1 ? Math.atan2(fdx, fdz) : (mob.panicBaseYaw ?? mob.yaw);
          // Zigzag +/- 60 deg
          const zigzagAngle = (Math.random() - 0.5) * (2 * Math.PI / 3);
          mob.yaw = baseYaw + zigzagAngle;
        }

        if (mob.panicTimer <= 0) {
          mob.panicTimer = 0;
          mob.state = 'Idle';
          mob.timer = 1.5 + Math.random() * 2.0;
        }
      }

      let wantsToFight = false;
      if (mob.panicTimer <= 0) {
        if (bClass === 'wild_predator') {
          if (canSeePlayer || horizDist < 5.0) {
            mob.aggroMemoryTimer = mob.spec.loseInterestSeconds ?? 10.0;
          } else if (mob.aggroMemoryTimer > 0) {
            mob.aggroMemoryTimer -= deltaTime;
          }
          wantsToFight = mob.aggroMemoryTimer > 0;
        } else if (bClass === 'night_monster' || mob.isSummonedSkeleton) {
          wantsToFight = horizDist <= senseRange;
        } else if (bClass === 'neutral') {
          if (mob.provoked && mob.aggroMemoryTimer > 0) {
            mob.aggroMemoryTimer -= deltaTime;
            wantsToFight = true;
          } else {
            mob.provoked = false;
          }
        }
      }

      if (mob.retreatTimer > 0) {
        mob.retreatTimer -= deltaTime;
      }

      const gap = gapDistance(mob, playerTarget);

      // Section 7.3: If mob is BURNING in daylight and player is > 5 blocks away,
      // it runs to the nearest shade/water spot within 20 blocks! If player <= 5 blocks, it keeps fighting!
      if (mob.burning && mob.shadeTarget && horizDist > 5.0) {
        const sdx = mob.shadeTarget.x - mob.group.position.x;
        const sdz = mob.shadeTarget.z - mob.group.position.z;
        mob.yaw = Math.atan2(sdx, sdz);
        mob.state = 'SeekShade';
        mob.attackController?.cancel(mob);
        mob.nightCombat?.cancel(mob, this.nightProjectiles);
      } else if (wantsToFight && mob.attackController?.selectReadyAttack) {
        // ====================================================================
        // Section 1.2 & 1.3: Data-Driven Multi-Attack Controller (GrimWraith, SoulSkeleton)
        // ====================================================================
        mob.yaw = Math.atan2(dx, dz);

        mob.attackController.update(
          deltaTime,
          mob,
          playerTarget,
          this.world,
          {
            onPlayerDamaged: (dmg, src, opts) => {
              if (typeof onPlayerDamaged === 'function') {
                onPlayerDamaged(dmg, src, opts);
              }
            },
            onSummon: (parentMob, maxCap) => this.summonWraithSkeletons(parentMob, maxCap),
            nightProjectiles: this.nightProjectiles,
            statusEffects,
            sfx: this.sfx,
            playerCurrentHp: playerHp,
          }
        );

        if (
          mob.attackPhase === 'WINDUP' ||
          mob.attackPhase === 'STRIKE'
        ) {
          mob.state = 'WindupStop';
        } else if (mob.attackPhase === 'IDLE') {
          const nextAtk = mob.attackController.selectReadyAttack(
            mob,
            playerTarget,
            this.world
          );
          if (nextAtk) {
            mob.attackController.startAttack(mob, nextAtk, statusEffects, this.sfx);
            mob.state = 'WindupStop';
          } else {
            // Tactical movement: GrimWraith kites back if player < 6m, else chases
            if (mob.spec.type === 'GrimWraith') {
              const scytheCd = mob.attackController.cooldowns.get('scythe_slash') || 0;
              const soulCd = mob.attackController.cooldowns.get('soul_steal') || 0;
              if (gap < 6.0 && (soulCd <= 0 || scytheCd > 0)) {
                mob.state = 'KiteBack';
              } else if (gap > 3.5) {
                mob.state = 'Chase';
              } else {
                mob.state = 'Idle';
              }
            } else if (gap > (mob.spec.meleeRange ?? 1.6) - 0.2) {
              mob.state = 'Chase';
            } else {
              mob.state = 'Idle';
            }
          }
        }
      } else if (wantsToFight && mob.nightCombat) {
        // ====================================================================
        // Sections 3, 4, 5, 6: 3-Attack Night Mob Combat State Machine
        // ====================================================================
        mob.yaw = Math.atan2(dx, dz);

        mob.nightCombat.update(
          deltaTime,
          mob,
          playerTarget,
          this.world,
          this.nightProjectiles,
          statusEffects,
          onPlayerDamaged,
          (wraithMob, maxCap) => this.summonWraithSkeletons(wraithMob, maxCap),
          this.sfx
        );

        if (
          mob.attackPhase === 'WINDUP' ||
          mob.attackPhase === 'CHANNELING_CONE'
        ) {
          mob.state = 'WindupStop';
        } else {
          const nextAtk = mob.nightCombat.selectReadyAttack(
            mob,
            gap,
            hasLOS,
            statusEffects,
            playerHp
          );
          if (nextAtk) {
            mob.nightCombat.startWindup(mob, nextAtk, statusEffects, this.sfx);
            mob.state = 'WindupStop';
          } else {
            // Mob-specific tactical positioning when between attacks:
            const mType = mob.spec.type;
            if (
              mType === 'BloodCrawler' &&
              (mob.nightCombat.cooldowns.get('poison_spit') || 0) > 0 &&
              gap > 3.2
            ) {
              mob.state = 'StrafeCast';
            } else if (
              mType === 'ShadowStalker' &&
              gap >= 9.5 &&
              gap <= 14.5 &&
              mob.nightCombat.stalkTimer > 0
            ) {
              mob.nightCombat.stalkTimer -= deltaTime;
              mob.state = 'StalkCircle';
            } else if (
              mType === 'FleshGhoul' &&
              gap > 8.0 &&
              mob.nightCombat.chargeTimer <= 0
            ) {
              mob.nightCombat.chargeTimer = 1.0;
              mob.state = 'ChargeRush';
            } else if (mob.nightCombat.chargeTimer > 0) {
              mob.state = 'ChargeRush';
            } else {
              mob.state = 'Chase';
            }
          }
        }
      } else if (wantsToFight) {
        mob.yaw = Math.atan2(dx, dz);

        if (mob.spec.attackType === 'ranged') {
          mob.attackController.update(
            deltaTime,
            mob,
            playerTarget,
            this.world,
            this.projectileManager
          );
          if (
            mob.attackPhase === 'IDLE' &&
            mob.attackController.canStart(mob, playerTarget, this.world)
          ) {
            mob.attackController.start(mob);
            this.sfx?.playCastTelegraph();
          }
          const minComfort = mob.spec.minComfortDist ?? 6.0;
          const castRange = mob.spec.castRange ?? 14.0;
          if (gap < minComfort) mob.state = 'KiteBack';
          else if (mob.attackPhase === 'CASTING') mob.state = 'StrafeCast';
          else if (gap > castRange - 1.2) mob.state = 'Chase';
          else mob.state = 'HoldRange';
        } else {
          mob.attackController.update(
            deltaTime,
            mob,
            playerTarget,
            this.world,
            ({ damage, knockback }) => {
              if (typeof onPlayerDamaged === 'function') {
                onPlayerDamaged(damage, mob.spec.label || mob.spec.type, {
                  knockback,
                });
              }
              if (mob.spec.retreatDuration) {
                mob.retreatTimer = mob.spec.retreatDuration;
              }
            },
            () => {
              this.sfx?.playWhooshMiss();
            }
          );

          if (mob.retreatTimer > 0) mob.state = 'Retreat';
          else if (mob.attackPhase === 'WINDUP') mob.state = 'WindupStop';
          else if (
            mob.attackPhase === 'IDLE' &&
            mob.attackController.canStart(mob, playerTarget, this.world)
          ) {
            mob.attackController.start(mob);
            mob.state = 'WindupStop';
          } else if (gap > (mob.spec.meleeRange ?? 1.5) - 0.2) {
            mob.state = 'Chase';
          } else {
            mob.state = 'Idle';
          }
        }
      } else {
        mob.attackController?.cancel(mob);
        mob.nightCombat?.cancel(mob, this.nightProjectiles);

        if (mob.panicTimer > 0) {
          // Phase 3: In Panic state - suppress climate behaviors and wander/idle timers!
        } else {
          // Part 3: Climate-Driven Animal Behavior Engine (Shelter, Rest, Drink, Huddle)
          const mobBiome = typeof this.world.getBiomeAt === 'function'
            ? this.world.getBiomeAt(mob.basePos?.x || mob.group.position.x, mob.basePos?.z || mob.group.position.z)
            : null;
          this.animalClimate.updateMobClimateState(deltaTime, mob, climateSystem, mobBiome, this.mobs);

          mob.timer -= deltaTime;
          if (mob.timer <= 0) {
            mob.state = Math.random() > 0.22 ? 'Wander' : 'Idle';
            if (mob.groupAnchor) {
              const adx = mob.groupAnchor.x - mob.group.position.x;
              const adz = mob.groupAnchor.z - mob.group.position.z;
              if (adx * adx + adz * adz > 6.5 * 6.5) {
                mob.yaw = Math.atan2(adx, adz) + (Math.random() - 0.5) * 0.5;
              } else {
                mob.yaw += (Math.random() - 0.5) * 2.0;
              }
            } else {
              mob.yaw += (Math.random() - 0.5) * 2.2;
            }
            mob.timer = 1.8 + Math.random() * 2.5;
          }
        }
      }

      if (!mob.basePos) {
        mob.basePos = {
          x: mob.group.position.x,
          y: mob.group.position.y,
          z: mob.group.position.z,
        };
      }

      // Part B3.4: Unloaded-chunk freeze! If the chunk under the mob isn't loaded yet,
      // skip gravity and movement so it never falls through the world or gets buried.
      if (!isChunkLoadedAt(this.world, mob.basePos.x, mob.basePos.z)) {
        mob.velocityY = 0;
        continue;
      }

      // Tick jump cooldown and sidestep timer
      if (mob.jumpCooldown > 0) {
        mob.jumpCooldown = Math.max(0, mob.jumpCooldown - deltaTime);
      }
      if (mob.sidestepTimer > 0) {
        mob.sidestepTimer = Math.max(0, mob.sidestepTimer - deltaTime);
      }

      // Movement execution with burning panic (+20% speed) & FleshGhoul Charge (x1.6)
      let moveX = 0;
      let moveZ = 0;
      const burnSpeedMult = mob.burning ? 1.2 : 1.0; // Section 7.3: +20% panic speed while burning
      const climateSpeedMult = (mob.panicTimer > 0) ? 1.0 : (mob.climateModifiers?.speedMult ?? 1.0);
      const spd = mob.spec.speed * burnSpeedMult * climateSpeedMult;

      if (mob.sidestepTimer > 0) {
        // Stage 3 Unstuck Sidestep: move perpendicular to obstacle
        const perpYaw = mob.yaw + (mob.strafeDir || 1) * (Math.PI * 0.5);
        moveX = Math.sin(perpYaw) * spd;
        moveZ = Math.cos(perpYaw) * spd;
      } else if (mob.state === 'Panic') {
        const pMult = mob.spec.panicSpeedMult || 1.6;
        moveX = Math.sin(mob.yaw) * spd * pMult;
        moveZ = Math.cos(mob.yaw) * spd * pMult;
      } else if (mob.state === 'ChargeRush') {
        moveX = Math.sin(mob.yaw) * spd * 1.6;
        moveZ = Math.cos(mob.yaw) * spd * 1.6;
      } else if (mob.state === 'SeekShade' || mob.state === 'Chase') {
        moveX = Math.sin(mob.yaw) * spd * 1.2;
        moveZ = Math.cos(mob.yaw) * spd * 1.2;
      } else if (mob.state === 'Flee' || mob.state === 'Retreat') {
        moveX = -Math.sin(mob.yaw) * spd * 1.85;
        moveZ = -Math.cos(mob.yaw) * spd * 1.85;
      } else if (mob.state === 'KiteBack') {
        moveX = -Math.sin(mob.yaw) * spd * 1.1;
        moveZ = -Math.cos(mob.yaw) * spd * 1.1;
      } else if (mob.state === 'StrafeCast' || mob.state === 'StalkCircle') {
        const perpYaw = mob.yaw + (mob.strafeDir || 1) * (Math.PI * 0.5);
        moveX = Math.sin(perpYaw) * spd * 0.85;
        moveZ = Math.cos(perpYaw) * spd * 0.85;
      } else if (mob.state === 'Wander') {
        moveX = Math.sin(mob.yaw) * spd * 0.75;
        moveZ = Math.cos(mob.yaw) * spd * 0.75;
      }

      const moveLen = Math.hypot(moveX, moveZ);
      let isMoving = moveLen > 0.01;
      const halfW = mob.halfWidth || 0.38;
      const colH = mob.colliderHeight || 1.2;

      if (isMoving) {
        const dirX = moveX / moveLen;
        const dirZ = moveZ / moveLen;

        // Phase 3: Lava avoidance for panicking and wandering animals
        let lavaAhead = false;
        const checkDist = 1.35;
        const aheadX = Math.floor(mob.basePos.x + dirX * checkDist);
        const aheadZ = Math.floor(mob.basePos.z + dirZ * checkDist);
        const aheadY = Math.floor(mob.basePos.y);
        for (let dy = -1; dy <= 1; dy++) {
          const b = this.world.getBlock(aheadX, aheadY + dy, aheadZ);
          if (b === 'lava') { lavaAhead = true; break; }
          if (this.world.fluidSimulator?.getFluid(aheadX, aheadY + dy, aheadZ)?.type === 'lava') { lavaAhead = true; break; }
        }

        if (lavaAhead) {
          mob.yaw += Math.PI * (0.65 + Math.random() * 0.5) * (Math.random() > 0.5 ? 1 : -1);
          moveX = 0;
          moveZ = 0;
          isMoving = false;
        } else if (
          (!wantsToFight || mob.state === 'Panic') &&
          mob.onGround &&
          isCliffDropAhead(
            this.world,
            mob.basePos.x,
            mob.basePos.y,
            mob.basePos.z,
            dirX,
            dirZ,
            halfW,
            3
          )
        ) {
          mob.yaw += Math.PI * (0.75 + Math.random() * 0.5);
          moveX = 0;
          moveZ = 0;
          isMoving = false;
        } else {
          // Part B3.2 — Auto-Jump 1-Block Obstacles vs Turn Away from 2+ Block Obstacles
          const obs = evaluateObstacleAhead(
            this.world,
            mob.basePos.x,
            mob.basePos.y,
            mob.basePos.z,
            dirX,
            dirZ,
            halfW,
            colH
          );

          if (obs === 'jump_1block') {
            if (mob.onGround && mob.jumpCooldown <= 0) {
              mob.velocityY = AUTO_JUMP_IMPULSE;
              mob.onGround = false;
              mob.jumpCooldown = AUTO_JUMP_COOLDOWN;
              // Small forward nudge while jumping so the mob lands cleanly on top of the 1-block step
              moveX *= 1.2;
              moveZ *= 1.2;
            }
          } else if (obs === 'blocked_tall') {
            // Obstacle is 2+ blocks tall or has no headroom: DO NOT JUMP!
            if (!wantsToFight) {
              // Immediately turn 110–170 degrees away from the 2-block wall
              mob.yaw +=
                (Math.PI * 0.65 + Math.random() * 0.45) *
                (mob.strafeDir || 1);
              mob.timer = 2.0 + Math.random() * 1.5;
              moveX = Math.sin(mob.yaw) * spd * 0.75;
              moveZ = Math.cos(mob.yaw) * spd * 0.75;
            } else if (mob.sidestepTimer <= 0) {
              // Chasing mob steers sideways around the 2-block wall
              const leftX = Math.cos(mob.yaw);
              const leftZ = -Math.sin(mob.yaw);
              const leftObs = evaluateObstacleAhead(
                this.world,
                mob.basePos.x,
                mob.basePos.y,
                mob.basePos.z,
                leftX,
                leftZ,
                halfW,
                colH
              );
              mob.strafeDir = leftObs === 'clear' ? 1 : -1;
              mob.sidestepTimer = 0.85;
            }
          }
        }
      }

      // Part B3.1 — Shared Axis-Separated AABB Movement & Gravity / Water Buoyancy
      const aabbRes = moveEntityWithAABB(
        this.world,
        mob.basePos,
        mob,
        moveX * deltaTime,
        moveZ * deltaTime,
        deltaTime,
        halfW,
        colH
      );

      // Job 2: Water extinguishes burning mob; Lava burns and damages mob
      if (aabbRes?.inWater && mob.burning) {
        mob.burning = false;
        mob.bodyMat.color.copy(mob.baseColor);
      } else if (aabbRes?.inLava) {
        mob.burning = true;
        mob.hp -= 8.0 * deltaTime;
        mob.hurtTimer = 0.24;
        mob.bodyMat.color.setHex(0xef4444);
        if (mob.hp <= 0 && mob.deadTimer <= 0) {
          mob.deadTimer = 0.8;
          this.sfx?.playMobHurt?.(mob.spec.type);
        }
      }

      // Part 3: Chicken gentle flutter fall
      if (mob.spec.type === 'Chicken' && !mob.onGround && mob.velocityY < -0.4) {
        mob.velocityY = Math.max(mob.velocityY, -1.8);
      }

      // Part B3.3 — 2 Hz Stuck Detection & 4-Stage Recovery Ladder
      mob.stuckCheckTimer = (mob.stuckCheckTimer || 0) + deltaTime;
      if (mob.stuckCheckTimer >= 0.5) {
        const dtStuck = mob.stuckCheckTimer;
        mob.stuckCheckTimer = 0;

        if (isMoving) {
          const movedDist = Math.hypot(
            mob.basePos.x - (mob.lastStuckCheckPos?.x ?? mob.basePos.x),
            mob.basePos.z - (mob.lastStuckCheckPos?.z ?? mob.basePos.z)
          );
          if (movedDist < 0.08) {
            mob.stuckDuration = (mob.stuckDuration || 0) + dtStuck;

            if (mob.stuckDuration >= 0.5 && mob.stuckDuration < 1.2) {
              // Stage 1: Try a jump if grounded and obstacle ahead is 1 block
              const dirX = Math.sin(mob.yaw);
              const dirZ = Math.cos(mob.yaw);
              const obs = evaluateObstacleAhead(
                this.world,
                mob.basePos.x,
                mob.basePos.y,
                mob.basePos.z,
                dirX,
                dirZ,
                halfW,
                colH
              );
              if (obs === 'jump_1block' && mob.onGround && mob.jumpCooldown <= 0) {
                mob.velocityY = AUTO_JUMP_IMPULSE;
                mob.onGround = false;
                mob.jumpCooldown = AUTO_JUMP_COOLDOWN;
              } else if (obs === 'blocked_tall') {
                mob.yaw += Math.PI * 0.75 * (mob.strafeDir || 1);
              }
            } else if (mob.stuckDuration >= 1.2 && mob.stuckDuration < 2.5) {
              // Stage 2: Pick a new random direction (turn 90 to 180 degrees) and wander target
              const turnAngle =
                (Math.PI * 0.5 + Math.random() * Math.PI * 0.5) *
                (Math.random() < 0.5 ? 1 : -1);
              mob.yaw += turnAngle;
              mob.state = 'Wander';
              mob.timer = 2.2;
            } else if (mob.stuckDuration >= 2.5 && mob.stuckDuration < 4.0) {
              // Stage 3: Find a path around by trying left and right steps
              mob.strafeDir = -1 * (mob.strafeDir || 1);
              mob.sidestepTimer = 1.1;
            } else if (mob.stuckDuration >= 4.0) {
              // Stage 4: Final safety fallback — push out of solid blocks / free air space
              pushEntityOutOfBlocks(this.world, mob.basePos, halfW, colH);
              mob.yaw += Math.PI;
              mob.stuckDuration = 0;
            }
          } else {
            mob.stuckDuration = 0;
          }
        } else {
          // Even when idle, ensure mob is never buried inside a solid block
          pushEntityOutOfBlocks(this.world, mob.basePos, halfW, colH);
          mob.stuckDuration = 0;
        }

        mob.lastStuckCheckPos = { x: mob.basePos.x, z: mob.basePos.z };
      }

      if (isMoving) {
        mob.animPhase += deltaTime * 8.5;
      } else {
        mob.animPhase += deltaTime * 2.5;
      }

      // Sync visual mesh group position with physics basePos + floating/hopping bob
      let bobOffset = 0;
      if (
        mob.spec.type === 'GrimWraith' ||
        mob.spec.type === 'Hexcaster'
      ) {
        bobOffset = 0.18 + Math.sin(mob.animPhase * 1.4) * 0.16;
      } else if (mob.spec.type === 'Bird' && isMoving) {
        bobOffset = 0.15 + Math.abs(Math.sin(mob.animPhase * 1.5)) * 0.25;
      } else if (
        (mob.spec.type === 'Rabbit' || mob.spec.type === 'Monkey') &&
        isMoving &&
        mob.onGround
      ) {
        bobOffset = Math.abs(Math.sin(mob.animPhase * 1.4)) * 0.24;
      }
      mob.group.position.x = mob.basePos.x;
      mob.group.position.y = mob.basePos.y + bobOffset;
      mob.group.position.z = mob.basePos.z;
      mob.group.rotation.y = mob.yaw;

      // Procedural Limb / Telegraph Animation
      const swing = isMoving ? Math.sin(mob.animPhase) * 0.42 : 0;
      if (mob.legs && mob.legs.length >= 2) {
        for (let l = 0; l < mob.legs.length; l++) {
          mob.legs[l].rotation.y = l % 2 === 0 ? swing : -swing;
        }
      }

      if (mob.arms && mob.arms.length >= 2) {
        if (mob.spec.type === 'GrimWraith') {
          if (mob.attackPhase === 'WINDUP') {
            if (mob.activeAttackId === 'scythe_slash') {
              // Scythe raised overhead for slash
              const p = 1.6 + Math.sin(performance.now() * 0.02) * 0.15;
              mob.arms[0].rotation.y = p;
              mob.arms[0].rotation.x = -0.35;
              mob.arms[1].rotation.y = 0.5;
            } else if (mob.activeAttackId === 'summon_skeletons') {
              // Both arms raised high for summon
              mob.arms[0].rotation.y = 1.8;
              mob.arms[1].rotation.y = 1.8;
            } else if (mob.activeAttackId === 'soul_steal') {
              // Arms channeled forward toward player
              mob.arms[0].rotation.y = 0.95;
              mob.arms[1].rotation.y = 0.95;
            }
          } else if (mob.attackPhase === 'STRIKE') {
            if (mob.activeAttackId === 'scythe_slash') {
              // Scythe slashed downward
              mob.arms[0].rotation.y = -0.7;
              mob.arms[0].rotation.x = 0.5;
            }
          } else {
            const armSwing = Math.sin(mob.animPhase * 1.2) * 0.14;
            mob.arms[0].rotation.y = 0.35 + armSwing;
            mob.arms[1].rotation.y = 0.25 - armSwing;
            mob.arms[0].rotation.x = 0;
            mob.arms[1].rotation.x = 0;
          }
        } else if (mob.spec.type === 'SoulSkeleton') {
          if (mob.attackPhase === 'WINDUP') {
            // Right claw arm raised to strike
            mob.arms[1].rotation.y = 1.5;
            mob.arms[0].rotation.y = 0.2;
          } else if (mob.attackPhase === 'STRIKE') {
            // Claw swipe forward
            mob.arms[1].rotation.y = -0.6;
          } else {
            const armSwing = Math.sin(mob.animPhase * 1.2) * (isMoving ? 0.48 : 0.12);
            mob.arms[0].rotation.y = armSwing;
            mob.arms[1].rotation.y = -armSwing;
          }
        } else if (mob.attackPhase === 'WINDUP' || mob.attackPhase === 'CASTING') {
          // Telegraph: raise both arms high and pulse!
          const pulse = 1.15 + Math.sin(performance.now() * 0.025) * 0.25;
          mob.arms[0].rotation.y = pulse;
          mob.arms[1].rotation.y = pulse;
        } else if (mob.missAnimTimer > 0) {
          mob.missAnimTimer -= deltaTime;
          mob.arms[0].rotation.z = 0.85;
          mob.arms[1].rotation.z = -0.85;
        } else if (mob.spec.type === 'Chicken') {
          const isFalling = !mob.onGround && mob.velocityY < -0.4;
          const flapSpeed = isFalling ? 12.0 : 2.4;
          const flapAmp = isFalling ? 0.75 : isMoving ? 0.55 : 0.15;
          const flap = Math.sin(mob.animPhase * flapSpeed) * flapAmp;
          mob.arms[0].rotation.x = flap;
          mob.arms[1].rotation.x = -flap;
        } else if (mob.spec.type === 'Bird') {
          const flap = Math.sin(mob.animPhase * 2.4) * (isMoving ? 0.55 : 0.15);
          mob.arms[0].rotation.x = flap;
          mob.arms[1].rotation.x = -flap;
        } else {
          const armSwing =
            Math.sin(mob.animPhase * 1.2) * (isMoving ? 0.48 : 0.12);
          mob.arms[0].rotation.y = armSwing;
          mob.arms[1].rotation.y = -armSwing;
          mob.arms[0].rotation.z = 0;
          mob.arms[1].rotation.z = 0;
        }
      }

      if (mob.headGroup) {
        mob.headGroup.rotation.y = Math.sin(mob.animPhase * 0.55) * 0.08;
      }
      if (mob.tailPivot) {
        mob.tailPivot.rotation.z = Math.sin(mob.animPhase * 2.0) * 0.35;
      }
    }

    // 4. Update F4 Debug Visualizer if active
    this._updateDebugVisuals(playerTarget);
  }

  toggleDebugView(forceState) {
    this.debugViewEnabled = (forceState !== undefined) ? Boolean(forceState) : !this.debugViewEnabled;
    this.debugGroup.visible = this.debugViewEnabled;
    if (!this.debugViewEnabled) {
      this._clearDebugGroup();
    }
    return this.debugViewEnabled;
  }

  _clearDebugGroup() {
    while (this.debugGroup.children.length > 0) {
      const child = this.debugGroup.children.pop();
      child.geometry?.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }
  }

  /**
   * Task F1 & F3: F4 Debug Visualizer
   * Draws for every mob within 32 blocks:
   * - Wireframe AABB hitbox
   * - Ground ring showing meleeRange (or castRange)
   * - Colored line to player (GREEN = can attack, RED = cannot)
   */
  _updateDebugVisuals(playerTarget) {
    this._clearDebugGroup();
    if (!this.debugViewEnabled) return;

    for (const mob of this.mobs) {
      if (mob.hp <= 0) continue;
      const gap = gapDistance(mob, playerTarget);
      if (gap > 32) continue;

      const aabb = getEntityAABB(mob);
      const w = aabb.maxX - aabb.minX;
      const h = aabb.maxY - aabb.minY;
      const d = aabb.maxZ - aabb.minZ;
      const cx = (aabb.minX + aabb.maxX) * 0.5;
      const cy = (aabb.minY + aabb.maxY) * 0.5;
      const cz = (aabb.minZ + aabb.maxZ) * 0.5;

      // 1. Wireframe Hitbox Box
      const boxGeo = new THREE.BoxGeometry(w, h, d);
      const edges = new THREE.EdgesGeometry(boxGeo);
      boxGeo.dispose();
      const isWindup =
        mob.attackPhase === 'WINDUP' || mob.attackPhase === 'CASTING';
      const boxMat = new THREE.LineBasicMaterial({
        color: isWindup ? 0xfacc15 : 0x38bdf8,
      });
      const boxWire = new THREE.LineSegments(edges, boxMat);
      boxWire.position.set(cx, cy, cz);
      this.debugGroup.add(boxWire);

      // 2. Range Ring around mob's hitbox footprint
      const isRanged = mob.spec.attackType === 'ranged';
      const effRange = isRanged
        ? mob.spec.castRange ?? 14.0
        : (mob.spec.meleeRange ?? 1.5) + w * 0.5;
      const ringPts = [];
      const segs = 32;
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        ringPts.push(
          new THREE.Vector3(
            cx + Math.cos(a) * effRange,
            aabb.minY + 0.08,
            cz + Math.sin(a) * effRange
          )
        );
      }
      const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
      const ringMat = new THREE.LineBasicMaterial({
        color: isRanged ? 0xc084fc : 0xf97316,
      });
      this.debugGroup.add(new THREE.Line(ringGeo, ringMat));

      // 3. Green / Red Line-of-Sight & Range Line to Player
      const { from, to } = getCombatRayEndpoints(mob, playerTarget);
      const hasLOS = hasLineOfSight(this.world, from, to);
      const inRange = isRanged
        ? gap <= (mob.spec.castRange ?? 14.0)
        : inMeleeRange(
            mob,
            playerTarget,
            mob.spec.meleeRange ?? 1.5,
            mob.reachY
          );
      const canAttack = hasLOS && inRange;

      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(from.x, from.y, from.z),
        new THREE.Vector3(to.x, to.y, to.z),
      ]);
      const lineMat = new THREE.LineBasicMaterial({
        color: canAttack ? 0x22c55e : 0xef4444,
      });
      this.debugGroup.add(new THREE.Line(lineGeo, lineMat));

      // 4. Overhead Telemetry Sprite (State, Current Attack, Cooldowns, Distance, Line-of-Sight)
      if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = 440;
        canvas.height = 76;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.strokeStyle = mob.attackPhase === 'WINDUP' ? '#f59e0b' : '#38bdf8';
          ctx.lineWidth = 3;
          ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
          ctx.font = 'bold 18px monospace';
          ctx.fillStyle = '#f8fafc';
          ctx.textAlign = 'center';

          let cdsStr = '';
          if (mob.attackController?.cooldowns) {
            const cds = [];
            for (const [id, cd] of mob.attackController.cooldowns.entries()) {
              const shortId = id.replace(/_slash|_skeletons|_steal|_scratch/, '');
              cds.push(`${shortId}:${cd > 0 ? cd.toFixed(1) + 's' : 'RDY'}`);
            }
            cdsStr = cds.join(' ');
          } else if (mob.nightCombat?.cooldowns) {
            const cds = [];
            for (const [id, cd] of mob.nightCombat.cooldowns.entries()) {
              cds.push(`${id.slice(0, 6)}:${cd > 0 ? cd.toFixed(1) + 's' : 'RDY'}`);
            }
            cdsStr = cds.join(' ');
          }

          const panicStr = mob.panicTimer > 0 ? ` [Panic: ${mob.panicTimer.toFixed(1)}s]` : ` [${mob.state}]`;
          const labelLine1 = `${mob.spec.type}${panicStr} (${Math.max(0, Math.ceil(mob.hp))}/${mob.maxHp}HP) | Dist:${gap.toFixed(1)}m LOS:${hasLOS ? 'YES' : 'NO'}`;
          const currentAtk = mob.activeAttackName || (mob.attackPhase !== 'IDLE' ? mob.attackPhase : 'IDLE');
          const labelLine2 = `Atk:${currentAtk} | CD:[${cdsStr || 'None'}]`;
          ctx.fillText(labelLine1, canvas.width * 0.5, 28);
          ctx.fillStyle = mob.attackPhase === 'WINDUP' ? '#facc15' : '#38bdf8';
          ctx.fillText(labelLine2, canvas.width * 0.5, 56);

          const tex = new THREE.CanvasTexture(canvas);
          const spriteMat = new THREE.SpriteMaterial({
            map: tex,
            transparent: true,
            depthTest: false,
          });
          const sprite = new THREE.Sprite(spriteMat);
          sprite.position.set(cx, aabb.maxY + 0.75, cz);
          sprite.scale.set(3.2, 0.55, 1);
          this.debugGroup.add(sprite);
        }
      }
    }
  }

  /**
   * Section 1.6: /forceattack <mob> <attackId> — Force nearest mob of that type to attack now.
   */
  forceMobAttack(mobType, attackId, playerPosition, world, statusEffects = null, sfx = null) {
    const cleanType = String(mobType).toLowerCase().replace(/[\s_-]/g, '');
    let closestMob = null;
    let closestDist = Infinity;

    for (const mob of this.mobs) {
      if (mob.hp <= 0) continue;
      const type = (mob.spec?.type || mob.spec?.id || '').toLowerCase().replace(/[\s_-]/g, '');
      if (type.includes(cleanType) || cleanType.includes(type)) {
        const dx = mob.group.position.x - playerPosition.x;
        const dz = mob.group.position.z - playerPosition.z;
        const dist = Math.hypot(dx, dz);
        if (dist < closestDist) {
          closestDist = dist;
          closestMob = mob;
        }
      }
    }

    if (!closestMob) {
      return { success: false, reason: `No alive mob matching '${mobType}' found nearby` };
    }

    const playerTarget = {
      isPlayer: true,
      position: playerPosition,
      width: PLAYER_COMBAT_CONFIG.width,
      height: PLAYER_COMBAT_CONFIG.height,
      depth: PLAYER_COMBAT_CONFIG.depth,
    };

    if (closestMob.attackController?.forceAttack) {
      const ok = closestMob.attackController.forceAttack(
        closestMob,
        attackId,
        playerTarget,
        world,
        statusEffects,
        sfx
      );
      if (ok) {
        return { success: true, mobType: closestMob.spec.type, attackId };
      }
      return { success: false, reason: `Attack '${attackId}' not found on ${closestMob.spec.type}` };
    }

    if (closestMob.nightCombat) {
      const atk = closestMob.nightCombat.attacks.find(
        (a) => a.id.toLowerCase() === attackId.toLowerCase()
      );
      if (atk) {
        closestMob.nightCombat.cooldowns.set(atk.id, 0);
        closestMob.nightCombat.globalDelayTimer = 0;
        closestMob.nightCombat.startWindup(closestMob, atk, statusEffects, sfx);
        return { success: true, mobType: closestMob.spec.type, attackId };
      }
      return { success: false, reason: `Attack '${attackId}' not found on ${closestMob.spec.type}` };
    }

    return { success: false, reason: 'Mob does not support multi-attack controller' };
  }

  /**
   * Part 4: Spawns a cohesive flock of flying birds that takeoff together.
   */
  spawnFlock(centerX, centerZ, count = 4) {
    const spawnedList = this.spawnMobGroup('Bird', centerX, centerZ, count);
    for (const b of spawnedList) {
      if (b.isFlyingBird) {
        this.birdAI.setBirdState(b, 'TakeOff');
      }
    }
    return spawnedList;
  }

  /**
   * Part 4: /birdstate <state> — Forces nearest flying bird into a specified flight state.
   */
  forceNearestBirdState(state, playerPosition) {
    let nearest = null;
    let minDist = Infinity;
    for (const m of this.mobs) {
      if (m.isFlyingBird && m.hp > 0) {
        const d = Math.hypot(
          (m.basePos?.x || m.group.position.x) - playerPosition.x,
          (m.basePos?.z || m.group.position.z) - playerPosition.z
        );
        if (d < minDist) {
          minDist = d;
          nearest = m;
        }
      }
    }

    if (!nearest) {
      return { success: false, reason: 'No alive flying bird found nearby' };
    }

    const ok = this.birdAI.setBirdState(nearest, state);
    if (!ok) {
      return { success: false, reason: `Invalid bird state '${state}' (valid: Perch, TakeOff, Fly, Soar, Land, Flee, Migrate)` };
    }

    return { success: true, mob: nearest, state };
  }
}

export class BlockBreakParticles {
  constructor(scene) {
    this.scene = scene;
    this.bursts = [];
    this.boxGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  }

  spawnBurst(x, y, z, blockType) {
    const blockDef = BLOCK_BY_ID[blockType];
    const mat = new THREE.MeshStandardMaterial({
      color: blockDef ? blockDef.color : 0x58b947,
      roughness: 0.8,
    });

    const particles = [];
    for (let i = 0; i < 10; i++) {
      const mesh = new THREE.Mesh(this.boxGeo, mat);
      mesh.position.set(
        x + (Math.random() - 0.5) * 0.5,
        y + (Math.random() - 0.5) * 0.5,
        z + (Math.random() - 0.5) * 0.5
      );
      this.scene.add(mesh);
      particles.push({
        mesh,
        vx: (Math.random() - 0.5) * 3.5,
        vy: 1.5 + Math.random() * 2.5,
        vz: (Math.random() - 0.5) * 3.5,
      });
    }

    this.bursts.push({ mat, particles, age: 0, maxAge: 0.48 });
  }

  update(deltaTime) {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.age += deltaTime;
      if (b.age >= b.maxAge) {
        for (const p of b.particles) {
          this.scene.remove(p.mesh);
        }
        b.mat.dispose();
        this.bursts.splice(i, 1);
        continue;
      }

      const scale = 1 - b.age / b.maxAge;
      for (const p of b.particles) {
        p.vy -= 9.8 * deltaTime;
        p.mesh.position.x += p.vx * deltaTime;
        p.mesh.position.y += p.vy * deltaTime;
        p.mesh.position.z += p.vz * deltaTime;
        p.mesh.scale.setScalar(scale);
      }
    }
  }
}
