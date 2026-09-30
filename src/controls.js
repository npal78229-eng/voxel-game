import * as THREE from 'three';
import { isBoxColliding } from './collision.js';
import { FLUID_CONFIG } from './config/fluids.js';

// ============================================================================
// Phase U0.3 & Job 2 — Player AABB Physics & Fluid Buoyancy Simulation
// ============================================================================

export class FirstPersonController {
  constructor(
    camera,
    domElement,
    world,
    onPointerLockChange,
    onCameraModeChange,
    onFallDamage,
    onPlayerDamage
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.world = world;
    this.onPointerLockChange = onPointerLockChange;
    this.onCameraModeChange = onCameraModeChange;
    this.onFallDamage = onFallDamage;
    this.onPlayerDamage = onPlayerDamage;

    // Player eye position in world coordinates (feet are at playerPosition.y - 1.62)
    this.playerPosition = this.camera.position.clone();
    this.eyeHeight = 1.62;
    this.halfWidth = 0.3; // 0.6 wide collider
    this.colliderHeight = 1.8; // 1.8 tall collider

    this.moveSpeed = 5.6;
    this.sprintMultiplier = 1.48;
    this.flySpeed = 11.5;
    this.jumpSpeed = 8.3;
    this.gravity = 24.0;
    this.mouseSensitivity = 0.0022;

    this.velocityY = 0;
    this.onGround = false;
    this.isFlyMode = false; // Double-tap Space or press 'F' to toggle Fly Mode
    this.lastSpaceDownTime = 0;
    this.highestAirY = this.playerPosition.y;

    // Fluid Physics & Buoyancy (Job 2)
    this.inWater = false;
    this.inLava = false;
    this.headSubmerged = false;
    this.headSubmergedType = null;
    this.oxygen = FLUID_CONFIG.water.drowningSeconds; // 15.0s
    this.maxOxygen = FLUID_CONFIG.water.drowningSeconds;
    this.drowningTimer = 0;
    this.lavaDamageTimer = 0;
    this.burnTimer = 0;
    this.burnDamageTimer = 0;

    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.euler.setFromQuaternion(this.camera.quaternion);

    this.keys = {
      KeyW: false,
      KeyS: false,
      KeyA: false,
      KeyD: false,
      Space: false,
      ShiftLeft: false,
      ShiftRight: false,
      ControlLeft: false,
    };

    this.isLocked = false;
    this.paused = false;
    this.isThirdPerson = false;
    this.cameraModeIndex = 0; // 0: 1st-Person, 1: 3rd-Person Back, 2: 3rd-Person Front

    // Status Effects & Combat telemetry hooks
    this.externalSpeedMultiplier = 1.0;
    this.allowSprint = true;
    this.cameraShakeOffset = { x: 0, y: 0 };
    this.lastVelocity = { x: 0, z: 0 };

    this._bindEvents();
  }

  syncFromCamera() {
    this.playerPosition.copy(this.camera.position);
    this.euler.setFromQuaternion(this.camera.quaternion);
    this.ensureNotInsideBlocks();
    this.highestAirY = this.playerPosition.y;
  }

  /**
   * Phase U0.3 — Spawn & anti-clipping safety check: if the player's collider overlaps
   * solid terrain, push the player up to stand cleanly on top of the surface.
   */
  ensureNotInsideBlocks() {
    if (!this.world) return;
    const surfY = this.world.getSurfaceHeight(this.playerPosition.x, this.playerPosition.z);
    const effectiveFloor = Math.max(surfY, 18);
    const minSurfaceY = effectiveFloor + 0.5 + this.eyeHeight;
    if (this.playerPosition.y < minSurfaceY) {
      this.playerPosition.y = minSurfaceY + 0.05;
      this.velocityY = 0;
      this.onGround = true;
    }
  }

  isMovingHorizontally() {
    if (this.paused) return false;
    return Boolean(
      this.keys.KeyW || this.keys.KeyS || this.keys.KeyA || this.keys.KeyD
    );
  }

