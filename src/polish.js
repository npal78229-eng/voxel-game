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
    this.timeOfDay = 0.23; // Start at clear morning/noon (daytime)
    this.dayDurationSeconds = 240;
    this.weather = 'clear';

    this.noonSky = new THREE.Color(0x7cc8f8);
    this.sunsetSky = new THREE.Color(0xf97316);
    this.nightSky = new THREE.Color(0x0b1528);
    this.rainSky = new THREE.Color(0x475569);
    this.currentSky = new THREE.Color();

    this._createCelestialBodies();
    this._createStarField();
    this._createClouds();
    this._createWeatherParticles();
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

  setWeather(mode) {
    this.weather = ['clear', 'rain', 'snow'].includes(mode) ? mode : 'clear';
    this.weatherPoints.visible = this.weather !== 'clear';
    if (this.weather === 'snow') {
      this.weatherMat.color.setHex(0xffffff);
      this.weatherMat.size = 0.45;
    } else {
      this.weatherMat.color.setHex(0x60a5fa);
      this.weatherMat.size = 0.28;
    }
  }

  advanceTime(step = 0.08) {
    this.timeOfDay = (this.timeOfDay + step) % 1.0;
  }

  /**
   * Task F2: Uses SPAWN_CONFIG.NIGHT_START (0.55) to NIGHT_END (0.95)
   */
  isNight() {
    return isNightTime(this.timeOfDay);
  }

  getDebugReadout() {
    return formatTimeDebugReadout(this.timeOfDay);
  }

  getLabel() {
    const t = this.timeOfDay;
    const w = this.weather !== 'clear' ? ` (${this.weather})` : '';
    if (this.isNight()) return `Night${w} [${Math.round(t * 100)}%]`;
    if (t >= 0.45 && t < SPAWN_CONFIG.NIGHT_START) return `Dusk${w} [${Math.round(t * 100)}%]`;
    if (t > SPAWN_CONFIG.NIGHT_END || t < 0.1) return `Dawn${w} [${Math.round(t * 100)}%]`;
    return `Day${w} [${Math.round(t * 100)}%]`;
  }

  update(deltaTime, playerPosition) {
    this.timeOfDay =
      (this.timeOfDay + deltaTime / this.dayDurationSeconds) % 1.0;

    const angle = this.timeOfDay * Math.PI * 2;
    const sunElevation = Math.sin(angle);
    const sunHorizontal = Math.cos(angle);

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

    for (const cloud of this.cloudGroup.children) {
      cloud.position.x += deltaTime * 1.1;
      if (cloud.position.x - playerPosition.x > 65) cloud.position.x -= 130;
      if (cloud.position.x - playerPosition.x < -65) cloud.position.x += 130;
      if (cloud.position.z - playerPosition.z > 65) cloud.position.z -= 130;
      if (cloud.position.z - playerPosition.z < -65) cloud.position.z += 130;
    }

    if (this.weatherPoints.visible) {
      this.weatherPoints.position.set(
        playerPosition.x,
        playerPosition.y - 6,
        playerPosition.z
      );
      const posAttr = this.weatherPoints.geometry.attributes.position;
      const fallSpeed = this.weather === 'snow' ? 3.8 : 14.5;
      for (let i = 0; i < posAttr.count; i++) {
        let y = posAttr.getY(i) - fallSpeed * deltaTime;
        if (y < 0) y = 24;
        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;
    }

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

    this.scene.background.copy(this.currentSky);
    if (this.scene.fog) {
      this.scene.fog.color.copy(this.currentSky);
    }
  }
}

export const MOB_SPECS = Object.values(MOB_CONFIGS);

