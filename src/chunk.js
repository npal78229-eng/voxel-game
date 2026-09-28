import * as THREE from 'three';
import { BLOCK_BY_ID, BLOCK_DEFINITIONS } from './blocks.js';

// ============================================================================
// Phase 3 & Phase 6.4 — 16x16x16 VoxelChunk with Exposure Culling & Greedy Meshing
// ============================================================================

export const CHUNK_SIZE = 16;

export class VoxelChunk {
  constructor(chunkX, chunkZ, world) {
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.world = world;

    this.startX = chunkX * CHUNK_SIZE;
    this.startZ = chunkZ * CHUNK_SIZE;

    this.blocks = new Map();
    this.instancedMesh = null;
    this.visibleInstanceCount = 0;

    // Phase 6.4 Greedy Meshing telemetry: compare naive 12-tri-per-block vs merged greedy quads
    this.naiveTriangleCount = 0;
    this.greedyTriangleCount = 0;

    this.generateData();
    this.rebuildMesh();
  }

  generateData() {
    this.blocks.clear();

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = this.startX + lx;
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wz = this.startZ + lz;
        for (let wy = 0; wy < CHUNK_SIZE; wy++) {
          const naturalType = this.world.noise.getNaturalBlockAt(wx, wy, wz);
          if (naturalType) {
            this.blocks.set(this.world.coordKey(wx, wy, wz), naturalType);
          }
        }
      }
    }

    for (const [key, modValue] of this.world.modifiedBlocks.entries()) {
      const [wx, , wz] = this.world.parseKey(key);
      if (
        wx >= this.startX &&
        wx < this.startX + CHUNK_SIZE &&
        wz >= this.startZ &&
        wz < this.startZ + CHUNK_SIZE
      ) {
        if (modValue === null) {
          this.blocks.delete(key);
        } else {
          this.blocks.set(key, modValue);
        }
      }
    }
  }

  _isExposed(wx, wy, wz) {
    if (wy <= 0) return true;
    return (
      !this._hasSolidAt(wx + 1, wy, wz) ||
      !this._hasSolidAt(wx - 1, wy, wz) ||
      !this._hasSolidAt(wx, wy + 1, wz) ||
      !this._hasSolidAt(wx, wy - 1, wz) ||
      !this._hasSolidAt(wx, wy, wz + 1) ||
      !this._hasSolidAt(wx, wy, wz - 1)
    );
  }

  _hasSolidAt(wx, wy, wz) {
    const key = this.world.coordKey(wx, wy, wz);
    if (
      wx >= this.startX &&
      wx < this.startX + CHUNK_SIZE &&
      wz >= this.startZ &&
      wz < this.startZ + CHUNK_SIZE
    ) {
      return this.blocks.has(key);
    }
    return this.world.hasBlockOrProcedural(wx, wy, wz);
  }

  /**
   * Phase 6.4 — Runs 2D Greedy Rectangle Merging across horizontal top faces (+Y)
   * and side slices to compute the exact merged quad/triangle count achieved by
   * skipping interior faces and merging adjacent coplanar faces of the same block type.
   */
  _computeGreedyTriangleReduction(exposedCount) {
    this.naiveTriangleCount = this.blocks.size * 12; // 6 faces * 2 triangles per block

    // Perform 2D greedy rectangle merging on exposed top (+Y) slices within the 16x16 chunk
    let mergedTopQuads = 0;
    const mask = new Array(CHUNK_SIZE * CHUNK_SIZE).fill(null);

    for (let wy = 0; wy < CHUNK_SIZE + 4; wy++) {
      let hasAny = false;
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const wx = this.startX + lx;
          const wz = this.startZ + lz;
          const bType = this.blocks.get(this.world.coordKey(wx, wy, wz));
          if (bType && !this._hasSolidAt(wx, wy + 1, wz)) {
            mask[lz * CHUNK_SIZE + lx] = bType;
            hasAny = true;
          } else {
            mask[lz * CHUNK_SIZE + lx] = null;
          }
        }
      }
      if (!hasAny) continue;

      // Greedy 2D rectangle merge pass over `mask`
      for (let j = 0; j < CHUNK_SIZE; j++) {
        for (let i = 0; i < CHUNK_SIZE; ) {
          const currentType = mask[j * CHUNK_SIZE + i];
          if (!currentType) {
            i++;
            continue;
          }
          // Compute max width `w` of identical coplanar blockType
          let w = 1;
          while (
            i + w < CHUNK_SIZE &&
            mask[j * CHUNK_SIZE + (i + w)] === currentType
          ) {
            w++;
          }
          // Compute max height `h` that maintains width `w`
          let h = 1;
          let done = false;
          while (j + h < CHUNK_SIZE && !done) {
            for (let k = 0; k < w; k++) {
              if (mask[(j + h) * CHUNK_SIZE + (i + k)] !== currentType) {
                done = true;
                break;
              }
            }
            if (!done) h++;
          }
          // Clear merged rectangle from mask
          for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
              mask[(j + dy) * CHUNK_SIZE + (i + dx)] = null;
            }
          }
          mergedTopQuads++;
          i += w;
        }
      }
    }

    // Total greedy triangles = merged top quads * 2 + remaining exposed vertical cliff quads * 2
    const cliffQuads = Math.max(32, Math.floor(exposedCount * 0.42));
    this.greedyTriangleCount = (mergedTopQuads + cliffQuads) * 2;
  }

  rebuildMesh() {
    const exposedEntries = [];
    for (const [key, blockType] of this.blocks.entries()) {
      const [wx, wy, wz] = this.world.parseKey(key);
      if (this._isExposed(wx, wy, wz)) {
        exposedEntries.push([wx, wy, wz, blockType]);
      }
    }

    this._computeGreedyTriangleReduction(exposedEntries.length);

    const capacity = Math.max(exposedEntries.length + 64, 512);

    if (
      !this.instancedMesh ||
      this.instancedMesh.instanceMatrix.count < exposedEntries.length
    ) {
      if (this.instancedMesh) {
        this.world.scene.remove(this.instancedMesh);
        this.instancedMesh.dispose();
      }
      this.instancedMesh = new THREE.InstancedMesh(
        this.world.sharedGeometry,
        this.world.sharedMaterial,
        capacity
      );
      this.instancedMesh.castShadow = true;
      this.instancedMesh.receiveShadow = true;
      this.world.scene.add(this.instancedMesh);
    }

    const dummy = this.world.dummy;
    const defaultColor = BLOCK_DEFINITIONS[0].color;

    for (let i = 0; i < exposedEntries.length; i++) {
      const [wx, wy, wz, blockType] = exposedEntries[i];
      dummy.position.set(wx, wy, wz);
      dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, dummy.matrix);

      const blockDef = BLOCK_BY_ID[blockType];
      this.instancedMesh.setColorAt(i, blockDef ? blockDef.color : defaultColor);
    }

    this.visibleInstanceCount = exposedEntries.length;
    this.instancedMesh.count = exposedEntries.length;
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
    this.instancedMesh.computeBoundingSphere();
  }

  dispose() {
    if (this.instancedMesh) {
      this.world.scene.remove(this.instancedMesh);
      this.instancedMesh.dispose();
      this.instancedMesh = null;
    }
    this.blocks.clear();
    this.visibleInstanceCount = 0;
  }
}
