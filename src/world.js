import * as THREE from 'three';
import { SeededSimplexNoise, TERRAIN_CONFIG } from './noise.js';
import { VoxelChunk, CHUNK_SIZE } from './chunk.js';
import { BLOCK_BY_ID } from './blocks.js';

// ============================================================================
// Phases U0.2, U2.1 & U3 — VoxelWorld with Web Worker Pool & Pixel Atlas
// ============================================================================

export const RENDER_RADIUS = 3;
export const UNLOAD_RADIUS = 4;
export const MAX_CHUNKS_PER_FRAME = 2;

function applyAtlasShader(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      `attribute float faceType;\nattribute vec3 instanceTiles;\n` +
      shader.vertexShader.replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
#ifdef USE_MAP
  float tileIdx = (faceType < 0.5) ? instanceTiles.x : ((faceType < 1.5) ? instanceTiles.y : instanceTiles.z);
  float col = mod(tileIdx, 16.0);
  float row = floor(tileIdx / 16.0);
  float eps = 0.5 / 1024.0;
  float u0 = (col * 64.0) / 1024.0 + eps;
  float u1 = ((col + 1.0) * 64.0) / 1024.0 - eps;
  float v0 = 1.0 - ((row + 1.0) * 64.0) / 1024.0 + eps;
  float v1 = 1.0 - (row * 64.0) / 1024.0 - eps;
  vMapUv = vec2(mix(u0, u1, uv.x), mix(v0, v1, uv.y));
#endif`
      );
  };
  return material;
}

let sharedAtlasTexture = null;
export function getSharedAtlasTexture() {
  if (!sharedAtlasTexture) {
    const loader = new THREE.TextureLoader();
    sharedAtlasTexture = loader.load('./assets/blocks/atlas.png');
    sharedAtlasTexture.magFilter = THREE.LinearFilter;
    sharedAtlasTexture.minFilter = THREE.LinearFilter;
    sharedAtlasTexture.generateMipmaps = false;
    sharedAtlasTexture.colorSpace = THREE.SRGBColorSpace;
  }
  return sharedAtlasTexture;
}

function createTintableVoxelMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    map: getSharedAtlasTexture(),
    roughness: 0.68,
    metalness: 0.08,
  });
  return applyAtlasShader(mat);
}

function createWaterMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    map: getSharedAtlasTexture(),
    color: 0xffffff,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    roughness: 0.16,
    metalness: 0.1,
  });
  return applyAtlasShader(mat);
}

function createVoxelBoxGeometry() {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const uvAttr = geometry.attributes.uv;

  // BoxGeometry face order: 0:+X(side), 1:-X(side), 2:+Y(top), 3:-Y(bottom), 4:+Z(side), 5:-Z(side)
  const faceTypeByFace = [1.0, 1.0, 0.0, 2.0, 1.0, 1.0];
  const faceTypes = new Float32Array(24);

  for (let face = 0; face < 6; face++) {
    const baseVertex = face * 4;
    uvAttr.setXY(baseVertex + 0, 0.0, 1.0);
    uvAttr.setXY(baseVertex + 1, 1.0, 1.0);
    uvAttr.setXY(baseVertex + 2, 0.0, 0.0);
    uvAttr.setXY(baseVertex + 3, 1.0, 0.0);
    for (let v = 0; v < 4; v++) {
      faceTypes[baseVertex + v] = faceTypeByFace[face];
    }
  }

  uvAttr.needsUpdate = true;
  geometry.setAttribute('faceType', new THREE.BufferAttribute(faceTypes, 1));
  return geometry;
}

export class VoxelWorld {
  constructor(scene, seed = TERRAIN_CONFIG.seed) {
    this.scene = scene;
    this.seed = seed;
    this.noise = new SeededSimplexNoise(seed);

    this.sharedGeometry = createVoxelBoxGeometry();
    this.sharedMaterial = createTintableVoxelMaterial();
    this.sharedWaterMaterial = createWaterMaterial();
    this.dummy = new THREE.Object3D();

    this.chunks = new Map();
    this.generationQueue = [];
    this.queuedChunkKeys = new Set();
    this.inFlightKeys = new Set();

    this.modifiedBlocks = new Map();

    this.lastPlayerChunkX = null;
    this.lastPlayerChunkZ = null;

    // Phase U0.2 — Initialize Web Worker Pool (hardwareConcurrency - 1, clamped 1..6)
    this.workers = [];
    this.busyWorkers = new Set();
    this._initWorkerPool();
  }