export class PassiveMobManager {
  constructor(scene, world, sfx = null, particles = null) {
    this.scene = scene;
    this.world = world;
    this.sfx = sfx;
    this.particles = particles;
    this.mobs = [];
    this.cycleIndex = 0;

    // Shared projectile system for Hexcaster & Bonewalker (Task F3)
    this.projectileManager = new ProjectileManager(scene, world, particles);

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

    // Task F1 / F3 Debug View (F4 Toggle)
    this.debugViewEnabled = false;
    this.debugGroup = new THREE.Group();
    this.scene.add(this.debugGroup);

    // Task F2 & User Request: Animals spawn in cohesive herds/flocks of 3 or 4!
    // NEVER spawn night_monsters during daytime or at world generation.
    const initialAnimalHerds = [
      { type: 'Pig', x: 11.0, z: 4.5, count: 4 },
      { type: 'Cow', x: -3.5, z: 5.5, count: 3 },
      { type: 'Sheep', x: 17.5, z: 12.0, count: 4 },
      { type: 'Chicken', x: 3.5, z: 16.5, count: 3 },
      { type: 'Rabbit', x: 14.0, z: 18.0, count: 3 },
      { type: 'Dog', x: 6.8, z: 7.4, count: 3 },
      // Wild predators also spawn in packs of 3
      { type: 'Wolf', x: 24.0, z: 21.0, count: 3 },
      { type: 'Monkey', x: -12.0, z: 22.0, count: 3 },
    ];

    for (const herd of initialAnimalHerds) {
      this.spawnMobGroup(herd.type, herd.x, herd.z, herd.count);
    }
    this._recordSpawnLog(
      'INIT',
      `Spawned ${this.mobs.length} animals in herds of 3-4 (0 night_monsters at daytime init)`
    );
  }

