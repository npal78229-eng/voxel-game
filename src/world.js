import * as THREE from 'three';
import { SeededSimplexNoise, TERRAIN_CONFIG } from './noise.js';
import { VoxelChunk, CHUNK_SIZE } from './chunk.js';
import { BLOCK_BY_ID } from './blocks.js';
import { FluidSimulator } from './fluids/FluidSimulator.js';
import { FLUID_CONFIG } from './config/fluids.js';

// ============================================================================
// Phases U0.2, U2.1 & U3 — VoxelWorld with Web Worker Pool & Pixel Atlas
// ============================================================================

export const RENDER_RADIUS = 3;
export const UNLOAD_RADIUS = 4;
export const MAX_CHUNKS_PER_FRAME = 2;

export const sharedShaderUniforms = {
  uTime: { value: 0 },
  uSeasonTint: { value: new THREE.Color(1.0, 1.0, 1.0) },
  uLeafDensity: { value: 1.0 },
  uSnowAmount: { value: 0.0 },
  uWetDarken: { value: 0.0 },
};

function applyAtlasShader(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedShaderUniforms.uTime;
    shader.uniforms.uSeasonTint = sharedShaderUniforms.uSeasonTint;
    shader.uniforms.uLeafDensity = sharedShaderUniforms.uLeafDensity;
    shader.uniforms.uSnowAmount = sharedShaderUniforms.uSnowAmount;
    shader.uniforms.uWetDarken = sharedShaderUniforms.uWetDarken;

    shader.vertexShader =
      `uniform float uTime;\nattribute float faceType;\nattribute vec3 instanceTiles;\nvarying vec3 vWorldPos;\nvarying float vTileIdx;\n` +
      shader.vertexShader.replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
#ifdef USE_MAP
  float tileIdx = (faceType < 0.5) ? instanceTiles.x : ((faceType < 1.5) ? instanceTiles.y : instanceTiles.z);
  vTileIdx = tileIdx;
  vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  float col = mod(tileIdx, 16.0);
  float row = floor(tileIdx / 16.0);
  float eps = 0.5 / 1024.0;
  float u0 = (col * 64.0) / 1024.0 + eps;
  float u1 = ((col + 1.0) * 64.0) / 1024.0 - eps;
  float v0 = 1.0 - ((row + 1.0) * 64.0) / 1024.0 + eps;
  float v1 = 1.0 - (row * 64.0) / 1024.0 - eps;
  vec2 localUv = uv;
  if (abs(tileIdx - 44.0) < 0.2 || abs(tileIdx - 45.0) < 0.2) {
    localUv.y = fract(localUv.y + uTime * (abs(tileIdx - 44.0) < 0.2 ? 0.35 : 0.12));
  }
  vMapUv = vec2(mix(u0, u1, localUv.x), mix(v0, v1, localUv.y));
#endif`
      );

    shader.fragmentShader =
      `uniform vec3 uSeasonTint;\nuniform float uLeafDensity;\nuniform float uSnowAmount;\nuniform float uWetDarken;\nvarying vec3 vWorldPos;\nvarying float vTileIdx;\n` +
      shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
#ifdef USE_MAP
  // Leaf thinning in autumn/winter for deciduous trees (oak, dark oak, birch, maple)
  bool isDeciduous = (abs(vTileIdx - 26.0) < 0.2 || abs(vTileIdx - 27.0) < 0.2 || abs(vTileIdx - 28.0) < 0.2 || abs(vTileIdx - 74.0) < 0.2 || (vTileIdx >= 78.0 && vTileIdx <= 80.0));
  if (isDeciduous && uLeafDensity < 0.98) {
    float leafHash = fract(sin(dot(floor(vWorldPos.xyz * 1.05), vec3(12.9898, 78.233, 45.164))) * 43758.5453);
    if (leafHash > uLeafDensity) discard;
  }

  // Seasonal tint for grass and foliage
  bool isFoliage = (vTileIdx < 3.0 || isDeciduous);
  if (isFoliage) {
    diffuseColor.rgb *= uSeasonTint;
  }

  // Render-only snow build-up on sky top faces
  if (uSnowAmount > 0.01 && vTileIdx != 44.0 && vTileIdx != 45.0) {
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.96, 1.0), uSnowAmount * 0.75);
  }

  // Rain wet darkening (10-15%)
  if (uWetDarken > 0.01 && vTileIdx != 44.0 && vTileIdx != 45.0) {
    diffuseColor.rgb *= (1.0 - uWetDarken * 0.15);
  }
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
    sharedAtlasTexture.magFilter = THREE.NearestFilter;
    sharedAtlasTexture.minFilter = THREE.NearestFilter;
    sharedAtlasTexture.generateMipmaps = false;
    sharedAtlasTexture.colorSpace = THREE.SRGBColorSpace;
  }
  return sharedAtlasTexture;
}

function createTintableVoxelMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    map: getSharedAtlasTexture(),
    roughness: 0.85,
    metalness: 0.02,
  });
  return applyAtlasShader(mat);
}

function createAnimatedFluidMaterial(texturePath, isWater = true) {
  const loader = new THREE.TextureLoader();
  const tex = loader.load(texturePath);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.0, 1.0 / 16.0);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;

  if (isWater) {
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      color: 0xffffff,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      roughness: 0.12,
      metalness: 0.05,
    });
    return { material: mat, texture: tex };
  } else {
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
    });
    return { material: mat, texture: tex };
  }
}

function createCrossPlaneGeometry() {
  const geometry = new THREE.BufferGeometry();
  const d = 0.38;
  const vertices = new Float32Array([
    // Quad 1: (-d, 0, -d) to (+d, 1, +d)
    -d, 0.0, -d,   d, 0.0,  d,   d, 1.0,  d,
    -d, 0.0, -d,   d, 1.0,  d,  -d, 1.0, -d,
    // Quad 2: (-d, 0, +d) to (+d, 1, -d)
    -d, 0.0,  d,   d, 0.0, -d,   d, 1.0, -d,
    -d, 0.0,  d,   d, 1.0, -d,  -d, 1.0,  d,
  ]);
  const uvs = new Float32Array([
    0.0, 0.0,  1.0, 0.0,  1.0, 1.0,
    0.0, 0.0,  1.0, 1.0,  0.0, 1.0,
    0.0, 0.0,  1.0, 0.0,  1.0, 1.0,
    0.0, 0.0,  1.0, 1.0,  0.0, 1.0,
  ]);
  const faceTypes = new Float32Array(12).fill(0.0);
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('faceType', new THREE.BufferAttribute(faceTypes, 1));
  geometry.computeVertexNormals();
  return geometry;
}

function createPlantMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    map: getSharedAtlasTexture(),
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.45,
    roughness: 0.85,
    metalness: 0.0,
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
    this.sharedPlantGeometry = createCrossPlaneGeometry();
    this.sharedMaterial = createTintableVoxelMaterial();
    const waterAsset = createAnimatedFluidMaterial('./assets/blocks/water_still.png', true);
    this.sharedWaterTexture = waterAsset.texture;
    this.sharedWaterMaterial = waterAsset.material;

    const lavaAsset = createAnimatedFluidMaterial('./assets/blocks/lava_still.png', false);
    this.sharedLavaTexture = lavaAsset.texture;
    this.sharedLavaMaterial = lavaAsset.material;

    this.sharedPlantMaterial = createPlantMaterial();
    this.dummy = new THREE.Object3D();

    this.fluidSimulator = new FluidSimulator(this, FLUID_CONFIG);
    this.pendingRemeshChunks = new Set();
    this.remeshDebounceTimer = 0;
    this.fluidAnimTimer = 0;

    this.chunks = new Map();
    this.generationQueue = [];
    this.queuedChunkKeys = new Set();
    this.inFlightKeys = new Set();

    this.modifiedBlocks = new Map();

    this.lastPlayerChunkX = null;
    this.lastPlayerChunkZ = null;
    this.caveXRayEnabled = false;

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
        caveXRay: Boolean(this.caveXRayEnabled),
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
    const def = BLOCK_BY_ID[b];
    return Boolean(b && b !== 'water' && b !== 'lava' && (!def || !def.isPlant));
  }

  hasBlockOrProcedural(wx, wy, wz) {
    const x = Math.round(wx);
    const y = Math.round(wy);
    const z = Math.round(wz);
    const chunk = this.getChunkAtWorld(x, z);
    const key = this.coordKey(x, y, z);
    if (chunk) {
      const b = chunk.blocks.get(key);
      const def = BLOCK_BY_ID[b];
      return Boolean(b && b !== 'water' && b !== 'lava' && (!def || !def.isPlant));
    }
    if (this.modifiedBlocks.has(key)) {
      const b = this.modifiedBlocks.get(key);
      const def = BLOCK_BY_ID[b];
      return Boolean(b && b !== 'water' && b !== 'lava' && (!def || !def.isPlant));
    }
    const nat = this.noise.getNaturalBlockAt(x, y, z);
    const def = BLOCK_BY_ID[nat];
    return Boolean(nat && nat !== 'water' && nat !== 'lava' && (!def || !def.isPlant));
  }

  setBlock(wx, wy, wz, blockType) {
    if (!blockType) return this.removeBlock(wx, wy, wz);
    const x = Math.round(wx);
    let y = Math.round(wy);
    const z = Math.round(wz);

    // Task F6: Gravity blocks (sand, gravel) fall downward when unsupported
    if (blockType === 'sand' || blockType === 'gravel') {
      while (y > 1 && !this.hasSolidBlockAt(x, y - 1, z)) {
        y--;
      }
    }

    const chunk = this.getChunkAtWorld(x, z);
    if (!chunk) return false;

    const key = this.coordKey(x, y, z);
    this.modifiedBlocks.set(key, blockType);
    chunk.blocks.set(key, blockType);
    chunk.rebuildMesh();
    this._rebuildNeighborChunksIfOnBorder(x, z, chunk);

    // Trigger fluid simulator on block placement
    if (this.fluidSimulator) {
      if (blockType === 'water') {
        this.fluidSimulator.addSource(x, y, z, 'water');
      } else if (blockType === 'lava') {
        this.fluidSimulator.addSource(x, y, z, 'lava');
      } else {
        this.fluidSimulator.onBlockChanged(x, y, z);
      }
    }
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
    if (existing === 'bedrock' || BLOCK_BY_ID[existing]?.hardness === Infinity) {
      return false;
    }

    this.modifiedBlocks.set(key, null);
    chunk.blocks.delete(key);

    // Remove unsupported plant on top if the supporting block was removed
    const directAbove = this.getBlock(x, y + 1, z);
    if (BLOCK_BY_ID[directAbove]?.isPlant) {
      const keyAbove = this.coordKey(x, y + 1, z);
      this.modifiedBlocks.set(keyAbove, null);
      chunk.blocks.delete(keyAbove);
    }

    chunk.rebuildMesh();
    this._rebuildNeighborChunksIfOnBorder(x, z, chunk);

    // Trigger fluid simulator on block removal
    if (this.fluidSimulator) {
      if (existing === 'water' || existing === 'lava') {
        this.fluidSimulator.removeSource(x, y, z);
      } else {
        this.fluidSimulator.onBlockChanged(x, y, z);
      }
    }

    // Task F6: Trigger gravity check on column above (sand/gravel above falls down!)
    for (let checkY = y + 1; checkY <= y + 8; checkY++) {
      const aboveType = this.getBlock(x, checkY, z);
      if (aboveType === 'sand' || aboveType === 'gravel') {
        const chunkAbove = this.getChunkAtWorld(x, z);
        const keyAbove = this.coordKey(x, checkY, z);
        this.modifiedBlocks.set(keyAbove, null);
        chunkAbove?.blocks.delete(keyAbove);
        this.setBlock(x, checkY, z, aboveType);
      } else {
        break;
      }
    }

    return true;
  }

  /**
   * Task F6: /gallery command — Builds a showcase grid of all 36 blocks in front of the player
   * so every surface, face texture, ore, wood, and light source can be inspected side-by-side.
   */
  buildBlockGallery(centerX, centerZ) {
    const startX = Math.round(centerX) - 6;
    const startZ = Math.round(centerZ) - 10;
    const baseY = Math.max(20, this.getSurfaceHeight(centerX, centerZ) + 1);
    const blockIds = Object.keys(BLOCK_BY_ID).slice(0, 36);

    // Build a seamless 14x10 stone-brick showcase floor first
    for (let dx = -1; dx <= 12; dx++) {
      for (let dz = -1; dz <= 7; dz++) {
        this.setBlock(startX + dx, baseY, startZ + dz, 'stone_bricks');
      }
    }

    // Place every block in a neat 6x6 showcase grid on top of the floor
    for (let i = 0; i < blockIds.length; i++) {
      const col = i % 6;
      const row = Math.floor(i / 6);
      const bx = startX + col * 2;
      const bz = startZ + row * 1;
      this.setBlock(bx, baseY + 1, bz, blockIds[i]);
    }
    return { count: blockIds.length, x: startX + 5, y: baseY + 2, z: startZ + 3 };
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

  getFluid(wx, wy, wz) {
    const x = Math.round(wx);
    const y = Math.round(wy);
    const z = Math.round(wz);
    const chunk = this.getChunkAtWorld(x, z);
    if (!chunk) return null;
    const key = this.coordKey(x, y, z);
    if (chunk.fluids && chunk.fluids.has(key)) {
      return chunk.fluids.get(key);
    }
    const b = chunk.blocks.get(key);
    if (b === 'water') {
      return { type: 'water', level: 0, falling: false };
    }
    if (b === 'lava') {
      return { type: 'lava', level: 0, falling: false };
    }
    return null;
  }

  setFluid(wx, wy, wz, fluidData) {
    const x = Math.round(wx);
    const y = Math.round(wy);
    const z = Math.round(wz);
    const chunk = this.getChunkAtWorld(x, z);
    if (!chunk) return;
    if (!chunk.fluids) chunk.fluids = new Map();
    const key = this.coordKey(x, y, z);
    chunk.fluids.set(key, { ...fluidData });
    this.scheduleChunkRemesh(chunk);
    this._scheduleBorderNeighborsForRemesh(x, z, chunk);
  }

  removeFluid(wx, wy, wz) {
    const x = Math.round(wx);
    const y = Math.round(wy);
    const z = Math.round(wz);
    const chunk = this.getChunkAtWorld(x, z);
    if (!chunk) return;
    if (chunk.fluids) {
      const key = this.coordKey(x, y, z);
      chunk.fluids.delete(key);
    }
    this.scheduleChunkRemesh(chunk);
    this._scheduleBorderNeighborsForRemesh(x, z, chunk);
  }

  scheduleChunkRemesh(chunk) {
    if (chunk) {
      this.pendingRemeshChunks.add(chunk);
    }
  }

  _scheduleBorderNeighborsForRemesh(wx, wz, chunk) {
    const localX = wx - chunk.startX;
    const localZ = wz - chunk.startZ;
    if (localX === 0) {
      const c = this.chunks.get(this.chunkKey(chunk.chunkX - 1, chunk.chunkZ));
      if (c) this.scheduleChunkRemesh(c);
    } else if (localX === CHUNK_SIZE - 1) {
      const c = this.chunks.get(this.chunkKey(chunk.chunkX + 1, chunk.chunkZ));
      if (c) this.scheduleChunkRemesh(c);
    }
    if (localZ === 0) {
      const c = this.chunks.get(this.chunkKey(chunk.chunkX, chunk.chunkZ - 1));
      if (c) this.scheduleChunkRemesh(c);
    } else if (localZ === CHUNK_SIZE - 1) {
      const c = this.chunks.get(this.chunkKey(chunk.chunkX, chunk.chunkZ + 1));
      if (c) this.scheduleChunkRemesh(c);
    }
  }

  updateFluids(deltaTime) {
    // 1. Tick fluid simulation queue (budgeted up to 200 updates per frame)
    this.fluidSimulator.currentTime += deltaTime;
    this.fluidSimulator.tick(
      this.fluidSimulator.currentTime,
      FLUID_CONFIG.budget?.maxUpdatesPerTick || 200
    );

    // 2. Animate textures at 10 Hz
    this.fluidAnimTimer += deltaTime;
    const frame = Math.floor(this.fluidAnimTimer * 10) % 16;
    if (this.sharedWaterTexture) {
      this.sharedWaterTexture.offset.y = 1.0 - (frame + 1) / 16.0;
    }
    if (this.sharedLavaTexture) {
      this.sharedLavaTexture.offset.y = 1.0 - (frame + 1) / 16.0;
    }

    // 3. Process debounced chunk remeshing (every 100ms)
    this.remeshDebounceTimer += deltaTime;
    if (
      this.remeshDebounceTimer >= (FLUID_CONFIG.budget?.debounceRemeshMs || 100) / 1000 &&
      this.pendingRemeshChunks.size > 0
    ) {
      this.remeshDebounceTimer = 0;
      for (const chunk of this.pendingRemeshChunks) {
        chunk.rebuildFluidMeshes();
      }
      this.pendingRemeshChunks.clear();
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
      caveXRayEnabled: this.caveXRayEnabled,
    };
  }

  /**
   * Task F4: Toggles F6 Cave X-Ray Mode (stone/dirt see-through except ores & cave boundaries)
   */
  toggleCaveXRay(playerPosition) {
    this.caveXRayEnabled = !this.caveXRayEnabled;
    this.reloadAllChunks(playerPosition);
    return this.caveXRayEnabled;
  }

  /**
   * Task F4: /orestats — Computes total blocks of each ore in loaded chunks & average per chunk.
   */
  getOreStats() {
    const counts = {
      coal_ore: 0,
      iron_ore: 0,
      redstone_ore: 0,
      gold_ore: 0,
      emerald_ore: 0,
      gem_ore: 0,
    };
    const numChunks = Math.max(1, this.chunks.size);

    for (const chunk of this.chunks.values()) {
      for (const blockType of chunk.blocks.values()) {
        if (counts[blockType] !== undefined) {
          counts[blockType]++;
        }
      }
    }

    const avgPerChunk = {};
    for (const [k, v] of Object.entries(counts)) {
      avgPerChunk[k] = Number((v / numChunks).toFixed(2));
    }

    return {
      loadedChunks: this.chunks.size,
      counts,
      avgPerChunk,
    };
  }
}
