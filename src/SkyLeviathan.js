import * as THREE from 'three';
import {
  createBasePBRShader,
  createBioluminescentEmissionShader,
  createFresnelRimShader,
  createEnergyDistortionShader,
  AtmosphericSkyEnclosure,
} from './shaders/ReelShaderSystem.js';

/**
 * SkyLeviathan.js — Colossal Abyssal Void Wyrm Boss System
 * 
 * Recreates the colossal sky leviathan / dragon featured in the viral
 * Stuka Ju 87 dogfight aerial showcase (Instagram: @cloudgamesid / IQBALISM).
 * 
 * VISUAL DESIGN & TEXTURES:
 * - Colossal 28-segment serpentine body (over 120 blocks long) undulating through 3D sky.
 * - Deep Obsidian / Void scales (#0a0e14 to #181f28, metallic matte finish).
 * - ICONIC DOUBLE TRACK of glowing cyan-white bioluminescent orbs (#5be7ff / #e0fcff)
 *   running symmetrically along both sides of its spine across all 28 body segments.
 * - Draconic horned skull with glowing cyan eyes, razor mandibles, and throat plasma core.
 * - Sinuous inverse-kinematics spline undulation in 3D airspace.
 * - Aerial dogfight attacks: Sweeping Sky Lunge, Dive-Bomb maneuvers, and
 *   homing Cyan Void Plasma Orbs that can be countered with Stuka heat flares [V].
 * - Integrated boss health bar HUD, damage hit flashes, and Web Audio roar SFX.
 */

export class SkyLeviathan {
  constructor(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    this.isActive = false;
    this.group = new THREE.Group();
    this.group.name = 'Sky_Leviathan_Void_Wyrm';
    this.group.visible = false;
    this.scene.add(this.group);

    // Boss Stats
    this.maxHp = 1500;
    this.hp = 1500;
    this.isDead = false;

    // Movement & Kinematics (Balanced to match Stuka flight speed 17.5 m/s)
    this.headPosition = new THREE.Vector3(0, 85, -120);
    this.headRotation = new THREE.Euler(0, 0, 0, 'YXZ');
    this.headVelocity = new THREE.Vector3(0, 0, 1);
    this.speed = 15.0; // Balanced dogfight flight speed

    this.flightAngle = 0;
    this.flightTime = 0;
    this.undulationTimer = 0;

    // AI Combat State
    this.state = 'PATROL'; // 'PATROL', 'DIVE_ATTACK', 'PLASMA_BARRAGE', 'CIRCLING', 'DEFEATED'
    this.stateTimer = 0;
    this.targetPos = new THREE.Vector3();
    this.plasmaCooldown = 0;

    // Segments structure
    this.numSegments = 28;
    this.segmentSpacing = 3.6;
    this.segments = []; // Array of { group, position, rotation, mesh, orbsL, orbsR }
    this.segmentPositions = [];

    // Combat Projectiles & Effects
    this.plasmaOrbs = [];
    this.hitParticles = [];

    // Audio
    this.audioCtx = null;

    // Atmospheric Horizon Enclosure (Clouds & Mountains)
    this.skyEnclosure = new AtmosphericSkyEnclosure(this.scene);
    this.skyEnclosure.group.visible = false;

    // Initialize Assets
    this.initMaterials();
    this.buildLeviathanBody();
    this.createBossHUD();
  }

