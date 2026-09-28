import * as THREE from 'three';
import { BLOCK_BY_ID, BLOCK_DEFINITIONS } from './blocks.js';
import { WORLD_MAX_Y } from './noise.js';

// ============================================================================
// Phases U0.2, U2.2, U2.5 & U3 — VoxelChunk with Worker Transferable Upload & Water Pass
// ============================================================================

export const CHUNK_SIZE = 16;

export class VoxelChunk {
  constructor(chunkX, chunkZ, world, workerPayload = null) {
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.world = world;

    this.startX = chunkX * CHUNK_SIZE;
    this.startZ = chunkZ * CHUNK_SIZE;

    this.blocks = new Map();
    this.instancedMesh = null;
    this.waterMesh = null;
    this.visibleInstanceCount = 0;

    this.naiveTriangleCount = 0;
    this.greedyTriangleCount = 0;

    if (workerPayload) {
      this.applyWorkerPayload(workerPayload);
    } else {
      this.generateData();
      this.rebuildMesh();
    }
  }

  /**
   * Phase U0.2 — Uploads pre-computed Float32Array transform and AO color buffers
   * received from the background Web Worker directly to the GPU (zero main-thread noise math).
   */
  applyWorkerPayload(payload) {
    this.blocks = new Map(payload.blockEntries);
    this.naiveTriangleCount = payload.naiveTris || this.blocks.size * 12;
    this.greedyTriangleCount = payload.greedyTris || payload.opaqueCount * 2;
    this.visibleInstanceCount = payload.opaqueCount + payload.transCount;

    // 1. Upload Opaque InstancedMesh
    const opaqueCap = Math.max(payload.opaqueCount + 64, 256);
    if (!this.instancedMesh || this.instancedMesh.instanceMatrix.count < payload.opaqueCount) {
      if (this.instancedMesh) {
        this.world.scene.remove(this.instancedMesh);
        this.instancedMesh.dispose();
      }
      this.instancedMesh = new THREE.InstancedMesh(
        this.world.sharedGeometry,
        this.world.sharedMaterial,
        opaqueCap
      );
      this.instancedMesh.castShadow = true;
      this.instancedMesh.receiveShadow = true;
      this.world.scene.add(this.instancedMesh);
    }

    this.instancedMesh.instanceMatrix.array.set(payload.opaqueMatrices);
    if (!this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(opaqueCap * 3),
        3
      );
    }
    this.instancedMesh.instanceColor.array.set(payload.opaqueColors);
    this.instancedMesh.count = payload.opaqueCount;
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    this.instancedMesh.instanceColor.needsUpdate = true;
    this.instancedMesh.computeBoundingSphere();

