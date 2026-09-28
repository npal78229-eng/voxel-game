import * as THREE from 'three';

// ============================================================================
// Phase 1 & Phase 4 — First/Third-Person Controls (Pointer Lock, WASD, Pause, V-Toggle)
// ============================================================================

export class FirstPersonController {
  constructor(camera, domElement, onPointerLockChange, onCameraModeChange) {
    this.camera = camera;
    this.domElement = domElement;
    this.onPointerLockChange = onPointerLockChange;
    this.onCameraModeChange = onCameraModeChange;

    // Canonical player eye position in world coordinates
    this.playerPosition = this.camera.position.clone();

    // Movement & look parameters
    this.moveSpeed = 6.5;
    this.verticalSpeed = 5.5;
    this.mouseSensitivity = 0.0022;

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
    };

    this.isLocked = false;
    this.paused = false; // Set true when Inventory UI ('E') is open
    this.isThirdPerson = false; // Toggled with 'V' key (Part 4B)

    this._bindEvents();
  }

  /**
   * Syncs `this.playerPosition` and `this.euler` from `this.camera` after initial spawn setup.
   */
  syncFromCamera() {
    this.playerPosition.copy(this.camera.position);
    this.euler.setFromQuaternion(this.camera.quaternion);
  }

  /**
   * Returns true when WASD horizontal movement is actively held (used to trigger 'Walk' animation).
   */
  isMovingHorizontally() {
    if (this.paused) return false;
    return Boolean(
      this.keys.KeyW || this.keys.KeyS || this.keys.KeyA || this.keys.KeyD
    );
  }

  toggleCameraMode() {
    this.isThirdPerson = !this.isThirdPerson;
    this._applyCameraTransform();
    if (typeof this.onCameraModeChange === 'function') {
      this.onCameraModeChange(this.isThirdPerson);
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
      if (event.code === 'KeyV' && !this.paused) {
        this.toggleCameraMode();
        return;
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

  _applyCameraTransform() {
    this.camera.quaternion.setFromEuler(this.euler);

    if (!this.isThirdPerson) {
      // First-Person View: Camera sits directly at player's eye position
      this.camera.position.copy(this.playerPosition);
    } else {
      // Third-Person Over-the-Shoulder View: Offset camera backward along look direction
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
        this.camera.quaternion
      );
      this.camera.position
        .copy(this.playerPosition)
        .addScaledVector(forward, -3.8);
      this.camera.position.y += 0.55;
    }
  }

  update(deltaTime) {
    if (this.paused) {
      this._applyCameraTransform();
      return;
    }

    const dt = Math.min(deltaTime, 0.1);
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
      this.playerPosition.addScaledVector(moveDirection, this.moveSpeed * dt);
    }

    if (this.keys.Space) {
      this.playerPosition.y += this.verticalSpeed * dt;
    }
    if (this.keys.ShiftLeft || this.keys.ShiftRight) {
      this.playerPosition.y -= this.verticalSpeed * dt;
    }

    this._applyCameraTransform();
  }
}
