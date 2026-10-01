import * as THREE from 'three';
import { BLOCK_BY_ID, BLOCK_DEFINITIONS } from './blocks.js';
import { WORLD_MAX_Y } from './noise.js';
import { buildFluidGeometry } from './fluids/FluidMesher.js';

// ============================================================================
// Phases U0.2, U2.2, U2.5 & U3 — VoxelChunk with Worker Transferable Upload & Fluid Meshes
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
    this.fluids = new Map();
    this.instancedMesh = null;
    this.transMesh = null;
    this.waterMesh = null;
    this.lavaMesh = null;
    this.plantMesh = null;
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
    this.visibleInstanceCount = payload.opaqueCount + payload.transCount + (payload.plantCount || 0);

    // 1. Upload Opaque InstancedMesh
    const opaqueCap = Math.max(payload.opaqueCount + 64, 256);
    if (!this.instancedMesh || this.instancedMesh.instanceMatrix.count < payload.opaqueCount) {
      if (this.instancedMesh) {
        this.world.scene.remove(this.instancedMesh);
        this.instancedMesh.geometry.dispose();
        this.instancedMesh.dispose();
      }
      const chunkGeo = this.world.sharedGeometry.clone();
      chunkGeo.setAttribute(
        'instanceTiles',
        new THREE.InstancedBufferAttribute(new Float32Array(opaqueCap * 3), 3)
      );
      this.instancedMesh = new THREE.InstancedMesh(
        chunkGeo,
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
    if (payload.opaqueTiles) {
      const tileAttr = this.instancedMesh.geometry.getAttribute('instanceTiles');
      tileAttr.array.set(payload.opaqueTiles);
      tileAttr.needsUpdate = true;
    }
    this.instancedMesh.count = payload.opaqueCount;
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    this.instancedMesh.instanceColor.needsUpdate = true;
    this.instancedMesh.computeBoundingSphere();

    // 2. Upload Transparent Ice/Glass Pass (Phase U2.5)
    if (payload.transCount > 0) {
      const transCap = Math.max(payload.transCount + 32, 128);
      if (!this.transMesh || this.transMesh.instanceMatrix.count < payload.transCount) {
        if (this.transMesh) {
          this.world.scene.remove(this.transMesh);
          this.transMesh.geometry.dispose();
          this.transMesh.dispose();
        }
        const transGeo = this.world.sharedGeometry.clone();
        transGeo.setAttribute(
          'instanceTiles',
          new THREE.InstancedBufferAttribute(new Float32Array(transCap * 3), 3)
        );
        this.transMesh = new THREE.InstancedMesh(
          transGeo,
          this.world.sharedTransparentMaterial || this.world.sharedMaterial,
          transCap
        );
        this.transMesh.renderOrder = 2;
        this.world.scene.add(this.transMesh);
      }
      this.transMesh.instanceMatrix.array.set(payload.transMatrices);
      if (!this.transMesh.instanceColor) {
        this.transMesh.instanceColor = new THREE.InstancedBufferAttribute(
          new Float32Array(transCap * 3),
          3
        );
      }
      this.transMesh.instanceColor.array.set(payload.transColors);
      if (payload.transTiles) {
        const wTileAttr = this.transMesh.geometry.getAttribute('instanceTiles');
        wTileAttr.array.set(payload.transTiles);
        wTileAttr.needsUpdate = true;
      }
      this.transMesh.count = payload.transCount;
      this.transMesh.instanceMatrix.needsUpdate = true;
      this.transMesh.instanceColor.needsUpdate = true;
      this.transMesh.computeBoundingSphere();
    } else if (this.transMesh) {
      this.transMesh.count = 0;
    }

    // 3. Upload Plant Pass (Cross-Plane Plants)
    if (payload.plantCount > 0) {
      const plantCap = Math.max(payload.plantCount + 16, 32);
      if (!this.plantMesh || this.plantMesh.instanceMatrix.count < payload.plantCount) {
        if (this.plantMesh) {
          this.world.scene.remove(this.plantMesh);
          this.plantMesh.geometry.dispose();
          this.plantMesh.dispose();
        }
        const plantGeo = this.world.sharedPlantGeometry.clone();
        plantGeo.setAttribute(
          'instanceTiles',
          new THREE.InstancedBufferAttribute(new Float32Array(plantCap * 3), 3)
        );
        this.plantMesh = new THREE.InstancedMesh(
          plantGeo,
          this.world.sharedPlantMaterial,
          plantCap
        );
        this.plantMesh.castShadow = true;
        this.world.scene.add(this.plantMesh);
      }
      this.plantMesh.instanceMatrix.array.set(payload.plantMatrices);
      if (!this.plantMesh.instanceColor) {
        this.plantMesh.instanceColor = new THREE.InstancedBufferAttribute(
          new Float32Array(plantCap * 3),
          3
        );
      }
      this.plantMesh.instanceColor.array.set(payload.plantColors);
      if (payload.plantTiles) {
        const pTileAttr = this.plantMesh.geometry.getAttribute('instanceTiles');
        pTileAttr.array.set(payload.plantTiles);
        pTileAttr.needsUpdate = true;
      }
      this.plantMesh.count = payload.plantCount;
      this.plantMesh.instanceMatrix.needsUpdate = true;
      this.plantMesh.instanceColor.needsUpdate = true;
      this.plantMesh.computeBoundingSphere();
    } else if (this.plantMesh) {
      this.plantMesh.count = 0;
    }

    // 4. Build smooth Minecraft-style fluid meshes (variable quad heights & corner averaging)
    this.rebuildFluidMeshes();
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
      return Boolean(b && b !== 'water' && b !== 'lava');
    }
    return this.world.hasBlockOrProcedural(wx, wy, wz);
  }

  rebuildMesh() {
    const opaqueEntries = [];
    const transEntries = [];
    const plantEntries = [];
    const xrayMode = Boolean(this.world.caveXRayEnabled);
    const XRAY_SET = new Set([
      'coal_ore',
      'iron_ore',
      'redstone_ore',
      'gold_ore',
      'emerald_ore',
      'gem_ore',
      'lava',
      'obsidian',
      'bedrock',
    ]);

    for (const [key, blockType] of this.blocks.entries()) {
      const [wx, wy, wz] = this.world.parseKey(key);
      if (blockType === 'water' || blockType === 'lava') {
        continue;
      }
      if (xrayMode) {
        if (XRAY_SET.has(blockType)) {
          opaqueEntries.push([wx, wy, wz, blockType]);
        }
        continue;
      }

      const def = BLOCK_BY_ID[blockType];
      if (def && def.isPlant) {
        // Ground Check: Only mesh plant if cell below has valid ground and no fluid
        const belowKey = this.world.coordKey(wx, wy - 1, wz);
        const belowType = this.blocks.get(belowKey) || this.world.getBlock(wx, wy - 1, wz);
        const isGroundValid = Boolean(
          belowType &&
          belowType !== 'water' &&
          belowType !== 'lava' &&
          belowType !== 'air' &&
          !BLOCK_BY_ID[belowType]?.isPlant
        );
        if (isGroundValid) {
          plantEntries.push([wx, wy, wz, blockType]);
        }
        continue;
      }

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
        this.instancedMesh.geometry.dispose();
        this.instancedMesh.dispose();
      }
      const chunkGeo = this.world.sharedGeometry.clone();
      chunkGeo.setAttribute(
        'instanceTiles',
        new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3)
      );
      this.instancedMesh = new THREE.InstancedMesh(
        chunkGeo,
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
    const tileAttr = this.instancedMesh.geometry.getAttribute('instanceTiles');

    for (let i = 0; i < opaqueEntries.length; i++) {
      const [wx, wy, wz, blockType] = opaqueEntries[i];
      dummy.position.set(wx, wy, wz);
      dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, dummy.matrix);

      const blockDef = BLOCK_BY_ID[blockType] || BLOCK_BY_ID.grass;
      tempColor.copy(blockDef ? blockDef.color : defaultColor);

      // Apply per-voxel Ambient Occlusion factor
      let occluders = 0;
      if (this._hasSolidAt(wx + 1, wy + 1, wz)) occluders++;
      if (this._hasSolidAt(wx - 1, wy + 1, wz)) occluders++;
      if (this._hasSolidAt(wx, wy + 1, wz + 1)) occluders++;
      if (this._hasSolidAt(wx, wy + 1, wz - 1)) occluders++;
      tempColor.multiplyScalar(1.0 - Math.min(3, occluders) * 0.085);

      this.instancedMesh.setColorAt(i, tempColor);

      if (tileAttr) {
        const tiles = blockDef.tiles || { top: 0, side: 3, bottom: 4 };
        let topTile = tiles.top;
        let sideTile = tiles.side;
        let bottomTile = tiles.bottom;
        if (tiles.topVariants && tiles.topVariants.length > 0) {
          const h = Math.abs((wx * 73856093) ^ (wy * 19349663) ^ (wz * 83492791));
          const vTile = tiles.topVariants[h % tiles.topVariants.length];
          topTile = vTile;
          if (tiles.side === tiles.top) sideTile = vTile;
          if (tiles.bottom === tiles.top) bottomTile = vTile;
        }
        const tOffset = i * 3;
        tileAttr.array[tOffset + 0] = topTile;
        tileAttr.array[tOffset + 1] = sideTile;
        tileAttr.array[tOffset + 2] = bottomTile;
      }
    }

    if (tileAttr) tileAttr.needsUpdate = true;
    this.visibleInstanceCount = opaqueEntries.length + transEntries.length;
    this.instancedMesh.count = opaqueEntries.length;
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
    this.instancedMesh.computeBoundingSphere();

    // Update non-fluid transparent pass (ice, glass)
    if (transEntries.length > 0) {
      const transCap = Math.max(transEntries.length + 32, 128);
      if (!this.transMesh || this.transMesh.instanceMatrix.count < transEntries.length) {
        if (this.transMesh) {
          this.world.scene.remove(this.transMesh);
          this.transMesh.geometry.dispose();
          this.transMesh.dispose();
        }
        const transGeo = this.world.sharedGeometry.clone();
        transGeo.setAttribute(
          'instanceTiles',
          new THREE.InstancedBufferAttribute(new Float32Array(transCap * 3), 3)
        );
        this.transMesh = new THREE.InstancedMesh(
          transGeo,
          this.world.sharedTransparentMaterial || this.world.sharedMaterial,
          transCap
        );
        this.transMesh.renderOrder = 2;
        this.world.scene.add(this.transMesh);
      }
      const wTileAttr = this.transMesh.geometry.getAttribute('instanceTiles');
      for (let i = 0; i < transEntries.length; i++) {
        const [wx, wy, wz, blockType] = transEntries[i];
        dummy.position.set(wx, wy, wz);
        dummy.updateMatrix();
        this.transMesh.setMatrixAt(i, dummy.matrix);
        const def = BLOCK_BY_ID[blockType] || BLOCK_BY_ID.glass;
        this.transMesh.setColorAt(i, def.color);
        if (wTileAttr) {
          const tiles = def.tiles || { top: 32, side: 32, bottom: 32 };
          wTileAttr.array[i * 3 + 0] = tiles.top;
          wTileAttr.array[i * 3 + 1] = tiles.side;
          wTileAttr.array[i * 3 + 2] = tiles.bottom;
        }
      }
      if (wTileAttr) wTileAttr.needsUpdate = true;
      this.transMesh.count = transEntries.length;
      this.transMesh.instanceMatrix.needsUpdate = true;
      if (this.transMesh.instanceColor) {
        this.transMesh.instanceColor.needsUpdate = true;
      }
      this.transMesh.computeBoundingSphere();
    } else if (this.transMesh) {
      this.transMesh.count = 0;
    }

    // Update plant pass (Cross-Plane Plants)
    if (plantEntries.length > 0) {
      const plantCap = Math.max(plantEntries.length + 16, 32);
      if (!this.plantMesh || this.plantMesh.instanceMatrix.count < plantEntries.length) {
        if (this.plantMesh) {
          this.world.scene.remove(this.plantMesh);
          this.plantMesh.geometry.dispose();
          this.plantMesh.dispose();
        }
        const plantGeo = this.world.sharedPlantGeometry.clone();
        plantGeo.setAttribute(
          'instanceTiles',
          new THREE.InstancedBufferAttribute(new Float32Array(plantCap * 3), 3)
        );
        this.plantMesh = new THREE.InstancedMesh(
          plantGeo,
          this.world.sharedPlantMaterial,
          plantCap
        );
        this.plantMesh.castShadow = true;
        this.world.scene.add(this.plantMesh);
      }
      const pTileAttr = this.plantMesh.geometry.getAttribute('instanceTiles');
      for (let i = 0; i < plantEntries.length; i++) {
        const [wx, wy, wz, blockType] = plantEntries[i];
        dummy.position.set(wx, wy, wz);
        dummy.updateMatrix();
        this.plantMesh.setMatrixAt(i, dummy.matrix);
        const def = BLOCK_BY_ID[blockType] || BLOCK_BY_ID.tall_grass_plant;
        this.plantMesh.setColorAt(i, def.color);
        if (pTileAttr) {
          const tiles = def.tiles || { top: 96, side: 96, bottom: 96 };
          pTileAttr.array[i * 3 + 0] = tiles.top;
          pTileAttr.array[i * 3 + 1] = tiles.side;
          pTileAttr.array[i * 3 + 2] = tiles.bottom;
        }
      }
      if (pTileAttr) pTileAttr.needsUpdate = true;
      this.plantMesh.count = plantEntries.length;
      this.plantMesh.instanceMatrix.needsUpdate = true;
      if (this.plantMesh.instanceColor) {
        this.plantMesh.instanceColor.needsUpdate = true;
      }
      this.plantMesh.computeBoundingSphere();
    } else if (this.plantMesh) {
      this.plantMesh.count = 0;
    }

    this.visibleInstanceCount = opaqueEntries.length + transEntries.length + plantEntries.length;

    // Rebuild smooth Minecraft-style fluid meshes (variable quad heights & corner averaging)
    this.rebuildFluidMeshes();
  }

  rebuildFluidMeshes() {
    if (!this.world || !this.world.scene) return;

    // 1. Water Mesh
    const waterGeo = buildFluidGeometry(this, 'water', this.world);
    if (waterGeo) {
      if (!this.waterMesh) {
        this.waterMesh = new THREE.Mesh(waterGeo, this.world.sharedWaterMaterial);
        this.waterMesh.renderOrder = 2;
        this.world.scene.add(this.waterMesh);
      } else {
        this.waterMesh.geometry.dispose();
        this.waterMesh.geometry = waterGeo;
        this.waterMesh.visible = true;
      }
    } else if (this.waterMesh) {
      this.waterMesh.visible = false;
    }

    // 2. Lava Mesh
    const lavaGeo = buildFluidGeometry(this, 'lava', this.world);
    if (lavaGeo) {
      if (!this.lavaMesh) {
        this.lavaMesh = new THREE.Mesh(lavaGeo, this.world.sharedLavaMaterial);
        this.lavaMesh.renderOrder = 1;
        this.world.scene.add(this.lavaMesh);
      } else {
        this.lavaMesh.geometry.dispose();
        this.lavaMesh.geometry = lavaGeo;
        this.lavaMesh.visible = true;
      }
    } else if (this.lavaMesh) {
      this.lavaMesh.visible = false;
    }
  }

  dispose() {
    if (this.instancedMesh) {
      this.world.scene.remove(this.instancedMesh);
      this.instancedMesh.geometry.dispose();
      this.instancedMesh.dispose();
      this.instancedMesh = null;
    }
    if (this.transMesh) {
      this.world.scene.remove(this.transMesh);
      this.transMesh.geometry.dispose();
      this.transMesh.dispose();
      this.transMesh = null;
    }
    if (this.waterMesh) {
      this.world.scene.remove(this.waterMesh);
      this.waterMesh.geometry.dispose();
      this.waterMesh = null;
    }
    if (this.lavaMesh) {
      this.world.scene.remove(this.lavaMesh);
      this.lavaMesh.geometry.dispose();
      this.lavaMesh = null;
    }
    if (this.plantMesh) {
      this.world.scene.remove(this.plantMesh);
      this.plantMesh.geometry.dispose();
      this.plantMesh.dispose();
      this.plantMesh = null;
    }
    this.blocks.clear();
    this.fluids.clear();
    this.visibleInstanceCount = 0;
  }
}
