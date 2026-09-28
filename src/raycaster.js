import * as THREE from 'three';

// ============================================================================
// Phase 2 (Task A) — Fast Voxel Traversal (DDA Raycasting) & Selection Outline
// ============================================================================

export const MAX_REACH_DISTANCE = 6.0; // Maximum block interaction reach in units

/**
 * Maps a unit face normal (nx, ny, nz) to its human-readable cardinal face name.
 */
function getFaceName(normal) {
  if (normal.y === 1) return 'top (+Y)';
  if (normal.y === -1) return 'bottom (-Y)';
  if (normal.x === 1) return 'east (+X)';
  if (normal.x === -1) return 'west (-X)';
  if (normal.z === 1) return 'south (+Z)';
  if (normal.z === -1) return 'north (-Z)';
  return 'inside';
}

/**
 * Performs 3D Digital Differential Analyzer (DDA) voxel traversal directly against
 * the `VoxelWorld` Map data structure (never testing against triangle meshes).
 *
 * Because each 1x1x1 cube centered at integer (bx, by, bz) occupies
 * [bx - 0.5, bx + 0.5] on each axis, adding +0.5 to the ray origin aligns
 * every voxel to the unit integer cell [bx, bx + 1).
 *
 * @param {import('./world.js').VoxelWorld} world
 * @param {THREE.Vector3} origin - Camera world position
 * @param {THREE.Vector3} direction - Normalized forward look vector
 * @param {number} maxDistance - Maximum ray reach in blocks (default 6.0)
 */
export function raycastVoxelDDA(
  world,
  origin,
  direction,
  maxDistance = MAX_REACH_DISTANCE
) {
  const dir = direction.clone().normalize();

  // Shift origin by +0.5 so block at (x,y,z) spans [x, x+1) in grid space
  const ox = origin.x + 0.5;
  const oy = origin.y + 0.5;
  const oz = origin.z + 0.5;

  let vx = Math.floor(ox);
  let vy = Math.floor(oy);
  let vz = Math.floor(oz);

  const stepX = dir.x >= 0 ? 1 : -1;
  const stepY = dir.y >= 0 ? 1 : -1;
  const stepZ = dir.z >= 0 ? 1 : -1;

  const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

  let tMaxX =
    dir.x !== 0
      ? ((dir.x > 0 ? vx + 1 - ox : ox - vx) * tDeltaX)
      : Infinity;
  let tMaxY =
    dir.y !== 0
      ? ((dir.y > 0 ? vy + 1 - oy : oy - vy) * tDeltaY)
      : Infinity;
  let tMaxZ =
    dir.z !== 0
      ? ((dir.z > 0 ? vz + 1 - oz : oz - vz) * tDeltaZ)
      : Infinity;

  let distance = 0;
  const normal = { x: 0, y: 0, z: 0 };

  // Step through voxel boundaries up to maxDistance
  const maxSteps = Math.ceil(maxDistance * 3) + 2;
  for (let step = 0; step < maxSteps; step++) {
    if (distance > maxDistance) {
      return null;
    }

    const blockType = world.getBlock(vx, vy, vz);
    if (blockType) {
      return {
        x: vx,
        y: vy,
        z: vz,
        blockType,
        normal: { ...normal },
        faceName: getFaceName(normal),
        distance,
        adjacent: {
          x: vx + normal.x,
          y: vy + normal.y,
          z: vz + normal.z,
        },
      };
    }

    // Advance along whichever axis boundary is crossed first
    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        vx += stepX;
        distance = tMaxX;
        tMaxX += tDeltaX;
        normal.x = -stepX;
        normal.y = 0;
        normal.z = 0;
      } else {
        vz += stepZ;
        distance = tMaxZ;
        tMaxZ += tDeltaZ;
        normal.x = 0;
        normal.y = 0;
        normal.z = -stepZ;
      }
    } else {
      if (tMaxY < tMaxZ) {
        vy += stepY;
        distance = tMaxY;
        tMaxY += tDeltaY;
        normal.x = 0;
        normal.y = -stepY;
        normal.z = 0;
      } else {
        vz += stepZ;
        distance = tMaxZ;
        tMaxZ += tDeltaZ;
        normal.x = 0;
        normal.y = 0;
        normal.z = -stepZ;
      }
    }
  }

  return null;
}

/**
 * Renders a crisp wireframe outline box around whichever block the crosshair is targeting.
 */
export class VoxelTargetHighlighter {
  constructor(scene) {
    // Slightly larger than 1x1x1 (1.008) to prevent z-fighting with the block faces
    const boxGeo = new THREE.BoxGeometry(1.008, 1.008, 1.008);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x0f172a,
      linewidth: 2,
      transparent: true,
      opacity: 0.92,
    });

    this.mesh = new THREE.LineSegments(edgesGeo, lineMat);
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  update(hitResult) {
    if (!hitResult) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.position.set(hitResult.x, hitResult.y, hitResult.z);
    this.mesh.visible = true;
  }
}