  _initWorkerPool() {
    const hw = navigator.hardwareConcurrency || 4;
    const poolSize = Math.max(1, Math.min(6, hw - 1));

    try {
      for (let i = 0; i < poolSize; i++) {
        const worker = new Worker(
          new URL('./workers/chunkWorker.js', import.meta.url),
          { type: 'module' }
        );
        worker.onmessage = (event) => {
          this.busyWorkers.delete(worker);
          this._onWorkerChunkReady(event.data);
          this._dispatchNextWorkerJob();
        };
        worker.onerror = () => {
          this.busyWorkers.delete(worker);
        };
        this.workers.push(worker);
      }
    } catch {
      // Fallback to main-thread chunk queue if Worker is blocked
      this.workers = [];
    }
  }

  _onWorkerChunkReady(payload) {
    const key = this.chunkKey(payload.chunkX, payload.chunkZ);
    this.inFlightKeys.delete(key);

    // Verify chunk is still within UNLOAD_RADIUS
    if (
      this.lastPlayerChunkX !== null &&
      (Math.abs(payload.chunkX - this.lastPlayerChunkX) > UNLOAD_RADIUS ||
        Math.abs(payload.chunkZ - this.lastPlayerChunkZ) > UNLOAD_RADIUS)
    ) {
      return;
    }

    if (!this.chunks.has(key)) {
      const chunk = new VoxelChunk(
        payload.chunkX,
        payload.chunkZ,
        this,
        payload
      );
      this.chunks.set(key, chunk);
    }
  }

  _dispatchNextWorkerJob() {
    if (this.generationQueue.length === 0) return;

    for (const worker of this.workers) {
      if (this.generationQueue.length === 0) break;
      if (this.busyWorkers.has(worker)) continue;

      const next = this.generationQueue.shift();
      const key = this.chunkKey(next.chunkX, next.chunkZ);
      this.queuedChunkKeys.delete(key);

      if (this.chunks.has(key) || this.inFlightKeys.has(key)) continue;

      this.inFlightKeys.add(key);
      this.busyWorkers.add(worker);

      worker.postMessage({
        jobId: key,
        chunkX: next.chunkX,
        chunkZ: next.chunkZ,
        seed: this.seed,
        diffs: Array.from(this.modifiedBlocks.entries()),
      });
    }
  }

  setSeed(newSeed) {
    this.seed = newSeed;
    this.noise = new SeededSimplexNoise(newSeed);
  }

  reloadAllChunks(playerPosition) {
    for (const chunk of this.chunks.values()) {
      chunk.dispose();
    }
    this.chunks.clear();
    this.generationQueue = [];
    this.queuedChunkKeys.clear();
    this.inFlightKeys.clear();
    this.lastPlayerChunkX = null;
    this.lastPlayerChunkZ = null;
    this.updateChunks(playerPosition, true);
  }

  coordKey(x, y, z) {
    return `${Math.round(x)},${Math.round(y)},${Math.round(z)}`;
  }

  parseKey(key) {
    return key.split(',').map(Number);
  }

  chunkKey(chunkX, chunkZ) {
    return `${chunkX},${chunkZ}`;
  }

  worldToChunkCoords(wx, wz) {
    return {
      chunkX: Math.floor(wx / CHUNK_SIZE),
      chunkZ: Math.floor(wz / CHUNK_SIZE),
    };
  }

  getChunkAtWorld(wx, wz) {
    const { chunkX, chunkZ } = this.worldToChunkCoords(wx, wz);
    return this.chunks.get(this.chunkKey(chunkX, chunkZ)) || null;
  }

  getSurfaceHeight(wx, wz) {
    return this.noise.getSurfaceHeight(Math.round(wx), Math.round(wz));
  }

  getBiomeNameAt(wx, wz) {
    return this.noise.getBiomeAt(Math.round(wx), Math.round(wz)).name;
  }