  isSprinting() {
    return (
      this.allowSprint &&
      this.isMovingHorizontally() &&
      Boolean(this.keys.ControlLeft || (!this.isFlyMode && this.keys.ShiftLeft))
    );
  }

  toggleCameraMode() {
    this.cameraModeIndex = (this.cameraModeIndex + 1) % 3;
    this.isThirdPerson = this.cameraModeIndex !== 0;
    this._applyCameraTransform();
    if (typeof this.onCameraModeChange === 'function') {
      const label =
        this.cameraModeIndex === 0
          ? '1st-Person'
          : this.cameraModeIndex === 1
          ? '3rd-Person Back'
          : '3rd-Person Front';
      this.onCameraModeChange(this.isThirdPerson, label);
    }
  }

  _bindEvents() {
    this.domElement.addEventListener('click', () => {
      if (!this.isLocked && !this.paused) {
        this.domElement.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement;
      if (!this.isLocked) {
        Object.keys(this.keys).forEach((k) => {
          this.keys[k] = false;
        });
      }
      if (typeof this.onPointerLockChange === 'function') {
        this.onPointerLockChange(this.isLocked);
      }
    });

    document.addEventListener('mousemove', (event) => {
      if (!this.isLocked || this.paused) return;

      const movementX = event.movementX || 0;
      const movementY = event.movementY || 0;

      this.euler.y -= movementX * this.mouseSensitivity;
      this.euler.x -= movementY * this.mouseSensitivity;

      const maxPitch = Math.PI / 2 - 0.015;
      this.euler.x = Math.max(-maxPitch, Math.min(maxPitch, this.euler.x));
    });

    window.addEventListener('keydown', (event) => {
      if (this.paused) return;

      if (event.code === 'KeyV') {
        this.toggleCameraMode();
        return;
      }

      if (event.code === 'KeyF') {
        this.isFlyMode = !this.isFlyMode;
        this.velocityY = 0;
        return;
      }

      if (event.code === 'Space' && !event.repeat) {
        const now = performance.now();
        if (now - this.lastSpaceDownTime < 300) {
          // Double-tap Space toggles Fly Mode (Phase U0.3)
          this.isFlyMode = !this.isFlyMode;
          this.velocityY = 0;
        }
        this.lastSpaceDownTime = now;
      }

      if (event.code in this.keys) {
        this.keys[event.code] = true;
      }
    });

    window.addEventListener('keyup', (event) => {
      if (event.code in this.keys) {
        this.keys[event.code] = false;
      }
    });
  }

  /**
   * Checks if the player's 0.6 x 1.8 AABB at eye position (px, py, pz) intersects any solid voxel.
   * Reuses shared isBoxColliding helper from src/collision.js (Part B3.1).
   */
  _collidesAt(px, py, pz) {
    if (!this.world) return false;
    const feetY = py - this.eyeHeight;
    return isBoxColliding(
      this.world,
      px,
      feetY,
      pz,
      this.halfWidth,
      this.colliderHeight
    );
  }

  _applyCameraTransform() {
    this.camera.quaternion.setFromEuler(this.euler);

    if (this.cameraModeIndex === 0) {
      this.camera.position.copy(this.playerPosition);
    } else if (this.cameraModeIndex === 1) {
      // Third-Person Back with terrain collision clamp so camera never clips inside hills
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
        this.camera.quaternion
      );
      let dist = 3.6;
      for (let d = 0.8; d <= 3.6; d += 0.4) {
        const testPos = this.playerPosition
          .clone()
          .addScaledVector(forward, -d);
        if (
          this.world &&
          this.world.isSolidAt(
            Math.round(testPos.x),
            Math.round(testPos.y),
            Math.round(testPos.z)
          )
        ) {
          dist = Math.max(0.6, d - 0.45);
          break;
        }
      }
      this.camera.position
        .copy(this.playerPosition)
        .addScaledVector(forward, -dist);
      this.camera.position.y += 0.35;
    } else {
      // Third-Person Front
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
        this.camera.quaternion
      );
      this.camera.position
        .copy(this.playerPosition)
        .addScaledVector(forward, 2.8);
      this.camera.lookAt(
        this.playerPosition.x,
        this.playerPosition.y - 0.3,
        this.playerPosition.z
      );
    }

