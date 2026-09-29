import * as THREE from 'three';
import {
  getEntityAABB,
  sweptSegmentIntersectsAABB,
} from './combat/AttackRange.js';

// ============================================================================
// Phase 2 — Pooled Night Mob Projectiles & Ground Hazards (src/projectiles.js)
// Reuses pre-allocated geometries & materials so 0 allocations occur at runtime.
// Supports:
//  - poison_spit (BloodCrawler): arcs with gravity, spawns 4s Poison Puddle on impact
//  - bone_javelin (ShadowStalker): fast straight bone spear (speed 17)
//  - bone_spike (FleshGhoul Spike Volley): 3-spike spread fan
//  - screech_ring (ShadowStalker Hunger Screech): expanding crimson shockwave ring
//  - soul_beam (GrimWraith Soul Steal): 1.5s cyan telegraph tether beam
// ============================================================================

export class NightProjectileSystem {
  constructor(scene, world, particles = null, sfx = null) {
    this.scene = scene;
    this.world = world;
    this.particles = particles;
    this.sfx = sfx;

    this.activeProjectiles = [];
    this.activePuddles = [];
    this.activeRings = [];

    this._initSharedPools();
  }

  _initSharedPools() {
    this.sharedGeos = {
      glob: new THREE.OctahedronGeometry(0.26, 1),
      spear: new THREE.BoxGeometry(0.14, 0.14, 0.88),
      spike: new THREE.ConeGeometry(0.14, 0.58, 6),
      puddle: new THREE.CylinderGeometry(1.75, 1.75, 0.08, 18),
      ring: new THREE.RingGeometry(0.85, 1.0, 24),
    };
    this.sharedGeos.spike.rotateX(Math.PI * 0.5);
    this.sharedGeos.ring.rotateX(-Math.PI * 0.5);

    this.sharedMats = {
      poison_spit: new THREE.MeshBasicMaterial({ color: 0x4ade80 }),
      bone_javelin: new THREE.MeshBasicMaterial({ color: 0xf1f5f9 }),
      bone_spike: new THREE.MeshBasicMaterial({ color: 0xe2e8f0 }),
      magic_bolt: new THREE.MeshBasicMaterial({ color: 0xc084fc }),
      puddle: new THREE.MeshBasicMaterial({
        color: 0x22c55e,
        transparent: true,
        opacity: 0.65,
      }),
      ring: new THREE.MeshBasicMaterial({
        color: 0xef4444,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
      }),
      soul_beam: new THREE.LineBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.9,
      }),
    };

    // Pre-allocate 24 projectile meshes in pool
    this.meshPool = [];
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(this.sharedGeos.glob, this.sharedMats.poison_spit);
      m.visible = false;
      if (this.scene) this.scene.add(m);
      this.meshPool.push(m);
    }

    // Pre-allocate 8 poison puddle meshes in pool
    this.puddlePool = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(this.sharedGeos.puddle, this.sharedMats.puddle);
      m.visible = false;
      if (this.scene) this.scene.add(m);
      this.puddlePool.push(m);
    }

    // Pre-allocate 4 expanding screech rings in pool
    this.ringPool = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(this.sharedGeos.ring, this.sharedMats.ring);
      m.visible = false;
      if (this.scene) this.scene.add(m);
      this.ringPool.push(m);
    }

    // Pre-allocate GrimWraith Soul Steal cyan tether beam
    const beamPts = [new THREE.Vector3(), new THREE.Vector3()];
    const beamGeo = new THREE.BufferGeometry().setFromPoints(beamPts);
    this.soulBeamLine = new THREE.Line(beamGeo, this.sharedMats.soul_beam);
    this.soulBeamLine.visible = false;
    if (this.scene) this.scene.add(this.soulBeamLine);
  }

  _acquireProjectileMesh(kind) {
    for (const m of this.meshPool) {
      if (!m.visible) {
        if (kind === 'bone_javelin') {
          m.geometry = this.sharedGeos.spear;
          m.material = this.sharedMats.bone_javelin;
        } else if (kind === 'bone_spike') {
          m.geometry = this.sharedGeos.spike;
          m.material = this.sharedMats.bone_spike;
        } else if (kind === 'poison_spit') {
          m.geometry = this.sharedGeos.glob;
          m.material = this.sharedMats.poison_spit;
        } else {
          m.geometry = this.sharedGeos.glob;
          m.material = this.sharedMats.magic_bolt;
        }
        m.visible = true;
        return m;
      }
    }
    return null;
  }

  /**
   * Spawns a single projectile (Poison Spit, Bone Javelin, or Bone Spike).
   */
  fireProjectile({
    kind = 'poison_spit',
    ownerType = 'BloodCrawler',
    origin,
    targetPos,
    speed = 14,
    gravity = 0,
    damage = 2,
    effect = null,
    yawOffset = 0,
    leavesPuddle = false,
  }) {
    const dx = targetPos.x - origin.x;
    const dy = targetPos.y - origin.y + (gravity > 0 ? 0.65 : 0);
    const dz = targetPos.z - origin.z;
    const horizLen = Math.max(1e-4, Math.sqrt(dx * dx + dz * dz));
    const baseYaw = Math.atan2(dx, dz) + yawOffset;
    const pitch = Math.atan2(dy, horizLen);

    const vx = Math.sin(baseYaw) * Math.cos(pitch) * speed;
    const vy = Math.sin(pitch) * speed;
    const vz = Math.cos(baseYaw) * Math.cos(pitch) * speed;

    const mesh = this._acquireProjectileMesh(kind);
    if (mesh) {
      mesh.position.set(origin.x, origin.y, origin.z);
      mesh.lookAt(targetPos.x, targetPos.y, targetPos.z);
    }

    this.activeProjectiles.push({
      kind,
      ownerType,
      pos: { x: origin.x, y: origin.y, z: origin.z },
      prevPos: { x: origin.x, y: origin.y, z: origin.z },
      vx,
      vy,
      vz,
      gravity,
      damage,
      effect,
      leavesPuddle,
      radius: 0.3,
      age: 0,
      maxLifetime: 3.2,
      mesh,
    });
  }

  /**
   * Spawns a 4-second Poison Puddle on the ground (BloodCrawler Poison Spit).
   */
  spawnPoisonPuddle(x, z) {
    const groundY = this.world ? this.world.getSurfaceHeight(x, z) + 0.54 : 10;
    const mesh = this.puddlePool.find((m) => !m.visible) || null;
    if (mesh) {
      mesh.position.set(x, groundY, z);
      mesh.visible = true;
    }
    this.activePuddles.push({
      x,
      y: groundY,
      z,
      radius: 1.75,
      timeLeft: 4.0,
      tickTimer: 0,
      mesh,
    });
  }

  /**
   * Spawns an expanding sound-wave ring (ShadowStalker Hunger Screech).
   */
  spawnScreechRing(x, y, z, maxRadius = 12.0) {
    const mesh = this.ringPool.find((m) => !m.visible) || null;
    if (mesh) {
      mesh.position.set(x, y + 0.4, z);
      mesh.scale.setScalar(1);
      mesh.visible = true;
    }
    this.activeRings.push({
      x,
      y: y + 0.4,
      z,
      radius: 0.8,
      maxRadius,
      age: 0,
      duration: 0.65,
      mesh,
    });
  }

  /**
   * Updates or hides the GrimWraith Soul Steal cyan beam line.
   */
  setSoulBeam(active, fromPos = null, toPos = null) {
    if (!this.soulBeamLine) return;
    if (!active || !fromPos || !toPos) {
      this.soulBeamLine.visible = false;
      return;
    }
    const posAttr = this.soulBeamLine.geometry.attributes.position;
    posAttr.setXYZ(0, fromPos.x, fromPos.y, fromPos.z);
    posAttr.setXYZ(1, toPos.x, toPos.y, toPos.z);
    posAttr.needsUpdate = true;
    this.soulBeamLine.visible = true;
  }

  /**
   * Updates all active projectiles, ground poison puddles, and screech rings.
   */
  update(deltaTime, playerPosition, statusEffects, onPlayerDamaged) {
    const playerTarget = {
      isPlayer: true,
      position: playerPosition,
      width: 0.6,
      height: 1.8,
      depth: 0.6,
    };
    const playerAABB = getEntityAABB(playerTarget);

    // 1. Update Active Projectiles with Swept Collision
    for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
      const p = this.activeProjectiles[i];
      p.age += deltaTime;
      if (p.age >= p.maxLifetime) {
        this._releaseProjectile(i);
        continue;
      }

      p.prevPos = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
      p.vy -= p.gravity * deltaTime;
      const nextPos = {
        x: p.pos.x + p.vx * deltaTime,
        y: p.pos.y + p.vy * deltaTime,
        z: p.pos.z + p.vz * deltaTime,
      };

      // Check solid voxel hit
      const wallHit = this._checkWallHit(p.prevPos, nextPos);
      const playerHit = sweptSegmentIntersectsAABB(
        p.prevPos,
        nextPos,
        p.radius,
        playerAABB
      );

      if (wallHit && (!playerHit || wallHit.t <= playerHit.t)) {
        if (p.leavesPuddle) {
          this.spawnPoisonPuddle(wallHit.point.x, wallHit.point.z);
        }
        if (this.particles) {
          this.particles.spawnBurst(
            wallHit.point.x,
            wallHit.point.y,
            wallHit.point.z,
            p.kind === 'poison_spit' ? 'leaves' : 'stone'
          );
        }
        this._releaseProjectile(i);
        continue;
      }

      if (playerHit && playerHit.hit) {
        if (typeof onPlayerDamaged === 'function') {
          onPlayerDamaged(p.damage, p.ownerType);
        }
        if (p.effect && statusEffects) {
          statusEffects.applyEffect(p.effect.id, p.effect.duration, p.effect.power);
        }
        if (p.leavesPuddle) {
          this.spawnPoisonPuddle(playerPosition.x, playerPosition.z);
        }
        this._releaseProjectile(i);
        continue;
      }

      p.pos = nextPos;
      if (p.mesh) {
        p.mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
      }
    }

    // 2. Update Ground Poison Puddles (4s duration, applies Poison if player stands in puddle)
    for (let i = this.activePuddles.length - 1; i >= 0; i--) {
      const puddle = this.activePuddles[i];
      puddle.timeLeft -= deltaTime;
      if (puddle.timeLeft <= 0) {
        if (puddle.mesh) puddle.mesh.visible = false;
        this.activePuddles.splice(i, 1);
        continue;
      }
      const dx = playerPosition.x - puddle.x;
      const dz = playerPosition.z - puddle.z;
      const dy = Math.abs(playerPosition.y - 1.62 - puddle.y);
      if (dx * dx + dz * dz <= puddle.radius * puddle.radius && dy <= 1.5) {
        if (statusEffects) {
          statusEffects.applyEffect('poison', 6.0, 1);
        }
      }
    }

    // 3. Update Expanding Hunger Screech Rings
    for (let i = this.activeRings.length - 1; i >= 0; i--) {
      const ring = this.activeRings[i];
      ring.age += deltaTime;
      if (ring.age >= ring.duration) {
        if (ring.mesh) ring.mesh.visible = false;
        this.activeRings.splice(i, 1);
        continue;
      }
      const progress = ring.age / ring.duration;
      const curRadius = 0.8 + (ring.maxRadius - 0.8) * progress;
      if (ring.mesh) {
        ring.mesh.scale.setScalar(curRadius);
      }
    }
  }

  _checkWallHit(p0, p1) {
    if (!this.world || typeof this.world.getBlock !== 'function') return null;
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dz = p1.z - p0.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const steps = Math.max(2, Math.ceil(dist / 0.16));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = p0.x + dx * t;
      const y = p0.y + dy * t;
      const z = p0.z + dz * t;
      const b = this.world.getBlock(
        Math.floor(x + 0.5),
        Math.floor(y + 0.5),
        Math.floor(z + 0.5)
      );
      if (b && b !== 'water' && b !== 'glass') {
        return { t, point: { x, y, z }, block: b };
      }
    }
    return null;
  }

  _releaseProjectile(idx) {
    const p = this.activeProjectiles[idx];
    if (p && p.mesh) {
      p.mesh.visible = false;
    }
    this.activeProjectiles.splice(idx, 1);
  }
}
