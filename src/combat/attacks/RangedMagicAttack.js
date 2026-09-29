import * as THREE from 'three';
import {
  gapDistance,
  hasLineOfSight,
  getCombatRayEndpoints,
  getEntityAABB,
  sweptSegmentIntersectsAABB,
} from '../AttackRange.js';

// ============================================================================
// Task F3 — Ranged Magic Attack (Hexcaster / Bonewalker) & Swept Projectile Engine
// Shared Interface: canStart(mob, target, world), start(mob), update(dt, ...), cancel(mob)
// ============================================================================

export class RangedMagicAttack {
  constructor(config = {}) {
    this.castRange = config.castRange ?? 14.0;
    this.minComfortDist = config.minComfortDist ?? 6.0;
    this.windupTime = config.windupTime ?? 1.0; // 1.0s telegraph
    this.cooldown = config.cooldown ?? 2.5; // 2.5s cooldown
    this.damage = config.damage ?? 3; // 3 HP (1.5 hearts)
    this.projectileSpeed = config.projectileSpeed ?? 14.0; // 14 blocks/s
    this.projectileGravity = config.projectileGravity ?? 0.0; // 0 for magic bolt, >0 for Bonewalker arrow
    this.projectileLifetime = config.projectileLifetime ?? 3.0;
    this.projectileRadius = config.projectileRadius ?? 0.3;
    this.rangedStyle = config.rangedStyle ?? 'magic_bolt';
    this.applySlowEffect = Boolean(config.applySlowEffect);
  }

  canStart(mob, target, world) {
    if (!mob || !target || mob.hp <= 0) return false;
    if ((mob.attackPhase && mob.attackPhase !== 'IDLE') || mob.attackCooldown > 0) {
      return false;
    }
    const gap = gapDistance(mob, target);
    if (gap > this.castRange) return false;
    const { from, to } = getCombatRayEndpoints(mob, target);
    return hasLineOfSight(world, from, to);
  }

  start(mob) {
    mob.attackPhase = 'CASTING';
    mob.phaseTimer = this.windupTime;
    mob.strafeDir = Math.random() < 0.5 ? -1 : 1;
    mob.lastAttackOutcome = 'CASTING SPELL...';
  }

  update(dt, mob, target, world, projectileManager, onCastStartSound = null) {
    if (!mob || mob.hp <= 0) {
      this.cancel(mob);
      return { state: 'IDLE' };
    }

    if (!mob.attackPhase || mob.attackPhase === 'IDLE') {
      if (mob.attackCooldown > 0) {
        mob.attackCooldown = Math.max(0, mob.attackCooldown - dt);
      }
      return { state: 'IDLE' };
    }

    if (mob.attackPhase === 'CASTING') {
      mob.phaseTimer -= dt;
      if (mob.phaseTimer <= 0) {
        const { from, to } = getCombatRayEndpoints(mob, target);
        if (hasLineOfSight(world, from, to) && projectileManager) {
          // Aim at player's chest with a small lead for target velocity
          const leadX = (target.vx || 0) * 0.28;
          const leadZ = (target.vz || 0) * 0.28;
          const aimTarget = {
            x: to.x + leadX,
            y: to.y + (this.projectileGravity > 0 ? 0.65 : 0.0),
            z: to.z + leadZ,
          };
          projectileManager.spawnProjectile({
            ownerId: mob.id || mob.spec?.type || 'Hexcaster',
            style: this.rangedStyle,
            origin: from,
            targetPos: aimTarget,
            speed: this.projectileSpeed,
            gravity: this.projectileGravity,
            lifetime: this.projectileLifetime,
            radius: this.projectileRadius,
            damage: this.damage,
            applySlowEffect: this.applySlowEffect,
          });
          mob.lastAttackOutcome = 'BOLT FIRED!';
        } else {
          mob.lastAttackOutcome = 'CAST FIZZLED (NO LOS)';
        }

        mob.attackPhase = 'COOLDOWN';
        mob.phaseTimer = this.cooldown;
        mob.attackCooldown = this.cooldown;
      }
      return { state: mob.attackPhase };
    }

    if (mob.attackPhase === 'COOLDOWN') {
      mob.phaseTimer -= dt;
      mob.attackCooldown = Math.max(0, mob.phaseTimer);
      if (mob.phaseTimer <= 0) {
        mob.attackPhase = 'IDLE';
        mob.phaseTimer = 0;
        mob.lastAttackOutcome = '';
      }
      return { state: mob.attackPhase };
    }

    return { state: mob.attackPhase };
  }

  cancel(mob) {
    if (!mob) return;
    mob.attackPhase = 'IDLE';
    mob.phaseTimer = 0;
    mob.lastAttackOutcome = '';
  }
}

/**
 * Shared Projectile Engine with Swept Segment-vs-AABB & Voxel Collision (Task F3).
 */
export class ProjectileManager {
  constructor(scene = null, world = null, particles = null) {
    this.scene = scene;
    this.world = world;
    this.particles = particles;
    this.projectiles = [];
  }

