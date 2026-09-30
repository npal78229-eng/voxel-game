// ============================================================================
// Part B3.1 — Shared Axis-Separated AABB Collision, Auto-Jump & Unstuck Helper
// Used by both FirstPersonController (src/controls.js) and PassiveMobManager (src/polish.js)
// ============================================================================

export const GRAVITY_ACCEL = 26.0;
// Impulse to clear 1.25 blocks of height: sqrt(2 * gravity * 1.25) ≈ 8.06 m/s
export const AUTO_JUMP_IMPULSE = Math.sqrt(2 * GRAVITY_ACCEL * 1.25);
export const AUTO_JUMP_COOLDOWN = 0.4;

/**
 * Checks whether the chunk containing world coordinates (wx, wz) is currently loaded.
 * Mobs over unloaded chunks are frozen until streaming finishes so they never fall through.
 */
export function isChunkLoadedAt(world, wx, wz) {
  if (!world) return false;
  if (!world.chunks || typeof world.chunks.has !== 'function') {
    // Mock world in unit tests is always considered loaded
    return true;
  }
  const chunkSize = world.chunkSize || 16;
  const cx = Math.floor(wx / chunkSize);
  const cz = Math.floor(wz / chunkSize);
  return world.chunks.has(`${cx},${cz}`);
}

function _isSolid(world, bx, by, bz) {
  if (!world) return false;
  if (typeof world.isSolidAt === 'function') {
    return world.isSolidAt(bx, by, bz);
  }
  if (typeof world.getBlock === 'function') {
    const b = world.getBlock(bx, by, bz);
    return Boolean(b && b !== 'water' && b !== 'lava');
  }
  return false;
}

function _isLava(world, bx, by, bz) {
  if (!world) return false;
  if (typeof world.getFluid === 'function') {
    const f = world.getFluid(bx, by, bz);
    if (f && f.type === 'lava') return true;
  }
  if (typeof world.getBlock === 'function') {
    return world.getBlock(bx, by, bz) === 'lava';
  }
  return false;
}

/**
 * Checks if an AABB with base center (px, feetY, pz), halfWidth, and height
 * intersects any solid voxel in the world.
 */