  initMaterials() {
    this.mats = {
      // Obsidian Scales - Abyssal charcoal black with cyan Fresnel rim light
      scalesDark: createBasePBRShader({
        baseColor: 0x0a0e15,
        roughness: 0.65,
        metallic: 0.35,
        rimColor: 0x38bdf8,
        rimPower: 3.2,
        rimStrength: 0.85,
      }),
      // Mid-tone Charcoal Spine Plates
      scalesMid: createBasePBRShader({
        baseColor: 0x141a24,
        roughness: 0.55,
        metallic: 0.25,
        rimColor: 0x38bdf8,
        rimPower: 3.5,
        rimStrength: 0.75,
      }),
      // Dorsal Ridge Spikes with sharp rim highlights
      dorsalSpike: createFresnelRimShader({
        baseColor: 0x07090d,
        rimColor: 0x5eeaff,
        rimPower: 2.8,
        rimStrength: 1.6,
      }),
      // The Iconic Cyan Bioluminescent Glowing Nodes (Dual Rows)
      cyanOrbGlow: createBioluminescentEmissionShader({
        emissionColor: 0x5eeaff,
        coreColor: 0xffffff,
        emissionStrength: 3.4,
        fresnelPower: 2.0,
        fresnelStrength: 2.2,
        pulseSpeed: 3.2,
        pulseIntensity: 0.45,
      }),
      cyanOrbCore: new THREE.MeshBasicMaterial({
        color: 0xffffff,
      }),
      // Eyes & Horn Accents
      cyanEye: createBioluminescentEmissionShader({
        emissionColor: 0x76f5ff,
        coreColor: 0xffffff,
        emissionStrength: 2.8,
      }),
      // Procedural Plasma Core in Maw with animated Simplex noise
      plasmaCore: createEnergyDistortionShader({
        colorA: 0x0284c7,
        colorB: 0x38bdf8,
        coreColor: 0xffffff,
        distortionStrength: 0.7,
        noiseScale: 2.2,
        noiseSpeed: 2.0,
      }),
      // Teeth & Claws
      boneIvory: createBasePBRShader({
        baseColor: 0xd9e2ec,
        roughness: 0.3,
        metallic: 0.1,
        rimColor: 0x94a3b8,
        rimPower: 4.0,
        rimStrength: 0.5,
      }),
      // Hit flash material
      hitFlashMat: new THREE.MeshBasicMaterial({
        color: 0xa5f3fc,
      }),
    };
  }

