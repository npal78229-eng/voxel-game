import * as THREE from 'three';
import {
  createGoldenSunsetRimShader,
  createTranslucentWingShader,
  GoldenSunsetAtmosphere,
} from './shaders/GoldenSunsetShaderSystem.js';

// ============================================================================
// DragonFlightSystem.js — Soaring Golden Wyvern Flight Combat System
// Recreates the third-person dragon soaring flight, animated flapping wings,
// fireball breath attacks, hexagonal saddle HUD, and minimap radar
// from the viral Golden Sunset Dragon Rider showcase (@enderlulz).
// ============================================================================

export class DragonFlightSystem {
  constructor(scene, camera, renderer, world) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.world = world;

    this.isActive = false;
    this.mountGroup = new THREE.Group();
    this.mountGroup.name = 'Golden_Wyvern_Mount_Rig';
    this.mountGroup.visible = false;
    this.scene.add(this.mountGroup);

    // Flight Dynamics
    this.position = new THREE.Vector3(0, 95, 0);
    this.velocity = new THREE.Vector3();
    this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
    this.quaternion = new THREE.Quaternion();

    this.speedKmh = 120; // Cruise speed ~120 km/h (33 m/s)
    this.minSpeedKmh = 65;
    this.maxSpeedKmh = 210;
    this.stamina = 100;
    this.maxStamina = 100;
    this.health = 20;
    this.maxHealth = 20;

    this.pitchRate = 0;
    this.rollRate = 0;
    this.yawRate = 0;

    // Wing & Undulation Kinematics
    this.wingFlapPhase = 0;
    this.wingFlapSpeed = 6.2; // Rad/s
    this.tailSwayPhase = 0;
    this.leftWingRoot = null;
    this.rightWingRoot = null;
    this.leftWingElbow = null;
    this.rightWingElbow = null;
    this.tailNodes = [];

    // Combat & Projectiles
    this.fireballs = [];
    this.fireSurges = [];
    this.fireballCooldown = 0;
    this.fireballAmmo = 8;
    this.roarCooldown = 0;

    // Camera & Controls State
    this.keys = {};
    this.mouseOffset = { x: 0, y: 0 };
    this.mouseLookAhead = { x: 0, y: 0 };
    this.isFreeLooking = false;
    this.freeLookYaw = 0;
    this.freeLookPitch = 0;
    this.rightMouseDown = false;
    this.rightMouseDownTime = 0;
    this.camQuat = null;

    // Audio Engine
    this.audioCtx = null;
    this.wingFlapGain = null;
    this.windGain = null;

    // Golden Sunset Sky Atmosphere
    this.sunsetAtmosphere = null;