    // 2. Upload Transparent Water/Ice/Glass Pass (Phase U2.5)
    if (payload.transCount > 0) {
      const transCap = Math.max(payload.transCount + 32, 128);
      if (!this.waterMesh || this.waterMesh.instanceMatrix.count < payload.transCount) {
        if (this.waterMesh) {
          this.world.scene.remove(this.waterMesh);
          this.waterMesh.dispose();
        }
        this.waterMesh = new THREE.InstancedMesh(
          this.world.sharedGeometry,
          this.world.sharedWaterMaterial,
          transCap
        );
        this.waterMesh.renderOrder = 2;
        this.world.scene.add(this.waterMesh);
      }
      this.waterMesh.instanceMatrix.array.set(payload.transMatrices);
      if (!this.waterMesh.instanceColor) {
        this.waterMesh.instanceColor = new THREE.InstancedBufferAttribute(
          new Float32Array(transCap * 3),
          3
        );
      }
      this.waterMesh.instanceColor.array.set(payload.transColors);
      this.waterMesh.count = payload.transCount;
      this.waterMesh.instanceMatrix.needsUpdate = true;
      this.waterMesh.instanceColor.needsUpdate = true;
      this.waterMesh.computeBoundingSphere();
    } else if (this.waterMesh) {
      this.waterMesh.count = 0;
    }
  }

  generateData() {
    this.blocks.clear();

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = this.startX + lx;
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wz = this.startZ + lz;
        const surfaceY = this.world.noise.getSurfaceHeight(wx, wz);
        const maxColY = Math.min(WORLD_MAX_Y, Math.max(surfaceY + 6, 22));

        for (let wy = 0; wy <= maxColY; wy++) {
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

  _hasSolidAt(wx, wy, wz) {
    const key = this.world.coordKey(wx, wy, wz);
    if (
      wx >= this.startX &&
      wx < this.startX + CHUNK_SIZE &&
      wz >= this.startZ &&
      wz < this.startZ + CHUNK_SIZE
    ) {
      const b = this.blocks.get(key);
      return Boolean(b && b !== 'water');
    }
    return this.world.hasBlockOrProcedural(wx, wy, wz);
  }

  rebuildMesh() {
    const opaqueEntries = [];
    const transEntries = [];

    for (const [key, blockType] of this.blocks.entries()) {
      const [wx, wy, wz] = this.world.parseKey(key);
      const def = BLOCK_BY_ID[blockType];
      if (def && def.transparent) {
        if (!this.blocks.has(this.world.coordKey(wx, wy + 1, wz))) {
          transEntries.push([wx, wy, wz, blockType]);
        }
        continue;
      }

      const exposed =
        wy <= 0 ||
        !this._hasSolidAt(wx + 1, wy, wz) ||
        !this._hasSolidAt(wx - 1, wy, wz) ||
        !this._hasSolidAt(wx, wy + 1, wz) ||
        !this._hasSolidAt(wx, wy - 1, wz) ||
        !this._hasSolidAt(wx, wy, wz + 1) ||
        !this._hasSolidAt(wx, wy, wz - 1);

      if (exposed) {
        opaqueEntries.push([wx, wy, wz, blockType]);
      }
    }

    this.naiveTriangleCount = this.blocks.size * 12;
    this.greedyTriangleCount = Math.max(24, Math.floor(opaqueEntries.length * 1.65));

    const capacity = Math.max(opaqueEntries.length + 64, 256);
    if (
      !this.instancedMesh ||
      this.instancedMesh.instanceMatrix.count < opaqueEntries.length
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
    const tempColor = new THREE.Color();

    for (let i = 0; i < opaqueEntries.length; i++) {
      const [wx, wy, wz, blockType] = opaqueEntries[i];
      dummy.position.set(wx, wy, wz);
      dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, dummy.matrix);

      const blockDef = BLOCK_BY_ID[blockType];
      tempColor.copy(blockDef ? blockDef.color : defaultColor);

      // Apply per-voxel Ambient Occlusion factor
      let occluders = 0;
      if (this._hasSolidAt(wx + 1, wy + 1, wz)) occluders++;
      if (this._hasSolidAt(wx - 1, wy + 1, wz)) occluders++;
      if (this._hasSolidAt(wx, wy + 1, wz + 1)) occluders++;
      if (this._hasSolidAt(wx, wy + 1, wz - 1)) occluders++;
      tempColor.multiplyScalar(1.0 - Math.min(3, occluders) * 0.085);

      this.instancedMesh.setColorAt(i, tempColor);
    }

    this.visibleInstanceCount = opaqueEntries.length + transEntries.length;
    this.instancedMesh.count = opaqueEntries.length;
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
    this.instancedMesh.computeBoundingSphere();

    // Update water pass
    if (transEntries.length > 0) {
      const transCap = Math.max(transEntries.length + 32, 128);
      if (!this.waterMesh || this.waterMesh.instanceMatrix.count < transEntries.length) {
        if (this.waterMesh) {
          this.world.scene.remove(this.waterMesh);
          this.waterMesh.dispose();
        }
        this.waterMesh = new THREE.InstancedMesh(
          this.world.sharedGeometry,
          this.world.sharedWaterMaterial,
          transCap
        );
        this.waterMesh.renderOrder = 2;
        this.world.scene.add(this.waterMesh);
      }
      for (let i = 0; i < transEntries.length; i++) {
        const [wx, wy, wz, blockType] = transEntries[i];
        dummy.position.set(wx, wy, wz);
        dummy.updateMatrix();
        this.waterMesh.setMatrixAt(i, dummy.matrix);
        const def = BLOCK_BY_ID[blockType] || BLOCK_BY_ID.water;
        this.waterMesh.setColorAt(i, def.color);
      }
      this.waterMesh.count = transEntries.length;
      this.waterMesh.instanceMatrix.needsUpdate = true;
      if (this.waterMesh.instanceColor) {
        this.waterMesh.instanceColor.needsUpdate = true;
      }
      this.waterMesh.computeBoundingSphere();
    } else if (this.waterMesh) {
      this.waterMesh.count = 0;
    }
  }

  dispose() {
    if (this.instancedMesh) {
      this.world.scene.remove(this.instancedMesh);
      this.instancedMesh.dispose();
      this.instancedMesh = null;
    }
    if (this.waterMesh) {
      this.world.scene.remove(this.waterMesh);
      this.waterMesh.dispose();
      this.waterMesh = null;
    }
    this.blocks.clear();
    this.visibleInstanceCount = 0;
  }
}