  getBlock(wx, wy, wz) {
    const x = Math.round(wx);
    const y = Math.round(wy);
    const z = Math.round(wz);
    const chunk = this.getChunkAtWorld(x, z);
    if (!chunk) return null;
    return chunk.blocks.get(this.coordKey(x, y, z)) || null;
  }

  /**
   * Returns true if a solid physical collider block exists at integer (x, y, z)
   * (water does not block movement; used by Phase U0.3 AABB Physics).
   */
  isSolidAt(wx, wy, wz) {
    const b = this.getBlock(wx, wy, wz);
    return Boolean(b && b !== 'water');
  }

  hasBlockOrProcedural(wx, wy, wz) {
    const x = Math.round(wx);
    const y = Math.round(wy);
    const z = Math.round(wz);
    const chunk = this.getChunkAtWorld(x, z);
    const key = this.coordKey(x, y, z);
    if (chunk) {
      const b = chunk.blocks.get(key);
      return Boolean(b && b !== 'water');
    }
    if (this.modifiedBlocks.has(key)) {
      const b = this.modifiedBlocks.get(key);
      return Boolean(b && b !== 'water');
    }
    const nat = this.noise.getNaturalBlockAt(x, y, z);
    return Boolean(nat && nat !== 'water');
  }

  setBlock(wx, wy, wz, blockType) {
    if (!blockType) return this.removeBlock(wx, wy, wz);
    const x = Math.round(wx);
    const y = Math.round(wy);
    const z = Math.round(wz);
    const chunk = this.getChunkAtWorld(x, z);
    if (!chunk) return false;

    const key = this.coordKey(x, y, z);
    this.modifiedBlocks.set(key, blockType);
    chunk.blocks.set(key, blockType);
    chunk.rebuildMesh();
    this._rebuildNeighborChunksIfOnBorder(x, z, chunk);
    return true;
  }

  removeBlock(wx, wy, wz) {
    const x = Math.round(wx);
    const y = Math.round(wy);
    const z = Math.round(wz);
    const chunk = this.getChunkAtWorld(x, z);
    if (!chunk) return false;

    const key = this.coordKey(x, y, z);
    const existing = chunk.blocks.get(key);
    if (!existing) return false;
    // Bedrock at y=0 is unbreakable (Phase U3.1)
    if (existing === 'bedrock' || BLOCK_BY_ID[existing]?.hardness === Infinity) {
      return false;
    }

    this.modifiedBlocks.set(key, null);
    chunk.blocks.delete(key);
    chunk.rebuildMesh();
    this._rebuildNeighborChunksIfOnBorder(x, z, chunk);
    return true;
  }

  _rebuildNeighborChunksIfOnBorder(wx, wz, chunk) {
    const localX = wx - chunk.startX;
    const localZ = wz - chunk.startZ;
    if (localX === 0) {
      const c = this.chunks.get(this.chunkKey(chunk.chunkX - 1, chunk.chunkZ));
      if (c) c.rebuildMesh();
    } else if (localX === CHUNK_SIZE - 1) {
      const c = this.chunks.get(this.chunkKey(chunk.chunkX + 1, chunk.chunkZ));
      if (c) c.rebuildMesh();
    }
    if (localZ === 0) {
      const c = this.chunks.get(this.chunkKey(chunk.chunkX, chunk.chunkZ - 1));
      if (c) c.rebuildMesh();
    } else if (localZ === CHUNK_SIZE - 1) {
      const c = this.chunks.get(this.chunkKey(chunk.chunkX, chunk.chunkZ + 1));
      if (c) c.rebuildMesh();
    }
  }

  wouldOverlapPlayer(bx, by, bz, playerPos) {
    const playerMinX = playerPos.x - 0.3;
    const playerMaxX = playerPos.x + 0.3;
    const playerMinY = playerPos.y - 1.62;
    const playerMaxY = playerPos.y + 0.18;
    const playerMinZ = playerPos.z - 0.3;
    const playerMaxZ = playerPos.z + 0.3;

    const blockMinX = bx - 0.5;
    const blockMaxX = bx + 0.5;
    const blockMinY = by - 0.5;
    const blockMaxY = by + 0.5;
    const blockMinZ = bz - 0.5;
    const blockMaxZ = bz + 0.5;

    return (
      playerMinX < blockMaxX &&
      playerMaxX > blockMinX &&
      playerMinY < blockMaxY &&
      playerMaxY > blockMinY &&
      playerMinZ < blockMaxZ &&
      playerMaxZ > blockMinZ
    );
  }