  buildLeviathanBody() {
    // 1. Build Head Segment
    this.headGroup = new THREE.Group();
    this.headGroup.name = 'Leviathan_Head';

    // Massive Draconic Skull
    const skullGeo = new THREE.BoxGeometry(4.6, 3.2, 5.8);
    this.skullMesh = new THREE.Mesh(skullGeo, this.mats.scalesDark);
    this.skullMesh.position.set(0, 0.4, 1.2);
    this.headGroup.add(this.skullMesh);

    // Elongated Snout & Brow
    const snoutGeo = new THREE.BoxGeometry(3.6, 2.2, 4.4);
    const snoutMesh = new THREE.Mesh(snoutGeo, this.mats.scalesMid);
    snoutMesh.position.set(0, -0.1, 5.4);
    this.headGroup.add(snoutMesh);

    // Upper Mandible Crest
    const crestGeo = new THREE.ConeGeometry(0.8, 3.2, 4);
    const crest = new THREE.Mesh(crestGeo, this.mats.dorsalSpike);
    crest.position.set(0, 2.0, 3.8);
    crest.rotation.x = -0.55;
    this.headGroup.add(crest);

    // Glowing Cyan Eyes
    const eyeGeo = new THREE.BoxGeometry(0.4, 0.6, 1.2);
    const eyeL = new THREE.Mesh(eyeGeo, this.mats.cyanEye);
    eyeL.position.set(-1.95, 0.8, 3.2);
    eyeL.rotation.y = -0.2;
    const eyeR = new THREE.Mesh(eyeGeo, this.mats.cyanEye);
    eyeR.position.set(1.95, 0.8, 3.2);
    eyeR.rotation.y = 0.2;
    this.headGroup.add(eyeL, eyeR);

    // Lower Jaws
    const jawGeo = new THREE.BoxGeometry(3.2, 1.2, 4.8);
    this.jawMesh = new THREE.Mesh(jawGeo, this.mats.scalesDark);
    this.jawMesh.position.set(0, -1.5, 4.6);
    this.jawMesh.rotation.x = 0.25;
    this.headGroup.add(this.jawMesh);

    // Razor Ivory Teeth
    for (let t = -1.2; t <= 1.2; t += 0.8) {
      const toothU = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.8, 4), this.mats.boneIvory);
      toothU.position.set(t, -1.0, 6.2);
      toothU.rotation.x = Math.PI;
      const toothL = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.7, 4), this.mats.boneIvory);
      toothL.position.set(t, -1.3, 5.8);
      this.headGroup.add(toothU, toothL);
    }

    // Throat Plasma Ball
    this.mawPlasma = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 10), this.mats.plasmaCore);
    this.mawPlasma.position.set(0, -0.6, 2.6);
    this.headGroup.add(this.mawPlasma);

    // Massive Swept-back Obsidian Horns (4 pairs)
    const hornConfigs = [
      { pos: [-1.8, 2.0, -0.5], rot: [-0.65, -0.35, -0.4], len: 4.8, r: 0.5 },
      { pos: [1.8, 2.0, -0.5], rot: [-0.65, 0.35, 0.4], len: 4.8, r: 0.5 },
      { pos: [-2.2, 1.2, -1.4], rot: [-0.4, -0.5, -0.7], len: 3.5, r: 0.4 },
      { pos: [2.2, 1.2, -1.4], rot: [-0.4, 0.5, 0.7], len: 3.5, r: 0.4 },
    ];
    hornConfigs.forEach(h => {
      const hornMesh = new THREE.Mesh(new THREE.ConeGeometry(h.r, h.len, 5), this.mats.dorsalSpike);
      hornMesh.position.set(...h.pos);
      hornMesh.rotation.set(...h.rot);
      this.headGroup.add(hornMesh);

      // Cyan glowing horn tip
      const tip = new THREE.Mesh(new THREE.ConeGeometry(h.r * 0.55, h.len * 0.3, 5), this.mats.cyanEye);
      tip.position.set(0, h.len * 0.38, 0);
      hornMesh.add(tip);
    });

    this.group.add(this.headGroup);

    // 2. Build 28 Articulated Body Segments
    // Each segment has dark scales, dorsal spines, and the signature double track of glowing cyan orbs
    for (let i = 0; i < this.numSegments; i++) {
      const segGroup = new THREE.Group();
      segGroup.name = `Leviathan_Seg_${i}`;

      const tRatio = i / this.numSegments; // 0.0 (near head) to 1.0 (tail tip)
      const segWidth = Math.max(1.1, 4.4 * (1.0 - tRatio * 0.75));
      const segHeight = Math.max(1.0, 3.4 * (1.0 - tRatio * 0.75));
      const segLength = 3.6;

      // Base Obsidian Body Block
      const bodyGeo = new THREE.BoxGeometry(segWidth, segHeight, segLength);
      const bodyMesh = new THREE.Mesh(bodyGeo, i % 2 === 0 ? this.mats.scalesDark : this.mats.scalesMid);
      segGroup.add(bodyMesh);

      // Dorsal Armor Plate & Jagged Spine
      const spineH = Math.max(0.6, 2.6 * (1.0 - tRatio * 0.7));
      const spineMesh = new THREE.Mesh(new THREE.ConeGeometry(0.55, spineH, 4), this.mats.dorsalSpike);
      spineMesh.position.set(0, segHeight * 0.5 + spineH * 0.4, -0.2);
      spineMesh.rotation.x = -0.3;
      segGroup.add(spineMesh);

      // ======================================================================
      // THE SIGNATURE REEL FEATURE: DOUBLE TRACK OF GLOWING CYAN-WHITE ORBS
      // Symmetrically placed on left and right flanks along the spine
      // ======================================================================
      const orbX = (segWidth * 0.44);
      const orbY = (segHeight * 0.52);
      const orbRadius = Math.max(0.22, 0.48 * (1.0 - tRatio * 0.6));

      // Left Track Orb
      const orbLGroup = new THREE.Group();
      orbLGroup.position.set(-orbX, orbY, 0);

      const glowL = new THREE.Mesh(new THREE.SphereGeometry(orbRadius, 8, 8), this.mats.cyanOrbGlow);
      const coreL = new THREE.Mesh(new THREE.SphereGeometry(orbRadius * 0.55, 6, 6), this.mats.cyanOrbCore);
      orbLGroup.add(glowL, coreL);
      segGroup.add(orbLGroup);

      // Right Track Orb
      const orbRGroup = new THREE.Group();
      orbRGroup.position.set(orbX, orbY, 0);

      const glowR = new THREE.Mesh(new THREE.SphereGeometry(orbRadius, 8, 8), this.mats.cyanOrbGlow);
      const coreR = new THREE.Mesh(new THREE.SphereGeometry(orbRadius * 0.55, 6, 6), this.mats.cyanOrbCore);
      orbRGroup.add(glowR, coreR);
      segGroup.add(orbRGroup);

      // Lateral Pectoral Stabilizer Fins for front-to-mid segments
      if (i >= 2 && i <= 8) {
        const finSpan = 6.5 - (i - 2) * 0.7;
        const finL = new THREE.Mesh(new THREE.BoxGeometry(finSpan, 0.15, 2.0), this.mats.scalesDark);
        finL.position.set(-segWidth * 0.5 - finSpan * 0.5, 0, 0);
        finL.rotation.z = 0.18;

        const finR = new THREE.Mesh(new THREE.BoxGeometry(finSpan, 0.15, 2.0), this.mats.scalesDark);
        finR.position.set(segWidth * 0.5 + finSpan * 0.5, 0, 0);
        finR.rotation.z = -0.18;

        // Cyan glow stripes on wingtips
        const finGlowL = new THREE.Mesh(new THREE.BoxGeometry(finSpan * 0.25, 0.2, 1.8), this.mats.cyanOrbGlow);
        finGlowL.position.set(-finSpan * 0.38, 0, 0);
        finL.add(finGlowL);

        const finGlowR = new THREE.Mesh(new THREE.BoxGeometry(finSpan * 0.25, 0.2, 1.8), this.mats.cyanOrbGlow);
        finGlowR.position.set(finSpan * 0.38, 0, 0);
        finR.add(finGlowR);

        segGroup.add(finL, finR);
      }

      // Tail Scythe Fluke for last 3 segments
      if (i >= this.numSegments - 3) {
        const flukeH = 3.2 - (this.numSegments - 1 - i) * 0.6;
        const fluke = new THREE.Mesh(new THREE.BoxGeometry(0.2, flukeH, 2.8), this.mats.dorsalSpike);
        fluke.position.set(0, 0, -1.2);
        fluke.rotation.x = -0.4;
        segGroup.add(fluke);
      }

      this.group.add(segGroup);
      this.segments.push({
        group: segGroup,
        bodyMesh: bodyMesh,
        originalMat: bodyMesh.material,
        width: segWidth,
        height: segHeight,
        index: i,
        orbs: [glowL, glowR],
      });

      // Initialize segment positions in trailing line behind head
      this.segmentPositions.push(new THREE.Vector3(0, 85, -120 - i * this.segmentSpacing));
    }
  }

  createBossHUD() {
    this.hudContainer = document.createElement('div');
    this.hudContainer.id = 'sky-leviathan-boss-hud';
    this.hudContainer.style.cssText = `
      position: fixed;
      top: 18px;
      left: 50%;
      transform: translateX(-50%);
      width: 580px;
      max-width: 90vw;
      text-align: center;
      z-index: 99998;
      display: none;
      font-family: 'Cinzel', 'Trajan Pro', 'Courier New', monospace;
      color: #fff;
      pointer-events: none;
      user-select: none;
    `;

    this.hudContainer.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 5px;">
        <span style="font-size: 15px; font-weight: 900; letter-spacing: 3.5px; color: #67e8f9; text-shadow: 0 0 12px #38bdf8, 2px 2px #000;">
          ABYSSAL SKY LEVIATHAN
        </span>
        <span id="leviathan-hp-val" style="font-size: 12px; color: #e0f2fe; font-family: monospace; letter-spacing: 1px;">
          1500 / 1500 HP
        </span>
      </div>
      <div style="background: rgba(7, 12, 18, 0.92); border: 2px solid #0284c7; border-radius: 4px; padding: 3px; box-shadow: 0 0 18px rgba(14, 165, 233, 0.5), inset 0 0 8px rgba(0,0,0,0.8);">
        <div id="leviathan-hp-bar" style="background: linear-gradient(90deg, #0369a1, #38bdf8, #a5f3fc); height: 16px; width: 100%; border-radius: 2px; transition: width 0.15s ease-out; box-shadow: 0 0 10px #38bdf8;"></div>
      </div>
      <div id="leviathan-status-text" style="font-size: 11px; color: #94a3b8; margin-top: 4px; letter-spacing: 1.5px; text-shadow: 1px 1px #000;">
        VOID WYRM • PATROLLING OVERCAST HEAVENS
      </div>
    `;

    document.body.appendChild(this.hudContainer);
  }

  initAudio() {
    if (this.audioCtx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtx();
    } catch {}
  }

  playRoarSound() {
    this.initAudio();
    if (!this.audioCtx) return;
    try {
      const t = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      const filter = this.audioCtx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(32, t + 1.8);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, t);
      filter.frequency.linearRampToValueAtTime(180, t + 1.8);

      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 2.0);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(t);
      osc.stop(t + 2.1);
    } catch {}
  }

  playPlasmaSound() {
    this.initAudio();
    if (!this.audioCtx) return;
    try {
      const t = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(480, t);
      osc.frequency.exponentialRampToValueAtTime(90, t + 0.45);

      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.52);
    } catch {}
  }

  /**
   * Spawns the colossal Sky Leviathan into the world sky.
   */
  spawn(spawnPos = null) {
    this.isActive = true;
    this.isDead = false;
    this.hp = this.maxHp;
    this.group.visible = true;

    const basePos = spawnPos || new THREE.Vector3(0, 80, -90);
    this.headPosition.copy(basePos);
    this.headGroup.position.copy(this.headPosition);

    for (let i = 0; i < this.numSegments; i++) {
      this.segmentPositions[i] = new THREE.Vector3(
        basePos.x,
        basePos.y,
        basePos.z - (i + 1) * this.segmentSpacing
      );
      this.segments[i].group.position.copy(this.segmentPositions[i]);
    }

    if (this.hudContainer) {
      this.hudContainer.style.display = 'block';
      this.updateHpUI();
    }

    this.playRoarSound();
    console.log('[SkyLeviathan] Spawned colossal Abyssal Sky Leviathan into sky airspace.');
  }

  updateHpUI() {
    const hpPct = Math.max(0, (this.hp / this.maxHp) * 100);
    const bar = document.getElementById('leviathan-hp-bar');
    const val = document.getElementById('leviathan-hp-val');
    if (bar) bar.style.width = `${hpPct}%`;
    if (val) val.innerText = `${Math.ceil(this.hp)} / ${this.maxHp} HP`;
  }

  /**
   * Hit detection against all body segments and head.
   * Called by Stuka machine gun bullets and 250kg bombs.
   */
  checkHit(targetPos, hitRadius = 2.5) {
    if (!this.isActive || this.isDead) return null;

    // Check Head Hit (Critical Damage x2.5)
    if (this.headPosition.distanceTo(targetPos) < (4.2 + hitRadius)) {
      return { hit: true, part: 'head', isCrit: true };
    }

    // Check Segments
    for (let i = 0; i < this.segments.length; i++) {
      const segPos = this.segmentPositions[i];
      const segRadius = (this.segments[i].width * 0.6) + hitRadius;
      if (segPos.distanceTo(targetPos) < segRadius) {
        return { hit: true, part: 'body', segmentIndex: i, isCrit: false };
      }
    }

    return null;
  }

  /**
   * Apply combat damage to the Leviathan with visual flash and particle burst.
   */
  takeDamage(amount, hitInfo = null) {
    if (!this.isActive || this.isDead) return;

    const actualDmg = (hitInfo && hitInfo.isCrit) ? amount * 2.2 : amount;
    this.hp -= actualDmg;

    // Trigger Combat Aggro / Dive State if roaming
    if (this.state === 'PATROL') {
      this.state = 'DIVE_ATTACK';
      this.stateTimer = 0;
      this.playRoarSound();
      const statusEl = document.getElementById('leviathan-status-text');
      if (statusEl) {
        statusEl.innerText = 'AGGRESSION TRIGGERED • HIGH-SPEED VOID DIVE-BOMB!';
        statusEl.style.color = '#f87171';
      }
    }

    // Visual Damage Flash on affected parts
    this.flashDamage(hitInfo);
    this.spawnHitSparks(hitInfo ? (hitInfo.part === 'head' ? this.headPosition : this.segmentPositions[hitInfo.segmentIndex || 0]) : this.headPosition);
    this.updateHpUI();

    if (this.hp <= 0) {
      this.triggerDeath();
    }
  }

  flashDamage(hitInfo) {
    const flashList = [];
    if (hitInfo && hitInfo.part === 'head') {
      flashList.push(this.skullMesh);
    } else if (hitInfo && hitInfo.segmentIndex !== undefined && this.segments[hitInfo.segmentIndex]) {
      flashList.push(this.segments[hitInfo.segmentIndex].bodyMesh);
    } else {
      // Flash first few segments
      for (let i = 0; i < 4; i++) {
        flashList.push(this.segments[i].bodyMesh);
      }
    }

    flashList.forEach(mesh => {
      if (mesh) {
        const orig = mesh.material;
        mesh.material = this.mats.hitFlashMat;
        setTimeout(() => {
          if (mesh) mesh.material = orig;
        }, 85);
      }
    });
  }

  spawnHitSparks(pos) {
    const count = 12;
    for (let i = 0; i < count; i++) {
      const spark = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.3, 0.3),
        new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? 0x67e8f9 : 0xffffff })
      );
      spark.position.copy(pos);
      spark.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 25,
        (Math.random() - 0.5) * 25,
        (Math.random() - 0.5) * 25
      );
      spark.userData.life = 0.5 + Math.random() * 0.4;
      this.scene.add(spark);
      this.hitParticles.push(spark);
    }
  }

  triggerDeath() {
    this.isDead = true;
    this.state = 'DEFEATED';
    this.stateTimer = 0;
    this.playRoarSound();

    const statusEl = document.getElementById('leviathan-status-text');
    if (statusEl) {
      statusEl.innerText = 'LEVIATHAN SLOCKED! THE HEAVENS ARE CONQUERED!';
      statusEl.style.color = '#38bdf8';
    }
  }

  /**
   * Fires a cluster of Cyan Void Plasma Orbs from the Leviathan's maw.
   */
  firePlasmaBarrage(targetPos) {
    this.playPlasmaSound();
    const count = 3;
    const mawPos = this.headPosition.clone().add(new THREE.Vector3(0, -0.6, 3).applyEuler(this.headRotation));

    for (let i = 0; i < count; i++) {
      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 12
      );
      const targetWithSpread = targetPos.clone().add(spread);
      const dir = targetWithSpread.clone().sub(mawPos).normalize();

      const orbMesh = new THREE.Mesh(
        new THREE.SphereGeometry(1.2, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
      );
      orbMesh.position.copy(mawPos);

      // Inner white core
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 8), this.mats.cyanOrbCore);
      orbMesh.add(core);

      orbMesh.userData = {
        velocity: dir.multiplyScalar(48), // 48 m/s plasma velocity
        life: 6.0,
        damage: 25,
      };

      this.scene.add(orbMesh);
      this.plasmaOrbs.push(orbMesh);
    }
  }

  /**
   * Main per-frame update loop:
   * Handles sinuous 3D inverse kinematics, serpentine undulating spline waves,
   * combat AI state transitions, and plasma orb trajectory.
   */
  update(deltaTime, playerPosition = null, stukaSystem = null) {
    if (!this.isActive) return;

    this.flightTime += deltaTime;
    this.stateTimer += deltaTime;
    this.undulationTimer += deltaTime * 2.2;

    // Update real-time shader uniform times for energy pulsing
    if (this.mats.cyanOrbGlow && this.mats.cyanOrbGlow.uniforms) {
      this.mats.cyanOrbGlow.uniforms.uTime.value += deltaTime;
    }
    if (this.mats.plasmaCore && this.mats.plasmaCore.uniforms) {
      this.mats.plasmaCore.uniforms.uTime.value += deltaTime;
    }

    // Update Atmospheric Cloud Deck & Distant Mountains
    if (this.skyEnclosure && this.skyEnclosure.group.visible) {
      this.skyEnclosure.update(deltaTime, this.headPosition);
    }

    const pPos = playerPosition || new THREE.Vector3(0, 45, 0);

    // ========================================================================
    // 1. BEHAVIOR STATE MACHINE
    // ========================================================================
    if (this.isDead) {
      // Death spiral descending into clouds
      this.headPosition.y -= 25 * deltaTime;
      this.headRotation.z += 1.8 * deltaTime;
      this.headRotation.x -= 0.6 * deltaTime;

      if (this.stateTimer > 7.0) {
        this.isActive = false;
        this.group.visible = false;
        if (this.hudContainer) this.hudContainer.style.display = 'none';
      }
    } else if (this.state === 'PATROL') {
      // Majestic sweeping flight through overcast clouds
      this.flightAngle += deltaTime * 0.22;
      const patrolRadius = 90.0;
      const targetX = Math.sin(this.flightAngle) * patrolRadius;
      const targetZ = Math.cos(this.flightAngle) * patrolRadius;
      const targetY = 82.0 + Math.sin(this.flightTime * 0.5) * 16.0;

      const steerTarget = new THREE.Vector3(targetX, targetY, targetZ);
      const steerDir = steerTarget.clone().sub(this.headPosition).normalize();
      this.headVelocity.lerp(steerDir, deltaTime * 1.5);
      this.headPosition.addScaledVector(this.headVelocity, this.speed * deltaTime);

      // Align head orientation
      const lookTarget = this.headPosition.clone().add(this.headVelocity);
      this.headGroup.lookAt(lookTarget);

      if (this.stateTimer > 20.0) {
        this.state = 'DIVE_ATTACK';
        this.stateTimer = 0;
        this.playRoarSound();
      }
    } else if (this.state === 'DIVE_ATTACK') {
      // High-speed dive intercepting the player's Stuka flight path!
      const diveTarget = pPos.clone().add(new THREE.Vector3(0, -6, 0));
      const steerDir = diveTarget.sub(this.headPosition).normalize();
      this.headVelocity.lerp(steerDir, deltaTime * 2.4);
      this.headPosition.addScaledVector(this.headVelocity, (this.speed * 1.45) * deltaTime);

      const lookTarget = this.headPosition.clone().add(this.headVelocity);
      this.headGroup.lookAt(lookTarget);

      // Jaws open wide during dive
      this.jawMesh.rotation.x = 0.55 + Math.sin(this.flightTime * 8) * 0.2;

      // Close to player or dive timed out -> transition to plasma barrage
      if (this.headPosition.distanceTo(pPos) < 28.0 || this.stateTimer > 6.5) {
        this.state = 'PLASMA_BARRAGE';
        this.stateTimer = 0;
      }
    } else if (this.state === 'PLASMA_BARRAGE') {
      // Swoop upward and discharge homing cyan plasma orbs
      const ascendTarget = pPos.clone().add(new THREE.Vector3(0, 40, 20));
      const steerDir = ascendTarget.sub(this.headPosition).normalize();
      this.headVelocity.lerp(steerDir, deltaTime * 2.0);
      this.headPosition.addScaledVector(this.headVelocity, this.speed * deltaTime);

      const lookTarget = this.headPosition.clone().add(this.headVelocity);
      this.headGroup.lookAt(lookTarget);

      // Fire 2 volleys during this phase
      if (this.stateTimer > 1.0 && this.stateTimer < 1.2 && !this.volleyFired1) {
        this.firePlasmaBarrage(pPos);
        this.volleyFired1 = true;
      }
      if (this.stateTimer > 2.5 && this.stateTimer < 2.7 && !this.volleyFired2) {
        this.firePlasmaBarrage(pPos);
        this.volleyFired2 = true;
      }

      if (this.stateTimer > 4.5) {
        this.volleyFired1 = false;
        this.volleyFired2 = false;
        this.state = 'PATROL';
        this.stateTimer = 0;
      }
    }

    this.headGroup.position.copy(this.headPosition);

    // ========================================================================
    // 2. SERPENTINE UNDULATING INVERSE KINEMATICS
    // Propagate position & rotation through all 28 body segments
    // ========================================================================
    let prevPos = this.headPosition;

    for (let i = 0; i < this.numSegments; i++) {
      const seg = this.segments[i];
      const curPos = this.segmentPositions[i];

      // Distance constraint: keep segment spacing
      const toPrev = prevPos.clone().sub(curPos);
      const dist = toPrev.length();

      if (dist > this.segmentSpacing) {
        toPrev.normalize().multiplyScalar(dist - this.segmentSpacing);
        curPos.add(toPrev);
      }

      // Add lateral serpentine sine undulation wave
      const wavePhase = this.undulationTimer - i * 0.32;
      const waveAmplitude = Math.sin(wavePhase) * (1.1 + (i / this.numSegments) * 1.8);
      
      // Calculate perpendicular vector for lateral swing
      const forwardDir = prevPos.clone().sub(curPos).normalize();
      const rightDir = new THREE.Vector3(-forwardDir.z, 0, forwardDir.x).normalize();
      const waveOffset = rightDir.multiplyScalar(waveAmplitude * deltaTime * 12);
      curPos.add(waveOffset);

      // Update segment group
      seg.group.position.copy(curPos);
      seg.group.lookAt(prevPos);

      // Pulse cyan bioluminescent orbs
      const pulse = 0.8 + Math.sin(this.flightTime * 3.5 + i * 0.4) * 0.35;
      seg.orbs.forEach(orb => orb.scale.set(pulse, pulse, pulse));

      prevPos = curPos;
    }

    // ========================================================================
    // 3. UPDATE CYAN VOID PLASMA ORBS & FLARE DECOY INTERACTION
    // ========================================================================
    for (let i = this.plasmaOrbs.length - 1; i >= 0; i--) {
      const orb = this.plasmaOrbs[i];
      orb.userData.life -= deltaTime;

      // Flare Decoy Interaction: If player ejected Stuka flares, orbs lock onto flares!
      let decoyFound = false;
      if (stukaSystem && stukaSystem.flares && stukaSystem.flares.length > 0) {
        let nearestFlare = null;
        let nearestDist = 999;
        stukaSystem.flares.forEach(fl => {
          const d = fl.position.distanceTo(orb.position);
          if (d < 45 && d < nearestDist) {
            nearestDist = d;
            nearestFlare = fl;
          }
        });

        if (nearestFlare) {
          const flareDir = nearestFlare.position.clone().sub(orb.position).normalize();
          orb.userData.velocity.lerp(flareDir.multiplyScalar(42), deltaTime * 4.0);
          decoyFound = true;

          // Detonate on flare impact
          if (nearestDist < 3.0) {
            this.scene.remove(orb);
            this.plasmaOrbs.splice(i, 1);
            continue;
          }
        }
      }

      // If not decoyed, slightly home in on player's Stuka
      if (!decoyFound) {
        const toPlayer = pPos.clone().sub(orb.position).normalize();
        orb.userData.velocity.lerp(toPlayer.multiplyScalar(42), deltaTime * 0.7);
      }

      orb.position.addScaledVector(orb.userData.velocity, deltaTime);

      // Check collision with player Stuka
      if (orb.position.distanceTo(pPos) < 4.2) {
        // Player hit by void plasma
        if (window.damagePlayer) window.damagePlayer(orb.userData.damage);
        this.spawnHitSparks(orb.position);
        this.scene.remove(orb);
        this.plasmaOrbs.splice(i, 1);
        continue;
      }

      if (orb.userData.life <= 0 || orb.position.y < 0) {
        this.scene.remove(orb);
        this.plasmaOrbs.splice(i, 1);
      }
    }

    // ========================================================================
    // 4. HIT PARTICLES
    // ========================================================================
    for (let i = this.hitParticles.length - 1; i >= 0; i--) {
      const p = this.hitParticles[i];
      p.userData.life -= deltaTime;
      p.position.addScaledVector(p.userData.velocity, deltaTime);
      p.scale.multiplyScalar(0.96);

      if (p.userData.life <= 0) {
        this.scene.remove(p);
        this.hitParticles.splice(i, 1);
      }
    }
  }

  /**
   * Sets up the cinematic luminous overcast sky and vast open visibility matching the reel!
   */
  applyReelAtmosphere(scene, renderer) {
    // Open, luminous silver-grey overcast sky matching the viral reel (@cloudgamesid)
    const overcastColor = new THREE.Color(0xd2dce4);
    scene.background = overcastColor;
    if (scene.fog && scene.fog.isFog) {
      scene.fog.color.copy(overcastColor);
      scene.fog.near = 280;
      scene.fog.far = 1100;
    } else {
      scene.fog = new THREE.Fog(0xd2dce4, 280, 1100);
    }

    if (this.skyEnclosure) {
      this.skyEnclosure.group.visible = true;
    }
    console.log('[SkyLeviathan] Applied luminous silver overcast sky (0xd2dce4) & open linear fog (280-1100m).');
  }
}