    // Build Model, HUD & Events
    this.initMaterials();
    this.buildWyvernMountModel();
    this.createDragonHUD();
    this.bindEvents();
  }

  initMaterials() {
    this.mats = {
      scales: createGoldenSunsetRimShader({
        baseColor: 0x14181c, // Dark obsidian scales matching reel silhouette
        rimColor: 0xffa033,  // Warm golden sunset rim light
        rimPower: 2.6,
        rimStrength: 2.2,
        roughness: 0.52,
        metalness: 0.28,
      }),
      underbelly: createGoldenSunsetRimShader({
        baseColor: 0x2c1f17, // Warm dark chestnut dorsal underbelly
        rimColor: 0xff9020,
        rimPower: 3.0,
        rimStrength: 1.6,
        roughness: 0.65,
        metalness: 0.15,
      }),
      horns: createGoldenSunsetRimShader({
        baseColor: 0x09090b,
        rimColor: 0xffaa44,
        rimPower: 2.4,
        rimStrength: 2.5,
        roughness: 0.35,
        metalness: 0.40,
      }),
      membrane: createTranslucentWingShader({
        baseColor: 0x241610,
        backlitColor: 0xff8815,
      }),
      eyeGlow: new THREE.MeshBasicMaterial({
        color: 0xffaa11, // Piercing amber eye glow
      }),
      saddle: new THREE.MeshStandardMaterial({
        color: 0x4a2810, // Rich saddle leather
        roughness: 0.45,
        metalness: 0.10,
      }),
      brass: new THREE.MeshStandardMaterial({
        color: 0xe5a828,
        roughness: 0.25,
        metalness: 0.85,
      }),
      fireballMat: new THREE.MeshBasicMaterial({
        color: 0xffaa22,
      }),
      fireTrailMat: new THREE.MeshBasicMaterial({
        color: 0xff4400,
        transparent: true,
        opacity: 0.75,
      }),
    };
  }

  /**
   * Constructs an authentic, proportional 3D Wyvern Mount model matching the reference reel:
   * Sinuous serpentine body, horned draconic head, saddle & harness, and articulated flapping wings.
   */
  buildWyvernMountModel() {
    const root = new THREE.Group();

    // 1. Main Torso
    const torsoGeo = new THREE.BoxGeometry(1.4, 1.2, 2.8);
    const torso = new THREE.Mesh(torsoGeo, this.mats.scales);
    torso.castShadow = true;
    root.add(torso);

    const bellyGeo = new THREE.BoxGeometry(1.1, 0.4, 2.5);
    const belly = new THREE.Mesh(bellyGeo, this.mats.underbelly);
    belly.position.set(0, -0.45, 0.1);
    torso.add(belly);

    // Spine Plates & Ridge Spikes
    for (let zOff = -1.0; zOff <= 1.0; zOff += 0.5) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.45, 4), this.mats.horns);
      spike.position.set(0, 0.8, zOff);
      spike.rotation.x = -0.25;
      torso.add(spike);
    }

    // 2. Rider Saddle & Harness (Matches the saddle icon in the bottom-left RPG HUD!)
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.95), this.mats.saddle);
    saddle.position.set(0, 0.68, 0.2);
    const cantle = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.35, 0.2), this.mats.saddle);
    cantle.position.set(0, 0.85, -0.25);
    const pommel = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.30, 0.18), this.mats.saddle);
    pommel.position.set(0, 0.82, 0.6);
    torso.add(saddle, cantle, pommel);

    [-0.72, 0.72].forEach((bx) => {
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.15), this.mats.brass);
      buckle.position.set(bx, 0.1, 0.2);
      torso.add(buckle);
    });

    // 3. Articulated Neck & Horned Head
    this.neckGroup = new THREE.Group();
    this.neckGroup.position.set(0, 0.3, 1.4);

    const neckBase = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 1.2), this.mats.scales);
    neckBase.position.set(0, 0.3, 0.5);
    neckBase.rotation.x = 0.35;
    this.neckGroup.add(neckBase);

    const neckMid = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 1.1), this.mats.scales);
    neckMid.position.set(0, 0.75, 1.3);
    neckMid.rotation.x = 0.25;
    this.neckGroup.add(neckMid);

    // Draconic Skull
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.75, 1.4), this.mats.scales);
    head.position.set(0, 1.15, 2.2);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.55, 1.0), this.mats.scales);
    snout.position.set(0, 1.05, 3.1);
    const lowerJaw = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.28, 0.9), this.mats.underbelly);
    lowerJaw.position.set(0, 0.72, 2.9);
    this.neckGroup.add(head, snout, lowerJaw);

    // Piercing Glowing Amber Eyes
    [-0.48, 0.48].forEach((ex) => {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.3), this.mats.eyeGlow);
      eye.position.set(ex, 1.28, 2.4);
      this.neckGroup.add(eye);
    });

    // Majestic Crown Horns
    [-0.42, 0.42].forEach((hx, i) => {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.3, 5), this.mats.horns);
      horn.position.set(hx, 1.6, 1.8);
      horn.rotation.x = -0.7;
      horn.rotation.z = i === 0 ? 0.35 : -0.35;
      this.neckGroup.add(horn);
    });

    torso.add(this.neckGroup);

    // 4. Articulated Tail with Sinuous Rudder Fins
    this.tailNodes = [];
    let parentNode = torso;
    const tailConfigs = [
      { size: [0.9, 0.8, 1.4], pos: [0, -0.1, -1.8] },
      { size: [0.75, 0.65, 1.4], pos: [0, -0.1, -1.3] },
      { size: [0.55, 0.5, 1.5], pos: [0, -0.1, -1.3] },
      { size: [0.35, 0.35, 1.4], pos: [0, -0.05, -1.3] },
    ];

    tailConfigs.forEach((cfg, idx) => {
      const node = new THREE.Group();
      node.position.set(...cfg.pos);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...cfg.size), this.mats.scales);
      mesh.castShadow = true;
      node.add(mesh);
      parentNode.add(node);
      this.tailNodes.push(node);
      parentNode = node;

      // Tail Rudder Flukes at Tip
      if (idx === tailConfigs.length - 1) {
        const finH = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.9), this.mats.horns);
        finH.position.set(0, 0, -0.6);
        const finV = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.8), this.mats.horns);
        finV.position.set(0, 0.3, -0.5);
        node.add(finH, finV);
      }
    });

    // 5. Articulated Bat Wings (Left & Right with Shoulder, Elbow, Fingers, Membranes)
    this.leftWingRoot = new THREE.Group();
    this.leftWingRoot.position.set(-0.75, 0.35, 0.4);
    torso.add(this.leftWingRoot);

    this.rightWingRoot = new THREE.Group();
    this.rightWingRoot.position.set(0.75, 0.35, 0.4);
    torso.add(this.rightWingRoot);

    this.buildWingStructure(this.leftWingRoot, -1);
    this.buildWingStructure(this.rightWingRoot, 1);

    // 6. Rear Talon Legs (Folded back aerodynamically)
    [-0.7, 0.7].forEach((lx) => {
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.8, 0.45), this.mats.scales);
      thigh.position.set(lx, -0.4, -0.8);
      thigh.rotation.x = 0.6;
      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.9, 0.35), this.mats.scales);
      shin.position.set(lx, -0.8, -1.4);
      shin.rotation.x = -0.7;
      torso.add(thigh, shin);
    });

    this.mountGroup.add(root);
  }

  buildWingStructure(rootGroup, sideMult) {
    // Shoulder Humerus Bone
    const humerus = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.42, 0.42), this.mats.scales);
    humerus.position.set(sideMult * 1.1, 0.1, 0.1);
    humerus.rotation.z = sideMult * 0.18;
    rootGroup.add(humerus);

    // Elbow Pivot
    const elbow = new THREE.Group();
    elbow.position.set(sideMult * 2.2, 0.25, 0.15);
    rootGroup.add(elbow);
    if (sideMult < 0) this.leftWingElbow = elbow;
    else this.rightWingElbow = elbow;

    // Forearm Radius Bone
    const radius = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.35, 0.35), this.mats.scales);
    radius.position.set(sideMult * 1.4, -0.1, 0);
    radius.rotation.z = sideMult * -0.15;
    elbow.add(radius);

    // Thumb Claw at Joint
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 4), this.mats.horns);
    claw.position.set(0, 0.3, 0.2);
    claw.rotation.x = -0.4;
    elbow.add(claw);

    // Elongated Wing Fingers (Skeletal spars)
    [
      { len: 2.6, rotZ: sideMult * -0.35, rotX: -0.15, pos: [sideMult * 2.2, -0.5, -0.2] },
      { len: 2.4, rotZ: sideMult * -0.55, rotX: -0.25, pos: [sideMult * 1.8, -1.0, -0.3] },
      { len: 2.0, rotZ: sideMult * -0.75, rotX: -0.35, pos: [sideMult * 1.3, -1.5, -0.4] },
    ].forEach((f, idx) => {
      const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.05, f.len, 4), this.mats.horns);
      finger.position.set(...f.pos);
      finger.rotation.z = f.rotZ;
      finger.rotation.x = f.rotX;
      elbow.add(finger);
    });

    // Broad Aerodynamic Wing Membrane Sails
    const innerSail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 0.05), this.mats.membrane);
    innerSail.position.set(sideMult * 1.2, -0.5, -0.1);
    innerSail.rotation.z = sideMult * 0.1;
    rootGroup.add(innerSail);

    const outerSail = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 0.05), this.mats.membrane);
    outerSail.position.set(sideMult * 1.6, -0.8, -0.2);
    outerSail.rotation.z = sideMult * -0.2;
    elbow.add(outerSail);
  }

  /**
   * Recreates the exact RPG Dragon Rider HUD from the reference reel:
   * 1. Bottom-Left Hexagonal Mount Slot (saddle icon) with Stamina (100/100) & Health (20/20) bars.
   * 2. Top-Right Circular Minimap Radar with compass points and elevation/coordinates.
   * 3. Bottom-Right Quiver Ammo Counter (crossed arrows).
   * 4. Center Flight Crosshair.
   */
  createDragonHUD() {
    this.hudContainer = document.createElement('div');
    this.hudContainer.id = 'dragon-rider-rpg-hud';
    this.hudContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 99998;
      display: none;
      font-family: 'Consolas', 'Courier New', monospace;
      user-select: none;
    `;

    this.hudContainer.innerHTML = `
      <!-- Golden Hour Ambient Vignette -->
      <div style="
        position: absolute;
        inset: 0;
        box-shadow: inset 0 0 130px rgba(180, 80, 10, 0.35), inset 0 0 70px rgba(0, 0, 0, 0.45);
        pointer-events: none;
      "></div>

      <!-- CENTER FLIGHT RETICLE -->
      <div style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
      ">
        <div style="
          width: 44px;
          height: 44px;
          border: 2px solid rgba(255, 215, 120, 0.85);
          border-radius: 50%;
          margin: 0 auto;
          position: relative;
          box-shadow: 0 0 10px rgba(255, 170, 40, 0.6);
        ">
          <div style="position: absolute; top: -5px; left: 50%; width: 2px; height: 5px; background: #ffe082; transform: translateX(-50%);"></div>
          <div style="position: absolute; bottom: -5px; left: 50%; width: 2px; height: 5px; background: #ffe082; transform: translateX(-50%);"></div>
          <div style="position: absolute; left: -5px; top: 50%; width: 5px; height: 2px; background: #ffe082; transform: translateY(-50%);"></div>
          <div style="position: absolute; right: -5px; top: 50%; width: 5px; height: 2px; background: #ffe082; transform: translateY(-50%);"></div>
          <div style="position: absolute; top: 50%; left: 50%; width: 4px; height: 4px; background: #ffaa00; border-radius: 50%; transform: translate(-50%, -50%); box-shadow: 0 0 6px #ff8800;"></div>
        </div>
        <div style="margin-top: 6px; font-size: 11px; color: #ffeb3b; text-shadow: 1px 1px 2px #000; letter-spacing: 0.5px; font-weight: bold;">
          WYVERN FIREBALL <span id="hud-dragon-fireball-ammo">8x</span>
        </div>
        <div style="font-size: 9px; color: #ffe082; text-shadow: 1px 1px 2px #000; margin-top: 2px;">
          [L-CLICK] Fireball &bull; [SPACE] Dive Boost &bull; [R-CLICK / ALT] Free-Look &bull; [F8] Exit
        </div>
      </div>

      <!-- BOTTOM LEFT: RPG HEXAGONAL MOUNT TRAY & DUAL RESOURCE BARS (Matching Reel Screenshot!) -->
      <div style="
        position: absolute;
        bottom: 28px;
        left: 32px;
        display: flex;
        align-items: center;
        gap: 14px;
      ">
        <!-- Hexagonal Mount Slot (with Saddle / Wyvern Icon) -->
        <div style="position: relative; width: 64px; height: 64px; display: flex; align-items: center; justify-content: center;">
          <div style="
            width: 58px;
            height: 58px;
            background: rgba(30, 20, 15, 0.88);
            border: 2px solid #e5a828;
            transform: rotate(45deg);
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.7), inset 0 0 8px rgba(229, 168, 40, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <div style="transform: rotate(-45deg); font-size: 24px; filter: drop-shadow(0 2px 4px #000);">
              🐎
            </div>
          </div>
        </div>

        <!-- Dual Resource Bars (Top: Stamina 100/100, Bottom: Health 20/20) -->
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <!-- Top: Dragon Stamina / Energy Bar (Glowing Amber) -->
          <div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: bold; color: #ffb300; text-shadow: 1px 1px 2px #000; margin-bottom: 2px;">
              <span>STAMINA</span>
              <span id="dragon-stamina-text">100/100</span>
            </div>
            <div style="width: 170px; height: 9px; background: rgba(0,0,0,0.7); border: 1px solid #ffb300; border-radius: 3px; overflow: hidden; box-shadow: 0 0 6px rgba(255, 179, 0, 0.35);">
              <div id="dragon-stamina-bar" style="width: 100%; height: 100%; background: linear-gradient(90deg, #ff8f00, #ffca28);"></div>
            </div>
          </div>

          <!-- Bottom: Rider & Mount Health Bar (Crimson Red) -->
          <div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: bold; color: #ef4444; text-shadow: 1px 1px 2px #000; margin-bottom: 2px;">
              <span>HEALTH</span>
              <span id="dragon-health-text">20/20</span>
            </div>
            <div style="width: 170px; height: 9px; background: rgba(0,0,0,0.7); border: 1px solid #ef4444; border-radius: 3px; overflow: hidden; box-shadow: 0 0 6px rgba(239, 68, 68, 0.35);">
              <div id="dragon-health-bar" style="width: 100%; height: 100%; background: linear-gradient(90deg, #b91c1c, #ef4444);"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- TOP RIGHT: CIRCULAR MINIMAP RADAR & CARDINAL COMPASS (Matching Reel Screenshot!) -->
      <div style="
        position: absolute;
        top: 24px;
        right: 28px;
        display: flex;
        flex-direction: column;
        align-items: center;
      ">
        <div style="
          width: 118px;
          height: 118px;
          border-radius: 50%;
          background: rgba(18, 28, 38, 0.90);
          border: 3px solid rgba(255, 215, 120, 0.85);
          position: relative;
          box-shadow: 0 4px 18px rgba(0, 0, 0, 0.75), inset 0 0 12px rgba(0, 0, 0, 0.6);
          overflow: hidden;
        ">
          <!-- Compass Dial Ring -->
          <div id="dragon-minimap-compass" style="
            width: 100%;
            height: 100%;
            position: absolute;
            transform-origin: center;
            transition: transform 0.05s linear;
          ">
            <div style="position: absolute; top: 4px; left: 50%; transform: translateX(-50%); font-size: 11px; font-weight: bold; color: #ef4444;">N</div>
            <div style="position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%); font-size: 10px; font-weight: bold; color: #fff;">S</div>
            <div style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); font-size: 10px; font-weight: bold; color: #fff;">E</div>
            <div style="position: absolute; left: 6px; top: 50%; transform: translateY(-50%); font-size: 10px; font-weight: bold; color: #fff;">W</div>
          </div>

          <!-- Radar Grid Lines -->
          <div style="position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: rgba(255,255,255,0.15);"></div>
          <div style="position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: rgba(255,255,255,0.15);"></div>
          <div style="position: absolute; top: 50%; left: 50%; width: 60px; height: 60px; border: 1px dashed rgba(255,255,255,0.25); border-radius: 50%; transform: translate(-50%, -50%);"></div>

          <!-- Player / Dragon Position Blip in Center -->
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            width: 8px;
            height: 8px;
            background: #ffaa00;
            border-radius: 50%;
            transform: translate(-50%, -50%);
            box-shadow: 0 0 8px #ff8800;
          "></div>
        </div>

        <!-- Coordinates and Realm Name Display -->
        <div style="
          margin-top: 6px;
          text-align: center;
          color: #ffffff;
          font-size: 10px;
          text-shadow: 1px 1px 2px #000;
          line-height: 1.35;
        ">
          <div style="color: #ffca28; font-weight: bold; letter-spacing: 0.5px;">SUNSET CALDERA</div>
          <div id="dragon-coords-text" style="color: #cbd5e1;">X: 0 &bull; Y: 95 &bull; Z: 0</div>
        </div>
      </div>

      <!-- BOTTOM RIGHT: QUIVER & CROSSED ARROWS AMMO COUNTER (Matching Reel Screenshot!) -->
      <div style="
        position: absolute;
        bottom: 28px;
        right: 32px;
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(25, 20, 15, 0.85);
        border: 1px solid rgba(255, 215, 120, 0.6);
        border-radius: 6px;
        padding: 8px 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.6);
      ">
        <span style="font-size: 22px; filter: drop-shadow(0 2px 3px #000);">🏹</span>
        <div style="display: flex; flex-direction: column;">
          <span style="font-size: 10px; color: #ffca28; font-weight: bold;">CHARGES</span>
          <span id="dragon-ammo-count" style="font-size: 14px; font-weight: 900; color: #ffffff;">8 / 8</span>
        </div>
      </div>
    `;

    document.body.appendChild(this.hudContainer);
  }

  bindEvents() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (!this.isActive) return;

      if (e.code === 'KeyV') {
        this.deployFireSurge();
      }
      if (e.code === 'KeyE') {
        this.triggerDragonRoar();
      }
      if (e.code === 'AltLeft' || e.code === 'AltRight') {
        this.isFreeLooking = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'AltLeft' || e.code === 'AltRight') {
        if (!this.rightMouseDown) {
          this.isFreeLooking = false;
        }
      }
    });

    window.addEventListener('contextmenu', (e) => {
      if (this.isActive) e.preventDefault();
    });

    window.addEventListener('mousedown', (e) => {
      if (!this.isActive) return;
      if (e.button === 0) {
        this.shootFireball();
      } else if (e.button === 2) {
        this.rightMouseDown = true;
        this.isFreeLooking = true;
        this.rightMouseDownTime = performance.now();
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (!this.isActive) return;
      if (e.button === 2) {
        const pressDuration = performance.now() - (this.rightMouseDownTime || 0);
        this.rightMouseDown = false;
        if (!this.keys['AltLeft'] && !this.keys['AltRight']) {
          this.isFreeLooking = false;
        }
        // Quick right-click tap triggers dragon roar ability!
        if (pressDuration < 240 && Math.abs(this.freeLookYaw) < 0.12 && Math.abs(this.freeLookPitch) < 0.12) {
          this.triggerDragonRoar();
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isActive || !document.pointerLockElement) return;

      if (this.isFreeLooking || this.rightMouseDown || this.keys['AltLeft'] || this.keys['AltRight']) {
        // 360-degree free-look camera mode around soaring wyvern
        this.freeLookYaw -= e.movementX * 0.0032;
        this.freeLookPitch = Math.max(-1.3, Math.min(1.3, this.freeLookPitch - e.movementY * 0.0032));
      } else {
        // Responsive flight steering
        this.mouseOffset.x += e.movementX * 0.0022;
        this.mouseOffset.y += e.movementY * 0.0022;
        this.mouseOffset.x = Math.max(-1.6, Math.min(1.6, this.mouseOffset.x));
        this.mouseOffset.y = Math.max(-1.6, Math.min(1.6, this.mouseOffset.y));

        this.mouseLookAhead.x = Math.max(-0.45, Math.min(0.45, this.mouseLookAhead.x - e.movementX * 0.0006));
        this.mouseLookAhead.y = Math.max(-0.35, Math.min(0.35, this.mouseLookAhead.y - e.movementY * 0.0006));
      }
    });
  }

  initAudio() {
    if (this.audioCtx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtx();

      // Atmospheric flight wind rumble
      this.windOsc = this.audioCtx.createOscillator();
      this.windOsc.type = 'sine';
      this.windOsc.frequency.setValueAtTime(80, this.audioCtx.currentTime);

      this.windGain = this.audioCtx.createGain();
      this.windGain.gain.setValueAtTime(0.06, this.audioCtx.currentTime);

      this.windOsc.connect(this.windGain);
      this.windGain.connect(this.audioCtx.destination);
      this.windOsc.start();
    } catch (e) {
      console.warn('[DragonFlightSystem] Audio init notice:', e);
    }
  }

  playRoarSound() {
    if (!this.audioCtx) return;
    try {
      const t = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.85);

      gain.gain.setValueAtTime(0.45, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.95);
    } catch {}
  }

  playFireballSound() {
    if (!this.audioCtx) return;
    try {
      const t = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(260, t);
      osc.frequency.exponentialRampToValueAtTime(60, t + 0.25);

      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.28);
    } catch {}
  }

  getForwardVector() {
    return new THREE.Vector3(0, 0, 1).applyEuler(this.rotation);
  }

  enterFlightMode(playerPosition, playerCamera) {
    if (this.isActive) return;
    this.isActive = true;
    this.initAudio();

    // Spawn dragon soaring in the golden sunset airspace
    const startY = Math.max(85, playerPosition.y + 35);
    this.position.set(playerPosition.x, startY, playerPosition.z);
    this.rotation.set(0, playerCamera ? playerCamera.rotation.y : 0, 0);
    this.mountGroup.position.copy(this.position);
    this.mountGroup.rotation.copy(this.rotation);
    this.mountGroup.visible = true;

    // Reset controls state
    this.isFreeLooking = false;
    this.freeLookYaw = 0;
    this.freeLookPitch = 0;
    this.mouseLookAhead.x = 0;
    this.mouseLookAhead.y = 0;
    this.camQuat = new THREE.Quaternion().copy(this.mountGroup.quaternion);

    // Camera near plane optimization
    if (this.camera) {
      this.camera.near = 0.35;
      this.camera.far = 1400;
      this.camera.updateProjectionMatrix();
    }

    // Set world render radius to 8 chunks for expansive open flight
    if (this.world && typeof this.world.setRenderRadius === 'function') {
      this.world.setRenderRadius(8);
    }

    // Apply Golden Sunset Atmosphere & Lighting
    if (!this.sunsetAtmosphere) {
      this.sunsetAtmosphere = new GoldenSunsetAtmosphere(this.scene);
    }
    this.sunsetAtmosphere.group.visible = true;

    // Golden Sunset scene fog & background
    const sunsetGoldColor = new THREE.Color(0xf5a32b);
    this.scene.background = sunsetGoldColor;
    if (this.scene.fog && this.scene.fog.isFog) {
      this.scene.fog.color.copy(sunsetGoldColor);
      this.scene.fog.near = 260;
      this.scene.fog.far = 1100;
    } else {
      this.scene.fog = new THREE.Fog(0xf5a32b, 260, 1100);
    }

    // Snap camera to third-person dragon chase position
    const camOffset = new THREE.Vector3(0, 2.4, -7.5).applyQuaternion(this.camQuat);
    this.camera.position.copy(this.position).add(camOffset);
    const forward = this.getForwardVector();
    this.camera.lookAt(this.position.clone().addScaledVector(forward, 35.0).add(new THREE.Vector3(0, 1.2, 0)));

    if (this.hudContainer) {
      this.hudContainer.style.display = 'block';
    }

    console.log('[DragonFlightSystem] Mounted Soaring Golden Wyvern in Golden Sunset Airspace.');
  }

  exitFlightMode(playerControls) {
    if (!this.isActive) return;
    this.isActive = false;
    this.mountGroup.visible = false;

    if (this.camera) {
      this.camera.near = 0.05;
      this.camera.far = 1200;
      this.camera.updateProjectionMatrix();
    }

    if (this.world && typeof this.world.setRenderRadius === 'function') {
      this.world.setRenderRadius(4);
    }

    if (this.sunsetAtmosphere) {
      this.sunsetAtmosphere.group.visible = false;
    }

    if (this.hudContainer) {
      this.hudContainer.style.display = 'none';
    }

    if (this.windGain && this.audioCtx) {
      this.windGain.gain.setValueAtTime(0.0, this.audioCtx.currentTime);
    }

    if (playerControls) {
      playerControls.playerPosition.copy(this.position);
      playerControls.syncFromCamera();
    }
    console.log('[DragonFlightSystem] Dismounted Wyvern.');
  }

  shootFireball() {
    if (this.fireballCooldown > 0 || this.fireballAmmo <= 0) return;
    this.fireballCooldown = 0.45;
    this.fireballAmmo--;

    this.playFireballSound();

    const ammoEl = document.getElementById('hud-dragon-fireball-ammo');
    const ammoCountEl = document.getElementById('dragon-ammo-count');
    if (ammoEl) ammoEl.innerText = `${this.fireballAmmo}x`;
    if (ammoCountEl) ammoCountEl.innerText = `${this.fireballAmmo} / 8`;

    // Spawn explosive plasma fireball projectile
    const forward = this.getForwardVector();
    const spawnPos = this.position.clone().addScaledVector(forward, 3.5).add(new THREE.Vector3(0, 0.8, 0));

    const fireball = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 8), this.mats.fireballMat);
    fireball.position.copy(spawnPos);
    fireball.userData = {
      velocity: forward.clone().multiplyScalar(68.0),
      life: 3.5,
    };
    this.scene.add(fireball);
    this.fireballs.push(fireball);

    // Recharge ammunition
    setTimeout(() => {
      if (this.fireballAmmo < 8) {
        this.fireballAmmo++;
        if (ammoEl) ammoEl.innerText = `${this.fireballAmmo}x`;
        if (ammoCountEl) ammoCountEl.innerText = `${this.fireballAmmo} / 8`;
      }
    }, 3500);
  }

  triggerDragonRoar() {
    if (this.roarCooldown > 0) return;
    this.roarCooldown = 6.0;

    this.playRoarSound();

    // Visual Shockwave Ring expanding outwards
    const ringGeo = new THREE.RingGeometry(1.0, 1.8, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffaa22,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(this.position);
    ring.quaternion.copy(this.mountGroup.quaternion);
    this.scene.add(ring);

    // Speed burst
    this.speedKmh = Math.min(this.maxSpeedKmh, this.speedKmh + 45);

    let scale = 1.0;
    const interval = setInterval(() => {
      scale += 2.8;
      ring.scale.set(scale, scale, scale);
      ringMat.opacity -= 0.05;
      if (ringMat.opacity <= 0) {
        clearInterval(interval);
        this.scene.remove(ring);
      }
    }, 30);
  }

  deployFireSurge() {
    // Eject fiery burst particles backwards
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 6), this.mats.fireTrailMat);
      const backward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.mountGroup.quaternion);
      const side = new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 2, 0);

      p.position.copy(this.position).addScaledVector(backward, 2.5);
      p.userData = {
        velocity: backward.clone().multiplyScalar(-18).add(side),
        life: 2.2,
      };
      this.scene.add(p);
      this.fireSurges.push(p);
    }
  }

  /**
   * Main per-frame update loop for dragon flight dynamics, wing flapping animation,
   * camera follow, stamina consumption, and RPG HUD.
   */
  update(deltaTime) {
    if (!this.isActive) return;

    // 1. Flight Control Input Processing
    let targetPitch = 0;
    let targetRoll = 0;
    let targetYaw = 0;

    if (this.keys['KeyW']) targetPitch -= 0.85;
    if (this.keys['KeyS']) targetPitch += 0.85;

    if (this.keys['KeyA']) {
      targetRoll += 1.4;
      targetYaw += 0.7;
    }
    if (this.keys['KeyD']) {
      targetRoll -= 1.4;
      targetYaw -= 0.7;
    }

    if (!this.isFreeLooking) {
      targetPitch += this.mouseOffset.y * 1.3;
      targetRoll -= this.mouseOffset.x * 1.8;
      targetYaw -= this.mouseOffset.x * 0.95;
    }

    this.mouseOffset.x *= Math.pow(0.04, deltaTime * 8);
    this.mouseOffset.y *= Math.pow(0.04, deltaTime * 8);

    if (!this.isFreeLooking) {
      const spring = Math.min(1.0, deltaTime * 8.0);
      this.freeLookYaw += (0 - this.freeLookYaw) * spring;
      this.freeLookPitch += (0 - this.freeLookPitch) * spring;
      this.mouseLookAhead.x += (0 - this.mouseLookAhead.x) * spring;
      this.mouseLookAhead.y += (0 - this.mouseLookAhead.y) * spring;
    }

    // Dive Boost (Space) & Hover Gliding (Shift)
    let isBoosting = false;
    let targetKmh = 120; // Normal cruise 120 km/h (33 m/s)

    if (this.keys['Space'] && this.stamina > 0) {
      isBoosting = true;
      targetKmh = 185;
      this.stamina = Math.max(0, this.stamina - deltaTime * 18.0); // Deplete stamina on boost
    } else if (this.keys['ShiftLeft'] || this.keys['ShiftRight']) {
      targetKmh = 75; // Hover glide
      this.stamina = Math.min(this.maxStamina, this.stamina + deltaTime * 14.0); // Regenerate stamina on glide
    } else {
      this.stamina = Math.min(this.maxStamina, this.stamina + deltaTime * 8.0);
    }

    this.speedKmh += (targetKmh - this.speedKmh) * deltaTime * 1.8;

    // Rate smoothing
    this.pitchRate += (targetPitch - this.pitchRate) * deltaTime * 4.2;
    this.rollRate += (targetRoll - this.rollRate) * deltaTime * 5.2;
    this.yawRate += (targetYaw - this.yawRate) * deltaTime * 3.6;

    this.rotation.x += this.pitchRate * deltaTime;
    this.rotation.y += this.yawRate * deltaTime;
    this.rotation.z += this.rollRate * deltaTime;

    // Self-righting roll damping
    this.rotation.z *= Math.pow(0.86, deltaTime * 10);

    this.mountGroup.rotation.copy(this.rotation);
    const forward = this.getForwardVector();

    // Cinematic translation speed (matches reference reel)
    const speedMs = (this.speedKmh / 3.6) * 0.82;
    this.velocity.copy(forward).multiplyScalar(speedMs);
    this.position.addScaledVector(this.velocity, deltaTime);

    // Floor clamp above cloud sea
    const minAltitude = 28;
    if (this.position.y < minAltitude) {
      this.position.y = minAltitude;
      this.rotation.x = Math.max(0.12, this.rotation.x);
    }
    this.mountGroup.position.copy(this.position);

    // 2. Animated Wing Flapping & Sinuous Tail Kinematics
    // When boosting/diving: wings delta-tuck back
    // When cruising: smooth flapping cycle
    if (isBoosting) {
      // Aerodynamic Wing Tuck
      const tuckAngle = 0.45;
      if (this.leftWingRoot) this.leftWingRoot.rotation.z = tuckAngle;
      if (this.rightWingRoot) this.rightWingRoot.rotation.z = -tuckAngle;
      if (this.leftWingElbow) this.leftWingElbow.rotation.y = 0.4;
      if (this.rightWingElbow) this.rightWingElbow.rotation.y = -0.4;
    } else {
      this.wingFlapPhase += deltaTime * this.wingFlapSpeed;
      const flapAngle = Math.sin(this.wingFlapPhase) * 0.52;
      const elbowAngle = Math.cos(this.wingFlapPhase) * 0.35;

      if (this.leftWingRoot) this.leftWingRoot.rotation.z = flapAngle;
      if (this.rightWingRoot) this.rightWingRoot.rotation.z = -flapAngle;
      if (this.leftWingElbow) this.leftWingElbow.rotation.z = elbowAngle;
      if (this.rightWingElbow) this.rightWingElbow.rotation.z = -elbowAngle;
    }

    // Sinuous undulating tail sway
    this.tailSwayPhase += deltaTime * 3.8;
    this.tailNodes.forEach((node, i) => {
      node.rotation.y = Math.sin(this.tailSwayPhase + i * 0.8) * 0.18 + this.yawRate * 0.2;
    });

    // 3. Zero-Jitter Kinematic Camera Chase Follow
    if (!this.camQuat) {
      this.camQuat = new THREE.Quaternion().copy(this.mountGroup.quaternion);
    }
    this.camQuat.slerp(this.mountGroup.quaternion, Math.min(1.0, deltaTime * 10.0));

    const totalYaw = this.freeLookYaw + (this.isFreeLooking ? 0 : this.mouseLookAhead.x);
    const totalPitch = this.freeLookPitch + (this.isFreeLooking ? 0 : this.mouseLookAhead.y);
    const lookRot = new THREE.Euler(totalPitch, totalYaw, 0, 'YXZ');
    const lookQuat = new THREE.Quaternion().setFromEuler(lookRot);
    const totalCamQuat = this.camQuat.clone().multiply(lookQuat);

    // Camera offset: 7.5m behind, 2.4m elevated
    const camOffset = new THREE.Vector3(0, 2.4, -7.5).applyQuaternion(totalCamQuat);
    this.camera.position.copy(this.position).add(camOffset);

    const lookTarget = this.position.clone().addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(totalCamQuat), 35.0).add(new THREE.Vector3(0, 1.2, 0));
    this.camera.lookAt(lookTarget);

    // 4. Update Projectiles & Cooldowns
    if (this.fireballCooldown > 0) this.fireballCooldown -= deltaTime;
    if (this.roarCooldown > 0) this.roarCooldown -= deltaTime;

    // Update Fireballs
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const fb = this.fireballs[i];
      fb.position.addScaledVector(fb.userData.velocity, deltaTime);
      fb.userData.life -= deltaTime;
      if (fb.userData.life <= 0 || fb.position.y <= 0) {
        this.scene.remove(fb);
        this.fireballs.splice(i, 1);
      }
    }

    // Update Fire Surges
    for (let i = this.fireSurges.length - 1; i >= 0; i--) {
      const fs = this.fireSurges[i];
      fs.position.addScaledVector(fs.userData.velocity, deltaTime);
      fs.userData.life -= deltaTime;
      fs.scale.multiplyScalar(0.96);
      if (fs.userData.life <= 0) {
        this.scene.remove(fs);
        this.fireSurges.splice(i, 1);
      }
    }

    // 5. Update Sunset Atmosphere position
    if (this.sunsetAtmosphere) {
      this.sunsetAtmosphere.update(deltaTime, this.position);
    }

    // 6. Update RPG Dragon Rider HUD
    const staminaBarEl = document.getElementById('dragon-stamina-bar');
    const staminaTextEl = document.getElementById('dragon-stamina-text');
    if (staminaBarEl) {
      staminaBarEl.style.width = `${Math.round(this.stamina)}%`;
    }
    if (staminaTextEl) {
      staminaTextEl.innerText = `${Math.round(this.stamina)}/100`;
    }

    const coordsTextEl = document.getElementById('dragon-coords-text');
    if (coordsTextEl) {
      coordsTextEl.innerText = `X: ${Math.round(this.position.x)} • Y: ${Math.round(this.position.y)} • Z: ${Math.round(this.position.z)}`;
    }

    const minimapCompassEl = document.getElementById('dragon-minimap-compass');
    if (minimapCompassEl) {
      const deg = (this.rotation.y * 180) / Math.PI;
      minimapCompassEl.style.transform = `rotate(${-deg}deg)`;
    }
  }
}
