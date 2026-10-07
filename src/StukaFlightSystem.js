import * as THREE from 'three';
import {
  createBasePBRShader,
  createBioluminescentEmissionShader,
  createCanopyRefractionShader,
} from './shaders/ReelShaderSystem.js';

// ============================================================================
// StukaFlightSystem.js — Authentic WWII Stuka Ju 87 Flight Combat System
// Recreates the dogfight flight mechanics, inverted gull-wing aircraft model,
// twin 7.92mm MG-17 machine guns, dive bombing siren, flares, and tactical HUD
// from the viral Sky Leviathan dogfight showcase.
// ============================================================================

export class StukaFlightSystem {
  constructor(scene, camera, renderer, world) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.world = world;

    this.isActive = false;
    this.planeGroup = new THREE.Group();
    this.planeGroup.name = 'Stuka_Ju87_Aircraft';
    this.planeGroup.visible = false;
    this.scene.add(this.planeGroup);

    // Flight Dynamics
    this.position = new THREE.Vector3(0, 55, 0);
    this.velocity = new THREE.Vector3();
    this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
    this.quaternion = new THREE.Quaternion();

    this.speedKmh = 176; // Cruise speed 176 km/h as seen in HUD
    this.minSpeedKmh = 95;
    this.maxSpeedKmh = 245;
    this.throttle = 0.72; // 0.0 to 1.0
    this.boostTimer = 0;

    this.pitchRate = 0;
    this.rollRate = 0;
    this.yawRate = 0;

    // Weapons
    this.bullets = [];
    this.bombs = [];
    this.flares = [];
    this.flareCount = 8;
    this.flareCooldown = 0;
    this.mgCooldown = 0;
    this.activeWeaponSlot = 1; // 1: 7.92mm MG-17, 2: 250kg Bomb, 3: Rockets

    // Input States
    this.keys = {};
    this.mouseOffset = { x: 0, y: 0 };
    this.isFiring = false;

    // Free Look & Camera Kinematics (Zero-Jitter Camera Tracking)
    this.isFreeLooking = false;
    this.freeLookYaw = 0;
    this.freeLookPitch = 0;
    this.mouseLookAhead = { x: 0, y: 0 };
    this.rightMouseDown = false;
    this.rightMouseDownTime = 0;
    this.camQuat = null;

    // Propeller & Animation
    this.propellerMesh = null;
    this.propellerAngle = 0;

    // Audio Engine
    this.audioCtx = null;
    this.engineGain = null;
    this.engineOsc = null;
    this.sirenGain = null;
    this.sirenOsc = null;