  /**
   * Spawns a herd/pack of 3 to 4 mobs of the same species clustered around (centerX, centerZ).
   */
  spawnMobGroup(typeOrSpec, centerX, centerZ, count = null) {
    const cfg = this._resolveSpec(typeOrSpec);
    const [minG, maxG] = SPAWN_CONFIG.ANIMAL_GROUP_SIZE || [3, 4];
    const groupSize =
      count !== null
        ? count
        : minG + Math.floor(Math.random() * (maxG - minG + 1));

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
    const x = customX !== null ? customX : 8 + Math.cos(angle) * 14;
    const z = customZ !== null ? customZ : 11 + Math.sin(angle) * 14;
    const y = this.world.getSurfaceHeight(x, z) + 0.5;

    const rig = createBlenderMobInstance(typeName);
    rig.group.position.set(x, y, z);
    const initYaw = Math.atan2(-(8 - x), -(11 - z));
    rig.group.rotation.y = initYaw;
    this.scene.add(rig.group);

    // Instantiate data-driven Attack Controller (Task F1 & Task F3)
    const attackController =
      cfg.attackType === 'ranged'
        ? new RangedMagicAttack(cfg)
        : new MeleeAttack(cfg);

    return {
      id: `${typeName}_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
      spec: { ...cfg, type: typeName },
      hitbox: cfg.hitbox,
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
      phaseTimer: 0,
      attackCooldown: 0,
      lastAttackOutcome: '',
      missAnimTimer: 0,
      provoked: false,
      aggroMemoryTimer: 0,
      retreatTimer: 0,
      burning: false,
      yaw: initYaw,
      timer: 1.5 + Math.random() * 2.5,
      hurtTimer: 0,
      animPhase: Math.random() * 10,
      deadTimer: 0,
      attackController,
    };
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

    const kb = closestMob.group.position
      .clone()
      .sub(origin)
      .setY(0)
      .normalize();
    closestMob.group.position.addScaledVector(kb, 0.85);

    if (closestMob.spec.behaviorClass === 'passive') {
      closestMob.state = 'Flee';
      closestMob.yaw = Math.atan2(-kb.x, -kb.z);
      closestMob.timer = 4.0;
    } else if (closestMob.spec.behaviorClass === 'neutral') {
      closestMob.provoked = true;
      closestMob.aggroMemoryTimer = 12.0;
      closestMob.state = 'Chase';
    } else {
      closestMob.aggroMemoryTimer = 12.0;
    }

    if (closestMob.hp <= 0) {
      closestMob.attackController?.cancel(closestMob);
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

    // 2. Attempt Passive Animal Herd Spawns (Groups of 3 or 4 on grass/surface)
    if (counts.passive < SPAWN_CONFIG.CAPS.passive) {
      const dist = 16 + Math.random() * 20;
      const angle = Math.random() * Math.PI * 2;
      const sx = playerPosition.x + Math.cos(angle) * dist;
      const sz = playerPosition.z + Math.sin(angle) * dist;
      const pool = SPAWN_CONFIG.PASSIVE_POOL;
      const chosenAnimal = pool[Math.floor(Math.random() * pool.length)];
      const groupSize = 3 + Math.floor(Math.random() * 2); // 3 or 4
      this.spawnMobGroup(chosenAnimal, sx, sz, groupSize);
      this._recordSpawnLog(
        'SUCCESS',
        `Spawned herd of ${groupSize}x ${chosenAnimal} (passive) at ${dist.toFixed(1)}m`
      );
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
    lookDirection = null
  ) {
    const playerTarget = {
      isPlayer: true,
      position: playerPosition,
      width: PLAYER_COMBAT_CONFIG.width,
      height: PLAYER_COMBAT_CONFIG.height,
      depth: PLAYER_COMBAT_CONFIG.depth,
      vx: playerVelocity.x || 0,
      vz: playerVelocity.z || 0,
    };

    // 1. Update Projectiles (Hexcaster magic bolts & Bonewalker arrows) with SWEPT collision
    this.projectileManager.update(deltaTime, playerTarget, (hitInfo) => {
      if (typeof onPlayerDamaged === 'function') {
        onPlayerDamaged(hitInfo.damage, `${hitInfo.source} (${hitInfo.style})`, {
          applySlowEffect: hitInfo.applySlowEffect,
        });
      }
    });

    // 2. Periodic Spawn Timer (every 2.0s, never every frame)
    this.spawnTimer += deltaTime;
    if (this.spawnTimer >= SPAWN_CONFIG.SPAWN_INTERVAL_SECONDS) {
      this.spawnTimer = 0;
      this._runSpawnCycle(playerPosition, lookDirection, isNight);
    }

    // 3. Sunrise / Daytime Despawn & Sunlight Burning for night_monsters (Task F2)
    if (!isNight) {
      this.dawnDespawnAccum += deltaTime * SPAWN_CONFIG.DAWN_DESPAWN_RATE_PER_SEC;
    } else {
      this.dawnDespawnAccum = 0;
    }

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];

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

      // Hard despawn beyond 96 blocks
      if (horizDist > SPAWN_CONFIG.HARD_DESPAWN_DIST) {
        this._removeMobAtIndex(i);
        continue;
      }

      // Sunrise handling for night_monster
      const isAttackingNow =
        mob.attackPhase && mob.attackPhase !== 'IDLE';
      if (mob.spec.behaviorClass === 'night_monster' && !isNight && !isAttackingNow) {
        if (horizDist > SPAWN_CONFIG.IMMEDIATE_DESPAWN_DIST) {
          this._removeMobAtIndex(i);
          continue;
        }
        if (mob.spec.burnsInSunlight) {
          mob.burning = true;
          mob.hp -= SPAWN_CONFIG.SUNLIGHT_BURN_DPS * deltaTime;
          mob.bodyMat.color.setHex(
            Math.floor( performance.now() / 120 ) % 2 === 0 ? 0xf97316 : 0xef4444
          );
          if (mob.hp <= 0) {
            mob.deadTimer = 0.35;
            continue;
          }
        } else if (
          horizDist > SPAWN_CONFIG.SOFT_DESPAWN_DIST &&
          this.dawnDespawnAccum >= 1.0
        ) {
          this.dawnDespawnAccum -= 1.0;
          this._removeMobAtIndex(i);
          continue;
        }
      } else {
        mob.burning = false;
      }

      if (mob.hurtTimer > 0) {
        mob.hurtTimer -= deltaTime;
        if (mob.hurtTimer <= 0 && !mob.burning) {
          mob.bodyMat.color.copy(mob.baseColor);
        }
      }

      // Determine whether this mob is hostile / aggroed toward the player (Task F2)
      const bClass = mob.spec.behaviorClass || 'passive';
      const senseRange = mob.spec.senseRange ?? 14;
      const { from: eyePos, to: chestPos } = getCombatRayEndpoints(
        mob,
        playerTarget
      );
      const canSeePlayer =
        horizDist <= senseRange && hasLineOfSight(this.world, eyePos, chestPos);

      let wantsToFight = false;
      if (bClass === 'wild_predator') {
        // Attacks on sight ANY time of day (day & night), loses interest after 10s without LOS
        if (canSeePlayer || horizDist < 5.0) {
          mob.aggroMemoryTimer = mob.spec.loseInterestSeconds ?? 10.0;
        } else if (mob.aggroMemoryTimer > 0) {
          mob.aggroMemoryTimer -= deltaTime;
        }
        wantsToFight = mob.aggroMemoryTimer > 0;
      } else if (bClass === 'night_monster') {
        wantsToFight = horizDist <= senseRange;
      } else if (bClass === 'neutral') {
        if (mob.provoked && mob.aggroMemoryTimer > 0) {
          mob.aggroMemoryTimer -= deltaTime;
          wantsToFight = true;
        } else {
          mob.provoked = false;
        }
      }

      // Treeswing Ape hit-and-retreat timer
      if (mob.retreatTimer > 0) {
        mob.retreatTimer -= deltaTime;
      }

      const gap = gapDistance(mob, playerTarget);

      if (wantsToFight) {
        mob.yaw = Math.atan2(dx, dz);

        if (mob.spec.attackType === 'ranged') {
          // Task F3: Ranged Magic / Bow Monster (Hexcaster / GrimWraith / Bonewalker)
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

          // Kiting & Strafing movement
          const minComfort = mob.spec.minComfortDist ?? 6.0;
          const castRange = mob.spec.castRange ?? 14.0;
          if (gap < minComfort) {
            mob.state = 'KiteBack';
          } else if (mob.attackPhase === 'CASTING') {
            mob.state = 'StrafeCast';
          } else if (gap > castRange - 1.2) {
            mob.state = 'Chase';
          } else {
            mob.state = 'HoldRange';
          }
        } else {
          // Task F1 & F3: Close-Only Melee Monster / Wild Predator
          mob.attackController.update(
            deltaTime,
            mob,
            playerTarget,
            this.world,
            ({ damage, knockback }) => {
              // STRIKE hit verified against current inMeleeRange & hasLineOfSight!
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
              // STRIKE missed because player stepped out of range or behind cover during windup!
              this.sfx?.playWhooshMiss();
            }
          );

          if (mob.retreatTimer > 0) {
            mob.state = 'Retreat';
          } else if (mob.attackPhase === 'WINDUP') {
            // Stop walking during WINDUP telegraph!
            mob.state = 'WindupStop';
          } else if (
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
        mob.timer -= deltaTime;
        if (mob.timer <= 0) {
          mob.state = Math.random() > 0.22 ? 'Wander' : 'Idle';
          // Herd cohesion: if part of a 3-4 animal group and drifted > 6.5m from anchor, steer back toward herd!
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

      // Movement execution with voxel wall collision check
      let moveX = 0;
      let moveZ = 0;
      const spd = mob.spec.speed;

      if (mob.state === 'Chase') {
        moveX = Math.sin(mob.yaw) * spd * 1.2;
        moveZ = Math.cos(mob.yaw) * spd * 1.2;
      } else if (mob.state === 'Flee' || mob.state === 'Retreat') {
        moveX = -Math.sin(mob.yaw) * spd * 1.85;
        moveZ = -Math.cos(mob.yaw) * spd * 1.85;
      } else if (mob.state === 'KiteBack') {
        moveX = -Math.sin(mob.yaw) * spd * 1.1;
        moveZ = -Math.cos(mob.yaw) * spd * 1.1;
      } else if (mob.state === 'StrafeCast') {
        const perpYaw = mob.yaw + (mob.strafeDir || 1) * (Math.PI * 0.5);
        moveX = Math.sin(perpYaw) * spd * 0.75;
        moveZ = Math.cos(perpYaw) * spd * 0.75;
      } else if (mob.state === 'Wander') {
        moveX = Math.sin(mob.yaw) * spd * 0.75;
        moveZ = Math.cos(mob.yaw) * spd * 0.75;
      }

      const isMoving = Math.abs(moveX) > 0.01 || Math.abs(moveZ) > 0.01;
      if (isMoving) {
        const nextX = mob.group.position.x + moveX * deltaTime;
        const nextZ = mob.group.position.z + moveZ * deltaTime;
        // Prevent walking straight inside a wall block at torso level
        const blockAtNext = this.world.getBlock(
          Math.floor(nextX + 0.5),
          Math.floor(mob.group.position.y + 0.6),
          Math.floor(nextZ + 0.5)
        );
        if (!blockAtNext || blockAtNext === 'water') {
          mob.group.position.x = nextX;
          mob.group.position.z = nextZ;
        }
        mob.animPhase += deltaTime * 8.5;
      } else {
        mob.animPhase += deltaTime * 2.5;
      }

      const groundY = this.world.getSurfaceHeight(
        mob.group.position.x,
        mob.group.position.z
      );
      let verticalOffset = 0.5;
      if (
        mob.spec.type === 'GrimWraith' ||
        mob.spec.type === 'Hexcaster'
      ) {
        verticalOffset = 0.68 + Math.sin(mob.animPhase * 1.4) * 0.16;
      } else if (mob.spec.type === 'Bird' && isMoving) {
        verticalOffset = 0.65 + Math.abs(Math.sin(mob.animPhase * 1.5)) * 0.25;
      } else if (
        (mob.spec.type === 'Rabbit' || mob.spec.type === 'Monkey') &&
        isMoving
      ) {
        verticalOffset = 0.5 + Math.abs(Math.sin(mob.animPhase * 1.4)) * 0.24;
      }
      mob.group.position.y = groundY + verticalOffset;
      mob.group.rotation.y = mob.yaw;

      // Procedural Limb / Telegraph Animation
      const swing = isMoving ? Math.sin(mob.animPhase) * 0.42 : 0;
      if (mob.legs && mob.legs.length >= 2) {
        for (let l = 0; l < mob.legs.length; l++) {
          mob.legs[l].rotation.y = l % 2 === 0 ? swing : -swing;
        }
      }

      if (mob.arms && mob.arms.length >= 2) {
        if (mob.attackPhase === 'WINDUP' || mob.attackPhase === 'CASTING') {
          // Telegraph: raise both arms high and pulse!
          const pulse = 1.15 + Math.sin(performance.now() * 0.025) * 0.25;
          mob.arms[0].rotation.y = pulse;
          mob.arms[1].rotation.y = pulse;
        } else if (mob.missAnimTimer > 0) {
          mob.missAnimTimer -= deltaTime;
          mob.arms[0].rotation.z = 0.85;
          mob.arms[1].rotation.z = -0.85;
        } else if (mob.spec.type === 'Bird' || mob.spec.type === 'Chicken') {
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

  toggleDebugView() {
    this.debugViewEnabled = !this.debugViewEnabled;
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
    }
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
