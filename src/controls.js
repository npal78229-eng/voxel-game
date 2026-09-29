import * as THREE from 'three';
import { isBoxColliding } from './collision.js';

// ============================================================================
// Phase U0.3 — Player AABB Physics (0.6x1.8 Collider, Axis-Separated X/Y/Z
//              Collision, Gravity, Jumping, Sprint FOV & Double-Space Fly Toggle)
// ============================================================================

export class FirstPersonController {
  constructor(
    camera,
    domElement,
    world,
    onPointerLockChange,
    onCameraModeChange,
    onFallDamage
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.world = world;
    this.onPointerLockChange = onPointerLockChange;
    this.onCameraModeChange = onCameraModeChange;
    this.onFallDamage = onFallDamage;

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
    const minSurfaceY =
      this.world.getSurfaceHeight(this.playerPosition.x, this.playerPosition.z) +
      0.5 +
      this.eyeHeight;
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

  update(deltaTime) {
    if (this.paused) {
      this._applyCameraTransform();
      return;
    }

    const dt = Math.min(deltaTime, 0.08);
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

    // Phase U0.3 — Axis-Separated AABB Collision Resolution (X -> Y -> Z)
    const speed =
      this.moveSpeed *
      (this.externalSpeedMultiplier || 1.0) *
      (this.isSprinting() ? this.sprintMultiplier : 1.0);
    const dx = moveDirection.x * speed * dt;
    const dz = moveDirection.z * speed * dt;
    this.lastVelocity.x = dt > 0 ? dx / dt : 0;
    this.lastVelocity.z = dt > 0 ? dz / dt : 0;

    // 1. Resolve X Axis
    if (!this._collidesAt(this.playerPosition.x + dx, this.playerPosition.y, this.playerPosition.z)) {
      this.playerPosition.x += dx;
    }

    // 2. Resolve Z Axis
    if (!this._collidesAt(this.playerPosition.x, this.playerPosition.y, this.playerPosition.z + dz)) {
      this.playerPosition.z += dz;
    }

    // 3. Jump & Gravity on Y Axis
    if (this.keys.Space && this.onGround) {
      this.velocityY = this.jumpSpeed;
      this.onGround = false;
    }

    this.velocityY -= this.gravity * dt;
    this.velocityY = Math.max(-32, this.velocityY);
    const dy = this.velocityY * dt;

    if (!this._collidesAt(this.playerPosition.x, this.playerPosition.y + dy, this.playerPosition.z)) {
      this.playerPosition.y += dy;
      this.onGround = false;
      if (this.playerPosition.y > this.highestAirY) {
        this.highestAirY = this.playerPosition.y;
      }
    } else {
      if (dy < 0) {
        // Landed on ground: check fall distance for Phase U5.6 Fall Damage
        const fallDist = this.highestAirY - this.playerPosition.y;
        if (fallDist > 4.2 && typeof this.onFallDamage === 'function') {
          this.onFallDamage(Math.floor(fallDist - 3.5));
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