  spawnProjectile(opts) {
    const dx = opts.targetPos.x - opts.origin.x;
    const dy = opts.targetPos.y - opts.origin.y;
    const dz = opts.targetPos.z - opts.origin.z;
    const len = Math.max(1e-4, Math.sqrt(dx * dx + dy * dy + dz * dz));
    const speed = opts.speed ?? 14.0;

    let mesh = null;
    let trailLine = null;
    if (this.scene) {
      const isArrow = opts.style === 'arrow_arc';
      const geo = isArrow
        ? new THREE.BoxGeometry(0.14, 0.14, 0.65)
        : new THREE.OctahedronGeometry(opts.radius ?? 0.28, 1);
      const mat = new THREE.MeshBasicMaterial({
        color: isArrow ? 0xfbbf24 : 0xc084fc,
      });
      mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(opts.origin.x, opts.origin.y, opts.origin.z);
      this.scene.add(mesh);

      // Debug / visual bolt path line
      const trailGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(opts.origin.x, opts.origin.y, opts.origin.z),
        new THREE.Vector3(opts.origin.x, opts.origin.y, opts.origin.z),
      ]);
      const trailMat = new THREE.LineBasicMaterial({
        color: isArrow ? 0xf59e0b : 0xa855f7,
        transparent: true,
        opacity: 0.75,
      });
      trailLine = new THREE.Line(trailGeo, trailMat);
      this.scene.add(trailLine);
    }

    const proj = {
      ownerId: opts.ownerId || 'Hexcaster',
      style: opts.style || 'magic_bolt',
      origin: { ...opts.origin },
      pos: { ...opts.origin },
      prevPos: { ...opts.origin },
      vx: (dx / len) * speed,
      vy: (dy / len) * speed,
      vz: (dz / len) * speed,
      gravity: opts.gravity ?? 0.0,
      radius: opts.radius ?? 0.3,
      damage: opts.damage ?? 3,
      applySlowEffect: Boolean(opts.applySlowEffect),
      age: 0,
      maxLifetime: opts.lifetime ?? 3.0,
      active: true,
      mesh,
      trailLine,
    };

    this.projectiles.push(proj);
    return proj;
  }

  /**
   * Advances all active projectiles using SWEPT collision (prevPos -> newPos)
   * against both solid world blocks and the target player AABB.
   */
  update(dt, playerTarget, onPlayerHit = null) {
    const playerAABB = getEntityAABB(playerTarget);

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (!p.active) {
        this._disposeProjectile(i);
        continue;
      }

      p.age += dt;
      if (p.age >= p.maxLifetime) {
        this._disposeProjectile(i);
        continue;
      }

      p.prevPos = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
      p.vy -= p.gravity * dt;
      const nextPos = {
        x: p.pos.x + p.vx * dt,
        y: p.pos.y + p.vy * dt,
        z: p.pos.z + p.vz * dt,
      };

      // 1. Check swept voxel wall collision along segment (prevPos -> nextPos)
      const wallHit = this._checkSweptWallCollision(p.prevPos, nextPos);
      // 2. Check swept player AABB hitbox collision along segment (prevPos -> nextPos)
      const playerHit = sweptSegmentIntersectsAABB(
        p.prevPos,
        nextPos,
        p.radius,
        playerAABB
      );

      if (wallHit && (!playerHit || wallHit.t <= playerHit.t)) {
        // Stopped by a solid wall before reaching player! Spawn spark burst, do NOT break blocks.
        if (this.particles) {
          this.particles.spawnBurst(
            wallHit.point.x,
            wallHit.point.y,
            wallHit.point.z,
            p.style === 'arrow_arc' ? 'wood' : 'gem_ore'
          );
        }
        this._disposeProjectile(i);
        continue;
      }

      if (playerHit && playerHit.hit) {
        if (typeof onPlayerHit === 'function') {
          onPlayerHit({
            damage: p.damage,
            source: p.ownerId,
            style: p.style,
            applySlowEffect: p.applySlowEffect,
            point: playerHit.point,
          });
        }
        if (this.particles) {
          this.particles.spawnBurst(
            playerHit.point.x,
            playerHit.point.y,
            playerHit.point.z,
            'gem_ore'
          );
        }
        this._disposeProjectile(i);
        continue;
      }

      p.pos = nextPos;
      if (p.mesh) {
        p.mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
        p.mesh.rotation.x += dt * 6;
        p.mesh.rotation.y += dt * 8;
      }
      if (p.trailLine) {
        const posAttr = p.trailLine.geometry.attributes.position;
        posAttr.setXYZ(0, p.origin.x, p.origin.y, p.origin.z);
        posAttr.setXYZ(1, p.pos.x, p.pos.y, p.pos.z);
        posAttr.needsUpdate = true;
      }
    }
  }

  _checkSweptWallCollision(p0, p1) {
    if (!this.world || typeof this.world.getBlock !== 'function') return null;
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dz = p1.z - p0.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const steps = Math.max(2, Math.ceil(dist / 0.12));

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

  _disposeProjectile(index) {
    const p = this.projectiles[index];
    if (!p) return;
    if (p.mesh && this.scene) {
      this.scene.remove(p.mesh);
      p.mesh.geometry?.dispose();
      p.mesh.material?.dispose();
    }
    if (p.trailLine && this.scene) {
      this.scene.remove(p.trailLine);
      p.trailLine.geometry?.dispose();
      p.trailLine.material?.dispose();
    }
    this.projectiles.splice(index, 1);
  }
}
