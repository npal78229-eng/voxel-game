import { PLAYER_COMBAT_CONFIG } from '../config/mobs.js';

// ============================================================================
// Task F1 — Centralized Edge-to-Edge AABB Attack Range & Voxel Line-of-Sight
// ============================================================================

/**
 * Builds a world-space AABB { minX, maxX, minY, maxY, minZ, maxZ } for a mob or player.
 * Note: For player camera positions (where y is eye height = feet + 1.62),
 * pass isPlayerEye = true or set entity.isPlayer = true.
 */
export function getEntityAABB(entity) {
  if (!entity) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
  }

  if (entity.minX !== undefined && entity.maxX !== undefined) {
    return entity;
  }

  const pos = entity.position || entity.group?.position || entity;
  const x = Number(pos.x) || 0;
  const y = Number(pos.y) || 0;
  const z = Number(pos.z) || 0;

  if (entity.isPlayer) {
    const hw = (entity.width || PLAYER_COMBAT_CONFIG.width) * 0.5;
    const hd = (entity.depth || PLAYER_COMBAT_CONFIG.depth) * 0.5;
    const h = entity.height || PLAYER_COMBAT_CONFIG.height;
    const feetY =
      entity.feetY !== undefined
        ? entity.feetY
        : y - PLAYER_COMBAT_CONFIG.eyeOffsetY;
    return {
      minX: x - hw,
      maxX: x + hw,
      minY: feetY,
      maxY: feetY + h,
      minZ: z - hd,
      maxZ: z + hd,
    };
  }

  const hb = entity.hitbox || entity.spec?.hitbox || {
    width: 0.85,
    height: 1.4,
    depth: 0.85,
  };
  const hw = (hb.width || 0.85) * 0.5;
  const hd = (hb.depth || hb.width || 0.85) * 0.5;
  const h = hb.height || 1.4;
  // Mob group.position.y is at groundY + 0.5 (center of lower body); base feet is y - 0.5
  const feetY = entity.feetY !== undefined ? entity.feetY : y - 0.5;

  return {
    minX: x - hw,
    maxX: x + hw,
    minY: feetY,
    maxY: feetY + h,
    minZ: z - hd,
    maxZ: z + hd,
  };
}

/**
 * Shortest 3D Euclidean distance between two AABB hitboxes (edge-to-edge, NOT center-to-center).
 * If the boxes overlap on all axes, returns 0.
 */
export function gapDistance(attacker, target) {
  const a = getEntityAABB(attacker);
  const b = getEntityAABB(target);

  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
  const dz = Math.max(0, a.minZ - b.maxZ, b.minZ - a.maxZ);

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Shortest vertical separation between two AABB hitboxes (0 if their Y ranges overlap).
 */
export function verticalGap(attacker, target) {
  const a = getEntityAABB(attacker);
  const b = getEntityAABB(target);
  return Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
}

/**
 * Shortest horizontal (XZ) edge-to-edge distance between two AABB hitboxes.
 */
export function horizontalGap(attacker, target) {
  const a = getEntityAABB(attacker);
  const b = getEntityAABB(target);
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const dz = Math.max(0, a.minZ - b.maxZ, b.minZ - a.maxZ);
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Task F1: Returns true iff gapDistance(attacker, target) <= range
 * AND verticalGap(attacker, target) <= reachY (default 1.0) so a mob one floor below/above cannot hit.
 */
export function inMeleeRange(attacker, target, range, reachY = undefined) {
  const maxVerticalGap =
    reachY !== undefined
      ? reachY
      : attacker?.reachY ?? attacker?.spec?.reachY ?? 1.0;
  const vGap = verticalGap(attacker, target);
  if (vGap > maxVerticalGap) return false;
  const gap = gapDistance(attacker, target);
  return gap <= range;
}

/**
 * Task F1: Voxel raycast from attacker's eye/hand position to target's chest.
 * Solid blocks block line of sight.
 */
export function hasLineOfSight(world, from, to) {
  if (!world || typeof world.getBlock !== 'function') return true;

  const x0 = Number(from.x) || 0;
  const y0 = Number(from.y) || 0;
  const z0 = Number(from.z) || 0;
  const x1 = Number(to.x) || 0;
  const y1 = Number(to.y) || 0;
  const z1 = Number(to.z) || 0;

  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist < 1e-4) return true;

  // Step along ray at 0.2-block intervals (plus exact voxel boundary crossings)
  const steps = Math.max(4, Math.ceil(dist / 0.18));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = x0 + dx * t;
    const py = y0 + dy * t;
    const pz = z0 + dz * t;
    const block = world.getBlock(
      Math.floor(px + 0.5),
      Math.floor(py + 0.5),
      Math.floor(pz + 0.5)
    );
    if (
      block &&
      block !== 'water' &&
      block !== 'glass' &&
      block !== 'leaves' &&
      block !== 'birch_leaves' &&
      block !== 'pine_leaves'
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Helper to compute attacker eye/hand ray origin and player chest ray target.
 */
export function getCombatRayEndpoints(attacker, target) {
  const aBox = getEntityAABB(attacker);
  const bBox = getEntityAABB(target);
  const from = {
    x: (aBox.minX + aBox.maxX) * 0.5,
    y: aBox.minY + (aBox.maxY - aBox.minY) * 0.72,
    z: (aBox.minZ + aBox.maxZ) * 0.5,
  };
  const to = {
    x: (bBox.minX + bBox.maxX) * 0.5,
    y: bBox.minY + (bBox.maxY - bBox.minY) * 0.62,
    z: (bBox.minZ + bBox.maxZ) * 0.5,
  };
  return { from, to };
}

/**
 * Task F3: Swept segment (p0 -> p1) vs AABB inflated by projectile radius.
 * Prevents fast projectiles (14+ blocks/s) from skipping through player or thin walls.
 */
export function sweptSegmentIntersectsAABB(p0, p1, radius, aabb) {
  const r = Math.max(0, Number(radius) || 0);
  const minX = aabb.minX - r;
  const maxX = aabb.maxX + r;
  const minY = aabb.minY - r;
  const maxY = aabb.maxY + r;
  const minZ = aabb.minZ - r;
  const maxZ = aabb.maxZ + r;

  let tMin = 0.0;
  let tMax = 1.0;

  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const dz = p1.z - p0.z;

  const axes = [
    [p0.x, dx, minX, maxX],
    [p0.y, dy, minY, maxY],
    [p0.z, dz, minZ, maxZ],
  ];

  for (const [origin, dir, boxMin, boxMax] of axes) {
    if (Math.abs(dir) < 1e-8) {
      if (origin < boxMin || origin > boxMax) return null;
    } else {
      const inv = 1.0 / dir;
      let t1 = (boxMin - origin) * inv;
      let t2 = (boxMax - origin) * inv;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return null;
    }
  }

  return {
    hit: true,
    t: tMin,
    point: {
      x: p0.x + dx * tMin,
      y: p0.y + dy * tMin,
      z: p0.z + dz * tMin,
    },
  };
}
