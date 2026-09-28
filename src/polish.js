import * as THREE from 'three';
import { BLOCK_BY_ID } from './blocks.js';

// ============================================================================
// Phase 6 — Polish & Feel (Web Audio API, Day/Night Cycle, Passive Mobs, Particles)
// ============================================================================

/**
 * 6.1 — Web Audio API Synthesizer for overlapping Break, Place, Footstep & Craft SFX.
 */
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
    // Short crunchy white-noise burst + descending pitch thump
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
    gain.gain.setValueAtTime(0.28, now);
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

    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.07);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.075);
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

    gain.gain.setValueAtTime(0.12, now);
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
 * 6.2 — Day/Night Cycle: Smoothly orbits directional sunlight and transitions sky/fog/ambient colors.
 */
export class DayNightCycle {
  constructor(scene, lights) {
    this.scene = scene;
    this.lights = lights;
    // 0.0 = Sunrise, 0.25 = Noon (start here), 0.5 = Sunset, 0.75 = Midnight
    this.timeOfDay = 0.23;
    this.dayDurationSeconds = 240; // 4 minutes per full in-game day (or press 'T' to advance)

    this.noonSky = new THREE.Color(0x87ceeb);
    this.sunsetSky = new THREE.Color(0xf97316);
    this.nightSky = new THREE.Color(0x0b132b);
    this.currentSky = new THREE.Color();
  }

  advanceTime(step = 0.08) {
    this.timeOfDay = (this.timeOfDay + step) % 1.0;
  }

  getLabel() {
    const t = this.timeOfDay;
    if (t >= 0.1 && t < 0.4) return 'Day (Noon)';
    if (t >= 0.4 && t < 0.6) return 'Sunset';
    if (t >= 0.6 && t < 0.9) return 'Night';
    return 'Sunrise';
  }

  update(deltaTime, playerPosition) {
    this.timeOfDay =
      (this.timeOfDay + deltaTime / this.dayDurationSeconds) % 1.0;

    const angle = this.timeOfDay * Math.PI * 2;
    const sunElevation = Math.sin(angle); // +1 at Noon (0.25), -1 at Midnight (0.75)
    const sunHorizontal = Math.cos(angle);

    // Orbit sun around player
    const radius = 52;
    this.lights.sunLight.position.set(
      playerPosition.x + sunHorizontal * radius,
      Math.max(6, sunElevation * radius),
      playerPosition.z + 18
    );
    this.lights.sunLight.target.position.set(
      playerPosition.x,
      0,
      playerPosition.z
    );
    this.lights.sunLight.target.updateMatrixWorld();

    // Interpolate sky & lighting intensities
    if (sunElevation > 0.2) {
      // Bright daytime
      const f = Math.min(1, (sunElevation - 0.2) / 0.8);
      this.currentSky.copy(this.sunsetSky).lerp(this.noonSky, f);
      this.lights.sunLight.intensity = 0.65 + 0.8 * f;
      this.lights.ambientLight.intensity = 0.32 + 0.14 * f;
      this.lights.ambientLight.color.setHex(0xffffff);
    } else if (sunElevation > -0.2) {
      // Golden hour transition (Sunrise / Sunset)
      const f = (sunElevation + 0.2) / 0.4;
      this.currentSky.copy(this.nightSky).lerp(this.sunsetSky, f);
      this.lights.sunLight.intensity = 0.18 + 0.47 * f;
      this.lights.ambientLight.intensity = 0.2 + 0.12 * f;
      this.lights.ambientLight.color.setHex(0xfed7aa);
    } else {
      // Nighttime (dim blue-tinted moonlight)
      this.currentSky.copy(this.nightSky);
      this.lights.sunLight.intensity = 0.16;
      this.lights.ambientLight.intensity = 0.2;
      this.lights.ambientLight.color.setHex(0x93c5fd);
    }

    this.scene.background.copy(this.currentSky);
    if (this.scene.fog) {
      this.scene.fog.color.copy(this.currentSky);
    }
  }
}

/**
 * 6.3 — Simple Passive Blocky Mobs (wandering voxel creatures on grass terrain).
 */
export class PassiveMobManager {
  constructor(scene, world, count = 6) {
    this.scene = scene;
    this.world = world;
    this.mobs = [];

    for (let i = 0; i < count; i++) {
      this.mobs.push(this._createMob(i));
    }
  }

  _createMob(index) {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: index % 2 === 0 ? 0xfbcfe8 : 0xfef08a,
      roughness: 0.75,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.8,
    });

    // Blocky body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.42, 0.82),
      bodyMat
    );
    body.position.set(0, 0.44, 0);
    body.castShadow = true;
    group.add(body);

    // Blocky head
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.38, 0.42),
      bodyMat
    );
    head.position.set(0, 0.62, -0.46);
    head.castShadow = true;
    group.add(head);

    // Eyes
    const leftEye = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, 0.02),
      darkMat
    );
    leftEye.position.set(-0.11, 0.66, -0.68);
    const rightEye = leftEye.clone();
    rightEye.position.x = 0.11;
    group.add(leftEye, rightEye);

    // 4 Legs
    const legs = [];
    const legPositions = [
      [-0.17, 0.16, -0.26],
      [0.17, 0.16, -0.26],
      [-0.17, 0.16, 0.26],
      [0.17, 0.16, 0.26],
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

    const angle = (index / 6) * Math.PI * 2;
    const x = 8 + Math.cos(angle) * 10;
    const z = 8 + Math.sin(angle) * 10;
    const y = this.world.getSurfaceHeight(x, z) + 0.5;
    group.position.set(x, y, z);

    this.scene.add(group);

    return {
      group,
      legs,
      yaw: Math.random() * Math.PI * 2,
      speed: 1.15,
      moving: true,
      timer: 1 + Math.random() * 3,
      animPhase: Math.random() * 10,
    };
  }

  update(deltaTime, playerPosition) {
    for (const mob of this.mobs) {
      mob.timer -= deltaTime;
      if (mob.timer <= 0) {
        mob.moving = Math.random() > 0.32;
        mob.yaw += (Math.random() - 0.5) * 2.2;
        mob.timer = 1.8 + Math.random() * 3.0;
      }

      if (mob.moving) {
        mob.group.position.x += -Math.sin(mob.yaw) * mob.speed * deltaTime;
        mob.group.position.z += -Math.cos(mob.yaw) * mob.speed * deltaTime;
        mob.animPhase += deltaTime * 8;
      }

      // Keep mob within a 28-block radius of the player (despawn/respawn near player)
      const dx = mob.group.position.x - playerPosition.x;
      const dz = mob.group.position.z - playerPosition.z;
      if (dx * dx + dz * dz > 28 * 28) {
        const a = Math.random() * Math.PI * 2;
        mob.group.position.x = playerPosition.x + Math.cos(a) * 14;
        mob.group.position.z = playerPosition.z + Math.sin(a) * 14;
      }

      // Snap Y to terrain surface
      const groundY = this.world.getSurfaceHeight(
        mob.group.position.x,
        mob.group.position.z
      );
      mob.group.position.y = groundY + 0.5;
      mob.group.rotation.y = mob.yaw;

      // Swing legs while walking
      const swing = mob.moving ? Math.sin(mob.animPhase) * 0.45 : 0;
      mob.legs[0].rotation.x = swing;
      mob.legs[1].rotation.x = -swing;
      mob.legs[2].rotation.x = -swing;
      mob.legs[3].rotation.x = swing;
    }
  }
}

/**
 * 6.5 — Block Break Particle Effects: Burst of small cubes popping outward on block break.
 */
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
