import * as THREE from 'three';
import { BLOCK_BY_ID } from './blocks.js';
import {
  createBlenderMobInstance,
  ALL_14_BLENDER_MOB_TYPES,
} from './BlenderMobs.js';

// ============================================================================
// Phases U2.3, U3.6, U5 & Complete 14-Mob Blender Suite (src/polish.js)
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
    this.timeOfDay = 0.23;
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

  isNight() {
    return this.timeOfDay >= 0.55 && this.timeOfDay <= 0.94;
  }

  getLabel() {
    const t = this.timeOfDay;
    const w = this.weather !== 'clear' ? ` (${this.weather})` : '';
    if (t >= 0.1 && t < 0.4) return `Day${w}`;
    if (t >= 0.4 && t < 0.6) return `Dusk${w}`;
    if (t >= 0.6 && t < 0.9) return `Night${w}`;
    return `Dawn${w}`;
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

    if (sunElevation > 0.2) {
      const f = Math.min(1, (sunElevation - 0.2) / 0.8);
      this.currentSky.copy(this.sunsetSky).lerp(this.noonSky, f);
      this.lights.sunLight.intensity = 0.7 + 0.75 * f;
      this.lights.ambientLight.intensity = 0.36 + 0.14 * f;
      this.lights.ambientLight.color.setHex(0xffffff);
    } else if (sunElevation > -0.2) {
      const f = (sunElevation + 0.2) / 0.4;
      this.currentSky.copy(this.nightSky).lerp(this.sunsetSky, f);
      this.lights.sunLight.intensity = 0.28 + 0.42 * f;
      this.lights.ambientLight.intensity = 0.28 + 0.1 * f;
      this.lights.ambientLight.color.setHex(0xfed7aa);
    } else {
      this.currentSky.copy(this.nightSky);
      this.lights.sunLight.intensity = 0.26;
      this.lights.ambientLight.intensity = 0.28;
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

export const MOB_SPECS = [
  { type: 'Pig', label: 'Sculpted Pig 🐷', hostile: false, maxHp: 12, speed: 1.35, drop: 'dirt' },
  { type: 'Dog', label: 'German Shepherd Dog 🐕', hostile: false, maxHp: 18, speed: 1.75, drop: 'wood' },
  { type: 'Cow', label: 'Spotted Dairy Cow 🐄', hostile: false, maxHp: 14, speed: 1.15, drop: 'dirt' },
  { type: 'Sheep', label: 'Fluffy Wool Sheep 🐑', hostile: false, maxHp: 12, speed: 1.25, drop: 'snow' },
  { type: 'Rabbit', label: 'White Cotton-Tail Rabbit 🐇', hostile: false, maxHp: 8, speed: 1.85, drop: 'grass' },
  { type: 'Bird', label: 'Crimson Raptor Falcon 🦅', hostile: false, maxHp: 10, speed: 1.9, drop: 'sand' },
  { type: 'Cat', label: 'Ginger & Cream Cat 🐈', hostile: false, maxHp: 10, speed: 1.65, drop: 'sand' },
  { type: 'Chicken', label: 'Farm Chicken 🐔', hostile: false, maxHp: 6, speed: 1.5, drop: 'sand' },
  { type: 'Wolf', label: 'Red-Eyed Dire Wolf 🐺', hostile: true, maxHp: 18, speed: 2.05, damage: 3, drop: 'coal_ore' },
  { type: 'Monkey', label: 'Feral Mandrill Rage Ape 🦍', hostile: true, maxHp: 22, speed: 1.95, damage: 3, drop: 'wood' },
  { type: 'ShadowStalker', label: 'Shadow Stalker Wendigo 💀', hostile: true, maxHp: 26, speed: 2.1, damage: 4, drop: 'obsidian' },
  { type: 'BloodCrawler', label: 'Abyssal Blood Crawler 🕷️', hostile: true, maxHp: 20, speed: 2.35, damage: 3, drop: 'redstone_ore' },
  { type: 'GrimWraith', label: 'Grim Wraith Soul Reaper 👻', hostile: true, maxHp: 24, speed: 2.0, damage: 4, drop: 'gem_ore' },
  { type: 'FleshGhoul', label: 'Mutant Flesh Ghoul 🧟', hostile: true, maxHp: 24, speed: 1.85, damage: 4, drop: 'mossy_cobble' },
];

export class PassiveMobManager {
  constructor(scene, world, count = 14) {
    this.scene = scene;
    this.world = world;
    this.mobs = [];
    this.cycleIndex = 0;

    // Spawn all 14 Blender Mobs around the player at startup:
    // - Daytime & Companion animals (0..7) in a welcoming semicircle right in front of spawn (8, 5..8)
    // - Feral & Night Horror mobs (8..13) on the outer perimeter ring (radius 12..15)
    const initialSpawns = [
      ['Pig', 8.0, 6.8],
      ['Dog', 6.2, 7.2],
      ['Cow', 9.8, 7.2],
      ['Sheep', 4.6, 8.2],
      ['Rabbit', 7.1, 5.6],
      ['Bird', 8.9, 5.6],
      ['Cat', 11.4, 8.2],
      ['Chicken', 5.6, 6.0],
      ['Wolf', 10.6, 5.8],
      ['Monkey', 3.4, 6.4],
      ['ShadowStalker', 2.0, 2.0],
      ['BloodCrawler', 14.0, 2.0],
      ['GrimWraith', 8.0, -1.5],
      ['FleshGhoul', 15.0, 5.0],
    ];

    const total = Math.max(count, initialSpawns.length);
    for (let i = 0; i < total; i++) {
      if (i < initialSpawns.length) {
        const [mType, mx, mz] = initialSpawns[i];
        const spec = MOB_SPECS.find((s) => s.type === mType) || MOB_SPECS[0];
        this.mobs.push(this._createMob(spec, i, mx, mz));
      } else {
        const spec = MOB_SPECS[i % MOB_SPECS.length];
        this.mobs.push(this._createMob(spec, i));
      }
    }
  }

  _resolveSpec(typeOrSpec) {
    if (typeOrSpec && typeof typeOrSpec === 'object' && typeOrSpec.type) {
      return typeOrSpec;
    }
    const q = String(typeOrSpec || 'Pig').toLowerCase().replace(/[\s_-]/g, '');
    const aliasMap = {
      snorter: 'Pig',
      blenderpig: 'Pig',
      moobeast: 'Cow',
      woolback: 'Sheep',
      cluck: 'Chicken',
      shambler: 'ShadowStalker',
      wendigo: 'ShadowStalker',
      crawler: 'BloodCrawler',
      spider: 'BloodCrawler',
      wraith: 'GrimWraith',
      reaper: 'GrimWraith',
      bloater: 'FleshGhoul',
      ghoul: 'FleshGhoul',
    };
    const canonical = aliasMap[q] || q;
    return (
      MOB_SPECS.find(
        (s) => s.type.toLowerCase().replace(/[\s_-]/g, '') === canonical
      ) || MOB_SPECS[0]
    );
  }

  spawnMob(x, z, typeOrSpec = null) {
    const spec = typeOrSpec
      ? this._resolveSpec(typeOrSpec)
      : MOB_SPECS[this.cycleIndex++ % MOB_SPECS.length];
    const mob = this._createMob(spec, this.mobs.length, x, z);
    this.mobs.push(mob);
    return mob.spec;
  }

  spawnMobAt(typeOrSpec, x, z) {
    const spec = this.spawnMob(x, z, typeOrSpec);
    return spec.type;
  }

  _createMob(spec, index, customX = null, customZ = null) {
    const angle = (index / ALL_14_BLENDER_MOB_TYPES.length) * Math.PI * 2;
    const x = customX !== null ? customX : 8 + Math.cos(angle) * 11;
    const z = customZ !== null ? customZ : 8 + Math.sin(angle) * 11;
    const y = this.world.getSurfaceHeight(x, z) + 0.5;

    const rig = createBlenderMobInstance(spec.type);
    rig.group.position.set(x, y, z);
    // Face toward the player spawn initially
    const initYaw = Math.atan2(-(8 - x), -(11 - z));
    rig.group.rotation.y = initYaw;
    this.scene.add(rig.group);

    return {
      spec,
      group: rig.group,
      bodyMat: rig.bodyMat,
      baseColor: rig.baseColor,
      legs: rig.legs || [],
      arms: rig.arms || [],
      headGroup: rig.headGroup,
      tailPivot: rig.tailPivot,
      hp: spec.maxHp,
      maxHp: spec.maxHp,
      state: 'Wander',
      yaw: initYaw,
      timer: 1.5 + Math.random() * 2.5,
      hurtTimer: 0,
      attackCooldown: 0,
      animPhase: Math.random() * 10,
      deadTimer: 0,
    };
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
      if (perpSq <= 0.85 * 0.85) {
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

    if (!closestMob.spec.hostile) {
      closestMob.state = 'Flee';
      closestMob.yaw = Math.atan2(-kb.x, -kb.z);
      closestMob.timer = 4.0;
    }

    if (closestMob.hp <= 0) {
      closestMob.deadTimer = 0.6;
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

  update(deltaTime, playerPosition, isNight = false, onPlayerDamaged = null) {
    for (const mob of this.mobs) {
      if (mob.hp <= 0) {
        mob.deadTimer -= deltaTime;
        mob.group.rotation.z = Math.min(
          Math.PI / 2,
          mob.group.rotation.z + deltaTime * 4
        );
        if (mob.deadTimer <= 0) {
          mob.hp = mob.maxHp;
          mob.group.rotation.z = 0;
          mob.bodyMat.color.copy(mob.baseColor);
          const a = Math.random() * Math.PI * 2;
          mob.group.position.x = playerPosition.x + Math.cos(a) * 14;
          mob.group.position.z = playerPosition.z + Math.sin(a) * 14;
        }
        continue;
      }

      if (mob.hurtTimer > 0) {
        mob.hurtTimer -= deltaTime;
        if (mob.hurtTimer <= 0) {
          mob.bodyMat.color.copy(mob.baseColor);
        }
      }

      if (mob.attackCooldown > 0) {
        mob.attackCooldown -= deltaTime;
      }

      const dx = playerPosition.x - mob.group.position.x;
      const dz = playerPosition.z - mob.group.position.z;
      const distSq = dx * dx + dz * dz;

      if (mob.spec.hostile && (isNight || distSq < 8 * 8) && distSq < 18 * 18) {
        mob.state = 'Chase';
        // Our Blender->Three basis places +Z as forward, so Math.atan2(dx, dz) faces player
        mob.yaw = Math.atan2(dx, dz);

        if (distSq < 1.85 * 1.85 && mob.attackCooldown <= 0) {
          mob.attackCooldown = 1.35;
          if (typeof onPlayerDamaged === 'function') {
            onPlayerDamaged(mob.spec.damage || 2, mob.spec.type);
          }
        }
      } else {
        mob.timer -= deltaTime;
        if (mob.timer <= 0) {
          mob.state = Math.random() > 0.25 ? 'Wander' : 'Idle';
          mob.yaw += (Math.random() - 0.5) * 2.2;
          mob.timer = 1.8 + Math.random() * 2.5;
        }
      }

      const speedMult =
        mob.state === 'Flee' ? 2.1 : mob.state === 'Chase' ? 1.25 : 1.0;
      const isMoving = mob.state !== 'Idle';

      if (isMoving) {
        mob.group.position.x +=
          Math.sin(mob.yaw) * mob.spec.speed * speedMult * deltaTime;
        mob.group.position.z +=
          Math.cos(mob.yaw) * mob.spec.speed * speedMult * deltaTime;
        mob.animPhase += deltaTime * 8 * speedMult;
      } else {
        mob.animPhase += deltaTime * 2.5;
      }

      if (distSq > 36 * 36) {
        const a = Math.random() * Math.PI * 2;
        mob.group.position.x = playerPosition.x + Math.cos(a) * 14;
        mob.group.position.z = playerPosition.z + Math.sin(a) * 14;
      }

      const groundY = this.world.getSurfaceHeight(
        mob.group.position.x,
        mob.group.position.z
      );
      let verticalOffset = 0.5;
      if (mob.spec.type === 'GrimWraith') {
        verticalOffset = 0.72 + Math.sin(mob.animPhase * 1.2) * 0.18;
      } else if (mob.spec.type === 'Bird' && isMoving) {
        verticalOffset = 0.65 + Math.abs(Math.sin(mob.animPhase * 1.5)) * 0.25;
      } else if (mob.spec.type === 'Rabbit' && isMoving) {
        verticalOffset = 0.5 + Math.abs(Math.sin(mob.animPhase * 1.2)) * 0.22;
      }
      mob.group.position.y = groundY + verticalOffset;
      mob.group.rotation.y = mob.yaw;

      // Animate legs (in Blender local coordinates, pitching forward/back is rotation.y)
      const swing = isMoving ? Math.sin(mob.animPhase) * 0.42 : 0;
      if (mob.legs && mob.legs.length >= 4) {
        mob.legs[0].rotation.y = swing;
        mob.legs[1].rotation.y = -swing;
        mob.legs[2].rotation.y = -swing;
        mob.legs[3].rotation.y = swing;
      }

      // Animate wings (Bird/Chicken flap around X) or arms/scythe (Monkey/Wendigo/Wraith/Ghoul slash around Y)
      if (mob.arms && mob.arms.length >= 2) {
        if (mob.spec.type === 'Bird' || mob.spec.type === 'Chicken') {
          const flap = Math.sin(mob.animPhase * 2.4) * (isMoving ? 0.55 : 0.15);
          mob.arms[0].rotation.x = flap;
          mob.arms[1].rotation.x = -flap;
        } else {
          const armSwing = Math.sin(mob.animPhase * 1.2) * (isMoving ? 0.48 : 0.12);
          mob.arms[0].rotation.y = armSwing;
          mob.arms[1].rotation.y = -armSwing;
        }
      }

      // Animate head nod & tail wag
      if (mob.headGroup) {
        mob.headGroup.rotation.y = Math.sin(mob.animPhase * 0.55) * 0.08;
      }
      if (mob.tailPivot) {
        mob.tailPivot.rotation.z = Math.sin(mob.animPhase * 2.0) * 0.35;
      }
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