export function isBoxColliding(world, px, feetY, pz, halfWidth = 0.3, height = 1.8) {
  if (!world) return false;

  const minX = Math.floor(px - halfWidth + 0.5);
  const maxX = Math.floor(px + halfWidth - 0.001 + 0.5);
  const minY = Math.floor(feetY + 0.5);
  const maxY = Math.floor(feetY + height - 0.02 + 0.5);
  const minZ = Math.floor(pz - halfWidth + 0.5);
  const maxZ = Math.floor(pz + halfWidth - 0.001 + 0.5);

  for (let bx = minX; bx <= maxX; bx++) {
    for (let by = minY; by <= maxY; by++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        if (_isSolid(world, bx, by, bz)) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Finds the highest solid block Y at column (wx, wz) using direct chunk/world lookups.
 */
export function getHighestSolidY(world, wx, wz, startY = null) {
  if (!world) return 18;
  const ix = Math.floor(wx + 0.5);
  const iz = Math.floor(wz + 0.5);
  const baseSurf =
    typeof world.getSurfaceHeight === 'function'
      ? world.getSurfaceHeight(ix, iz)
      : 22;
  const topSearch = startY !== null ? Math.max(startY, baseSurf + 10) : baseSurf + 10;

  for (let y = topSearch; y >= 1; y--) {
    if (_isSolid(world, ix, y, iz)) {
      return y;
    }
  }
  return baseSurf;
}

/**
 * Part B3.2 — Evaluates the obstacle directly in front of an entity moving in (dirX, dirZ).
 * Returns:
 *  - 'clear': no solid block at foot level ahead
 *  - 'jump_1block': 1-block solid obstacle at foot level with free headroom above -> AUTO-JUMP!
 *  - 'blocked_tall': 2+ block wall or low ceiling -> DO NOT JUMP, turn away instead
 */
export function evaluateObstacleAhead(
  world,
  px,
  feetY,
  pz,
  dirX,
  dirZ,
  halfWidth = 0.38,
  height = 1.2
) {
  if (!world) return 'clear';

  // Probe ~0.5 blocks ahead of the entity's leading edge
  const probeDist = halfWidth + 0.5;
  const checkX = Math.floor(px + dirX * probeDist + 0.5);
  const checkZ = Math.floor(pz + dirZ * probeDist + 0.5);
  const footBlockY = Math.floor(feetY + 0.5);

  if (_isLava(world, checkX, footBlockY, checkZ)) {
    return 'blocked_tall'; // Lava hazard: treat as impassable obstacle so mob turns away
  }

  const footSolid = _isSolid(world, checkX, footBlockY, checkZ);
  const headHeightBlocks = Math.max(1, Math.ceil(height));

  if (!footSolid) {
    // Check if an upper block at torso/head level is blocking horizontal passage
    for (let h = 1; h <= headHeightBlocks; h++) {
      if (_isSolid(world, checkX, footBlockY + h, checkZ)) {
        return 'blocked_tall';
      }
    }
    return 'clear';
  }

  // Foot level is solid! Check if the block above it (and headroom for the mob) is free
  for (let h = 1; h <= headHeightBlocks + 1; h++) {
    if (_isSolid(world, checkX, footBlockY + h, checkZ)) {
      // Obstacle is 2+ blocks tall or has a low ceiling
      return 'blocked_tall';
    }
  }

  return 'jump_1block';
}

/**
 * Part B3.2 — Checks if stepping forward in (dirX, dirZ) would drop the entity off a cliff
 * deeper than maxDropBlocks (default 3 blocks for passive mobs) or drop into dangerous lava.
 */
export function isCliffDropAhead(
  world,
  px,
  feetY,
  pz,
  dirX,
  dirZ,
  halfWidth = 0.38,
  maxDropBlocks = 3
) {
  if (!world) return false;
  const probeDist = halfWidth + 0.65;
  const checkX = Math.floor(px + dirX * probeDist + 0.5);
  const checkZ = Math.floor(pz + dirZ * probeDist + 0.5);
  const currentGroundY = Math.floor(feetY + 0.5) - 1;

  for (let drop = 0; drop <= maxDropBlocks; drop++) {
    const y = currentGroundY - drop;
    if (_isLava(world, checkX, y, checkZ)) {
      return true; // Dropping into lava is hazardous!
    }
    if (_isSolid(world, checkX, y, checkZ)) {
      return false; // Found solid ground within allowed drop
    }
    if (typeof world.getBlock === 'function' && world.getBlock(checkX, y, checkZ) === 'water') {
      return false; // Water below is safe
    }
    if (typeof world.getFluid === 'function') {
      const f = world.getFluid(checkX, y, checkZ);
      if (f && f.type === 'water') return false; // Water below is safe
    }
  }
  return true; // Drop exceeds maxDropBlocks!
}

/**
 * Part B3.1 — Axis-Separated AABB Movement & Gravity Solver (X -> Z -> Y) for mobs.
 * Updates position { x, y, z }, velocityY, and onGround in place.
 * Note: for mobs, pos.y is the base (feet) Y coordinate in the scene (groundBlockY + 0.5).
 */
export function moveEntityWithAABB(
  world,
  pos,
  state,
  dx,
  dz,
  dt,
  halfWidth = 0.38,
  height = 1.2
) {
  let blockedX = false;
  let blockedZ = false;

  // 1. Water & Lava Buoyancy vs Gravity on Y Axis (Resolved FIRST when jumping so entity rises before moving forward over the 1-block ledge)
  const ix = Math.floor(pos.x + 0.5);
  const iy = Math.floor(pos.y + 0.5);
  const iz = Math.floor(pos.z + 0.5);

  const getFluidType = (x, y, z) => {
    if (typeof world?.getFluid === 'function') {
      const f = world.getFluid(x, y, z);
      if (f) return f.type;
    }
    if (typeof world?.getBlock === 'function') {
      const b = world.getBlock(x, y, z);
      if (b === 'water' || b === 'lava') return b;
    }
    return null;
  };

  const feetFluid = getFluidType(ix, iy, iz) || getFluidType(ix, iy - 1, iz);
  const inWater = feetFluid === 'water';
  const inLava = feetFluid === 'lava';

  if (inWater) {
    // Swim upward so the mob never sinks or sticks at the bottom of rivers/oceans
    state.velocityY = Math.min(3.5, (state.velocityY || 0) + 18.0 * dt);
    state.onGround = true;
  } else if (inLava) {
    // Mob paddles upward in lava (slower swim speed)
    state.velocityY = Math.min(1.5, (state.velocityY || 0) + 12.0 * dt);
    state.onGround = true;
  } else {
    state.velocityY = Math.max(-28.0, (state.velocityY || 0) - GRAVITY_ACCEL * dt);
  }

  const dy = state.velocityY * dt;
  if (!isBoxColliding(world, pos.x, pos.y + dy, pos.z, halfWidth, height)) {
    pos.y += dy;
    if (!inWater && !inLava) {
      state.onGround = false;
    }
  } else {
    if (dy <= 0) {
      // Snap cleanly to top of supporting block (blockY + 0.5)
      pos.y = Math.floor(pos.y + dy + 0.5) + 0.5;
      state.onGround = true;
    }
    state.velocityY = 0;
  }

  // 2. Resolve X Axis (with jump-apex step-over if near top of 1-block ledge)
  if (dx !== 0) {
    if (!isBoxColliding(world, pos.x + dx, pos.y, pos.z, halfWidth, height)) {
      pos.x += dx;
    } else if (
      !state.onGround &&
      !isBoxColliding(world, pos.x + dx, Math.floor(pos.y + 0.5) + 0.5, pos.z, halfWidth, height)
    ) {
      pos.y = Math.floor(pos.y + 0.5) + 0.5;
      pos.x += dx;
    } else {
      blockedX = true;
    }
  }

  // 3. Resolve Z Axis (with jump-apex step-over if near top of 1-block ledge)
  if (dz !== 0) {
    if (!isBoxColliding(world, pos.x, pos.y, pos.z + dz, halfWidth, height)) {
      pos.z += dz;
    } else if (
      !state.onGround &&
      !isBoxColliding(world, pos.x, Math.floor(pos.y + 0.5) + 0.5, pos.z + dz, halfWidth, height)
    ) {
      pos.y = Math.floor(pos.y + 0.5) + 0.5;
      pos.z += dz;
    } else {
      blockedZ = true;
    }
  }

  // Safety floor
  if (pos.y < 1.5) {
    const topY = getHighestSolidY(world, pos.x, pos.z);
    pos.y = topY + 0.5;
    state.velocityY = 0;
    state.onGround = true;
  }

  return { blockedHorizontally: blockedX || blockedZ, inWater, inLava };
}

/**
 * Part B3.3 & B3.4 — Final Safety Fallback & Block-Placement Push-Out:
 * If an entity's AABB overlaps any solid block, pushes it aside or upward to the nearest
 * free air space so it is never buried or trapped.
 */
export function pushEntityOutOfBlocks(world, pos, halfWidth = 0.38, height = 1.2) {
  if (!isBoxColliding(world, pos.x, pos.y, pos.z, halfWidth, height)) {
    return false;
  }

  // First try nudging horizontally by 0.85 blocks in cardinal directions
  const nudges = [
    [0.85, 0],
    [-0.85, 0],
    [0, 0.85],
    [0, -0.85],
  ];
  for (const [nx, nz] of nudges) {
    if (!isBoxColliding(world, pos.x + nx, pos.y, pos.z + nz, halfWidth, height)) {
      pos.x += nx;
      pos.z += nz;
      return true;
    }
  }

  // Otherwise push straight up to the first free vertical space
  for (let up = 1; up <= 16; up++) {
    const candidateY = Math.floor(pos.y + 0.5) + up - 0.5;
    if (!isBoxColliding(world, pos.x, candidateY, pos.z, halfWidth, height)) {
      pos.y = candidateY;
      return true;
    }
  }

  const topY = getHighestSolidY(world, pos.x, pos.z);
  pos.y = topY + 0.5;
  return true;
}
