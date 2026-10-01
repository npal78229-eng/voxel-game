import * as THREE from 'three';
import { LIGHTNING_CONFIG } from '../config/lightning.js';

// ============================================================================
// Lightning Strike System (Phase 6 — src/weather/Lightning.js)
// Natural strikes during rain & thunderstorms with target weights:
// LIVING: 30 (17.65%), TREE: 60 (35.29%), BLOCK: 80 (47.06%)
// Procedural visual bolt, delayed thunder audio, tree charring & scorched ground
// ============================================================================

export class LightningSystem {
  constructor(scene, world, mobs, sfx = null) {
    this.scene = scene;
    this.world = world;
    this.mobs = mobs;
    this.sfx = sfx;

    this.strikeTimer = 12.0;
    this.activeBolts = [];
    this.pendingThunders = [];
    this.debugEnabled = false;

    // Audio context for procedural thunder synthesis
    this.audioCtx = null;
    this._initAudio();

    // Reusable materials
    this.boltMaterial = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  _initAudio() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.audioCtx = new AudioCtx();
    } catch (_) {}
  }

  _ensureAudio() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  /**
   * Rolls a target category based on centralized weights (Living: 30, Tree: 60, Block: 80)
   */
  rollTargetType(weights = LIGHTNING_CONFIG.TARGET_WEIGHTS) {
    const total = weights.LIVING + weights.TREE + weights.BLOCK;
    const r = Math.random() * total;
    if (r < weights.LIVING) return 'LIVING';
    if (r < weights.LIVING + weights.TREE) return 'TREE';
    return 'BLOCK';
  }

  /**
   * Run simulation benchmark of N target weight rolls for testing & verification.
   */
  simulateTargetRolls(n = 10000) {
    const counts = { LIVING: 0, TREE: 0, BLOCK: 0 };
    for (let i = 0; i < n; i++) {
      const t = this.rollTargetType();
      counts[t]++;
    }
    return {
      total: n,
      living: { count: counts.LIVING, pct: Number(((counts.LIVING / n) * 100).toFixed(2)) },
      tree: { count: counts.TREE, pct: Number(((counts.TREE / n) * 100).toFixed(2)) },
      block: { count: counts.BLOCK, pct: Number(((counts.BLOCK / n) * 100).toFixed(2)) },
    };
  }

  /**
   * Main per-frame update loop.
   */
  update(deltaTime, playerPosition, weather, onPlayerDamaged = null) {
    const isStorm = weather === 'thunderstorm' || weather === 'heavy_rain';
    const isLightRain = weather === 'light_rain';
    const isRaining = isStorm || isLightRain;

    // 1. Tick Natural Lightning Strike Timer during rain
    if (isRaining && playerPosition) {
      this.strikeTimer -= deltaTime;
      if (this.strikeTimer <= 0) {
        // Roll next interval
        const [minI, maxI] = isStorm
          ? LIGHTNING_CONFIG.STRIKE_INTERVAL_STORM
          : LIGHTNING_CONFIG.STRIKE_INTERVAL_LIGHT_RAIN;
        this.strikeTimer = minI + Math.random() * (maxI - minI);

        // Trigger natural strike near player
        this.triggerStrike(null, playerPosition, onPlayerDamaged);
      }
    } else {
      // Not raining: keep timer at minimum readiness
      if (this.strikeTimer < 8.0) this.strikeTimer = 8.0;
    }

    // 2. Animate and clean active visual bolts
    for (let i = this.activeBolts.length - 1; i >= 0; i--) {
      const bolt = this.activeBolts[i];
      bolt.age += deltaTime;
      if (bolt.age >= bolt.lifetime) {
        this.scene.remove(bolt.meshGroup);
        this._disposeGroup(bolt.meshGroup);
        this.activeBolts.splice(i, 1);
      } else {
        // Rapid flicker effect
        const flicker = Math.sin(bolt.age * 70) > 0 ? 1.0 : 0.45;
        bolt.meshGroup.visible = flicker > 0.5;
      }
    }

    // 3. Process delayed thunder audio
    for (let i = this.pendingThunders.length - 1; i >= 0; i--) {
      const pt = this.pendingThunders[i];
      pt.delay -= deltaTime;
      if (pt.delay <= 0) {
        this._playThunderAudio(pt.distance, pt.isClose);
        this.pendingThunders.splice(i, 1);
      }
    }
  }

  /**
   * Triggers a lightning strike.
   * @param {string|null} forcedTargetType 'me' | 'animal' | 'tree' | 'block' | null
   * @param {THREE.Vector3} playerPosition
   * @param {Function} onPlayerDamaged
   */
  triggerStrike(forcedTargetType = null, playerPosition = null, onPlayerDamaged = null) {
    const px = playerPosition?.x ?? 0;
    const py = playerPosition?.y ?? 20;
    const pz = playerPosition?.z ?? 0;

    let targetType = forcedTargetType ? forcedTargetType.toUpperCase() : this.rollTargetType();
    if (targetType === 'ME' || targetType === 'PLAYER') targetType = 'LIVING';

    let strikePos = null;
    let targetEntity = null;
    let isTreeStrike = false;

    // 1. Resolve Target Position based on Category
    if (targetType === 'LIVING') {
      const candidates = [];
      // Player candidate (if outdoor / open sky)
      const playerSkyY = this.world.getSurfaceHeight ? this.world.getSurfaceHeight(px, pz) : py;
      if (py >= playerSkyY - 2) {
        candidates.push({ x: px, y: py, z: pz, isPlayer: true });
      }

      // Living mobs candidates
      if (this.mobs?.mobs) {
        for (const mob of this.mobs.mobs) {
          if (mob.hp > 0) {
            const mx = mob.basePos?.x ?? mob.group.position.x;
            const my = mob.basePos?.y ?? mob.group.position.y;
            const mz = mob.basePos?.z ?? mob.group.position.z;
            const dist = Math.hypot(mx - px, mz - pz);
            if (dist <= LIGHTNING_CONFIG.SEARCH_RADIUS_LIVING) {
              candidates.push({ x: mx, y: my, z: mz, isPlayer: false, mob });
            }
          }
        }
      }

      if (candidates.length > 0) {
        const picked = candidates[Math.floor(Math.random() * candidates.length)];
        strikePos = new THREE.Vector3(picked.x, picked.y, picked.z);
        if (picked.isPlayer) {
          targetEntity = 'player';
        } else {
          targetEntity = picked.mob;
        }
      } else {
        // Fallback to TREE or BLOCK
        targetType = 'TREE';
      }
    }

    if (targetType === 'TREE') {
      // Search for tree blocks within radius
      const searchR = LIGHTNING_CONFIG.SEARCH_RADIUS_TREE;
      for (let attempt = 0; attempt < 18; attempt++) {
        const a = Math.random() * Math.PI * 2;
        const r = 8 + Math.random() * (searchR - 8);
        const tx = Math.floor(px + Math.cos(a) * r);
        const tz = Math.floor(pz + Math.sin(a) * r);
        const surfY = this.world.getSurfaceHeight ? this.world.getSurfaceHeight(tx, tz) : 20;

        // Check columns from surfY up to surfY + 28 for leaves or logs
        for (let ty = surfY + 16; ty >= surfY; ty--) {
          const b = this.world.getBlock(tx, ty, tz);
          if (b && (b.includes('leaves') || b.includes('log') || b === 'wood')) {
            strikePos = new THREE.Vector3(tx + 0.5, ty + 1.0, tz + 0.5);
            isTreeStrike = true;
            break;
          }
        }
        if (strikePos) break;
      }
      if (!strikePos) targetType = 'BLOCK'; // Fallback
    }

    if (targetType === 'BLOCK' || !strikePos) {
      // Pick random surface block
      const searchR = LIGHTNING_CONFIG.SEARCH_RADIUS_BLOCK;
      const a = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * (searchR - 6);
      const bx = Math.floor(px + Math.cos(a) * r);
      const bz = Math.floor(pz + Math.sin(a) * r);
      const by = this.world.getSurfaceHeight ? this.world.getSurfaceHeight(bx, bz) : Math.floor(py);
      strikePos = new THREE.Vector3(bx + 0.5, by + 0.5, bz + 0.5);
    }

    // 2. Spawn Procedural 3D Visual Bolt
    this._createVisualBolt(strikePos);

    // 3. Queue Delayed Thunder Audio
    const dist = Math.hypot(px - strikePos.x, pz - strikePos.z);
    const thunderDelay = Math.max(0.04, dist / LIGHTNING_CONFIG.THUNDER_SPEED_OF_SOUND);
    this.pendingThunders.push({
      delay: thunderDelay,
      distance: dist,
      isClose: dist < 18.0,
    });

    // 4. Apply Gameplay Damage & Splash
    this._applyStrikeConsequences(strikePos, targetEntity, isTreeStrike, onPlayerDamaged);

    if (this.debugEnabled) {
      console.log(`[Lightning] Strike at (${strikePos.x.toFixed(1)}, ${strikePos.y.toFixed(1)}, ${strikePos.z.toFixed(1)}) | Target: ${targetType} | Dist: ${dist.toFixed(1)}m | Delay: ${thunderDelay.toFixed(2)}s`);
    }

    return {
      targetType,
      position: strikePos,
      distance: dist,
      thunderDelay,
      isTreeStrike,
    };
  }

  /**
   * Constructs 3D jagged geometry from clouds to impact position.
   */
  _createVisualBolt(impactPos) {
    const group = new THREE.Group();
    const startY = impactPos.y + 55 + Math.random() * 15;
    const numSegments = 9;
    const segHeight = (startY - impactPos.y) / numSegments;

    const points = [new THREE.Vector3(impactPos.x + (Math.random() - 0.5) * 6, startY, impactPos.z + (Math.random() - 0.5) * 6)];
    let curX = points[0].x;
    let curZ = points[0].z;

    for (let i = 1; i < numSegments; i++) {
      const y = startY - i * segHeight;
      const progress = i / numSegments;
      // Interpolate towards impactPos with random jitter
      curX = THREE.MathUtils.lerp(curX, impactPos.x, progress * 0.45) + (Math.random() - 0.5) * 2.8;
      curZ = THREE.MathUtils.lerp(curZ, impactPos.z, progress * 0.45) + (Math.random() - 0.5) * 2.8;
      points.push(new THREE.Vector3(curX, y, curZ));

      // Occasional branch off main bolt
      if (Math.random() < 0.4 && i >= 2 && i <= 7) {
        this._createBranch(group, curX, y, curZ, (Math.random() - 0.5) * 4, -segHeight * 2.5, (Math.random() - 0.5) * 4);
      }
    }
    points.push(new THREE.Vector3(impactPos.x, impactPos.y, impactPos.z));

    // Build box meshes for each segment
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const mesh = this._createBoltSegmentMesh(p1, p2, 0.28);
      group.add(mesh);
    }

    this.scene.add(group);
    this.activeBolts.push({
      meshGroup: group,
      age: 0,
      lifetime: LIGHTNING_CONFIG.BOLT_LIFETIME,
    });
  }

  _createBranch(parentGroup, x, y, z, dx, dy, dz) {
    const numSub = 3;
    let px = x;
    let py = y;
    let pz = z;
    for (let j = 0; j < numSub; j++) {
      const nx = px + dx / numSub + (Math.random() - 0.5) * 1.5;
      const ny = py + dy / numSub;
      const nz = pz + dz / numSub + (Math.random() - 0.5) * 1.5;
      const branchMesh = this._createBoltSegmentMesh(new THREE.Vector3(px, py, pz), new THREE.Vector3(nx, ny, nz), 0.16);
      parentGroup.add(branchMesh);
      px = nx;
      py = ny;
      pz = nz;
    }
  }

  _createBoltSegmentMesh(p1, p2, thickness = 0.25) {
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const len = dir.length();
    const geo = new THREE.BoxGeometry(thickness, len, thickness);
    const mesh = new THREE.Mesh(geo, this.boltMaterial);

    const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    mesh.position.copy(mid);

    // Orient mesh along dir
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
    mesh.setRotationFromQuaternion(quat);

    return mesh;
  }

  /**
   * Resolves splash damage, ignition, charred logs, and scorched ground.
   */
  _applyStrikeConsequences(strikePos, targetEntity, isTreeStrike, onPlayerDamaged) {
    const splashR = LIGHTNING_CONFIG.SPLASH_RADIUS;
    const splashRSq = splashR * splashR;

    // 1. Living Splash Damage & Fire
    // Player damage check
    if (typeof onPlayerDamaged === 'function') {
      const pPos = this.scene ? strikePos : null; // target position
      // Check distance to player
      if (targetEntity === 'player') {
        onPlayerDamaged(LIGHTNING_CONFIG.PLAYER_DAMAGE, 'Lightning Strike', { burning: true });
      }
    }

    // Mob damage & herd panic in splash radius
    if (this.mobs?.mobs) {
      for (const mob of this.mobs.mobs) {
        if (mob.hp > 0) {
          const mx = mob.basePos?.x ?? mob.group.position.x;
          const my = mob.basePos?.y ?? mob.group.position.y;
          const mz = mob.basePos?.z ?? mob.group.position.z;
          const distSq = (mx - strikePos.x) ** 2 + (my - strikePos.y) ** 2 + (mz - strikePos.z) ** 2;
          if (distSq <= splashRSq) {
            mob.hp -= LIGHTNING_CONFIG.ANIMAL_DAMAGE;
            mob.burning = true;
            mob.burnTimer = LIGHTNING_CONFIG.FIRE_BURN_DURATION;
            mob.hurtTimer = 0.35;
            mob.bodyMat.color.setHex(0xef4444);

            if (mob.hp <= 0) {
              mob.deadTimer = 0.45;
            } else if (this.mobs.triggerMobPanic) {
              this.mobs.triggerMobPanic(mob, strikePos);
            }
          }
        }
      }
    }

    // 2. World Block Modification: Charred Logs & Scorched Ground
    const bx = Math.floor(strikePos.x);
    const by = Math.floor(strikePos.y);
    const bz = Math.floor(strikePos.z);
    const affectedChunks = new Set();

    if (isTreeStrike) {
      // Char logs in radius 3 and destroy leaves in radius 2
      for (let ox = -3; ox <= 3; ox++) {
        for (let oz = -3; oz <= 3; oz++) {
          for (let oy = -3; oy <= 4; oy++) {
            const tx = bx + ox;
            const ty = by + oy;
            const tz = bz + oz;
            const b = this.world.getBlock(tx, ty, tz);
            if (!b) continue;

            if (b.includes('log') || b === 'wood') {
              this.world.setBlock(tx, ty, tz, 'charred_log');
              const ch = this.world.getChunkForVoxel?.(tx, ty, tz);
              if (ch) affectedChunks.add(ch);
            } else if (b.includes('leaves') && Math.hypot(ox, oz, oy) <= 2.2) {
              this.world.setBlock(tx, ty, tz, null); // Burn away leaves
              const ch = this.world.getChunkForVoxel?.(tx, ty, tz);
              if (ch) affectedChunks.add(ch);
            }
          }
        }
      }
    } else {
      // Scorched ground for ground impact
      for (let ox = -1; ox <= 1; ox++) {
        for (let oz = -1; oz <= 1; oz++) {
          const tx = bx + ox;
          const tz = bz + oz;
          for (let oy = 1; oy >= -2; oy--) {
            const ty = by + oy;
            const b = this.world.getBlock(tx, ty, tz);
            if (b && b !== 'water' && b !== 'lava' && !b.includes('air')) {
              // Convert solid top surface to scorched_ground
              this.world.setBlock(tx, ty, tz, 'scorched_ground');
              const ch = this.world.getChunkForVoxel?.(tx, ty, tz);
              if (ch) affectedChunks.add(ch);
              break;
            }
          }
        }
      }
    }

    // Rebuild meshes of affected chunks
    for (const ch of affectedChunks) {
      if (typeof ch.rebuildMesh === 'function') {
        ch.rebuildMesh();
      }
    }
  }

  /**
   * Procedural Web Audio thunder generator.
   */
  _playThunderAudio(distance, isClose) {
    const ctx = this._ensureAudio();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const vol = Math.max(0.08, Math.min(0.9, 1.2 - distance / 90));

      // 1. Sharp crack / snap for close lightning strikes (< 18m)
      if (isClose) {
        const snapBufSize = Math.floor(ctx.sampleRate * 0.08);
        const snapBuf = ctx.createBuffer(1, snapBufSize, ctx.sampleRate);
        const snapData = snapBuf.getChannelData(0);
        for (let i = 0; i < snapBufSize; i++) {
          snapData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (snapBufSize * 0.2));
        }
        const snapSource = ctx.createBufferSource();
        snapSource.buffer = snapBuf;

        const snapFilter = ctx.createBiquadFilter();
        snapFilter.type = 'highpass';
        snapFilter.frequency.setValueAtTime(800, now);

        const snapGain = ctx.createGain();
        snapGain.gain.setValueAtTime(vol * 0.8, now);
        snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

        snapSource.connect(snapFilter);
        snapFilter.connect(snapGain);
        snapGain.connect(ctx.destination);
        snapSource.start(now);
      }

      // 2. Deep rolling rumble for all strikes
      const rumbleLen = Math.floor(ctx.sampleRate * (isClose ? 2.5 : 3.8));
      const rumbleBuf = ctx.createBuffer(1, rumbleLen, ctx.sampleRate);
      const rumbleData = rumbleBuf.getChannelData(0);
      for (let i = 0; i < rumbleLen; i++) {
        rumbleData[i] = Math.random() * 2 - 1;
      }
      const rumbleSource = ctx.createBufferSource();
      rumbleSource.buffer = rumbleBuf;

      const lowFilter = ctx.createBiquadFilter();
      lowFilter.type = 'lowpass';
      lowFilter.frequency.setValueAtTime(140, now);
      lowFilter.frequency.exponentialRampToValueAtTime(45, now + 2.5);

      const rumbleGain = ctx.createGain();
      rumbleGain.gain.setValueAtTime(0.01, now);
      rumbleGain.gain.linearRampToValueAtTime(vol * 0.7, now + 0.12);
      rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 2.8);

      rumbleSource.connect(lowFilter);
      lowFilter.connect(rumbleGain);
      rumbleGain.connect(ctx.destination);
      rumbleSource.start(now);
    } catch (_) {}
  }

  _disposeGroup(group) {
    while (group.children.length > 0) {
      const child = group.children.pop();
      child.geometry?.dispose();
    }
  }
}