    // Build the 3D Stuka & HUD
    this.initMaterials();
    this.buildStukaJu87Model();
    this.createFlightHUD();
    this.bindEvents();
  }

  initMaterials() {
    this.mats = {
      fuselage: new THREE.MeshStandardMaterial({
        color: 0x3d4e3d, // Authentic Luftwaffe Dark Camo Olive Green
        roughness: 0.52,
        metalness: 0.22,
      }),
      underside: new THREE.MeshStandardMaterial({
        color: 0x8298a8, // Authentic Hellblau Light Blue-Grey
        roughness: 0.48,
        metalness: 0.18,
      }),
      yellowAccent: new THREE.MeshStandardMaterial({
        color: 0xf59e0b, // Eastern Front Yellow Cowling & Wingtips
        roughness: 0.40,
        metalness: 0.12,
      }),
      canopy: new THREE.MeshStandardMaterial({
        color: 0xa8cce8,
        transparent: true,
        opacity: 0.48,
        roughness: 0.12,
        metalness: 0.15,
        depthWrite: false,
      }),
      canopyFrame: new THREE.MeshStandardMaterial({
        color: 0x1c221c,
        roughness: 0.75,
      }),
      engineMetal: new THREE.MeshStandardMaterial({
        color: 0x22262a,
        roughness: 0.35,
        metalness: 0.85,
      }),
      propeller: new THREE.MeshStandardMaterial({
        color: 0x181c18,
        roughness: 0.55,
      }),
      propellerBlur: new THREE.MeshBasicMaterial({
        color: 0xd8ded8,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      crossWhite: new THREE.MeshBasicMaterial({
        color: 0xffffff,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
      crossBlack: new THREE.MeshBasicMaterial({
        color: 0x111111,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      tracer: createBioluminescentEmissionShader({
        emissionColor: 0xffea55,
        coreColor: 0xffffff,
        emissionStrength: 4.5,
      }),
      flareMat: createBioluminescentEmissionShader({
        emissionColor: 0xffffff,
        coreColor: 0xffedd5,
        emissionStrength: 5.5,
      }),
      bombMat: new THREE.MeshStandardMaterial({
        color: 0x475143,
        roughness: 0.65,
        metalness: 0.45,
      }),
    };
  }

  /**
   * Constructs an authentic, proportional 3D model of the Junkers Ju 87 Stuka
   * featuring inverted gull wings, forward wheel spats, dive siren, Balkenkreuz crosses, and spinning propeller.
   */
  buildStukaJu87Model() {
    const root = new THREE.Group();

    // 1. Main Fuselage (6.2m length, streamlined oval)
    const fuseGeo = new THREE.CylinderGeometry(0.56, 0.28, 6.2, 14);
    fuseGeo.rotateX(Math.PI * 0.5);
    const fuselage = new THREE.Mesh(fuseGeo, this.mats.fuselage);
    fuselage.castShadow = true;
    fuselage.receiveShadow = true;
    root.add(fuselage);

    // Engine Cowling Nose (Points FORWARD to +Z!)
    const cowlGeo = new THREE.ConeGeometry(0.56, 1.2, 14);
    cowlGeo.rotateX(Math.PI * 0.5); // Apex points forward (+Z)!
    const cowl = new THREE.Mesh(cowlGeo, this.mats.yellowAccent);
    cowl.position.set(0, 0, 3.7);
    cowl.castShadow = true;
    root.add(cowl);

    // 2. Greenhouse Cockpit Canopy
    const canopyGeo = new THREE.BoxGeometry(0.72, 0.64, 2.3);
    const canopy = new THREE.Mesh(canopyGeo, this.mats.canopy);
    canopy.position.set(0, 0.52, 0.6);
    root.add(canopy);

    // Dark Canopy Frames
    for (let zOff = -0.8; zOff <= 0.8; zOff += 0.4) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.68, 0.06), this.mats.canopyFrame);
      frame.position.set(0, 0.52, 0.6 + zOff);
      root.add(frame);
    }
    // Radio antenna mast
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 6), this.mats.canopyFrame);
    mast.position.set(0, 0.95, -0.4);
    mast.rotation.x = -0.2;
    root.add(mast);

    // 3. Inverted Gull Wings (The Signature Stuka Cranked Wings)
    // Left Wing: Inner section cranked down, outer section cranked up
    const wingInnerL = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, 1.6), this.mats.fuselage);
    wingInnerL.position.set(-1.2, -0.24, 0.8);
    wingInnerL.rotation.z = 0.28; // Anhedral down
    wingInnerL.castShadow = true;
    root.add(wingInnerL);

    const wingOuterL = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 1.3), this.mats.fuselage);
    wingOuterL.position.set(-3.8, 0.16, 0.7);
    wingOuterL.rotation.z = -0.14; // Dihedral up
    wingOuterL.castShadow = true;
    const wingTipL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 1.2), this.mats.yellowAccent);
    wingTipL.position.set(-5.6, 0.38, 0.65);
    wingTipL.rotation.z = -0.14;
    wingTipL.castShadow = true;
    root.add(wingOuterL, wingTipL);

    // Right Wing: Mirror of left wing
    const wingInnerR = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, 1.6), this.mats.fuselage);
    wingInnerR.position.set(1.2, -0.24, 0.8);
    wingInnerR.rotation.z = -0.28;
    wingInnerR.castShadow = true;
    root.add(wingInnerR);

    const wingOuterR = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 1.3), this.mats.fuselage);
    wingOuterR.position.set(3.8, 0.16, 0.7);
    wingOuterR.rotation.z = 0.14;
    wingOuterR.castShadow = true;
    const wingTipR = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 1.2), this.mats.yellowAccent);
    wingTipR.position.set(5.6, 0.38, 0.65);
    wingTipR.rotation.z = 0.14;
    wingTipR.castShadow = true;
    root.add(wingOuterR, wingTipR);

    // Balkenkreuz Crosses on Left & Right wings (Parented directly to wings with positive surface offset to eliminate clipping & Z-fighting)
    const crossWL = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), this.mats.crossWhite);
    crossWL.rotation.x = -Math.PI * 0.5;
    crossWL.position.set(0.2, 0.063, 0);
    const crossBL = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.65), this.mats.crossBlack);
    crossBL.rotation.x = -Math.PI * 0.5;
    crossBL.position.set(0.2, 0.065, 0);
    wingOuterL.add(crossWL, crossBL);

    const crossWR = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), this.mats.crossWhite);
    crossWR.rotation.x = -Math.PI * 0.5;
    crossWR.position.set(-0.2, 0.063, 0);
    const crossBR = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.65), this.mats.crossBlack);
    crossBR.rotation.x = -Math.PI * 0.5;
    crossBR.position.set(-0.2, 0.065, 0);
    wingOuterR.add(crossWR, crossBR);

    // Dive brake slats under the wings
    [-3.5, 3.5].forEach(dx => {
      const brake = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.22), this.mats.engineMetal);
      brake.position.set(dx, -0.05, 0.2);
      root.add(brake);
    });

    // 4. Twin 7.92mm MG-17 Machine Gun Barrels
    this.gunBarrels = [];
    [-2.1, 2.1].forEach(gx => {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.2, 8), this.mats.engineMetal);
      barrel.rotateX(Math.PI * 0.5);
      barrel.position.set(gx, -0.24, 1.9);
      root.add(barrel);
      this.gunBarrels.push(barrel);
    });

    // 5. Fixed Landing Gear with Aerodynamic Wheel Spats
    [-1.6, 1.6].forEach(lx => {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.3, 0.4), this.mats.fuselage);
      strut.position.set(lx, -0.9, 0.9);
      strut.castShadow = true;

      // Aerodynamic wheel spat pointing forward and down
      const spat = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.3, 10), this.mats.fuselage);
      spat.rotateX(Math.PI * 0.45); // Pointing forward-down!
      spat.position.set(lx, -1.45, 0.9);
      spat.castShadow = true;

      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 14), this.mats.engineMetal);
      wheel.rotateZ(Math.PI * 0.5);
      wheel.position.set(lx, -1.6, 0.85);

      // Jericho Trumpet Siren pod on left wheel strut (horn pointing forward)
      if (lx < 0) {
        const siren = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.55, 8), this.mats.engineMetal);
        siren.rotateX(Math.PI * 0.5); // Horn mouth pointing forward!
        siren.position.set(lx - 0.25, -1.1, 1.25);
        root.add(siren);
      }

      root.add(strut, spat, wheel);
    });

    // 6. Tailplane (Vertical Fin, Rudder, and Horizontal Stabilizers)
    const vertFin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.5, 1.2), this.mats.fuselage);
    vertFin.position.set(0, 0.75, -2.9);
    vertFin.rotation.x = -0.28;
    vertFin.castShadow = true;
    const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.3, 0.6), this.mats.yellowAccent);
    rudder.position.set(0, 0.65, -3.4);
    rudder.castShadow = true;
    const horizStab = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.12, 0.95), this.mats.fuselage);
    horizStab.position.set(0, 0.22, -3.0);
    horizStab.castShadow = true;
    root.add(vertFin, rudder, horizStab);

    // 7. 3-Blade Propeller & Pointed Spinner Cone
    this.propellerGroup = new THREE.Group();
    this.propellerGroup.position.set(0, 0, 4.3);

    // Pointed spinner cone pointing forward (+Z)
    const spinnerGeo = new THREE.ConeGeometry(0.26, 0.55, 12);
    spinnerGeo.rotateX(Math.PI * 0.5);
    const spinner = new THREE.Mesh(spinnerGeo, this.mats.yellowAccent);
    spinner.position.set(0, 0, 0.26);
    this.propellerGroup.add(spinner);

    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.28, 0.04), this.mats.propeller);
      blade.position.y = 0.68;
      const bladePivot = new THREE.Group();
      bladePivot.rotation.z = (i * Math.PI * 2) / 3;
      bladePivot.add(blade);
      this.propellerGroup.add(bladePivot);
    }

    // High-RPM Spinning Propeller Blur Disc
    const blurDisc = new THREE.Mesh(new THREE.CircleGeometry(1.32, 24), this.mats.propellerBlur);
    blurDisc.position.set(0, 0, 0.08);
    blurDisc.renderOrder = 10;
    this.propellerGroup.add(blurDisc);

    root.add(this.propellerGroup);

    // Centerline 250kg Bomb (visible when loaded)
    this.bombMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 1.6, 10), this.mats.bombMat);
    this.bombMesh.rotateX(Math.PI * 0.5);
    this.bombMesh.position.set(0, -0.65, 0.7);
    root.add(this.bombMesh);

    this.planeGroup.add(root);
  }

  /**
   * Recreates the exact tactical military Flight Combat HUD seen in the reel:
   * 1. Centered Rotating Compass Rose Dial with needle and Health Hearts.
   * 2. Bottom Left Speedometer (176 KM/H) with IQBALISM / Throttle status bars.
   * 3. Flight Crosshair with 7.92mm MG-17 and FLARE READY 8 [V] readout.
   * 4. Bottom Right Weapon Bay Tray.
   */
  createFlightHUD() {
    this.hudContainer = document.createElement('div');
    this.hudContainer.id = 'stuka-flight-combat-hud';
    this.hudContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 99998;
      display: none;
      font-family: 'Minecraft', 'Consolas', 'Courier New', monospace;
      user-select: none;
    `;

    this.hudContainer.innerHTML = `
      <!-- Vignette and Cockpit Haze -->
      <div id="stuka-vignette-overlay" style="
        position: absolute;
        inset: 0;
        box-shadow: inset 0 0 120px rgba(0, 0, 0, 0.55);
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
        <!-- Circular Gun Sight Reticle -->
        <div style="
          width: 58px;
          height: 58px;
          border: 2px solid rgba(255, 255, 255, 0.75);
          border-radius: 50%;
          margin: 0 auto;
          position: relative;
          box-shadow: 0 0 8px rgba(255, 255, 255, 0.35);
        ">
          <!-- Crosshair Ticks -->
          <div style="position: absolute; top: -6px; left: 50%; width: 2px; height: 6px; background: #fff; transform: translateX(-50%);"></div>
          <div style="position: absolute; bottom: -6px; left: 50%; width: 2px; height: 6px; background: #fff; transform: translateX(-50%);"></div>
          <div style="position: absolute; left: -6px; top: 50%; width: 6px; height: 2px; background: #fff; transform: translateY(-50%);"></div>
          <div style="position: absolute; right: -6px; top: 50%; width: 6px; height: 2px; background: #fff; transform: translateY(-50%);"></div>
          <div style="position: absolute; top: 50%; left: 50%; width: 4px; height: 4px; background: #fff; border-radius: 50%; transform: translate(-50%, -50%);"></div>
        </div>

        <!-- Gun & Flare Readiness Text Matching Screenshot -->
        <div style="margin-top: 8px; font-size: 11px; color: #ffffff; text-shadow: 1px 1px 2px #000, 0 0 6px rgba(0,0,0,0.8); line-height: 1.35; letter-spacing: 0.5px;">
          <div>7.92mm MG-17 <span style="font-size: 13px;">&#8734;</span></div>
          <div style="color: #e2e8f0;">FLARE READY <span id="hud-flare-count">8</span> <span style="color: #94a3b8;">[V]</span></div>
        </div>

        <!-- Dynamic Sky Leviathan Boss Tracker Readout -->
        <div id="stuka-boss-reticle-tracker" style="
          margin-top: 6px;
          font-size: 11px;
          color: #38bdf8;
          font-weight: bold;
          text-shadow: 1px 1px 2px #000, 0 0 6px rgba(56, 189, 248, 0.85);
          letter-spacing: 0.5px;
          display: none;
        ">
          TARGET: SKY LEVIATHAN [<span id="stuka-reticle-boss-dist">---</span>m]
        </div>
        <div style="font-size: 9px; color: #cbd5e1; text-shadow: 1px 1px 2px #000; margin-top: 3px; letter-spacing: 0.5px;">
          HOLD [R-CLICK] OR [ALT] TO FREE-LOOK &bull; [B / 2] BOMB
        </div>
      </div>

      <!-- BOTTOM CENTER COMPASS DIAL & HEARTS -->
      <div style="
        position: absolute;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
      ">
        <!-- Player Hearts Bar -->
        <div id="stuka-hearts-bar" style="display: flex; gap: 3px; margin-bottom: 6px; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.8));">
          ${Array(10).fill(0).map(() => `<span style="color: #ef4444; font-size: 16px;">❤</span>`).join('')}
        </div>

        <!-- Boss Direction & Bearing Status Banner -->
        <div id="stuka-boss-status-banner" style="
          margin-bottom: 5px;
          font-size: 11px;
          font-weight: bold;
          color: #38bdf8;
          text-shadow: 1px 1px 3px #000, 0 0 8px rgba(56, 189, 248, 0.85);
          display: none;
          letter-spacing: 0.5px;
        ">
          LEVIATHAN: <span id="stuka-boss-dist-val">---</span>m &bull; <span id="stuka-boss-dir-val">LOCATING...</span>
        </div>

        <!-- Compass Circular Dial Gauge -->
        <div style="
          width: 136px;
          height: 136px;
          border-radius: 50%;
          background: rgba(15, 23, 20, 0.88);
          border: 3px solid rgba(255, 255, 255, 0.85);
          position: relative;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.75), inset 0 0 10px rgba(0, 0, 0, 0.7);
          overflow: hidden;
        ">
          <!-- Compass Face Texture -->
          <div id="stuka-compass-face" style="
            width: 100%;
            height: 100%;
            position: absolute;
            transform-origin: center;
            transition: transform 0.05s linear;
          ">
            <div style="position: absolute; top: 6px; left: 50%; transform: translateX(-50%); font-size: 13px; font-weight: bold; color: #ef4444;">N</div>
            <div style="position: absolute; bottom: 6px; left: 50%; transform: translateX(-50%); font-size: 12px; font-weight: bold; color: #fff;">S</div>
            <div style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); font-size: 12px; font-weight: bold; color: #fff;">E</div>
            <div style="position: absolute; left: 8px; top: 50%; transform: translateY(-50%); font-size: 12px; font-weight: bold; color: #fff;">W</div>
            <div style="position: absolute; top: 18px; right: 20px; font-size: 9px; color: #a0aec0;">NE</div>
            <div style="position: absolute; top: 18px; left: 20px; font-size: 9px; color: #a0aec0;">NW</div>
            <div style="position: absolute; bottom: 18px; right: 20px; font-size: 9px; color: #a0aec0;">SE</div>
            <div style="position: absolute; bottom: 18px; left: 20px; font-size: 9px; color: #a0aec0;">SW</div>

            <!-- Glowing Cyan Leviathan Bearing Diamond on Compass Rose -->
            <div id="stuka-boss-compass-marker" style="
              position: absolute;
              top: 50%;
              left: 50%;
              width: 14px;
              height: 14px;
              margin-left: -7px;
              margin-top: -7px;
              display: none;
              align-items: center;
              justify-content: center;
              filter: drop-shadow(0 0 5px #00e5ff);
              transition: transform 0.05s linear;
            ">
              <div style="
                width: 8px;
                height: 8px;
                background: #00e5ff;
                transform: rotate(45deg);
                border: 1px solid #ffffff;
                box-shadow: 0 0 6px #00e5ff;
              "></div>
            </div>
          </div>
          <!-- Red Needle Indicator -->
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            width: 4px;
            height: 38px;
            background: #ef4444;
            transform-origin: bottom center;
            transform: translate(-50%, -100%);
            box-shadow: 0 0 4px #ef4444;
          "></div>
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            width: 10px;
            height: 10px;
            background: #fff;
            border-radius: 50%;
            transform: translate(-50%, -50%);
          "></div>
        </div>
      </div>

      <!-- BOTTOM LEFT SPEEDOMETER & THROTTLE GAUGES -->
      <div style="
        position: absolute;
        bottom: 28px;
        left: 36px;
        color: #ffffff;
        text-shadow: 1px 1px 2px #000;
      ">
        <div style="display: flex; align-items: baseline; gap: 8px;">
          <div id="stuka-speed-readout" style="font-size: 32px; font-weight: 900; letter-spacing: 1px; color: #ffffff;">176</div>
          <div style="font-size: 16px; font-weight: 800; color: #cbd5e1; letter-spacing: 1px;">KM/H</div>
        </div>

        <div style="margin-top: 6px; font-size: 12px; line-height: 1.45;">
          <!-- Slot [1] Throttle Bar -->
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="color: #4ade80; font-weight: bold;">[1] ⊙ IQBALISM</span>
          </div>
          <div style="width: 150px; height: 7px; background: rgba(0,0,0,0.65); border: 1px solid #4ade80; border-radius: 2px; overflow: hidden; margin-top: 2px;">
            <div id="stuka-throttle-meter" style="width: 72%; height: 100%; background: #4ade80;"></div>
          </div>

          <!-- Slot [2] Boost Status Bar -->
          <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
            <span style="color: #94a3b8;">[2] ⚡ BOOST</span>
          </div>
          <div style="width: 150px; height: 7px; background: rgba(0,0,0,0.65); border: 1px solid #94a3b8; border-radius: 2px; overflow: hidden; margin-top: 2px;">
            <div id="stuka-boost-meter" style="width: 100%; height: 100%; background: #38bdf8;"></div>
          </div>
        </div>
      </div>

      <!-- BOTTOM RIGHT WEAPONS & AMMUNITION RACK -->
      <div style="
        position: absolute;
        bottom: 28px;
        right: 36px;
        text-align: right;
        color: #ffffff;
        text-shadow: 1px 1px 2px #000;
      ">
        <div style="
          background: rgba(15, 23, 20, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.4);
          border-radius: 4px;
          padding: 8px 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 12px;
        ">
          <!-- Active Weapon: 7.92mm MG-17 -->
          <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
            <span style="color: #4ade80; font-weight: bold;">▶ 1</span>
            <span style="letter-spacing: 1px;">7.92mm MG-17</span>
            <span style="background: rgba(255,255,255,0.2); padding: 1px 6px; border-radius: 3px; font-weight: bold;">&#8734;</span>
          </div>

          <!-- Slot 2: 250kg Stuka Bomb -->
          <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px; color: #94a3b8;">
            <span>[2]</span>
            <span>250kg BOMB</span>
            <span id="stuka-bomb-ready" style="color: #4ade80; font-weight: bold;">READY</span>
          </div>

          <!-- Slot 3: Flares -->
          <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px; color: #94a3b8;">
            <span>[V]</span>
            <span>HEAT FLARES</span>
            <span id="stuka-flare-ready" style="color: #38bdf8; font-weight: bold;">8x</span>
          </div>
        </div>

        <div style="margin-top: 6px; font-size: 10px; color: #94a3b8;">
          [L-CLICK] Fire Guns &bull; [R-CLICK / ALT] Free-Look &bull; [B / 2] Bomb &bull; [V] Flares &bull; [F7] Exit
        </div>
      </div>

      <!-- Off-Screen 3D Boss Locator Arrow Indicator (Points in screen direction to turn mouse) -->
      <div id="stuka-boss-edge-indicator" style="
        position: absolute;
        display: none;
        pointer-events: none;
        z-index: 99999;
        transform: translate(-50%, -50%);
      ">
        <div id="stuka-boss-edge-arrow" style="
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          filter: drop-shadow(0 0 8px #00e5ff);
          transform-origin: center center;
        ">
          <div style="
            width: 0;
            height: 0;
            border-left: 9px solid transparent;
            border-right: 9px solid transparent;
            border-bottom: 16px solid #00e5ff;
            filter: drop-shadow(0 0 6px #00e5ff);
          "></div>
          <div style="
            background: rgba(10, 25, 35, 0.92);
            border: 1px solid #00e5ff;
            border-radius: 3px;
            padding: 2px 6px;
            color: #ffffff;
            font-size: 10px;
            font-weight: bold;
            letter-spacing: 0.5px;
            white-space: nowrap;
          ">
            <span style="color: #00e5ff;">◆ BOSS</span> <span id="stuka-boss-edge-dist">150m</span>
          </div>
        </div>
      </div>

      <!-- On-Screen Tactical Target Bracket (When Leviathan is in screen view) -->
      <div id="stuka-boss-target-bracket" style="
        position: absolute;
        display: none;
        pointer-events: none;
        z-index: 99999;
        transform: translate(-50%, -50%);
        text-align: center;
      ">
        <div style="
          width: 68px;
          height: 68px;
          border: 2px solid rgba(56, 189, 248, 0.85);
          position: relative;
          box-shadow: 0 0 10px rgba(56, 189, 248, 0.4), inset 0 0 10px rgba(56, 189, 248, 0.2);
        ">
          <!-- Corner ticks -->
          <div style="position: absolute; top: -2px; left: -2px; width: 8px; height: 8px; border-top: 3px solid #fff; border-left: 3px solid #fff;"></div>
          <div style="position: absolute; top: -2px; right: -2px; width: 8px; height: 8px; border-top: 3px solid #fff; border-right: 3px solid #fff;"></div>
          <div style="position: absolute; bottom: -2px; left: -2px; width: 8px; height: 8px; border-bottom: 3px solid #fff; border-left: 3px solid #fff;"></div>
          <div style="position: absolute; bottom: -2px; right: -2px; width: 8px; height: 8px; border-bottom: 3px solid #fff; border-right: 3px solid #fff;"></div>
          <div style="position: absolute; top: 50%; left: 50%; width: 6px; height: 6px; background: #00e5ff; border-radius: 50%; transform: translate(-50%, -50%); box-shadow: 0 0 6px #00e5ff;"></div>
        </div>
        <div style="
          margin-top: 4px;
          background: rgba(10, 25, 35, 0.88);
          border: 1px solid rgba(56, 189, 248, 0.6);
          border-radius: 3px;
          padding: 2px 6px;
          color: #fff;
          font-size: 10px;
          font-weight: bold;
          letter-spacing: 0.5px;
          white-space: nowrap;
        ">
          <span style="color: #00e5ff;">SKY LEVIATHAN</span> &bull; <span id="stuka-boss-bracket-dist">120m</span>
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
        this.deployFlares();
      }
      if (e.code === 'Digit1') {
        this.activeWeaponSlot = 1;
      }
      if (e.code === 'Digit2' || e.code === 'KeyB') {
        this.activeWeaponSlot = 2;
        this.dropBomb();
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
      if (this.isActive) {
        e.preventDefault();
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (!this.isActive) return;
      if (e.button === 0) {
        this.isFiring = true;
      } else if (e.button === 2) {
        // Right click: Free-look mode to look around and locate the boss
        this.rightMouseDown = true;
        this.isFreeLooking = true;
        this.rightMouseDownTime = performance.now();
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (!this.isActive) return;
      if (e.button === 0) {
        this.isFiring = false;
      } else if (e.button === 2) {
        const pressDuration = performance.now() - (this.rightMouseDownTime || 0);
        this.rightMouseDown = false;
        if (!this.keys['AltLeft'] && !this.keys['AltRight']) {
          this.isFreeLooking = false;
        }
        // Quick right-click tap (<220ms without dragging) also drops bomb!
        if (pressDuration < 220 && Math.abs(this.freeLookYaw) < 0.12 && Math.abs(this.freeLookPitch) < 0.12) {
          this.dropBomb();
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isActive || !document.pointerLockElement) return;

      if (this.isFreeLooking || this.rightMouseDown || this.keys['AltLeft'] || this.keys['AltRight']) {
        // Free-look mode: Orbit camera around aircraft in 360 degrees to spot and track boss
        this.freeLookYaw -= e.movementX * 0.0035;
        this.freeLookPitch = Math.max(-1.3, Math.min(1.3, this.freeLookPitch - e.movementY * 0.0035));
      } else {
        // Responsive flight steering
        this.mouseOffset.x += e.movementX * 0.0022;
        this.mouseOffset.y += e.movementY * 0.0022;
        this.mouseOffset.x = Math.max(-1.6, Math.min(1.6, this.mouseOffset.x));
        this.mouseOffset.y = Math.max(-1.6, Math.min(1.6, this.mouseOffset.y));

        // Subtle look-ahead peeking while steering
        this.mouseLookAhead.x = Math.max(-0.45, Math.min(0.45, this.mouseLookAhead.x - e.movementX * 0.0006));
        this.mouseLookAhead.y = Math.max(-0.35, Math.min(0.35, this.mouseLookAhead.y - e.movementY * 0.0006));
      }
    });
  }

  initAudio() {
    if (this.audioCtx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContext();

      // Engine Rumble
      this.engineOsc = this.audioCtx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.setValueAtTime(65, this.audioCtx.currentTime);

      this.engineGain = this.audioCtx.createGain();
      this.engineGain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);

      this.engineOsc.connect(this.engineGain);
      this.engineGain.connect(this.audioCtx.destination);
      this.engineOsc.start();

      // Jericho Trumpet Siren
      this.sirenOsc = this.audioCtx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.setValueAtTime(440, this.audioCtx.currentTime);

      this.sirenGain = this.audioCtx.createGain();
      this.sirenGain.gain.setValueAtTime(0.0, this.audioCtx.currentTime);

      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.audioCtx.destination);
      this.sirenOsc.start();
    } catch (e) {
      console.warn('[StukaFlight] Web Audio init failed:', e);
    }
  }

  playGunSound() {
    if (!this.audioCtx) return;
    try {
      const t = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(30, t + 0.08);

      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.09);
    } catch {}
  }

  playBombSound() {
    if (!this.audioCtx) return;
    try {
      const t = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(80, t);
      osc.frequency.exponentialRampToValueAtTime(20, t + 0.6);

      gain.gain.setValueAtTime(0.6, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.65);
    } catch {}
  }

  getForwardVector() {
    return new THREE.Vector3(0, 0, 1).applyEuler(this.rotation);
  }

  enterFlightMode(playerPosition, playerCamera) {
    if (this.isActive) return;
    this.isActive = true;
    this.initAudio();

    const startY = Math.max(54, playerPosition.y + 24);
    this.position.set(playerPosition.x, startY, playerPosition.z);
    this.rotation.set(0, playerCamera ? playerCamera.rotation.y : 0, 0);
    this.planeGroup.position.copy(this.position);
    this.planeGroup.rotation.copy(this.rotation);
    this.planeGroup.visible = true;

    // Reset camera state and angles
    this.isFreeLooking = false;
    this.freeLookYaw = 0;
    this.freeLookPitch = 0;
    this.mouseLookAhead.x = 0;
    this.mouseLookAhead.y = 0;
    this.mouseOffset.x = 0;
    this.mouseOffset.y = 0;
    this.camQuat = new THREE.Quaternion().copy(this.planeGroup.quaternion);

    // Optimize camera near plane to 0.35 (Multiplies 24-bit Z-buffer precision by 7x, eliminating Z-fighting on aircraft)
    if (this.camera) {
      this.camera.near = 0.35;
      this.camera.far = 1400;
      this.camera.updateProjectionMatrix();
    }

    // Expand chunk streaming radius to 8 chunks (256m zone) for smooth flight over vast terrain
    if (this.world && typeof this.world.setRenderRadius === 'function') {
      this.world.setRenderRadius(8);
    }

    // Snap camera immediately to reel chase position (no ground lerping lag!)
    const camOffset = new THREE.Vector3(0, 1.75, -6.8).applyQuaternion(this.camQuat);
    this.camera.position.copy(this.position).add(camOffset);
    const forward = this.getForwardVector();
    this.camera.lookAt(this.position.clone().add(forward.clone().multiplyScalar(35.0)).add(new THREE.Vector3(0, 0.8, 0)));

    if (this.hudContainer) {
      this.hudContainer.style.display = 'block';
    }

    console.log('[StukaFlightSystem] Entered Stuka Ju 87 Flight Dogfight Mode.');
  }

  exitFlightMode(playerControls) {
    if (!this.isActive) return;
    this.isActive = false;
    this.planeGroup.visible = false;

    // Restore standard camera near and far planes
    if (this.camera) {
      this.camera.near = 0.05;
      this.camera.far = 1200;
      this.camera.updateProjectionMatrix();
    }

    // Restore standard on-foot chunk radius
    if (this.world && typeof this.world.setRenderRadius === 'function') {
      this.world.setRenderRadius(4);
    }

    this.hideBossHUD();

    if (this.hudContainer) {
      this.hudContainer.style.display = 'none';
    }

    if (this.engineGain && this.audioCtx) {
      this.engineGain.gain.setValueAtTime(0.0, this.audioCtx.currentTime);
    }
    if (this.sirenGain && this.audioCtx) {
      this.sirenGain.gain.setValueAtTime(0.0, this.audioCtx.currentTime);
    }

    if (playerControls) {
      playerControls.playerPosition.copy(this.position);
      playerControls.syncFromCamera();
    }
    console.log('[StukaFlightSystem] Exited flight mode.');
  }

  deployFlares() {
    if (this.flareCount <= 0 || this.flareCooldown > 0) return;
    this.flareCount--;
    this.flareCooldown = 1.2;

    const countEl = document.getElementById('hud-flare-count');
    const readyEl = document.getElementById('stuka-flare-ready');
    if (countEl) countEl.innerText = this.flareCount;
    if (readyEl) readyEl.innerText = `${this.flareCount}x`;

    // Eject 6 sparkling heat flares backwards
    for (let i = 0; i < 6; i++) {
      const flare = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 6), this.mats.flareMat);
      const backward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.planeGroup.quaternion);
      const side = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.4, 0).applyQuaternion(this.planeGroup.quaternion);

      flare.position.copy(this.position).addScaledVector(backward, 3.2);
      flare.userData = {
        velocity: backward.clone().multiplyScalar(-14).add(side.multiplyScalar(8)),
        life: 2.8,
      };
      this.scene.add(flare);
      this.flares.push(flare);
    }
  }

  dropBomb() {
    if (!this.bombMesh || !this.bombMesh.visible) return;
    this.bombMesh.visible = false;

    const bomb = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 1.8, 10), this.mats.bombMat);
    bomb.position.copy(this.position).add(new THREE.Vector3(0, -1.2, 0));
    bomb.quaternion.copy(this.planeGroup.quaternion);
    bomb.userData = {
      velocity: this.velocity.clone().add(new THREE.Vector3(0, -4, 0)),
      life: 8.0,
    };
    this.scene.add(bomb);
    this.bombs.push(bomb);

    const bombReadyEl = document.getElementById('stuka-bomb-ready');
    if (bombReadyEl) {
      bombReadyEl.innerText = 'RELOADING';
      bombReadyEl.style.color = '#eab308';
    }

    setTimeout(() => {
      if (this.bombMesh) this.bombMesh.visible = true;
      if (bombReadyEl) {
        bombReadyEl.innerText = 'READY';
        bombReadyEl.style.color = '#4ade80';
      }
    }, 4500);
  }

  fireMachineGuns() {
    if (this.mgCooldown > 0) return;
    this.mgCooldown = 0.085; // ~700 rounds/minute

    this.playGunSound();

    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.planeGroup.quaternion);

    this.gunBarrels.forEach((barrel, i) => {
      const startPos = new THREE.Vector3();
      barrel.getWorldPosition(startPos);

      const tracerGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.4, 4);
      tracerGeo.rotateX(Math.PI * 0.5);
      const tracer = new THREE.Mesh(tracerGeo, this.mats.tracer);
      tracer.position.copy(startPos);
      tracer.quaternion.copy(this.planeGroup.quaternion);

      tracer.userData = {
        velocity: forward.clone().multiplyScalar(160), // High bullet velocity
        life: 1.8,
        damage: 15,
      };

      this.scene.add(tracer);
      this.bullets.push(tracer);
    });
  }

  /**
   * Main per-frame flight physics, control handling, projectile simulation,
   * audio pitch modulation, and HUD updates.
   */
  update(deltaTime, targetLeviathan = null, onTargetHit = null) {
    if (!this.isActive) return;

    // 1. Flight Control Input Processing
    let targetPitch = 0;
    let targetRoll = 0;
    let targetYaw = 0;

    // Pitch from W / S or mouse Y
    if (this.keys['KeyW']) targetPitch -= 0.85;
    if (this.keys['KeyS']) targetPitch += 0.85;

    // Roll & Rudder from A / D or mouse X
    if (this.keys['KeyA']) {
      targetRoll += 1.3;
      targetYaw += 0.65;
    }
    if (this.keys['KeyD']) {
      targetRoll -= 1.3;
      targetYaw -= 0.65;
    }

    // Apply responsive mouse steering when not in free-look
    if (!this.isFreeLooking) {
      targetPitch += this.mouseOffset.y * 1.3;
      targetRoll -= this.mouseOffset.x * 1.8;
      targetYaw -= this.mouseOffset.x * 0.95;
    }

    // Smooth exponential decay of mouse control impulses
    this.mouseOffset.x *= Math.pow(0.04, deltaTime * 8);
    this.mouseOffset.y *= Math.pow(0.04, deltaTime * 8);

    // Smoothly spring free-look camera angles back when not holding free-look
    if (!this.isFreeLooking) {
      const spring = Math.min(1.0, deltaTime * 8.0);
      this.freeLookYaw += (0 - this.freeLookYaw) * spring;
      this.freeLookPitch += (0 - this.freeLookPitch) * spring;
      this.mouseLookAhead.x += (0 - this.mouseLookAhead.x) * spring;
      this.mouseLookAhead.y += (0 - this.mouseLookAhead.y) * spring;
    }

    // Boost & Airbrakes
    let targetKmh = 176;
    if (this.keys['Space']) {
      targetKmh = 230;
      this.throttle = 1.0;
    } else if (this.keys['ShiftLeft'] || this.keys['ShiftRight']) {
      targetKmh = 115;
      this.throttle = 0.35;
    } else {
      this.throttle = 0.72;
    }

    // Smooth speed interpolation
    this.speedKmh += (targetKmh - this.speedKmh) * deltaTime * 1.8;

    // Rate smoothing
    this.pitchRate += (targetPitch - this.pitchRate) * deltaTime * 4.5;
    this.rollRate += (targetRoll - this.rollRate) * deltaTime * 5.0;
    this.yawRate += (targetYaw - this.yawRate) * deltaTime * 3.5;

    // Apply rotations
    this.rotation.x += this.pitchRate * deltaTime;
    this.rotation.y += this.yawRate * deltaTime;
    this.rotation.z += this.rollRate * deltaTime;

    // Natural self-righting roll damping
    this.rotation.z *= Math.pow(0.85, deltaTime * 10);

    // Compute forward motion vector
    this.planeGroup.rotation.copy(this.rotation);
    const forward = this.getForwardVector();

    // Cinematic translation speed: 17.5 m/s at 176 km/h cruise (matches reel, prevents outrunning chunks)
    const speedRatio = this.speedKmh / 176.0;
    const speedMs = 17.5 * speedRatio;

    this.velocity.copy(forward).multiplyScalar(speedMs);
    this.position.addScaledVector(this.velocity, deltaTime);

    // Prevent crashing deep underground
    const minAltitude = 12;
    if (this.position.y < minAltitude) {
      this.position.y = minAltitude;
      this.rotation.x = Math.max(0.1, this.rotation.x);
    }
    this.planeGroup.position.copy(this.position);

    // Propeller spinning animation
    if (this.propellerGroup) {
      this.propellerAngle += deltaTime * (this.speedKmh * 0.35);
      this.propellerGroup.rotation.z = this.propellerAngle;
    }

    // 2. Camera Chase Logic with Zero-Jitter Kinematic Tracking & 360-deg Free Look
    if (!this.camQuat) {
      this.camQuat = new THREE.Quaternion().copy(this.planeGroup.quaternion);
    }
    // Slerp camera orientation smoothly for cinematic banking & pitch lag
    const slerpFactor = Math.min(1.0, deltaTime * 10.0);
    this.camQuat.slerp(this.planeGroup.quaternion, slerpFactor);

    // Combine aircraft orientation with player free-look and steering peek
    const totalYaw = this.freeLookYaw + (this.isFreeLooking ? 0 : this.mouseLookAhead.x);
    const totalPitch = this.freeLookPitch + (this.isFreeLooking ? 0 : this.mouseLookAhead.y);
    const lookRot = new THREE.Euler(totalPitch, totalYaw, 0, 'YXZ');
    const lookQuat = new THREE.Quaternion().setFromEuler(lookRot);
    const totalCamQuat = this.camQuat.clone().multiply(lookQuat);

    // Anchor camera offset directly to this.position -> strictly ZERO position jitter!
    const camOffset = new THREE.Vector3(0, 1.75, -6.8).applyQuaternion(totalCamQuat);
    this.camera.position.copy(this.position).add(camOffset);

    // Look target ahead along camera orientation
    const forwardDir = new THREE.Vector3(0, 0, 1).applyQuaternion(totalCamQuat);
    const lookTarget = this.position.clone().addScaledVector(forwardDir, 35.0).add(new THREE.Vector3(0, 0.8, 0));
    this.camera.lookAt(lookTarget);

    // 3. Audio Frequency & Dive Siren Modulation
    if (this.audioCtx && this.engineOsc && this.engineGain) {
      const freq = 55 + (this.speedKmh / 240) * 80;
      this.engineOsc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      this.engineGain.gain.setValueAtTime(0.09, this.audioCtx.currentTime);

      // Trigger Jericho Trumpet Siren during steep dive (> 195 KM/H and pitch down)
      if (this.sirenGain && this.sirenOsc) {
        if (this.speedKmh > 195 && this.rotation.x < -0.2) {
          const sFreq = 380 + Math.sin(performance.now() * 0.015) * 120 + (this.speedKmh - 195) * 8;
          this.sirenOsc.frequency.setValueAtTime(sFreq, this.audioCtx.currentTime);
          this.sirenGain.gain.setValueAtTime(0.22, this.audioCtx.currentTime);
        } else {
          this.sirenGain.gain.setValueAtTime(0.0, this.audioCtx.currentTime);
        }
      }
    }

    // 4. Weapons & Projectiles
    if (this.mgCooldown > 0) this.mgCooldown -= deltaTime;
    if (this.flareCooldown > 0) this.flareCooldown -= deltaTime;

    if (this.isFiring && this.activeWeaponSlot === 1) {
      this.fireMachineGuns();
    }

    // Update Machine Gun Bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.position.addScaledVector(b.userData.velocity, deltaTime);
      b.userData.life -= deltaTime;

      // Hit detection against Sky Leviathan
      if (targetLeviathan && typeof targetLeviathan.checkHit === 'function') {
        const hit = targetLeviathan.checkHit(b.position, 2.5);
        if (hit) {
          if (typeof targetLeviathan.takeDamage === 'function') {
            targetLeviathan.takeDamage(b.userData.damage, hit);
          }
          if (typeof onTargetHit === 'function') {
            onTargetHit(b.userData.damage, hit.part);
          }
          this.scene.remove(b);
          this.bullets.splice(i, 1);
          continue;
        }
      }

      if (b.userData.life <= 0 || b.position.y < 0) {
        this.scene.remove(b);
        this.bullets.splice(i, 1);
      }
    }

    // Update Bombs
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const bomb = this.bombs[i];
      bomb.userData.velocity.y -= 19.6 * deltaTime; // Gravity
      bomb.position.addScaledVector(bomb.userData.velocity, deltaTime);
      bomb.userData.life -= deltaTime;

      if (bomb.position.y <= 1.0 || bomb.userData.life <= 0) {
        this.playBombSound();
        if (targetLeviathan && typeof targetLeviathan.checkHit === 'function') {
          const bHit = targetLeviathan.checkHit(bomb.position, 14.0);
          if (bHit && typeof targetLeviathan.takeDamage === 'function') {
            targetLeviathan.takeDamage(150, bHit);
          }
        }
        this.scene.remove(bomb);
        this.bombs.splice(i, 1);
      }
    }

    // Update Flares
    for (let i = this.flares.length - 1; i >= 0; i--) {
      const fl = this.flares[i];
      fl.position.addScaledVector(fl.userData.velocity, deltaTime);
      fl.userData.velocity.y -= 9.8 * deltaTime;
      fl.userData.life -= deltaTime;
      fl.scale.multiplyScalar(0.98);

      if (fl.userData.life <= 0) {
        this.scene.remove(fl);
        this.flares.splice(i, 1);
      }
    }

    // 5. Update Tactical HUD
    const speedEl = document.getElementById('stuka-speed-readout');
    if (speedEl) {
      speedEl.innerText = Math.round(this.speedKmh);
    }

    const throttleEl = document.getElementById('stuka-throttle-meter');
    if (throttleEl) {
      throttleEl.style.width = `${Math.round(this.throttle * 100)}%`;
    }

    const compassFaceEl = document.getElementById('stuka-compass-face');
    if (compassFaceEl) {
      const deg = (this.rotation.y * 180) / Math.PI;
      compassFaceEl.style.transform = `rotate(${-deg}deg)`;
    }

    // 6. Update Sky Leviathan Boss Locator & 3D Tactical Tracking
    this.updateBossLocator(targetLeviathan);
  }

  /**
   * Tracks the Sky Leviathan boss position in 3D world and screen space:
   * 1. Compass Bearing Diamond: points to Leviathan heading on the compass rose.
   * 2. Off-Screen 3D Locator Arrow: points in 2D screen direction where player should move mouse.
   * 3. On-Screen Target Bracket: locks onto Leviathan head in 3D viewport.
   * 4. Distance & Direction Readouts.
   */
  updateBossLocator(targetLeviathan) {
    const reticleTrackerEl = document.getElementById('stuka-boss-reticle-tracker');
    const reticleDistEl = document.getElementById('stuka-reticle-boss-dist');
    const statusBannerEl = document.getElementById('stuka-boss-status-banner');
    const statusDistEl = document.getElementById('stuka-boss-dist-val');
    const statusDirEl = document.getElementById('stuka-boss-dir-val');
    const compassMarkerEl = document.getElementById('stuka-boss-compass-marker');
    const edgeIndicatorEl = document.getElementById('stuka-boss-edge-indicator');
    const edgeArrowEl = document.getElementById('stuka-boss-edge-arrow');
    const edgeDistEl = document.getElementById('stuka-boss-edge-dist');
    const bracketEl = document.getElementById('stuka-boss-target-bracket');
    const bracketDistEl = document.getElementById('stuka-boss-bracket-dist');

    if (!targetLeviathan || !targetLeviathan.isActive || targetLeviathan.isDead || !targetLeviathan.headPosition) {
      this.hideBossHUD();
      return;
    }

    const bossPos = targetLeviathan.headPosition;
    const toBoss = bossPos.clone().sub(this.position);
    const bossDist = Math.round(toBoss.length());

    // Reticle & Status Banner text
    if (reticleTrackerEl) {
      reticleTrackerEl.style.display = 'block';
      if (reticleDistEl) reticleDistEl.innerText = bossDist;
    }
    if (statusBannerEl) {
      statusBannerEl.style.display = 'block';
      if (statusDistEl) statusDistEl.innerText = bossDist;
      if (statusDirEl) {
        const forward = this.getForwardVector();
        const toBossNorm = toBoss.clone().normalize();
        const dotFwd = forward.dot(toBossNorm);
        let dirLabel = 'AHEAD';
        if (dotFwd < -0.5) dirLabel = 'BEHIND';
        else if (dotFwd < 0.6) {
          const crossY = forward.x * toBossNorm.z - forward.z * toBossNorm.x;
          dirLabel = crossY > 0 ? 'FLANK LEFT' : 'FLANK RIGHT';
        }
        if (toBoss.y > 25) dirLabel += ' (HIGH)';
        else if (toBoss.y < -25) dirLabel += ' (LOW)';
        statusDirEl.innerText = dirLabel;
      }
    }

    // Compass Marker Positioning (Inside rotating compass face)
    if (compassMarkerEl) {
      compassMarkerEl.style.display = 'flex';
      // Angle in XZ plane relative to world
      const worldAngle = Math.atan2(toBoss.x, toBoss.z);
      // Place marker around compass dial edge at radius 44px
      const markerX = Math.sin(worldAngle) * 44;
      const markerY = -Math.cos(worldAngle) * 44;
      compassMarkerEl.style.transform = `translate(${markerX}px, ${markerY}px)`;
    }

    // Screen Space 3D Projection for Locator Arrow & Target Bracket
    const proj = bossPos.clone().project(this.camera);
    const isBehindCamera = proj.z > 1.0;

    let screenXNorm = proj.x;
    let screenYNorm = proj.y;

    if (isBehindCamera) {
      // Invert coordinates if behind camera so indicator points back
      screenXNorm = -screenXNorm;
      screenYNorm = -screenYNorm;
      if (Math.abs(screenXNorm) < 0.001 && Math.abs(screenYNorm) < 0.001) {
        screenYNorm = -1.0;
      }
    }

    const isOnScreen = !isBehindCamera && Math.abs(screenXNorm) < 0.82 && Math.abs(screenYNorm) < 0.82;

    if (isOnScreen) {
      // On-Screen: Show tactical target bracket over Leviathan head
      if (edgeIndicatorEl) edgeIndicatorEl.style.display = 'none';
      if (bracketEl) {
        bracketEl.style.display = 'block';
        const px = (screenXNorm * 0.5 + 0.5) * window.innerWidth;
        const py = (-screenYNorm * 0.5 + 0.5) * window.innerHeight;
        bracketEl.style.left = `${px}px`;
        bracketEl.style.top = `${py}px`;
        if (bracketDistEl) bracketDistEl.innerText = `${bossDist}m`;
      }
    } else {
      // Off-Screen: Show 3D screen-edge locator arrow pointing toward boss
      if (bracketEl) bracketEl.style.display = 'none';
      if (edgeIndicatorEl) {
        edgeIndicatorEl.style.display = 'block';

        const halfW = (window.innerWidth * 0.5) - 64;
        const halfH = (window.innerHeight * 0.5) - 64;

        const scaleX = screenXNorm !== 0 ? Math.abs(halfW / screenXNorm) : 9999;
        const scaleY = screenYNorm !== 0 ? Math.abs(halfH / screenYNorm) : 9999;
        const scale = Math.min(scaleX, scaleY);

        const edgeX = (window.innerWidth * 0.5) + screenXNorm * scale;
        const edgeY = (window.innerHeight * 0.5) - screenYNorm * scale;

        edgeIndicatorEl.style.left = `${edgeX}px`;
        edgeIndicatorEl.style.top = `${edgeY}px`;

        // Arrow points outward from center toward boss
        const screenAngleDeg = (Math.atan2(-screenYNorm, screenXNorm) * 180 / Math.PI) + 90;
        if (edgeArrowEl) {
          edgeArrowEl.style.transform = `rotate(${screenAngleDeg}deg)`;
        }
        if (edgeDistEl) {
          edgeDistEl.innerText = `${bossDist}m`;
        }
      }
    }
  }

  hideBossHUD() {
    [
      'stuka-boss-reticle-tracker',
      'stuka-boss-status-banner',
      'stuka-boss-compass-marker',
      'stuka-boss-edge-indicator',
      'stuka-boss-target-bracket',
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }
}
