import * as THREE from 'three';
import { ANIMAL_CLIMATE_CONFIG } from '../config/animalClimate.js';

// ============================================================================
// Real Flying Bird AI State Machine & Boids Flocking Engine (src/ai/BirdFlightAI.js)
// States: Perch, TakeOff, Fly, Soar, Land, Flee, Migrate
// 3D Flight Physics (zero gravity), Obstacle Raycasts, Banking & Procedural Wings
// ============================================================================

export class BirdFlightAI {
  constructor(world, sfx = null) {
    this.world = world;
    this.sfx = sfx;
    this.cfg = ANIMAL_CLIMATE_CONFIG.BIRD_FLIGHT;
    this.audioCtx = null;
    this._initAudio();
  }

  _initAudio() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.audioCtx = new AudioCtx();
    } catch (_) {}
  }

  playChirp(playerPos, birdPos) {
    if (!this.audioCtx || this.audioCtx.state !== 'running') return;
    try {
      const dx = (playerPos?.x || 0) - birdPos.x;
      const dz = (playerPos?.z || 0) - birdPos.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > 40 * 40) return; // Attenuation beyond 40m

      const dist = Math.sqrt(distSq);
      const volume = Math.max(0.01, (1.0 - dist / 40.0) * 0.12);
      const now = this.audioCtx.currentTime;

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(750, now + 0.12);

      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.14);
    } catch (_) {}
  }

  initBird(mob, startX, startZ, surfaceY) {
    mob.isFlyingBird = true;
    mob.flightState = 'Perch'; // Initial state: perched gracefully
    mob.perchTimer = 8.0 + Math.random() * 20.0;
    mob.flightTarget = null;
    mob.perchTarget = null;
    mob.flockId = Math.floor(Math.random() * 100);
    mob.chirpTimer = 3.0 + Math.random() * 15.0;

    mob.flyVelocity = new THREE.Vector3(0, 0, 0);
    mob.targetAltitude = 12.0;
    mob.bankRoll = 0.0;
    mob.pitch = 0.0;
    mob.wingPhase = Math.random() * Math.PI * 2;
    mob.soarAngle = Math.random() * Math.PI * 2;

    // Place on top of solid surface
    mob.basePos = { x: startX, y: surfaceY + 0.1, z: startZ };
    mob.group.position.set(mob.basePos.x, mob.basePos.y, mob.basePos.z);
  }

  setBirdState(mob, newState) {
    const valid = ['Perch', 'TakeOff', 'Fly', 'Soar', 'Land', 'Flee', 'Migrate'];
    if (!valid.includes(newState)) return false;
    mob.flightState = newState;
    if (newState === 'Perch') {
      mob.perchTimer = 15.0 + Math.random() * 25.0;
      mob.flyVelocity.set(0, 0, 0);
    } else if (newState === 'TakeOff') {
      mob.targetAltitude = this._pickCruiseAltitude(mob.basePos.x, mob.basePos.z);
    } else if (newState === 'Migrate') {
      mob.targetAltitude = 22.0;
    }
    return true;
  }

  _pickCruiseAltitude(x, z) {
    const groundY = this.world.getSurfaceHeight(x, z);
    const offset = this.cfg.minCruiseAltitude + Math.random() * (this.cfg.maxCruiseAltitude - this.cfg.minCruiseAltitude);
    return groundY + offset;
  }

  updateBird(dt, mob, playerPos, climate, allBirds = []) {
    // 1. Periodic sound chirp
    mob.chirpTimer -= dt;
    if (mob.chirpTimer <= 0) {
      mob.chirpTimer = 7.0 + Math.random() * 18.0;
      this.playChirp(playerPos, mob.basePos);
    }

    // 2. Flee check if player approaches within 6 blocks while perched
    if (mob.flightState === 'Perch' && playerPos) {
      const dPlayer = Math.hypot(mob.basePos.x - playerPos.x, mob.basePos.z - playerPos.z);
      if (dPlayer < this.cfg.fleePlayerDistance) {
        mob.flightState = 'Flee';
        mob.fleeTimer = 4.5;
        this.playChirp(playerPos, mob.basePos);
      }
    }

    // 3. Climate weather and night triggers
    const isStorm = climate?.weather === 'thunderstorm' || climate?.weather === 'heavy_rain';
    const isNight = climate ? climate.isNight() : false;
    const isAutumn = climate ? climate.season === 'autumn' : false;

    if ((isStorm || isNight) && mob.flightState !== 'Perch' && mob.flightState !== 'Land') {
      this._startLanding(mob);
    }

    // Autumn migration trigger
    if (isAutumn && mob.flightState === 'Fly' && Math.random() < 0.005) {
      mob.flightState = 'Migrate';
      mob.targetAltitude = 24.0;
    }

    // 4. State Machine Execution
    switch (mob.flightState) {
      case 'Perch':
        this._updatePerch(dt, mob, isStorm || isNight);
        break;
      case 'TakeOff':
        this._updateTakeOff(dt, mob);
        break;
      case 'Fly':
        this._updateFly(dt, mob, allBirds);
        break;
      case 'Soar':
        this._updateSoar(dt, mob);
        break;
      case 'Land':
        this._updateLand(dt, mob);
        break;
      case 'Flee':
        this._updateFlee(dt, mob, playerPos);
        break;
      case 'Migrate':
        this._updateMigrate(dt, mob, allBirds);
        break;
    }

    // 5. Position & Orientation Integration
    if (mob.flightState !== 'Perch') {
      mob.basePos.x += mob.flyVelocity.x * dt;
      mob.basePos.y += mob.flyVelocity.y * dt;
      mob.basePos.z += mob.flyVelocity.z * dt;

      // Obstacle Pushout Fallback: if bird is inside solid blocks, push up
      if (this.world.isSolidAt(mob.basePos.x, mob.basePos.y, mob.basePos.z)) {
        mob.basePos.y += 1.2;
        mob.flyVelocity.y = Math.max(mob.flyVelocity.y, 2.0);
      }

      mob.group.position.set(mob.basePos.x, mob.basePos.y, mob.basePos.z);

      // Orientation: Yaw from velocity + Banking Roll (Z) + Pitch (X)
      const hSpeed = Math.hypot(mob.flyVelocity.x, mob.flyVelocity.z);
      if (hSpeed > 0.1) {
        const targetYaw = Math.atan2(mob.flyVelocity.x, mob.flyVelocity.z);
        // Smooth yaw interpolation
        let dy = targetYaw - mob.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        mob.yaw += dy * Math.min(1.0, dt * 5.0);

        // Banking roll proportional to turn rate
        const targetRoll = Math.max(-this.cfg.bankRollMax, Math.min(this.cfg.bankRollMax, -dy * 1.8));
        mob.bankRoll = THREE.MathUtils.lerp(mob.bankRoll, targetRoll, dt * 6.0);

        // Pitch proportional to climb/dive vertical velocity
        const targetPitch = Math.max(-0.55, Math.min(0.55, mob.flyVelocity.y * 0.15));
        mob.pitch = THREE.MathUtils.lerp(mob.pitch, targetPitch, dt * 5.0);
      }

      mob.group.rotation.y = mob.yaw;
      mob.group.rotation.z = mob.bankRoll;
      mob.group.rotation.x = mob.pitch;
    } else {
      mob.group.position.set(mob.basePos.x, mob.basePos.y, mob.basePos.z);
      mob.group.rotation.set(0, mob.yaw, 0);
    }

    // 6. Procedural Wing Flapping (mob.arms[0] = left wing, mob.arms[1] = right wing)
    this._animateWings(dt, mob);
  }

  _updatePerch(dt, mob, keepGrounded) {
    mob.flyVelocity.set(0, 0, 0);
    if (mob.headGroup) {
      // Gentle idle look around
      mob.headGroup.rotation.y = Math.sin(performance.now() * 0.0018) * 0.35;
    }
    if (keepGrounded) return; // Do not take off in storm or night

    mob.perchTimer -= dt;
    if (mob.perchTimer <= 0) {
      mob.flightState = 'TakeOff';
      mob.targetAltitude = this._pickCruiseAltitude(mob.basePos.x, mob.basePos.z);
      const angle = mob.yaw + (Math.random() - 0.5) * 1.2;
      mob.flyVelocity.set(Math.sin(angle) * 3.5, 3.8, Math.cos(angle) * 3.5);
    }
  }

  _updateTakeOff(dt, mob) {
    // Climb at ~45° with fast wing flapping
    mob.flyVelocity.y = THREE.MathUtils.lerp(mob.flyVelocity.y, this.cfg.climbRate, dt * 3.0);
    const speed = 5.5;
    mob.flyVelocity.x = Math.sin(mob.yaw) * speed;
    mob.flyVelocity.z = Math.cos(mob.yaw) * speed;

    if (mob.basePos.y >= mob.targetAltitude - 0.5) {
      // Reached cruise height
      mob.flightState = Math.random() < 0.3 ? 'Soar' : 'Fly';
      mob.flyTimer = 18.0 + Math.random() * 30.0;
      this._pickNewFlightTarget(mob);
    }
  }

  _updateFly(dt, mob, allBirds) {
    mob.flyTimer = (mob.flyTimer || 25.0) - dt;
    if (mob.flyTimer <= 0) {
      if (Math.random() < 0.35) {
        mob.flightState = 'Soar';
        mob.soarTimer = 14.0 + Math.random() * 16.0;
      } else {
        this._startLanding(mob);
      }
      return;
    }

    if (!mob.flightTarget || Math.hypot(mob.flightTarget.x - mob.basePos.x, mob.flightTarget.z - mob.basePos.z) < 6.0) {
      this._pickNewFlightTarget(mob);
    }

    // Steering towards flightTarget
    const toTarget = new THREE.Vector3(
      mob.flightTarget.x - mob.basePos.x,
      0,
      mob.flightTarget.z - mob.basePos.z
    ).normalize();

    // Boids Flocking Force (Separation, Alignment, Cohesion)
    const flockForce = this._computeBoidsForce(mob, allBirds);

    // Desired horizontal direction
    const desiredDir = new THREE.Vector3()
      .addVectors(toTarget, flockForce)
      .normalize();

    const speed = this.cfg.cruiseSpeedMin + 1.2;
    mob.flyVelocity.x = THREE.MathUtils.lerp(mob.flyVelocity.x, desiredDir.x * speed, dt * 2.5);
    mob.flyVelocity.z = THREE.MathUtils.lerp(mob.flyVelocity.z, desiredDir.z * speed, dt * 2.5);

    // Terrain following & vertical altitude control
    const groundAheadY = this.world.getSurfaceHeight(
      mob.basePos.x + mob.flyVelocity.x * 0.8,
      mob.basePos.z + mob.flyVelocity.z * 0.8
    );
    const minSafeY = groundAheadY + 7.0;
    if (mob.basePos.y < minSafeY) {
      mob.flyVelocity.y = THREE.MathUtils.lerp(mob.flyVelocity.y, 3.2, dt * 4.0);
    } else {
      const altDelta = mob.targetAltitude - mob.basePos.y;
      mob.flyVelocity.y = THREE.MathUtils.lerp(mob.flyVelocity.y, altDelta * 0.45, dt * 2.0);
    }

    // Forward Voxel Raycast Obstacle Avoidance (~6 blocks ahead)
    this._avoidVoxelObstacles(dt, mob);
  }

  _updateSoar(dt, mob) {
    mob.soarTimer = (mob.soarTimer || 15.0) - dt;
    if (mob.soarTimer <= 0) {
      mob.flightState = 'Fly';
      mob.flyTimer = 20.0 + Math.random() * 25.0;
      this._pickNewFlightTarget(mob);
      return;
    }

    // Circle slowly in thermal updraft
    mob.soarAngle = (mob.soarAngle || 0) + dt * 0.45;
    const speed = 4.8;
    mob.flyVelocity.x = Math.cos(mob.soarAngle) * speed;
    mob.flyVelocity.z = Math.sin(mob.soarAngle) * speed;

    // Slight thermal lift
    mob.flyVelocity.y = Math.sin(mob.soarAngle * 2.0) * 0.35;

    // Forward Obstacle Check
    this._avoidVoxelObstacles(dt, mob);
  }

  _updateLand(dt, mob) {
    if (!mob.perchTarget) {
      this._findPerchSpot(mob);
    }

    const tx = mob.perchTarget.x;
    const ty = mob.perchTarget.y;
    const tz = mob.perchTarget.z;

    const dx = tx - mob.basePos.x;
    const dy = ty - mob.basePos.y;
    const dz = tz - mob.basePos.z;
    const distH = Math.hypot(dx, dz);

    if (distH < 0.6 && Math.abs(dy) < 0.8) {
      // Touchdown!
      mob.basePos.x = tx;
      mob.basePos.y = ty;
      mob.basePos.z = tz;
      mob.flyVelocity.set(0, 0, 0);
      mob.flightState = 'Perch';
      mob.perchTimer = 15.0 + Math.random() * 30.0;
      mob.perchTarget = null;
      return;
    }

    // Approach perch target smoothly, slowing down
    const approachSpeed = Math.max(2.2, Math.min(6.0, distH * 0.8));
    const dirH = new THREE.Vector2(dx, dz).normalize();
    mob.flyVelocity.x = THREE.MathUtils.lerp(mob.flyVelocity.x, dirH.x * approachSpeed, dt * 3.5);
    mob.flyVelocity.z = THREE.MathUtils.lerp(mob.flyVelocity.z, dirH.y * approachSpeed, dt * 3.5);
    mob.flyVelocity.y = THREE.MathUtils.lerp(mob.flyVelocity.y, dy * 0.85, dt * 2.5);
  }

  _updateFlee(dt, mob, playerPos) {
    mob.fleeTimer -= dt;
    // High speed burst away from player
    const awayX = playerPos ? mob.basePos.x - playerPos.x : Math.sin(mob.yaw);
    const awayZ = playerPos ? mob.basePos.z - playerPos.z : Math.cos(mob.yaw);
    const dir = new THREE.Vector2(awayX, awayZ).normalize();

    const fleeSpeed = 8.5;
    mob.flyVelocity.x = dir.x * fleeSpeed;
    mob.flyVelocity.z = dir.y * fleeSpeed;
    mob.flyVelocity.y = 3.8; // Climb fast

    if (mob.fleeTimer <= 0) {
      mob.flightState = 'Fly';
      mob.flyTimer = 20.0;
      this._pickNewFlightTarget(mob);
    }
  }

  _updateMigrate(dt, mob, allBirds) {
    // Migration heading: Southwest vector [-0.707, -0.707]
    const migrateDir = new THREE.Vector3(-0.707, 0, -0.707);
    const speed = 7.5;

    // Keep flock together
    const flockForce = this._computeBoidsForce(mob, allBirds);
    const combinedDir = new THREE.Vector3().addVectors(migrateDir, flockForce).normalize();

    mob.flyVelocity.x = THREE.MathUtils.lerp(mob.flyVelocity.x, combinedDir.x * speed, dt * 2.0);
    mob.flyVelocity.z = THREE.MathUtils.lerp(mob.flyVelocity.z, combinedDir.z * speed, dt * 2.0);

    const targetY = 25.0;
    mob.flyVelocity.y = THREE.MathUtils.lerp(mob.flyVelocity.y, (targetY - mob.basePos.y) * 0.35, dt * 2.0);

    this._avoidVoxelObstacles(dt, mob);
  }

  _startLanding(mob) {
    mob.flightState = 'Land';
    this._findPerchSpot(mob);
  }

  _findPerchSpot(mob) {
    // Search nearby tree canopy top or solid high ground
    let bestX = mob.basePos.x + Math.sin(mob.yaw) * 8.0;
    let bestZ = mob.basePos.z + Math.cos(mob.yaw) * 8.0;
    let bestY = this.world.getSurfaceHeight(bestX, bestZ);

    for (let r = 4; r <= 16; r += 4) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI * 0.5) {
        const cx = Math.round(mob.basePos.x + Math.cos(a) * r);
        const cz = Math.round(mob.basePos.z + Math.sin(a) * r);
        const surfaceY = this.world.getSurfaceHeight(cx, cz);
        // Prefer higher perch (tree leaves)
        if (surfaceY > bestY) {
          bestY = surfaceY;
          bestX = cx;
          bestZ = cz;
        }
      }
    }

    mob.perchTarget = { x: bestX, y: bestY + 0.1, z: bestZ };
  }

  _pickNewFlightTarget(mob) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 30.0 + Math.random() * 45.0;
    const tx = mob.basePos.x + Math.cos(angle) * dist;
    const tz = mob.basePos.z + Math.sin(angle) * dist;
    mob.flightTarget = { x: tx, z: tz };
    mob.targetAltitude = this._pickCruiseAltitude(tx, tz);
  }

  _computeBoidsForce(mob, allBirds) {
    const force = new THREE.Vector3(0, 0, 0);
    if (!allBirds || allBirds.length <= 1) return force;

    let neighbors = 0;
    const avgVel = new THREE.Vector3(0, 0, 0);
    const center = new THREE.Vector3(0, 0, 0);

    for (const other of allBirds) {
      if (other === mob || !other.isFlyingBird || other.flightState === 'Perch') continue;
      const d = Math.hypot(other.basePos.x - mob.basePos.x, other.basePos.z - mob.basePos.z);
      if (d < 12.0) {
        neighbors++;
        // 1. Separation
        if (d < this.cfg.flockSeparationDist && d > 0.01) {
          const sep = new THREE.Vector3(
            mob.basePos.x - other.basePos.x,
            0,
            mob.basePos.z - other.basePos.z
          ).normalize().multiplyScalar((this.cfg.flockSeparationDist - d) * this.cfg.flockSeparationWeight);
          force.add(sep);
        }
        // 2. Alignment & Cohesion accumulators
        avgVel.add(other.flyVelocity);
        center.add(new THREE.Vector3(other.basePos.x, 0, other.basePos.z));
      }
    }

    if (neighbors > 0) {
      avgVel.divideScalar(neighbors);
      center.divideScalar(neighbors);

      // Alignment
      const align = new THREE.Vector3(avgVel.x, 0, avgVel.z).normalize().multiplyScalar(this.cfg.flockAlignmentWeight);
      force.add(align);

      // Cohesion
      const coh = new THREE.Vector3(center.x - mob.basePos.x, 0, center.z - mob.basePos.z).normalize().multiplyScalar(this.cfg.flockCohesionWeight);
      force.add(coh);
    }

    return force;
  }

  _avoidVoxelObstacles(dt, mob) {
    const dirX = Math.sin(mob.yaw);
    const dirZ = Math.cos(mob.yaw);

    // Cast a stepped forward ray (up to 6 blocks ahead)
    for (let step = 1.5; step <= this.cfg.obstacleRayDistance; step += 1.2) {
      const checkX = Math.round(mob.basePos.x + dirX * step);
      const checkY = Math.round(mob.basePos.y);
      const checkZ = Math.round(mob.basePos.z + dirZ * step);

      if (this.world.isSolidAt(checkX, checkY, checkZ)) {
        // Obstacle ahead! Pitch up to climb and turn yaw away
        mob.flyVelocity.y = Math.max(mob.flyVelocity.y, 4.0);
        mob.yaw += Math.PI * 0.45 * (mob.flockId % 2 === 0 ? 1 : -1);
        break;
      }
    }
  }

  _animateWings(dt, mob) {
    if (!mob.arms || mob.arms.length < 2) return;

    const leftWing = mob.arms[0];
    const rightWing = mob.arms[1];

    if (mob.flightState === 'Perch') {
      // Folded wings tucked at side
      leftWing.rotation.set(0, 0, 0);
      rightWing.rotation.set(0, 0, 0);
      return;
    }

    if (mob.flightState === 'Soar') {
      // Wings spread wide and still with micro-glides
      const microGlide = Math.sin(performance.now() * 0.003) * 0.08;
      leftWing.rotation.z = -0.35 + microGlide;
      rightWing.rotation.z = 0.35 - microGlide;
      leftWing.rotation.x = 0;
      rightWing.rotation.x = 0;
      return;
    }

    // Active Flapping
    const flapSpeed =
      mob.flightState === 'TakeOff' || mob.flightState === 'Flee'
        ? this.cfg.wingFlapSpeedClimb
        : this.cfg.wingFlapSpeedCruise;

    mob.wingPhase = (mob.wingPhase || 0) + dt * flapSpeed;
    const flapAngle = Math.sin(mob.wingPhase) * 0.52;

    // Wing dihedral flap (Z-axis roll) and slight pitch swept stroke (X-axis)
    leftWing.rotation.z = flapAngle;
    rightWing.rotation.z = -flapAngle;
    leftWing.rotation.x = Math.cos(mob.wingPhase) * 0.15;
    rightWing.rotation.x = Math.cos(mob.wingPhase) * 0.15;
  }
}
