import * as THREE from 'three';

/**
 * DragonArenaSystem.js
 * 
 * Implements the Open & Dangerous Calamity Caldera Boss Dimension
 * for the Three-Headed Emerald Titan.
 * 
 * LAPTOP PERFORMANCE ARCHITECTURE (Intel Core i5-10200H + NVIDIA GTX 1650 4GB):
 * - Suspends heavy Overworld loops (infinite chunk meshing, daylight updates, 
 *   weather/particles, passive animal AI, mob spawner).
 * - Open 110m fractured terrain with glowing toxic green lava fissures and central sunken caldera.
 * - ZERO healing beams.
 * - Neutral Free-Will roaming until provoked; retaliatory combat AI when attacked.
 * - 100% of GPU/CPU frame budget dedicated to dragon flight, wing flapping, and 60+ FPS boss combat.
 */

export class DragonArenaSystem {
  constructor(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    this.isActive = false;
    this.arenaGroup = new THREE.Group();
    this.arenaGroup.name = "Dragon_Boss_Arena_Dimension";
    this.arenaGroup.visible = false;
    this.scene.add(this.arenaGroup);

    // Boss State
    this.bossMaxHP = 1000;
    this.bossHP = 1000;
    this.isAggro = false; // Peaceful Free Will initially
    this.bossPhase = 'FREE_ROAM'; // FREE_ROAM, DIVE_BOMB, PERCH_ROAR, RETALIATE_CIRCLING
    this.phaseTimer = 0;
    this.flightAngle = 0;
    this.wingFlapTime = 0;

    // Embers
    this.embers = [];

    // Saved Overworld player position
    this.savedOverworldPos = new THREE.Vector3(8, 20, 11);

    // Build the 3D Arena & Dragon
    this.initMaterials();
    this.buildDangerousCalderaEnvironment();
    this.buildThreeHeadedDragon();
    this.createBossUI();
  }

  initMaterials() {
    this.mats = {
      deepslate: new THREE.MeshStandardMaterial({ color: 0x181c19, roughness: 0.85 }),
      bedrock: new THREE.MeshStandardMaterial({ color: 0x0f1310, roughness: 0.92 }),
      obsidian: new THREE.MeshStandardMaterial({ color: 0x0c0912, roughness: 0.32, metalness: 0.3 }),
      toxicLava: new THREE.MeshBasicMaterial({ color: 0x39ff14 }),
      neonCrystal: new THREE.MeshBasicMaterial({ color: 0x55ff33 }),
      dragonScale: new THREE.MeshStandardMaterial({ color: 0x0c2514, roughness: 0.55 }),
      emeraldPlate: new THREE.MeshStandardMaterial({ color: 0x185526, roughness: 0.45 }),
      ivory: new THREE.MeshStandardMaterial({ color: 0xdfdac5, roughness: 0.30 }),
      fireCore: new THREE.MeshBasicMaterial({ color: 0x66ff33 })
    };
  }