    const shakeX = Number(this.cameraShakeOffset?.x) || 0;
    const shakeY = Number(this.cameraShakeOffset?.y) || 0;
    if (shakeX !== 0 || shakeY !== 0) {
      this.camera.position.x += shakeX;
      this.camera.position.y += shakeY;
    }
  }

  /**
   * Samples whether world coordinate (wx, wy, wz) is currently inside a water or lava fluid.
   */
  _getFluidAt(wx, wy, wz) {
    if (!this.world || typeof this.world.getFluid !== 'function') return null;
    const bx = Math.round(wx);
    const by = Math.round(wy);
    const bz = Math.round(wz);
    const f = this.world.getFluid(bx, by, bz);
    if (!f) return null;
    const fluidH = f.falling || f.level === 0 ? 1.0 : (8 - f.level) / 9.0;
    const fluidTop = by - 0.5 + fluidH;
    if (wy <= fluidTop) {
      return { ...f, bx, by, bz, fluidTop };
    }
    return null;
  }

  _updateFluidStatus(dt) {
    const px = this.playerPosition.x;
    const py = this.playerPosition.y;
    const pz = this.playerPosition.z;

    const headF = this._getFluidAt(px, py, pz);
    const waistF = this._getFluidAt(px, py - 0.8, pz);
    const feetF = this._getFluidAt(px, py - 1.55, pz);

    if (headF) {
      this.headSubmerged = true;
      this.headSubmergedType = headF.type;
    } else {
      this.headSubmerged = false;
      this.headSubmergedType = null;
    }

    const bodyF = waistF || feetF || headF;
    this.inWater = bodyF?.type === 'water';
    this.inLava = bodyF?.type === 'lava';

    // 1. Water effects
    if (this.inWater) {
      this.highestAirY = this.playerPosition.y; // Negate fall damage
      this.burnTimer = 0; // Extinguish fire
      this.burnDamageTimer = 0;
    }

    // 2. Lava effects
    if (this.inLava) {
      this.highestAirY = this.playerPosition.y; // Negate fall damage
      this.burnTimer = FLUID_CONFIG.lava.burnDuration; // 15s burn duration
      this.lavaDamageTimer += dt;
      if (this.lavaDamageTimer >= FLUID_CONFIG.lava.damageInterval) {
        this.lavaDamageTimer = 0;
        if (typeof this.onPlayerDamage === 'function') {
          this.onPlayerDamage(FLUID_CONFIG.lava.damagePerHit, 'Lava');
        }
      }
    } else {
      this.lavaDamageTimer = 0;
    }

    // 3. Burn tick after leaving lava
    if (this.burnTimer > 0 && !this.inWater) {
      this.burnTimer = Math.max(0, this.burnTimer - dt);
      this.burnDamageTimer += dt;
      if (this.burnDamageTimer >= 1.0) {
        this.burnDamageTimer = 0;
        if (typeof this.onPlayerDamage === 'function') {
          this.onPlayerDamage(FLUID_CONFIG.lava.burnDps, 'Fire');
        }
      }
    } else if (this.burnTimer <= 0) {
      this.burnDamageTimer = 0;
    }

    // 4. Oxygen & Drowning
    if (this.headSubmerged && this.headSubmergedType === 'water') {
      this.oxygen = Math.max(0, this.oxygen - dt);
      if (this.oxygen <= 0) {
        this.drowningTimer += dt;
        if (this.drowningTimer >= 1.0) {
          this.drowningTimer = 0;
          if (typeof this.onPlayerDamage === 'function') {
            this.onPlayerDamage(FLUID_CONFIG.water.drowningDps, 'Drowning');
          }
        }
      }
    } else {
      this.drowningTimer = 0;
      if (this.oxygen < FLUID_CONFIG.water.drowningSeconds) {
        const refillRate =
          (FLUID_CONFIG.water.drowningSeconds / FLUID_CONFIG.water.bubbleCount) *
          FLUID_CONFIG.water.bubbleRefillRate;
        this.oxygen = Math.min(
          FLUID_CONFIG.water.drowningSeconds,
          this.oxygen + refillRate * dt
        );
      }
    }
  }

  _getFluidFlowPush(dt) {
    if (this.isFlyMode) return { pushX: 0, pushZ: 0 };
    const px = this.playerPosition.x;
    const py = this.playerPosition.y;
    const pz = this.playerPosition.z;

    const f =
      this._getFluidAt(px, py - 1.0, pz) || this._getFluidAt(px, py - 1.55, pz);
    if (!f) return { pushX: 0, pushZ: 0 };

    const cfg = FLUID_CONFIG[f.type] || FLUID_CONFIG.water;

    // Falling fluid drags entity down
    if (f.falling) {
      this.velocityY -= (cfg.fallingPushForce || 3.2) * dt;
    }

    // Calculate horizontal slope vector
    const bx = f.bx;
    const by = f.by;
    const bz = f.bz;
    let pushX = 0;
    let pushZ = 0;

    const dirs = [
      { dx: 1, dz: 0 },
      { dx: -1, dz: 0 },
      { dx: 0, dz: 1 },
      { dx: 0, dz: -1 },
    ];

    for (const d of dirs) {
      const nx = bx + d.dx;
      const nz = bz + d.dz;
      if (this.world?.isSolidAt && this.world.isSolidAt(nx, by, nz)) continue;
      const nf = this.world?.getFluid ? this.world.getFluid(nx, by, nz) : null;
      if (!nf) {
        // Drop or open air
        pushX += d.dx * 1.5;
        pushZ += d.dz * 1.5;
      } else if (nf.type === f.type) {
        const diff = nf.level - f.level;
        if (diff > 0) {
          pushX += d.dx * diff;
          pushZ += d.dz * diff;
        }
      }
    }

    const len = Math.hypot(pushX, pushZ);
    if (len > 0.001) {
      const force = cfg.flowPushForce || 1.8;
      return {
        pushX: (pushX / len) * force * dt,
        pushZ: (pushZ / len) * force * dt,
      };
    }

    return { pushX: 0, pushZ: 0 };
  }

  update(deltaTime) {
    if (this.paused) {
      this._applyCameraTransform();
      return;
    }

    const dt = Math.min(deltaTime, 0.08);

    // Job 2: Tick fluid status (inWater, inLava, headSubmerged, oxygen, burn)
    this._updateFluidStatus(dt);

    const yaw = this.euler.y;
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

    const moveDirection = new THREE.Vector3();
    if (this.keys.KeyW) moveDirection.add(forward);
    if (this.keys.KeyS) moveDirection.sub(forward);
    if (this.keys.KeyD) moveDirection.add(right);
    if (this.keys.KeyA) moveDirection.sub(right);

    if (moveDirection.lengthSq() > 0) {
      moveDirection.normalize();
    }

    // Dynamic FOV sprint widening (Phase U2.7)
    const targetFov = this.isSprinting() ? 83 : 75;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 10);
      this.camera.updateProjectionMatrix();
    }

    if (this.isFlyMode) {
      const speed = this.flySpeed * dt;
      this.playerPosition.addScaledVector(moveDirection, speed);
      if (this.keys.Space) this.playerPosition.y += speed * 0.85;
      if (this.keys.ShiftLeft || this.keys.ShiftRight) {
        this.playerPosition.y -= speed * 0.85;
      }
      this.highestAirY = this.playerPosition.y;
      this.lastVelocity.x = moveDirection.x * this.flySpeed;
      this.lastVelocity.z = moveDirection.z * this.flySpeed;
      this._applyCameraTransform();
      return;
    }

    // Job 2: Fluid Speed Multipliers (Water: 0.5x walk / 0.72x sprint; Lava: 0.35x)
    let fluidSpeedMult = 1.0;
    if (this.inWater) {
      fluidSpeedMult = this.isSprinting()
        ? FLUID_CONFIG.water.sprintSwimMultiplier
        : FLUID_CONFIG.water.horizontalSpeedMultiplier;
    } else if (this.inLava) {
      fluidSpeedMult = FLUID_CONFIG.lava.horizontalSpeedMultiplier;
    }

    // Phase U0.3 — Axis-Separated AABB Collision Resolution (X -> Y -> Z)
    const speed =
      this.moveSpeed *
      (this.externalSpeedMultiplier || 1.0) *
      (this.isSprinting() ? this.sprintMultiplier : 1.0) *
      fluidSpeedMult;

    const { pushX, pushZ } = this._getFluidFlowPush(dt);
    const dx = moveDirection.x * speed * dt;
    const dz = moveDirection.z * speed * dt;
    this.lastVelocity.x = dt > 0 ? (dx + pushX) / dt : 0;
    this.lastVelocity.z = dt > 0 ? (dz + pushZ) / dt : 0;

    // 1. Resolve X Axis (with flow push force)
    const totalDx = dx + pushX;
    if (
      !this._collidesAt(
        this.playerPosition.x + totalDx,
        this.playerPosition.y,
        this.playerPosition.z
      )
    ) {
      this.playerPosition.x += totalDx;
    } else if (
      dx !== 0 &&
      !this._collidesAt(
        this.playerPosition.x + dx,
        this.playerPosition.y,
        this.playerPosition.z
      )
    ) {
      this.playerPosition.x += dx;
    }

    // 2. Resolve Z Axis (with flow push force)
    const totalDz = dz + pushZ;
    if (
      !this._collidesAt(
        this.playerPosition.x,
        this.playerPosition.y,
        this.playerPosition.z + totalDz
      )
    ) {
      this.playerPosition.z += totalDz;
    } else if (
      dz !== 0 &&
      !this._collidesAt(
        this.playerPosition.x,
        this.playerPosition.y,
        this.playerPosition.z + dz
      )
    ) {
      this.playerPosition.z += dz;
    }

    // 3. Jump, Swim & Gravity on Y Axis
    if (this.inWater || this.inLava) {
      const cfg = this.inWater ? FLUID_CONFIG.water : FLUID_CONFIG.lava;
      if (this.keys.Space) {
        // Continuous swimming upward while holding Space
        this.velocityY = cfg.swimUpSpeed;
        this.onGround = false;
      } else {
        // Clamped sinking terminal speed
        this.velocityY = Math.max(-cfg.sinkTerminalSpeed, this.velocityY - 12.0 * dt);
      }
    } else {
      // Normal ground jumping & gravity in air
      if (this.keys.Space && this.onGround) {
        this.velocityY = this.jumpSpeed;
        this.onGround = false;
      }
      this.velocityY -= this.gravity * dt;
      this.velocityY = Math.max(-32, this.velocityY);
    }

    const dy = this.velocityY * dt;

    if (
      !this._collidesAt(
        this.playerPosition.x,
        this.playerPosition.y + dy,
        this.playerPosition.z
      )
    ) {
      this.playerPosition.y += dy;
      this.onGround = false;
      if (this.playerPosition.y > this.highestAirY) {
        this.highestAirY = this.playerPosition.y;
      }
    } else {
      if (dy < 0) {
        // Landed on ground: only take fall damage if falling through air (not water/lava)
        if (!this.inWater && !this.inLava) {
          const fallDist = this.highestAirY - this.playerPosition.y;
          if (fallDist > 4.2 && typeof this.onFallDamage === 'function') {
            this.onFallDamage(Math.floor(fallDist - 3.5));
          }
        }
        this.onGround = true;
        this.highestAirY = this.playerPosition.y;
      }
      this.velocityY = 0;
    }

    // Safety floor so player never falls below y=1
    if (this.playerPosition.y < 1.8) {
      this.ensureNotInsideBlocks();
    }

    this._applyCameraTransform();
  }
}
