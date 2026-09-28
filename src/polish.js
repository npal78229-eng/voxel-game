import * as THREE from 'three';
import { BLOCK_BY_ID } from './blocks.js';

// ============================================================================
// Phases U2.3, U3.6, U5 & U6 — Sky System (Sun/Moon/Stars/Clouds/Weather),
//                              Web Audio SFX, Original Mob Roster & Combat AI
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

/**
 * Phase U2.3 & U3.6 — Sky Dome, Visible Sun & Moon Discs, Night Starfield,
 * Drifting 3D Clouds & Weather System ('clear' | 'rain' | 'snow').
 */
export class DayNightCycle {
  constructor(scene, lights) {
    this.scene = scene;
    this.lights = lights;
    this.timeOfDay = 0.23; // 0.25 = Noon
    this.dayDurationSeconds = 240;
    this.weather = 'clear'; // 'clear' | 'rain' | 'snow'

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

    // Visible Sun Disc
    const sunGeo = new THREE.BoxGeometry(7.5, 7.5, 1.5);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    this.sunDisc = new THREE.Mesh(sunGeo, sunMat);
    this.celestialGroup.add(this.sunDisc);

    // Visible Moon Disc
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

    // Phase U2.4 — Texel-snapped player follow for zero shadow shimmering
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

    // Update visible Sun & Moon discs
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

    // Starfield fade-in at night
    this.stars.position.set(playerPosition.x, 0, playerPosition.z);
    this.starMat.opacity = Math.max(0, Math.min(0.95, -sunElevation * 1.4));

    // Drift clouds slowly
    for (const cloud of this.cloudGroup.children) {
      cloud.position.x += deltaTime * 1.1;
      if (cloud.position.x - playerPosition.x > 65) cloud.position.x -= 130;
      if (cloud.position.x - playerPosition.x < -65) cloud.position.x += 130;
      if (cloud.position.z - playerPosition.z > 65) cloud.position.z -= 130;
      if (cloud.position.z - playerPosition.z < -65) cloud.position.z += 130;
    }

    // Animate weather particles
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

    // Sky & lighting color transitions (keeping night moonlit and readable per Phase U2.3)
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
      this.lights.ambientLight.intensity = 0.28; // Readable moonlight
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

/**
 * Phase U5 — Original Mob Roster ('Snorter', 'Moo-Beast', 'Woolback', 'Cluck',
 * 'Shambler', 'Bonewalker', 'Crawler', 'Bloater') with AI State Machine & Combat.
 */
const MOB_SPECS = [
  {
    type: 'Snorter',
    hostile: false,
    color: 0xf4a2b8,
    accent: 0xdb7093,
    maxHp: 10,
    speed: 1.35,
    drop: 'dirt',
  },
  {
    type: 'Moo-Beast',
    hostile: false,
    color: 0x78350f,
    accent: 0xfef3c7,
    maxHp: 12,
    speed: 1.15,
    drop: 'wood',
  },
  {
    type: 'Woolback',
    hostile: false,
    color: 0xf8fafc,
    accent: 0xcbd5e1,
    maxHp: 10,
    speed: 1.25,
    drop: 'snow',
  },
  {
    type: 'Cluck',
    hostile: false,
    color: 0xfef08a,
    accent: 0xef4444,
    maxHp: 6,
    speed: 1.6,
    drop: 'sand',
  },
  {
    type: 'Shambler',
    hostile: true,
    color: 0x4d7c0f,
    accent: 0x1e3a8a,
    maxHp: 16,
    speed: 1.95,
    damage: 2,
    drop: 'cobblestone',
  },
  {
    type: 'Crawler',
    hostile: true,
    color: 0x1e293b,
    accent: 0xdc2626,
    maxHp: 12,
    speed: 2.3,
    damage: 2,
    drop: 'coal_ore',
  },
  {
    type: 'Bloater',
    hostile: true,
    color: 0x22c55e,
    accent: 0x14532d,
    maxHp: 14,
    speed: 1.8,
    damage: 4,
    drop: 'brick',
  },
];

export class PassiveMobManager {
  constructor(scene, world, count = 10) {
    this.scene = scene;
    this.world = world;
    this.mobs = [];

    for (let i = 0; i < count; i++) {
      const spec = MOB_SPECS[i % MOB_SPECS.length];
      this.mobs.push(this._createMob(spec, i));
    }
  }

  spawnMobAt(typeOrSpec, x, z) {
    const spec =
      MOB_SPECS.find(
        (s) => s.type.toLowerCase() === String(typeOrSpec).toLowerCase()
      ) || MOB_SPECS[0];
    const mob = this._createMob(spec, this.mobs.length, x, z);
    this.mobs.push(mob);
    return mob.spec.type;
  }

  _createMob(spec, index, customX = null, customZ = null) {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: spec.color,
      roughness: 0.75,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: spec.accent,
      roughness: 0.75,
    });
    const eyeMat = new THREE.MeshBasicMaterial({
      color: spec.hostile ? 0xef4444 : 0x0f172a,
    });

    // Body
    const isTall = spec.type === 'Shambler' || spec.type === 'Bloater';
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.54, isTall ? 0.82 : 0.44, isTall ? 0.34 : 0.8),
      bodyMat
    );
    body.position.set(0, isTall ? 0.72 : 0.46, 0);
    body.castShadow = true;
    group.add(body);

    // Head
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.4, 0.42),
      accentMat
    );
    head.position.set(0, isTall ? 1.32 : 0.64, isTall ? 0 : -0.44);
    head.castShadow = true;
    group.add(head);

    const leftEye = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.07, 0.02),
      eyeMat
    );
    leftEye.position.set(-0.1, isTall ? 1.35 : 0.68, isTall ? -0.22 : -0.66);
    const rightEye = leftEye.clone();
    rightEye.position.x = 0.1;
    group.add(leftEye, rightEye);

    const legs = [];
    const legPositions = [
      [-0.16, 0.16, -0.22],
      [0.16, 0.16, -0.22],
      [-0.16, 0.16, 0.22],
      [0.16, 0.16, 0.22],
    ];
    for (const [lx, ly, lz] of legPositions) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.32, 0.14),
        bodyMat
      );
      leg.position.set(lx, ly, lz);
      leg.castShadow = true;
      group.add(leg);
      legs.push(leg);
    }

    const angle = (index / 10) * Math.PI * 2;
    const x = customX !== null ? customX : 8 + Math.cos(angle) * 11;
    const z = customZ !== null ? customZ : 8 + Math.sin(angle) * 11;
    const y = this.world.getSurfaceHeight(x, z) + 0.5;
    group.position.set(x, y, z);

    this.scene.add(group);

    return {
      spec,
      group,
      bodyMat,
      accentMat,
      baseColor: new THREE.Color(spec.color),
      legs,
      hp: spec.maxHp,
      maxHp: spec.maxHp,
      state: 'Wander', // 'Idle' | 'Wander' | 'Flee' | 'Chase'
      yaw: Math.random() * Math.PI * 2,
      timer: 1.5 + Math.random() * 2.5,
      hurtTimer: 0,
      attackCooldown: 0,
      animPhase: Math.random() * 10,
      deadTimer: 0,
    };
  }

  /**
   * Phase U5.6 — Ray-vs-Mob AABB hit test for player melee combat (reach = 3.6 blocks).
   */
  tryAttackMob(origin, direction, damage = 4) {
    const dir = direction.clone().normalize();
    let closestMob = null;
    let closestDist = 3.8;

    for (const mob of this.mobs) {
      if (mob.hp <= 0) continue;
      const toMob = mob.group.position
        .clone()
        .add(new THREE.Vector3(0, 0.6, 0))
        .sub(origin);
      const proj = toMob.dot(dir);
      if (proj < 0 || proj > closestDist) continue;

      const perpSq = toMob.lengthSq() - proj * proj;
      if (perpSq <= 0.65 * 0.65) {
        closestDist = proj;
        closestMob = mob;
      }
    }

    if (!closestMob) return null;

    closestMob.hp -= damage;
    closestMob.hurtTimer = 0.24;
    closestMob.bodyMat.color.setHex(0xef4444);

    // Knockback away from player
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
          // Respawn mob smoothly at perimeter
          mob.hp = mob.maxHp;
          mob.group.rotation.z = 0;
          mob.bodyMat.color.copy(mob.baseColor);
          const a = Math.random() * Math.PI * 2;
          mob.group.position.x = playerPosition.x + Math.cos(a) * 18;
          mob.group.position.z = playerPosition.z + Math.sin(a) * 18;
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

      // Hostile AI: Chase player at night or when close
      if (mob.spec.hostile && (isNight || distSq < 9 * 9) && distSq < 18 * 18) {
        mob.state = 'Chase';
        mob.yaw = Math.atan2(-dx, -dz);

        if (distSq < 1.75 * 1.75 && mob.attackCooldown <= 0) {
          mob.attackCooldown = 1.35;
          if (typeof onPlayerDamaged === 'function') {
            onPlayerDamaged(mob.spec.damage || 2, mob.spec.type);
          }
        }
      } else {
        mob.timer -= deltaTime;
        if (mob.timer <= 0) {
          mob.state = Math.random() > 0.3 ? 'Wander' : 'Idle';
          mob.yaw += (Math.random() - 0.5) * 2.2;
          mob.timer = 1.8 + Math.random() * 2.5;
        }
      }

      const speedMult =
        mob.state === 'Flee' ? 2.1 : mob.state === 'Chase' ? 1.25 : 1.0;
      const isMoving = mob.state !== 'Idle';

      if (isMoving) {
        mob.group.position.x +=
          -Math.sin(mob.yaw) * mob.spec.speed * speedMult * deltaTime;
        mob.group.position.z +=
          -Math.cos(mob.yaw) * mob.spec.speed * speedMult * deltaTime;
        mob.animPhase += deltaTime * 8 * speedMult;
      }

      if (distSq > 34 * 34) {
        const a = Math.random() * Math.PI * 2;
        mob.group.position.x = playerPosition.x + Math.cos(a) * 18;
        mob.group.position.z = playerPosition.z + Math.sin(a) * 18;
      }

      const groundY = this.world.getSurfaceHeight(
        mob.group.position.x,
        mob.group.position.z
      );
      mob.group.position.y = groundY + 0.5;
      mob.group.rotation.y = mob.yaw;

      const swing = isMoving ? Math.sin(mob.animPhase) * 0.48 : 0;
      mob.legs[0].rotation.x = swing;
      mob.legs[1].rotation.x = -swing;
      mob.legs[2].rotation.x = -swing;
      mob.legs[3].rotation.x = swing;
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