  buildDangerousCalderaEnvironment() {
    const g = this.arenaGroup;

    // 1. Vast Fractured Tectonic Continent (110m wide)
    const islandGeo = new THREE.CylinderGeometry(55, 45, 5, 24);
    const island = new THREE.Mesh(islandGeo, this.mats.deepslate);
    island.position.set(0, -2.5, 0);
    island.receiveShadow = true;
    g.add(island);

    // 2. Glowing Toxic Green Lava Fissures
    const fissureAngles = [0, 45, 90, 135, 180, 225, 270, 315];
    fissureAngles.forEach(deg => {
      const rad = deg * Math.PI / 180;
      const fGeo = new THREE.BoxGeometry(2.4, 0.3, 38);
      const fMesh = new THREE.Mesh(fGeo, this.mats.toxicLava);
      fMesh.position.set(Math.sin(rad) * 28, 0.05, Math.cos(rad) * 28);
      fMesh.rotation.y = rad;
      g.add(fMesh);

      // Basalt banks
      const bL = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 36), this.mats.obsidian);
      bL.position.set(Math.sin(rad) * 28 + Math.cos(rad) * 1.8, 0.3, Math.cos(rad) * 28 - Math.sin(rad) * 1.8);
      bL.rotation.y = rad;
      const bR = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 36), this.mats.obsidian);
      bR.position.set(Math.sin(rad) * 28 - Math.cos(rad) * 1.8, 0.3, Math.cos(rad) * 28 + Math.sin(rad) * 1.8);
      bR.rotation.y = rad;
      g.add(bL, bR);
    });

    // 3. Sunken Calamity Caldera
    const calderaOuter = new THREE.Mesh(new THREE.CylinderGeometry(18, 17, 1.2, 20), this.mats.bedrock);
    calderaOuter.position.set(0, 0.3, 0);
    const calderaInner = new THREE.Mesh(new THREE.CylinderGeometry(15, 14, 0.6, 20), this.mats.toxicLava);
    calderaInner.position.set(0, 0.5, 0);
    g.add(calderaOuter, calderaInner);

    // 4. Central Wyrm's Throne Crag
    const throneCrag = new THREE.Mesh(new THREE.BoxGeometry(9, 3.2, 9), this.mats.obsidian);
    throneCrag.position.set(0, 1.8, 0);
    const throneAltar = new THREE.Mesh(new THREE.BoxGeometry(6, 1.0, 6), this.mats.bedrock);
    throneAltar.position.set(0, 3.8, 0);
    const throneRune = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.1, 3.5), this.mats.toxicLava);
    throneRune.position.set(0, 4.35, 0);
    g.add(throneCrag, throneAltar, throneRune);

    // 5. 12 Obsidian Caldera Fangs
    for (let i = 0; i < 12; i++) {
      const a = (i * 30) * Math.PI / 180;
      const fx = Math.sin(a) * 16.5;
      const fz = Math.cos(a) * 16.5;
      const fh = 6.0 + (i % 3) * 3.0;

      const fang = new THREE.Mesh(new THREE.ConeGeometry(1.6, fh, 4), this.mats.obsidian);
      fang.position.set(fx, fh * 0.5, fz);
      fang.rotation.x = Math.cos(a) * 0.35;
      fang.rotation.z = -Math.sin(a) * 0.35;
      fang.rotation.y = -a;
      g.add(fang);
    }

    // 6. Floating Green Embers
    const emberGeo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
    for (let i = 0; i < 50; i++) {
      const eMesh = new THREE.Mesh(emberGeo, this.mats.neonCrystal);
      eMesh.position.set(
        (Math.random() - 0.5) * 60,
        Math.random() * 18 + 0.5,
        (Math.random() - 0.5) * 60
      );
      eMesh.userData.speedY = 0.5 + Math.random() * 0.8;
      g.add(eMesh);
      this.embers.push(eMesh);
    }
  }

  buildThreeHeadedDragon() {
    this.dragon = new THREE.Group();
    this.dragon.name = "Three_Headed_Emerald_Titan";

    // Main Body Chest
    const chest = new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.6, 3.8), this.mats.dragonScale);
    this.dragon.add(chest);

    // Front Chest Armor Plates
    for (let i = 0; i < 4; i++) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(3.6 - i * 0.5, 0.65, 0.4), this.mats.emeraldPlate);
      plate.position.set(0, -0.9 + i * 0.75, 2.0);
      this.dragon.add(plate);
    }

    // 4 Heavy Legs
    [[-2.2, 1.4], [2.2, 1.4], [-2.0, -1.8], [2.0, -1.8]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.6, 1.4), this.mats.dragonScale);
      leg.position.set(lx, -2.4, lz);
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 4), this.mats.neonCrystal);
      claw.position.set(lx, -3.7, lz + 0.7);
      claw.rotation.x = Math.PI * 0.5;
      this.dragon.add(leg, claw);
    });

    // 2 Flapping Wings
    this.wingL = new THREE.Group();
    this.wingL.position.set(-2.2, 1.4, 0.4);
    const sparL = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.7, 0.7), this.mats.dragonScale);
    sparL.position.set(-4.2, 0, 0);
    const memL = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.12, 5.0), this.mats.emeraldPlate);
    memL.position.set(-4.2, -0.1, -2.4);
    this.wingL.add(sparL, memL);
    this.dragon.add(this.wingL);

    this.wingR = new THREE.Group();
    this.wingR.position.set(2.2, 1.4, 0.4);
    const sparR = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.7, 0.7), this.mats.dragonScale);
    sparR.position.set(4.2, 0, 0);
    const memR = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.12, 5.0), this.mats.emeraldPlate);
    memR.position.set(4.2, -0.1, -2.4);
    this.wingR.add(sparR, memR);
    this.dragon.add(this.wingR);

    // THREE HEADS (Left, Center, Right)
    this.heads = [];
    const headConfigs = [
      { name: 'Head_C', pos: [0, 3.8, 3.4], rot: [0.35, 0, 0], scale: 1.1 },
      { name: 'Head_L', pos: [-3.8, 3.2, 2.6], rot: [0.22, 0.5, 0], scale: 1.0 },
      { name: 'Head_R', pos: [3.8, 3.2, 2.6], rot: [0.22, -0.5, 0], scale: 1.0 },
    ];

    headConfigs.forEach(cfg => {
      const hGroup = new THREE.Group();
      hGroup.position.set(...cfg.pos);
      hGroup.rotation.set(...cfg.rot);
      hGroup.scale.setScalar(cfg.scale);

      const skull = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.5, 1.6), this.mats.dragonScale);
      const snout = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.8), this.mats.dragonScale);
      snout.position.set(0, -0.2, 1.6);

      const jaw = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.45, 1.7), this.mats.dragonScale);
      jaw.position.set(0, -0.9, 1.3);
      jaw.rotation.x = -0.4;

      // Ivory Teeth
      [-0.45, 0, 0.45].forEach(tx => {
        const toothU = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 4), this.mats.ivory);
        toothU.position.set(tx, -0.65, 2.2);
        toothU.rotation.x = Math.PI;
        const toothL = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 4), this.mats.ivory);
        toothL.position.set(tx, -0.7, 1.8);
        hGroup.add(toothU, toothL);
      });

      const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.35, 0.35), this.mats.neonCrystal);
      eyeL.position.set(-0.95, 0.25, 0.6);
      const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.35, 0.35), this.mats.neonCrystal);
      eyeR.position.set(0.95, 0.25, 0.6);

      const fire = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.9), this.mats.fireCore);
      fire.position.set(0, -0.4, 1.1);

      const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.4, 4), this.mats.neonCrystal);
      hornL.position.set(-0.7, 1.1, -0.6);
      hornL.rotation.x = -0.8;
      hornL.rotation.z = -0.2;
      const hornR = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.4, 4), this.mats.neonCrystal);
      hornR.position.set(0.7, 1.1, -0.6);
      hornR.rotation.x = -0.8;
      hornR.rotation.z = 0.2;

      hGroup.add(skull, snout, jaw, eyeL, eyeR, fire, hornL, hornR);
      this.dragon.add(hGroup);
      this.heads.push({ group: hGroup, fireMesh: fire });
    });

    this.dragon.position.set(0, 16, 0);
    this.arenaGroup.add(this.dragon);
  }

  createBossUI() {
    this.uiContainer = document.createElement('div');
    this.uiContainer.id = 'dragon-boss-arena-hud';
    this.uiContainer.style.cssText = `
      position: fixed;
      top: 14px;
      left: 50%;
      transform: translateX(-50%);
      width: 600px;
      max-width: 90vw;
      text-align: center;
      z-index: 99999;
      display: none;
      font-family: 'Minecraft', 'Segoe UI', monospace;
      color: #fff;
      pointer-events: none;
      user-select: none;
    `;

    this.uiContainer.innerHTML = `
      <div style="font-size: 16px; font-weight: bold; letter-spacing: 3px; color: #44ff55; text-shadow: 0 0 10px #00ff44, 2px 2px #000; margin-bottom: 5px;">
        THREE-HEADED EMERALD TITAN
      </div>
      <div style="background: rgba(10, 20, 12, 0.85); border: 2px solid #228833; border-radius: 4px; padding: 3px; box-shadow: 0 0 14px rgba(50, 255, 80, 0.4);">
        <div id="dragon-boss-hp-bar" style="background: linear-gradient(90deg, #11aa33, #44ff66); height: 18px; width: 100%; border-radius: 2px; transition: width 0.15s ease-out;"></div>
      </div>
      <div id="dragon-boss-status" style="font-size: 11px; color: #aaffaa; margin-top: 5px; text-shadow: 1px 1px #000;">
        FREE WILL (NEUTRAL) — Titan is roaming peacefully. Attack to engage!
      </div>
    `;

    document.body.appendChild(this.uiContainer);
  }

  enterArena(playerControls) {
    if (this.isActive) return;
    this.isActive = true;

    this.savedOverworldPos.copy(playerControls.playerPosition);
    playerControls.playerPosition.set(0, 3.5, 38.0);
    this.camera.position.set(0, 3.5, 38.0);
    this.camera.lookAt(0, 10.0, 0);

    this.scene.background = new THREE.Color(0x030704);
    if (this.scene.fog) {
      this.scene.fog.color.set(0x030704);
      this.scene.fog.density = 0.008;
    }

    this.arenaGroup.visible = true;
    this.uiContainer.style.display = 'block';

    console.log("=== ENTERED CALAMITY CALDERA: Overworld Frozen, 100% Focus on Boss Fight ===");
  }

  exitArena(playerControls) {
    if (!this.isActive) return;
    this.isActive = false;

    playerControls.playerPosition.copy(this.savedOverworldPos);
    this.arenaGroup.visible = false;
    this.uiContainer.style.display = 'none';

    this.scene.background = new THREE.Color(0x7cc8f8);
    if (this.scene.fog) {
      this.scene.fog.color.set(0x7cc8f8);
      this.scene.fog.density = 0.011;
    }

    console.log("=== EXITED CALAMITY CALDERA: Overworld Simulation Resumed ===");
  }

  triggerAggro() {
    if (!this.isAggro) {
      this.isAggro = true;
      const statusEl = document.getElementById('dragon-boss-status');
      if (statusEl) {
        statusEl.textContent = 'AGGRO TRIGGERED! Titan is retaliating with fury!';
        statusEl.style.color = '#ff3333';
      }
      this.bossPhase = 'DIVE_BOMB';
      this.phaseTimer = 0;
    }
  }

  damageBoss(amount) {
    this.triggerAggro();
    this.bossHP = Math.max(0, this.bossHP - amount);
    const hpPct = (this.bossHP / this.bossMaxHP) * 100;
    const bar = document.getElementById('dragon-boss-hp-bar');
    if (bar) bar.style.width = `${hpPct}%`;

    if (this.bossHP <= 0) {
      const statusEl = document.getElementById('dragon-boss-status');
      if (statusEl) statusEl.textContent = 'TITAN DEFEATED! The Calamity Caldera is conquered!';
    }
  }

  update(delta, playerPos) {
    if (!this.isActive) return;

    this.phaseTimer += delta;
    this.wingFlapTime += delta * (this.isAggro ? 8.5 : 5.0);

    // 1. Wings
    const flap = Math.sin(this.wingFlapTime) * 0.45;
    this.wingL.rotation.z = flap;
    this.wingR.rotation.z = -flap;

    // 2. Embers
    this.embers.forEach(e => {
      e.position.y += e.userData.speedY * delta;
      if (e.position.y > 20.0) {
        e.position.y = 0.5;
        e.position.x = (Math.random() - 0.5) * 60;
        e.position.z = (Math.random() - 0.5) * 60;
      }
    });

    // 3. Free-Will & Retaliation Boss AI State Machine
    if (this.bossPhase === 'FREE_ROAM') {
      this.flightAngle += delta * 0.35;
      const rRad = 32.0;
      const flyX = Math.sin(this.flightAngle) * rRad;
      const flyZ = Math.cos(this.flightAngle) * rRad;
      const flyY = 16.0 + Math.sin(this.flightAngle * 2.0) * 3.5;

      this.dragon.position.set(flyX, flyY, flyZ);
      this.dragon.rotation.y = this.flightAngle + Math.PI * 0.5;
      this.dragon.rotation.z = Math.sin(this.flightAngle) * 0.2;

      if (this.phaseTimer > 14.0) {
        this.bossPhase = 'PERCH_ROAR';
        this.phaseTimer = 0;
      }
    } else if (this.bossPhase === 'PERCH_ROAR') {
      const perchPos = new THREE.Vector3(0, 7.5, 0);
      this.dragon.position.lerp(perchPos, delta * 2.0);
      this.dragon.lookAt(playerPos.x, this.dragon.position.y, playerPos.z);

      const fireScale = 1.0 + Math.sin(this.phaseTimer * 12.0) * 0.35;
      this.heads.forEach(h => h.fireMesh.scale.set(fireScale, fireScale, fireScale * 1.3));

      if (this.phaseTimer > 6.0) {
        this.heads.forEach(h => h.fireMesh.scale.set(1, 1, 1));
        this.bossPhase = this.isAggro ? 'DIVE_BOMB' : 'FREE_ROAM';
        this.phaseTimer = 0;
      }
    } else if (this.bossPhase === 'DIVE_BOMB') {
      const target = new THREE.Vector3(playerPos.x, 3.8, playerPos.z);
      this.dragon.position.lerp(target, delta * 2.2);
      this.dragon.lookAt(playerPos.x, playerPos.y + 1.0, playerPos.z);

      if (this.phaseTimer > 3.8 || this.dragon.position.distanceTo(target) < 4.0) {
        this.bossPhase = 'RETALIATE_CIRCLING';
        this.phaseTimer = 0;
      }
    } else if (this.bossPhase === 'RETALIATE_CIRCLING') {
      this.flightAngle += delta * 0.7;
      const rRad = 24.0;
      const flyX = Math.sin(this.flightAngle) * rRad;
      const flyZ = Math.cos(this.flightAngle) * rRad;
      const flyY = 13.0 + Math.sin(this.flightAngle * 3.0) * 4.0;

      this.dragon.position.set(flyX, flyY, flyZ);
      this.dragon.lookAt(playerPos.x, playerPos.y, playerPos.z);

      if (this.phaseTimer > 7.0) {
        this.bossPhase = Math.random() > 0.5 ? 'DIVE_BOMB' : 'PERCH_ROAR';
        this.phaseTimer = 0;
      }
    }
  }
}