  updateChunks(playerPosition, immediateCenter = false) {
    const { chunkX: pCX, chunkZ: pCZ } = this.worldToChunkCoords(
      playerPosition.x,
      playerPosition.z
    );

    if (
      pCX !== this.lastPlayerChunkX ||
      pCZ !== this.lastPlayerChunkZ ||
      immediateCenter
    ) {
      this.lastPlayerChunkX = pCX;
      this.lastPlayerChunkZ = pCZ;

      for (const [key, chunk] of this.chunks.entries()) {
        const dx = Math.abs(chunk.chunkX - pCX);
        const dz = Math.abs(chunk.chunkZ - pCZ);
        if (dx > UNLOAD_RADIUS || dz > UNLOAD_RADIUS) {
          chunk.dispose();
          this.chunks.delete(key);
        }
      }

      this.generationQueue = this.generationQueue.filter((item) => {
        const keep =
          Math.abs(item.chunkX - pCX) <= RENDER_RADIUS &&
          Math.abs(item.chunkZ - pCZ) <= RENDER_RADIUS;
        if (!keep) {
          this.queuedChunkKeys.delete(this.chunkKey(item.chunkX, item.chunkZ));
        }
        return keep;
      });

      const candidates = [];
      for (let dx = -RENDER_RADIUS; dx <= RENDER_RADIUS; dx++) {
        for (let dz = -RENDER_RADIUS; dz <= RENDER_RADIUS; dz++) {
          const cx = pCX + dx;
          const cz = pCZ + dz;
          const key = this.chunkKey(cx, cz);
          if (
            !this.chunks.has(key) &&
            !this.queuedChunkKeys.has(key) &&
            !this.inFlightKeys.has(key)
          ) {
            candidates.push({
              chunkX: cx,
              chunkZ: cz,
              distSq: dx * dx + dz * dz,
            });
            this.queuedChunkKeys.add(key);
          }
        }
      }

      candidates.sort((a, b) => a.distSq - b.distSq);
      this.generationQueue.push(...candidates);
    }

    // Immediate center chunk generation on first spawn so player stands on solid ground immediately
    if (immediateCenter) {
      let count = 0;
      while (this.generationQueue.length > 0 && count < 4) {
        const next = this.generationQueue.shift();
        const key = this.chunkKey(next.chunkX, next.chunkZ);
        this.queuedChunkKeys.delete(key);
        if (!this.chunks.has(key)) {
          this.chunks.set(key, new VoxelChunk(next.chunkX, next.chunkZ, this));
          count++;
        }
      }
    }

    // Dispatch remaining chunks to the Web Worker pool (or fallback main-thread queue)
    if (this.workers.length > 0) {
      this._dispatchNextWorkerJob();
    } else {
      let generated = 0;
      while (this.generationQueue.length > 0 && generated < MAX_CHUNKS_PER_FRAME) {
        const next = this.generationQueue.shift();
        const key = this.chunkKey(next.chunkX, next.chunkZ);
        this.queuedChunkKeys.delete(key);
        if (!this.chunks.has(key)) {
          this.chunks.set(key, new VoxelChunk(next.chunkX, next.chunkZ, this));
          generated++;
        }
      }
    }
  }

  getStats() {
    let visibleInstances = 0;
    let totalBlocks = 0;
    let naiveTris = 0;
    let greedyTris = 0;
    for (const chunk of this.chunks.values()) {
      visibleInstances += chunk.visibleInstanceCount;
      totalBlocks += chunk.blocks.size;
      naiveTris += chunk.naiveTriangleCount;
      greedyTris += chunk.greedyTriangleCount;
    }
    const reductionPct =
      naiveTris > 0
        ? Math.round(((naiveTris - greedyTris) / naiveTris) * 100)
        : 0;

    return {
      loadedChunks: this.chunks.size,
      queuedChunks: this.generationQueue.length + this.inFlightKeys.size,
      visibleInstances,
      totalBlocks,
      naiveTris,
      greedyTris,
      reductionPct,
      diffCount: this.modifiedBlocks.size,
      workerCount: this.workers.length,
    };
  }
}
