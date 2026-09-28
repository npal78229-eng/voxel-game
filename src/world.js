import * as THREE from 'three';
import { SeededSimplexNoise, TERRAIN_CONFIG } from './noise.js';
import { VoxelChunk, CHUNK_SIZE } from './chunk.js';

// ============================================================================
// Phase 3, 5 & 6 — Chunked Procedural VoxelWorld with Seeded Diffs & Greedy Stats
// ============================================================================

export const RENDER_RADIUS = 3;
export const UNLOAD_RADIUS = 4;
export const MAX_CHUNKS_PER_FRAME = 2;

function createTintableVoxelMaterial() {
  const tileSize = 64;
  const canvas = document.createElement('canvas');
  canvas.width = tileSize * 3;
  canvas.height = tileSize;
  const ctx = canvas.getContext('2d');

  function paintTile(offsetX, baseLuma, grainDelta, borderAlpha) {
    ctx.fillStyle = `rgb(${baseLuma}, ${baseLuma}, ${baseLuma})`;
    ctx.fillRect(offsetX, 0, tileSize, tileSize);

    for (let py = 0; py < tileSize; py += 8) {
      for (let px = 0; px < tileSize; px += 8) {
        const hash = ((px * 31 + py * 17) % 7) - 3;
        const v = Math.max(0, Math.min(255, baseLuma + hash * grainDelta));
        ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
        ctx.fillRect(offsetX + px, py, 8, 8);
      }
    }

    ctx.strokeStyle = `rgba(0, 0, 0, ${borderAlpha})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(offsetX + 1, 1, tileSize - 2, tileSize - 2);
  }

  paintTile(0, 248, 4, 0.2);
  paintTile(tileSize, 215, 5, 0.24);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.fillRect(tileSize + 2, 2, tileSize - 4, 12);
  paintTile(tileSize * 2, 165, 4, 0.28);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;

  return new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.78,
    metalness: 0.05,
  });
}

function createVoxelBoxGeometry() {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const uvAttr = geometry.attributes.uv;

  const tileRanges = [
    [1 / 3, 2 / 3],
    [1 / 3, 2 / 3],
    [0 / 3, 1 / 3],
    [2 / 3, 3 / 3],
    [1 / 3, 2 / 3],
    [1 / 3, 2 / 3],
  ];

  for (let face = 0; face < 6; face++) {
    const [uMin, uMax] = tileRanges[face];
    const baseVertex = face * 4;
    uvAttr.setXY(baseVertex + 0, uMin, 1);
    uvAttr.setXY(baseVertex + 1, uMax, 1);
    uvAttr.setXY(baseVertex + 2, uMin, 0);
    uvAttr.setXY(baseVertex + 3, uMax, 0);
  }

  uvAttr.needsUpdate = true;
  return geometry;
}

export class VoxelWorld {
  constructor(scene, seed = TERRAIN_CONFIG.seed) {
    this.scene = scene;
    this.seed = seed;
    this.noise = new SeededSimplexNoise(seed);

    this.sharedGeometry = createVoxelBoxGeometry();
    this.sharedMaterial = createTintableVoxelMaterial();
    this.dummy = new THREE.Object3D();

    this.chunks = new Map();
    this.generationQueue = [];
    this.queuedChunkKeys = new Set();

    // Diff Map<"wx,wy,wz", blockType | null> for Phase 5 Persistence
    this.modifiedBlocks = new Map();

    this.lastPlayerChunkX = null;
    this.lastPlayerChunkZ = null;
  }

  /**
   * Updates the deterministic world seed and re-initializes the Simplex noise generator.
   */
  setSeed(newSeed) {
    this.seed = newSeed;
    this.noise = new SeededSimplexNoise(newSeed);
  }

  /**
   * Disposes all active chunks and rebuilds around `playerPosition` (used on Save Load / New Game).
   */
  reloadAllChunks(playerPosition) {
    for (const chunk of this.chunks.values()) {
      chunk.dispose();
    }
    this.chunks.clear();
    this.generationQueue = [];
    this.queuedChunkKeys.clear();
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

  getBlock(wx, wy, wz) {
    const x = Math.round(wx);
    const y = Math.round(wy);
    const z = Math.round(wz);
    const chunk = this.getChunkAtWorld(x, z);
    if (!chunk) return null;
    return chunk.blocks.get(this.coordKey(x, y, z)) || null;
  }

  hasBlockOrProcedural(wx, wy, wz) {
    const x = Math.round(wx);
    const y = Math.round(wy);
    const z = Math.round(wz);
    const chunk = this.getChunkAtWorld(x, z);
    const key = this.coordKey(x, y, z);
    if (chunk) {
      return chunk.blocks.has(key);
    }
    if (this.modifiedBlocks.has(key)) {
      return this.modifiedBlocks.get(key) !== null;
    }
    return this.noise.getNaturalBlockAt(x, y, z) !== null;
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
    if (!chunk.blocks.has(key)) return false;

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
    const playerMinX = playerPos.x - 0.35;
    const playerMaxX = playerPos.x + 0.35;
    const playerMinY = playerPos.y - 1.45;
    const playerMaxY = playerPos.y + 0.35;
    const playerMinZ = playerPos.z - 0.35;
    const playerMaxZ = playerPos.z + 0.35;

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
          if (!this.chunks.has(key) && !this.queuedChunkKeys.has(key)) {
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

    const budget = immediateCenter ? 9 : MAX_CHUNKS_PER_FRAME;
    let generatedCount = 0;

    while (this.generationQueue.length > 0 && generatedCount < budget) {
      const next = this.generationQueue.shift();
      const key = this.chunkKey(next.chunkX, next.chunkZ);
      this.queuedChunkKeys.delete(key);

      if (!this.chunks.has(key)) {
        const chunk = new VoxelChunk(next.chunkX, next.chunkZ, this);
        this.chunks.set(key, chunk);
        generatedCount++;
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
      naiveTris > 0 ? Math.round(((naiveTris - greedyTris) / naiveTris) * 100) : 0;

    return {
      loadedChunks: this.chunks.size,
      queuedChunks: this.generationQueue.length,
      visibleInstances,
      totalBlocks,
      naiveTris,
      greedyTris,
      reductionPct,
      diffCount: this.modifiedBlocks.size,
    };
  }
}
