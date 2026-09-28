import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BLOCK_BY_ID } from './blocks.js';

// ============================================================================
// Phase 4 (Part 4B) — Blocky Rigged Character, GLTFLoader & AnimationMixer
// ============================================================================

export class CharacterController {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    // Root container placed at player feet in world space (visible in 3rd-person view 'V')
    this.characterRoot = new THREE.Group();
    this.characterRoot.name = 'PlayerCharacterRoot';
    this.characterRoot.visible = false; // Hidden in 1st-person, visible in 3rd-person ('V' key)
    this.scene.add(this.characterRoot);

    // First-person viewmodel arm + held item attached to camera (visible in 1st-person view)
    this.fpArmGroup = new THREE.Group();
    this.fpArmGroup.position.set(0.46, -0.38, -0.62);
    this.camera.add(this.fpArmGroup);
    if (!this.camera.parent) {
      this.scene.add(this.camera);
    }

    this.mixer = null;
    this.actions = { Idle: null, Walk: null };
    this.activeActionName = 'Idle';

    this.swingProgress = 0;
    this.isSwinging = false;
    this.walkTime = 0;

    // 1. Build rigged blocky character & AnimationMixer clips immediately
    this._buildProceduralBlockyRig();
    this._buildFirstPersonArm();

    // 2. Also attempt to load custom Blender export at /assets/character.glb via GLTFLoader
    this._tryLoadCustomGLB('/assets/character.glb');
  }

  /**
   * Builds a ~1.85-block-tall blocky humanoid hierarchy with named bone pivots
   * and binds real THREE.AnimationClip('Idle') & THREE.AnimationClip('Walk')
   * to a THREE.AnimationMixer using .crossFadeTo().
   */
  _buildProceduralBlockyRig() {
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xf1c27d,
      roughness: 0.7,
    });
    const shirtMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      roughness: 0.75,
    });
    const pantsMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a8a,
      roughness: 0.8,
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: 0x3b2314,
      roughness: 0.85,
    });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });

    const rig = new THREE.Group();
    rig.name = 'RigRoot';

    // Torso (0.5w x 0.72h x 0.26d), center at y = 1.08
    const torsoPivot = new THREE.Group();
    torsoPivot.name = 'SpineBone';
    torsoPivot.position.set(0, 1.08, 0);
    const torsoMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.72, 0.26),
      shirtMat
    );
    torsoMesh.castShadow = true;
    torsoPivot.add(torsoMesh);
    rig.add(torsoPivot);

    // Head (0.48w x 0.48h x 0.48d), pivot at neck (y = 1.44)
    const headPivot = new THREE.Group();
    headPivot.name = 'HeadBone';
    headPivot.position.set(0, 1.44, 0);
    const headMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.48, 0.48),
      skinMat
    );
    headMesh.position.set(0, 0.24, 0);
    headMesh.castShadow = true;

    // Hair cap
    const hairMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.14, 0.5),
      hairMat
    );
    hairMesh.position.set(0, 0.44, 0);
    headPivot.add(hairMesh);

    // Eyes on front (-Z face)
    const leftEye = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.06, 0.02),
      eyeMat
    );
    leftEye.position.set(-0.1, 0.22, -0.245);
    const rightEye = leftEye.clone();
    rightEye.position.x = 0.1;
    headPivot.add(leftEye, rightEye);
    headPivot.add(headMesh);
    rig.add(headPivot);

    // Left Arm (0.22w x 0.70h x 0.22d), pivot at shoulder (x = -0.36, y = 1.40)
    const leftArmPivot = new THREE.Group();
    leftArmPivot.name = 'LeftArmBone';
    leftArmPivot.position.set(-0.36, 1.4, 0);
    const leftArmMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.7, 0.22),
      skinMat
    );
    leftArmMesh.position.set(0, -0.32, 0);
    leftArmMesh.castShadow = true;
    leftArmPivot.add(leftArmMesh);
    rig.add(leftArmPivot);

    // Right Arm (0.22w x 0.70h x 0.22d), pivot at shoulder (x = +0.36, y = 1.40)
    const rightArmPivot = new THREE.Group();
    rightArmPivot.name = 'RightArmBone';
    rightArmPivot.position.set(0.36, 1.4, 0);
    const rightArmMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.7, 0.22),
      skinMat
    );
    rightArmMesh.position.set(0, -0.32, 0);
    rightArmMesh.castShadow = true;
    rightArmPivot.add(rightArmMesh);
    rig.add(rightArmPivot);

    // Left Leg (0.23w x 0.72h x 0.24d), pivot at hip (x = -0.13, y = 0.72)
    const leftLegPivot = new THREE.Group();
    leftLegPivot.name = 'LeftLegBone';
    leftLegPivot.position.set(-0.13, 0.72, 0);
    const leftLegMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.23, 0.72, 0.24),
      pantsMat
    );
    leftLegMesh.position.set(0, -0.36, 0);
    leftLegMesh.castShadow = true;
    leftLegPivot.add(leftLegMesh);
    rig.add(leftLegPivot);

    // Right Leg (0.23w x 0.72h x 0.24d), pivot at hip (x = +0.13, y = 0.72)
    const rightLegPivot = new THREE.Group();
    rightLegPivot.name = 'RightLegBone';
    rightLegPivot.position.set(0.13, 0.72, 0);
    const rightLegMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.23, 0.72, 0.24),
      pantsMat
    );
    rightLegMesh.position.set(0, -0.36, 0);
    rightLegMesh.castShadow = true;
    rightLegPivot.add(rightLegMesh);
    rig.add(rightLegPivot);

    this.characterRoot.add(rig);

    // Build genuine THREE.AnimationClip tracks for 'Idle' and 'Walk'
    const idleClip = this._createLimbSwingClip('Idle', 2.0, 0.06);
    const walkClip = this._createLimbSwingClip('Walk', 0.65, 0.72);

    this.mixer = new THREE.AnimationMixer(rig);
    this.actions.Idle = this.mixer.clipAction(idleClip);
    this.actions.Walk = this.mixer.clipAction(walkClip);

    this.actions.Idle.play();
    this.activeActionName = 'Idle';
  }

  /**
   * Generates a looping skeletal QuaternionKeyframeTrack animation clip
   * swinging arms and legs in opposite pairs (LeftArm with RightLeg, RightArm with LeftLeg).
   */
  _createLimbSwingClip(name, duration, maxAngleRad) {
    const times = [0, duration * 0.25, duration * 0.5, duration * 0.75, duration];
    const q = new THREE.Quaternion();
    const xAxis = new THREE.Vector3(1, 0, 0);

    const makeTrack = (boneName, sign) => {
      const values = [];
      const angles = [0, maxAngleRad * sign, 0, -maxAngleRad * sign, 0];
      for (const angle of angles) {
        q.setFromAxisAngle(xAxis, angle);
        values.push(q.x, q.y, q.z, q.w);
      }
      return new THREE.QuaternionKeyframeTrack(
        `${boneName}.quaternion`,
        times,
        values
      );
    };

    const tracks = [
      makeTrack('LeftArmBone', 1),
      makeTrack('RightArmBone', -1),
      makeTrack('LeftLegBone', -1),
      makeTrack('RightLegBone', 1),
    ];

    return new THREE.AnimationClip(name, duration, tracks);
  }

  /**
   * Builds the First-Person right arm + mini held block attached to the camera.
   */
  _buildFirstPersonArm() {
    const sleeveMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      roughness: 0.7,
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xf1c27d,
      roughness: 0.7,
    });

    const armMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.52, 0.18),
      skinMat
    );
    armMesh.rotation.x = -Math.PI / 3;
    armMesh.rotation.z = -0.18;

    const cuffMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.19, 0.22, 0.19),
      sleeveMat
    );
    cuffMesh.position.set(0, -0.14, 0);
    armMesh.add(cuffMesh);

    // Held mini-block at the tip of the hand
    this.heldBlockMat = new THREE.MeshStandardMaterial({
      color: 0x58b947,
      roughness: 0.75,
    });
    this.heldBlockMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.22, 0.22),
      this.heldBlockMat
    );
    this.heldBlockMesh.position.set(-0.04, 0.26, -0.04);
    armMesh.add(this.heldBlockMesh);

    this.fpArmMesh = armMesh;
    this.fpArmGroup.add(armMesh);
  }

  /**
   * Attempts to load `/assets/character.glb` via GLTFLoader. If the user exports a custom
   * Blender `.glb` model into `public/assets/character.glb`, it replaces the procedural rig
   * and wires up its 'Idle' and 'Walk' clips to `this.mixer`.
   */
  _tryLoadCustomGLB(url) {
    // First do a lightweight HEAD check so the browser console doesn't log a 404 if no custom file was dropped in yet
    fetch(url, { method: 'HEAD' })
      .then((res) => {
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok || contentType.includes('text/html')) return;

        const loader = new GLTFLoader();
        loader.load(
          url,
          (gltf) => {
            this.characterRoot.clear();
            const model = gltf.scene;
            model.traverse((obj) => {
              if (obj.isMesh) {
                obj.castShadow = true;
                obj.receiveShadow = true;
              }
            });
            this.characterRoot.add(model);

            if (gltf.animations && gltf.animations.length > 0) {
              this.mixer = new THREE.AnimationMixer(model);
              const idleClip =
                THREE.AnimationClip.findByName(gltf.animations, 'Idle') ||
                gltf.animations[0];
              const walkClip =
                THREE.AnimationClip.findByName(gltf.animations, 'Walk') ||
                gltf.animations[1] ||
                gltf.animations[0];

              this.actions.Idle = this.mixer.clipAction(idleClip);
              this.actions.Walk = this.mixer.clipAction(walkClip);
              this.actions.Idle.play();
              this.activeActionName = 'Idle';
            }
          },
          undefined,
          () => {}
        );
      })
      .catch(() => {});
  }

  /**
   * Updates the color of the mini block held in the player's right hand to match the hotbar.
   */
  setHeldBlockType(blockType) {
    if (!this.heldBlockMesh) return;
    if (!blockType || !BLOCK_BY_ID[blockType]) {
      this.heldBlockMesh.visible = false;
      return;
    }
    this.heldBlockMesh.visible = true;
    this.heldBlockMat.color.copy(BLOCK_BY_ID[blockType].color);
  }

  /**
   * Plays a quick punch/swing animation on the arm when breaking or placing a block.
   */
  triggerSwing() {
    this.isSwinging = true;
    this.swingProgress = 0;
  }

  /**
   * Switches between First-Person viewmodel arm and Third-Person full character model.
   */
  setThirdPersonMode(isThirdPerson) {
    this.characterRoot.visible = isThirdPerson;
    this.fpArmGroup.visible = !isThirdPerson;
  }

  /**
   * Updates the character position, yaw rotation, and AnimationMixer crossfading every frame.
   */
  update(deltaTime, playerPosition, yaw, isMoving) {
    // Position full character feet ~1.65 units below player eye height
    this.characterRoot.position.set(
      playerPosition.x,
      playerPosition.y - 1.65,
      playerPosition.z
    );
    this.characterRoot.rotation.y = yaw;

    // Crossfade smoothly between 'Idle' and 'Walk' via AnimationMixer.crossFadeTo()
    const desiredAction = isMoving ? 'Walk' : 'Idle';
    if (
      desiredAction !== this.activeActionName &&
      this.actions.Idle &&
      this.actions.Walk
    ) {
      const fromAction = this.actions[this.activeActionName];
      const toAction = this.actions[desiredAction];

      toAction.reset();
      toAction.play();
      fromAction.crossFadeTo(toAction, 0.22, false);
      this.activeActionName = desiredAction;
    }

    if (this.mixer) {
      this.mixer.update(deltaTime);
    }

    // Update First-Person viewmodel arm bob & block-swing animation
    this.walkTime += deltaTime * (isMoving ? 9.0 : 2.2);
    const bobX = Math.cos(this.walkTime * 0.5) * (isMoving ? 0.028 : 0.006);
    const bobY = Math.abs(Math.sin(this.walkTime)) * (isMoving ? 0.035 : 0.008);

    let swingRotX = 0;
    let swingRotZ = 0;
    if (this.isSwinging) {
      this.swingProgress += deltaTime * 6.5;
      if (this.swingProgress >= 1) {
        this.isSwinging = false;
        this.swingProgress = 0;
      } else {
        const s = Math.sin(this.swingProgress * Math.PI);
        swingRotX = -s * 0.55;
        swingRotZ = s * 0.25;
      }
    }

    this.fpArmGroup.position.set(0.46 + bobX, -0.38 - bobY, -0.62);
    if (this.fpArmMesh) {
      this.fpArmMesh.rotation.x = -Math.PI / 3 + swingRotX;
      this.fpArmMesh.rotation.z = -0.18 + swingRotZ;
    }
  }
}
