import * as THREE from 'three';

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
    this.position = new THREE.Vector3(0, 45, 0);
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
        color: 0x2e3b2e, // Luftwaffe Dark Camo Olive Green
        roughness: 0.65,
        metalness: 0.25,
      }),
      underside: new THREE.MeshStandardMaterial({
        color: 0x768896, // Hellblau underside
        roughness: 0.6,
        metalness: 0.2,
      }),
      yellowAccent: new THREE.MeshStandardMaterial({
        color: 0xd4a017, // Eastern front yellow cowling/wingtips
        roughness: 0.5,
      }),
      canopy: new THREE.MeshStandardMaterial({
        color: 0x9bc8eb,
        transparent: true,
        opacity: 0.6,
        roughness: 0.1,
        metalness: 0.8,
      }),
      canopyFrame: new THREE.MeshStandardMaterial({
        color: 0x1f241f,
        roughness: 0.8,
      }),
      engineMetal: new THREE.MeshStandardMaterial({
        color: 0x222222,
        roughness: 0.4,
        metalness: 0.8,
      }),
      propeller: new THREE.MeshStandardMaterial({
        color: 0x151815,
        roughness: 0.5,
      }),
      tracer: new THREE.MeshBasicMaterial({
        color: 0xffea55,
      }),
      flareMat: new THREE.MeshBasicMaterial({
        color: 0xffffff,
      }),
      bombMat: new THREE.MeshStandardMaterial({
        color: 0x3d4338,
        roughness: 0.7,
        metalness: 0.5,
      }),
    };
  }

  /**
   * Constructs an authentic, proportional 3D model of the Junkers Ju 87 Stuka
   * featuring inverted gull wings, wheel spats, dive siren, and spinning propeller.
   */
  buildStukaJu87Model() {
    const root = new THREE.Group();

    // 1. Main Fuselage
    const fuseGeo = new THREE.CylinderGeometry(0.55, 0.28, 6.2, 12);
    fuseGeo.rotateX(Math.PI * 0.5);
    const fuselage = new THREE.Mesh(fuseGeo, this.mats.fuselage);
    fuselage.castShadow = true;
    root.add(fuselage);

    // Engine Cowling Nose
    const cowlGeo = new THREE.ConeGeometry(0.58, 1.4, 12);
    cowlGeo.rotateX(-Math.PI * 0.5);
    const cowl = new THREE.Mesh(cowlGeo, this.mats.yellowAccent);
    cowl.position.set(0, 0, 3.6);
    root.add(cowl);

    // 2. Greenhouse Cockpit Canopy
    const canopyGeo = new THREE.BoxGeometry(0.68, 0.62, 2.2);
    const canopy = new THREE.Mesh(canopyGeo, this.mats.canopy);
    canopy.position.set(0, 0.48, 0.6);
    root.add(canopy);

    // Canopy frames
    for (let zOff = -0.7; zOff <= 0.7; zOff += 0.45) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.66, 0.08), this.mats.canopyFrame);
      frame.position.set(0, 0.48, 0.6 + zOff);
      root.add(frame);
    }

    // 3. Inverted Gull Wings (The Signature Stuka Cranked Wings)
    // Left Wing: Inner section angles down, outer section angles up
    const wingInnerL = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, 1.6), this.mats.fuselage);
    wingInnerL.position.set(-1.2, -0.22, 0.8);
    wingInnerL.rotation.z = 0.26; // Anhedral down
    root.add(wingInnerL);

    const wingOuterL = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 1.3), this.mats.fuselage);
    wingOuterL.position.set(-3.9, 0.15, 0.7);
    wingOuterL.rotation.z = -0.12; // Dihedral up
    const wingTipL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 1.2), this.mats.yellowAccent);
    wingTipL.position.set(-5.6, 0.35, 0.65);
    wingTipL.rotation.z = -0.12;
    root.add(wingOuterL, wingTipL);

    // Right Wing: Mirror of left wing
    const wingInnerR = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, 1.6), this.mats.fuselage);
    wingInnerR.position.set(1.2, -0.22, 0.8);
    wingInnerR.rotation.z = -0.26;
    root.add(wingInnerR);

    const wingOuterR = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 1.3), this.mats.fuselage);
    wingOuterR.position.set(3.9, 0.15, 0.7);
    wingOuterR.rotation.z = 0.12;
    const wingTipR = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 1.2), this.mats.yellowAccent);
    wingTipR.position.set(5.6, 0.35, 0.65);
    wingTipR.rotation.z = 0.12;
    root.add(wingOuterR, wingTipR);

    // 4. Twin 7.92mm MG-17 Machine Gun Barrels
    this.gunBarrels = [];
    [-2.1, 2.1].forEach(gx => {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.1, 8), this.mats.engineMetal);
      barrel.rotateX(Math.PI * 0.5);
      barrel.position.set(gx, -0.26, 1.8);
      root.add(barrel);
      this.gunBarrels.push(barrel);
    });

    // 5. Fixed Landing Gear with Aerodynamic Wheel Spats
    [-1.9, 1.9].forEach(lx => {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 0.4), this.mats.fuselage);
      strut.position.set(lx, -1.0, 0.9);
      const spat = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 8), this.mats.fuselage);
      spat.rotateX(-Math.PI * 0.4);
      spat.position.set(lx, -1.5, 0.8);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.18, 12), this.mats.engineMetal);
      wheel.rotateZ(Math.PI * 0.5);
      wheel.position.set(lx, -1.65, 0.7);

      // Jericho Trumpet Siren pod on left wheel strut
      if (lx < 0) {
        const siren = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 6), this.mats.engineMetal);
        siren.rotateX(-Math.PI * 0.5);
        siren.position.set(lx - 0.22, -1.1, 1.1);
        root.add(siren);
      }

      root.add(strut, spat, wheel);
    });

    // 6. Tailplane (Vertical Fin and Horizontal Stabilizers)
    const vertFin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 1.1), this.mats.fuselage);
    vertFin.position.set(0, 0.7, -2.8);
    vertFin.rotation.x = -0.3;
    const horizStab = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 0.9), this.mats.fuselage);
    horizStab.position.set(0, 0.2, -2.9);
    root.add(vertFin, horizStab);

    // 7. 3-Blade Propeller
    this.propellerGroup = new THREE.Group();
    this.propellerGroup.position.set(0, 0, 4.3);
    const spinner = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), this.mats.yellowAccent);
    this.propellerGroup.add(spinner);

    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.25, 0.04), this.mats.propeller);
      blade.position.y = 0.6;
      const bladePivot = new THREE.Group();
      bladePivot.rotation.z = (i * Math.PI * 2) / 3;
      bladePivot.add(blade);
      this.propellerGroup.add(bladePivot);
    }
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
          [L-CLICK] Fire Guns &bull; [R-CLICK] Drop Bomb &bull; [V] Flares &bull; [F7] Exit
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
      if (e.code === 'Digit2') {
        this.activeWeaponSlot = 2;
        this.dropBomb();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    window.addEventListener('mousedown', (e) => {
      if (!this.isActive) return;
      if (e.button === 0) {
        this.isFiring = true;
      } else if (e.button === 2) {
        this.dropBomb();
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.isFiring = false;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isActive || !document.pointerLockElement) return;
      this.mouseOffset.x += e.movementX * 0.0018;
      this.mouseOffset.y += e.movementY * 0.0018;
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

  enterFlightMode(playerPosition, playerCamera) {
    if (this.isActive) return;
    this.isActive = true;
    this.initAudio();

    this.position.copy(playerPosition).add(new THREE.Vector3(0, 18, 0));
    this.rotation.set(0, playerCamera ? playerCamera.rotation.y : 0, 0);
    this.planeGroup.position.copy(this.position);
    this.planeGroup.visible = true;

    if (this.hudContainer) {
      this.hudContainer.style.display = 'block';
    }

    console.log('[StukaFlightSystem] Entered Stuka Ju 87 Flight Dogfight Mode.');
  }

  exitFlightMode(playerControls) {
    if (!this.isActive) return;
    this.isActive = false;
    this.planeGroup.visible = false;

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
    if (this.keys['KeyW']) targetPitch -= 1.2;
    if (this.keys['KeyS']) targetPitch += 1.2;
    targetPitch += this.mouseOffset.y * 1.5;

    // Roll & Rudder from A / D or mouse X
    if (this.keys['KeyA']) {
      targetRoll += 1.6;
      targetYaw += 0.8;
    }
    if (this.keys['KeyD']) {
      targetRoll -= 1.6;
      targetYaw -= 0.8;
    }
    targetRoll -= this.mouseOffset.x * 2.2;
    targetYaw -= this.mouseOffset.x * 0.9;

    // Reset mouse delta accumulation
    this.mouseOffset.x *= 0.15;
    this.mouseOffset.y *= 0.15;

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
    const forward = new THREE.Vector3(0, 0, 1).applyEuler(this.rotation);
    const speedMs = (this.speedKmh * 1000) / 3600;

    this.velocity.copy(forward).multiplyScalar(speedMs);
    this.position.addScaledVector(this.velocity, deltaTime);

    // Prevent crashing deep underground
    const minAltitude = 6;
    if (this.position.y < minAltitude) {
      this.position.y = minAltitude;
      this.rotation.x = Math.max(0.1, this.rotation.x);
    }
    this.planeGroup.position.copy(this.position);

    // Propeller spinning animation
    if (this.propellerGroup) {
      this.propellerAngle += deltaTime * (this.speedKmh * 0.3);
      this.propellerGroup.rotation.z = this.propellerAngle;
    }

    // 2. Camera Chase Logic
    const camOffset = new THREE.Vector3(0, 2.8, -10.5).applyEuler(this.rotation);
    this.camera.position.copy(this.position).add(camOffset);
    const lookTarget = this.position.clone().add(forward.clone().multiplyScalar(15));
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
  }
}
