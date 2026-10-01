import { FLUID_CONFIG } from '../config/fluids.js';

// ============================================================================
// Minecraft-Style Fluid Simulator (src/fluids/FluidSimulator.js)
// Pure simulation logic for Water and Lava:
// - Level 0: source block
// - Water: spreads up to 7 blocks (levels 1..7), 0.25s tick delay
// - Lava: spreads up to 3 blocks (levels 0, 2, 4, 6), 1.5s tick delay
// - Flow down first, hole search for shortest path to drop (water: 4, lava: 2)
// - Infinite water source from 2 horizontal sources over solid floor
// - Water/Lava interaction: obsidian, cobblestone, stone
// - Flow retreat on source removal
// ============================================================================

export class FluidSimulator {
  constructor(worldInterface, config = FLUID_CONFIG) {
    this.world = worldInterface;
    this.config = config;
    // Map of key "x,y,z" -> { type, level, falling }
    this.fluids = new Map();
    // Scheduled queue of { x, y, z, fluidType, scheduledTime }
    this.queue = [];
    this.queuedKeys = new Set();
    this.currentTime = 0;
    this.activeUpdatesCount = 0;
  }

  coordKey(x, y, z) {
    return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  }

  parseKey(key) {
    const [x, y, z] = key.split(',').map(Number);
    return { x, y, z };
  }

  getFluid(x, y, z) {
    const key = this.coordKey(x, y, z);
    if (this.fluids.has(key)) {
      return this.fluids.get(key);
    }
    if (typeof this.world?.getFluid === 'function') {
      return this.world.getFluid(x, y, z);
    }
    return null;
  }

  setFluid(x, y, z, fluidData) {
    const key = this.coordKey(x, y, z);
    this.fluids.set(key, { ...fluidData });
    if (typeof this.world?.setFluid === 'function') {
      this.world.setFluid(x, y, z, fluidData);
    }
  }

  removeFluid(x, y, z) {
    const key = this.coordKey(x, y, z);
    this.fluids.delete(key);
    if (typeof this.world?.removeFluid === 'function') {
      this.world.removeFluid(x, y, z);
    }
  }

  isChunkLoaded(x, z) {
    if (typeof this.world?.isChunkLoadedAt === 'function') {
      return this.world.isChunkLoadedAt(x, z);
    }
    return true; // fallback for unit tests with mock world
  }

  isSolid(x, y, z) {
    if (!this.isChunkLoaded(x, z)) {
      if (typeof this.world?.noise?.getNaturalBlockAt === 'function') {
        const nat = this.world.noise.getNaturalBlockAt(x, y, z);
        return Boolean(nat && nat !== 'water' && nat !== 'lava');
      }
      return true; // Treat unloaded chunks as solid boundary so fluids never spill
    }
    if (typeof this.world?.isSolidAt === 'function') {
      return this.world.isSolidAt(x, y, z);
    }
    if (typeof this.world?.getBlock === 'function') {
      const b = this.world.getBlock(x, y, z);
      return Boolean(b && b !== 'water' && b !== 'lava');
    }
    return false;
  }

  isAirOrReplaceable(x, y, z) {
    if (!this.isChunkLoaded(x, z)) return false; // Unloaded chunks are NEVER treated as air!
    if (typeof this.world?.isAirOrReplaceable === 'function') {
      return this.world.isAirOrReplaceable(x, y, z);
    }
    if (typeof this.world?.getBlock === 'function') {
      const b = this.world.getBlock(x, y, z);
      if (!b) return true;
      if (b === 'water' || b === 'lava') return false;
      const replaceable = [
        'tall_grass',
        'tall_grass_plant',
        'fern',
        'mushroom_red',
        'mushroom_brown',
        'flower_bluebell',
        'flower_violet',
        'flower_anemone',
        'torch',
      ];
      return replaceable.includes(b);
    }
    return true;
  }

  scheduleUpdate(x, y, z, fluidType, delay = null) {
    const key = this.coordKey(x, y, z);
    if (this.queuedKeys.has(key)) return;

    const type = fluidType || this.getFluid(x, y, z)?.type || 'water';
    const cfg = this.config[type] || this.config.water;
    const tickDelay = delay !== null ? delay : (cfg.tickDelay || 0.25);

    this.queue.push({
      x: Math.floor(x),
      y: Math.floor(y),
      z: Math.floor(z),
      fluidType: type,
      scheduledTime: this.currentTime + tickDelay,
    });
    this.queuedKeys.add(key);
  }

  addSource(x, y, z, fluidType = 'water') {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    this.setFluid(ix, iy, iz, { type: fluidType, level: 0, falling: false });
    const key = this.coordKey(ix, iy, iz);
    this.queuedKeys.delete(key);
    this.scheduleUpdate(ix, iy, iz, fluidType, 0);
    this._scheduleNeighbors(ix, iy, iz, fluidType);
  }

  removeSource(x, y, z) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    const f = this.getFluid(ix, iy, iz);
    if (!f) return;
    const fluidType = f.type;
    this.removeFluid(ix, iy, iz);
    // Schedule neighbors to retreat
    this._scheduleNeighbors(ix, iy, iz, fluidType);
  }

  onBlockChanged(x, y, z) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);

    // If solid block placed inside fluid, remove fluid
    if (this.isSolid(ix, iy, iz) && this.getFluid(ix, iy, iz)) {
      const f = this.getFluid(ix, iy, iz);
      this.removeFluid(ix, iy, iz);
      this._scheduleNeighbors(ix, iy, iz, f.type);
      return;
    }

    // Schedule all 6 surrounding neighbors
    const neighbors = [
      [ix + 1, iy, iz],
      [ix - 1, iy, iz],
      [ix, iy + 1, iz],
      [ix, iy - 1, iz],
      [ix, iy, iz + 1],
      [ix, iy, iz - 1],
    ];
    for (const [nx, ny, nz] of neighbors) {
      const f = this.getFluid(nx, ny, nz);
      if (f) {
        this.scheduleUpdate(nx, ny, nz, f.type, 0);
      }
    }
  }

  _scheduleNeighbors(x, y, z, fluidType) {
    const dirs = [
      [x + 1, y, z],
      [x - 1, y, z],
      [x, y + 1, z],
      [x, y - 1, z],
      [x, y, z + 1],
      [x, y, z - 1],
    ];
    for (const [nx, ny, nz] of dirs) {
      this.scheduleUpdate(nx, ny, nz, fluidType, 0);
    }
  }

  /**
   * Searches horizontal paths up to searchRange to find the shortest distance to a drop/hole.
   */
  _findShortestDropPaths(startX, startY, startZ, fluidType, searchRange) {
    const cardinalDirs = [
      { dx: 1, dz: 0 },
      { dx: -1, dz: 0 },
      { dx: 0, dz: 1 },
      { dx: 0, dz: -1 },
    ];

    const paths = [];

    for (const dir of cardinalDirs) {
      const nx = startX + dir.dx;
      const nz = startZ + dir.dz;

      // Check if immediate neighbor is blocked
      if (this.isSolid(nx, startY, nz)) continue;

      // BFS outward along this branch up to searchRange
      let foundDropDist = Infinity;
      const visited = new Set();
      const queue = [{ x: nx, z: nz, dist: 1 }];
      visited.add(`${nx},${nz}`);

      while (queue.length > 0) {
        const curr = queue.shift();

        // Check if there is a drop at curr: floor is missing/air/replaceable
        if (!this.isSolid(curr.x, startY - 1, curr.z)) {
          const belowFluid = this.getFluid(curr.x, startY - 1, curr.z);
          if (!belowFluid || belowFluid.type === fluidType) {
            foundDropDist = curr.dist;
            break;
          }
        }

        if (curr.dist < searchRange) {
          for (const nextDir of cardinalDirs) {
            const nextX = curr.x + nextDir.dx;
            const nextZ = curr.z + nextDir.dz;
            const key = `${nextX},${nextZ}`;
            if (visited.has(key)) continue;
            visited.add(key);

            if (this.isSolid(nextX, startY, nextZ)) continue;
            const nf = this.getFluid(nextX, startY, nextZ);
            if (nf && nf.type !== fluidType) continue; // opposite fluid blocks drop search path

            queue.push({ x: nextX, z: nextZ, dist: curr.dist + 1 });
          }
        }
      }

      paths.push({ dir, dist: foundDropDist });
    }

    // Find minimum drop distance
    let minDist = Infinity;
    for (const p of paths) {
      if (p.dist < minDist) minDist = p.dist;
    }

    if (minDist !== Infinity) {
      return paths.filter((p) => p.dist === minDist).map((p) => p.dir);
    }
    // No drop found: return all open directions
    return paths.map((p) => p.dir);
  }

  /**
   * Executes a scheduled tick pass up to maxUpdates.
   */
  tick(currentTime = null, maxUpdates = null) {
    if (currentTime !== null) {
      this.currentTime = currentTime;
    } else {
      this.currentTime += 0.25;
    }

    const budget = maxUpdates !== null ? maxUpdates : (this.config.budget?.maxUpdatesPerTick || 200);
    let updatesProcessed = 0;

    // Filter ready updates
    const remainingQueue = [];
    const toProcess = [];

    for (const item of this.queue) {
      if (item.scheduledTime <= this.currentTime && toProcess.length < budget) {
        toProcess.push(item);
        this.queuedKeys.delete(this.coordKey(item.x, item.y, item.z));
      } else {
        remainingQueue.push(item);
      }
    }
    this.queue = remainingQueue;

    for (const item of toProcess) {
      this._updateFluidBlock(item.x, item.y, item.z, item.fluidType);
      updatesProcessed++;
    }

    this.activeUpdatesCount = updatesProcessed;
    return updatesProcessed;
  }

  _checkFluidInteractions(x, y, z, fluidType) {
    const current = this.getFluid(x, y, z);
    if (!current) return false;

    // 1. Check vertical interaction below
    const belowY = y - 1;
    const belowFluid = this.getFluid(x, belowY, z);
    if (belowFluid && belowFluid.type !== fluidType) {
      if (fluidType === 'lava' && belowFluid.type === 'water') {
        // Lava flowing/falling down on water -> Stone
        if (typeof this.world?.setBlock === 'function') {
          this.world.setBlock(x, belowY, z, this.config.interactions.lavaDownOnWater || 'stone');
        }
        this.removeFluid(x, belowY, z);
        this.onBlockChanged(x, belowY, z);
        return true;
      }
      if (fluidType === 'water' && belowFluid.type === 'lava') {
        const res =
          belowFluid.level === 0
            ? this.config.interactions.waterOnLavaSource || 'obsidian'
            : this.config.interactions.waterOnFlowingLava || 'cobblestone';
        if (typeof this.world?.setBlock === 'function') {
          this.world.setBlock(x, belowY, z, res);
        }
        this.removeFluid(x, belowY, z);
        this.onBlockChanged(x, belowY, z);
        return true;
      }
    }

    // 2. Check horizontal interactions with adjacent blocks
    const horiz = [
      [x + 1, y, z],
      [x - 1, y, z],
      [x, y, z + 1],
      [x, y, z - 1],
    ];

    for (const [hx, hy, hz] of horiz) {
      const neighbor = this.getFluid(hx, hy, hz);
      if (neighbor && neighbor.type !== fluidType) {
        if (fluidType === 'water' && neighbor.type === 'lava') {
          // Water touches lava neighbor -> Lava neighbor cools down into rock
          const res =
            neighbor.level === 0
              ? this.config.interactions.waterOnLavaSource || 'obsidian'
              : this.config.interactions.waterOnFlowingLava || 'cobblestone';
          if (typeof this.world?.setBlock === 'function') {
            this.world.setBlock(hx, hy, hz, res);
          }
          this.removeFluid(hx, hy, hz);
          this.onBlockChanged(hx, hy, hz);
        } else if (fluidType === 'lava' && neighbor.type === 'water') {
          // Lava touches water neighbor -> This lava block cools down into rock
          const res =
            current.level === 0
              ? this.config.interactions.waterOnLavaSource || 'obsidian'
              : this.config.interactions.waterOnFlowingLava || 'cobblestone';
          if (typeof this.world?.setBlock === 'function') {
            this.world.setBlock(x, y, z, res);
          }
          this.removeFluid(x, y, z);
          this.onBlockChanged(x, y, z);
          return true;
        }
      }
    }

    return false;
  }

  _updateFluidBlock(x, y, z, scheduledFluidType) {
    const current = this.getFluid(x, y, z);
    const fluidType = current ? current.type : scheduledFluidType;
    const cfg = this.config[fluidType] || this.config.water;

    // 1. Check for infinite water source formation at (x, y, z) if not a source
    if (cfg.infiniteSource && (!current || current.level > 0)) {
      if (!this.isSolid(x, y, z)) {
        let adjacentSources = 0;
        const horiz = [
          [x + 1, y, z],
          [x - 1, y, z],
          [x, y, z + 1],
          [x, y, z - 1],
        ];
        for (const [hx, hy, hz] of horiz) {
          const hf = this.getFluid(hx, hy, hz);
          if (hf && hf.type === 'water' && hf.level === 0) {
            adjacentSources++;
          }
        }

        const belowSolid = this.isSolid(x, y - 1, z);
        const belowFluid = this.getFluid(x, y - 1, z);
        const belowSource = belowFluid && belowFluid.type === 'water' && belowFluid.level === 0;

        if (adjacentSources >= 2 && (belowSolid || belowSource)) {
          this.setFluid(x, y, z, { type: 'water', level: 0, falling: false });
          this._scheduleNeighbors(x, y, z, 'water');
          this.scheduleUpdate(x, y, z, 'water', 0);
          return;
        }
      }
    }

    if (!current) return;

    // 2. Check for fluid contact interactions (Water + Lava)
    if (this._checkFluidInteractions(x, y, z, fluidType)) {
      return;
    }

    // 3. Recompute supply for flowing fluid (Supply / Retreat)
    if (current.level > 0) {
      const aboveFluid = this.getFluid(x, y + 1, z);
      const isFalling = Boolean(aboveFluid && aboveFluid.type === fluidType);

      if (isFalling) {
        if (!current.falling || current.level !== 1) {
          this.setFluid(x, y, z, { type: fluidType, level: 1, falling: true });
        }
      } else {
        // Find best supplying horizontal neighbor
        let bestSupplierLevel = Infinity;
        const horiz = [
          [x + 1, y, z],
          [x - 1, y, z],
          [x, y, z + 1],
          [x, y, z - 1],
        ];
        for (const [hx, hy, hz] of horiz) {
          const hf = this.getFluid(hx, hy, hz);
          if (hf && hf.type === fluidType) {
            // A falling column neighbor acts as level 0 supplier for horizontal flow
            const effLevel = hf.falling ? 0 : hf.level;
            // Strict inequality: only strictly lower levels can supply to prevent circular locking
            if (effLevel < current.level && effLevel < bestSupplierLevel) {
              bestSupplierLevel = effLevel;
            }
          }
        }

        const expectedLevel = bestSupplierLevel + (cfg.levelDrop || 1);
        if (expectedLevel > cfg.maxLevel || bestSupplierLevel === Infinity) {
          // Supply lost -> RETREAT!
          this.removeFluid(x, y, z);
          this._scheduleNeighbors(x, y, z, fluidType);
          return;
        } else if (current.level !== expectedLevel || current.falling) {
          this.setFluid(x, y, z, { type: fluidType, level: expectedLevel, falling: false });
        }
      }
    }

    // Re-fetch current state after potential supply update
    const active = this.getFluid(x, y, z);
    if (!active) return;

    // 4. Flow DOWN FIRST: Check block below
    const belowY = y - 1;
    const belowSolid = this.isSolid(x, belowY, z);
    const belowFluid = this.getFluid(x, belowY, z);

    // Can it fall straight down?
    const canFallDown =
      !belowSolid &&
      (this.isAirOrReplaceable(x, belowY, z) ||
        (belowFluid && belowFluid.type === fluidType));

    if (canFallDown) {
      if (!belowFluid || !belowFluid.falling || belowFluid.level !== 1) {
        this.setFluid(x, belowY, z, { type: fluidType, level: 1, falling: true });
        this.scheduleUpdate(x, belowY, z, fluidType);
      }
      // Master rule: A source or flowing block that can go down does NOT spread sideways!
      return;
    }

    // 5. Spread SIDEWAYS only if it cannot go down
    if (active.level >= cfg.maxLevel && !active.falling) {
      return;
    }

    const dropDirs = this._findShortestDropPaths(
      x,
      y,
      z,
      fluidType,
      cfg.holeSearchRange || 4
    );

    const nextLevel = active.falling ? (cfg.levelDrop || 1) : active.level + (cfg.levelDrop || 1);
    if (nextLevel > cfg.maxLevel) return;

    for (const dir of dropDirs) {
      const nx = x + dir.dx;
      const nz = z + dir.dz;

      // Solid block blocks sideways flow
      if (this.isSolid(nx, y, nz)) continue;

      const neighborFluid = this.getFluid(nx, y, nz);

      // Water and Lava meeting horizontally
      if (neighborFluid && neighborFluid.type !== fluidType) {
        if (fluidType === 'water' && neighborFluid.type === 'lava') {
          const res =
            neighborFluid.level === 0
              ? this.config.interactions.waterOnLavaSource || 'obsidian'
              : this.config.interactions.waterOnFlowingLava || 'cobblestone';
          if (typeof this.world?.setBlock === 'function') {
            this.world.setBlock(nx, y, nz, res);
          }
          this.removeFluid(nx, y, nz);
          this.onBlockChanged(nx, y, nz);
          continue;
        } else if (fluidType === 'lava' && neighborFluid.type === 'water') {
          if (typeof this.world?.setBlock === 'function') {
            this.world.setBlock(nx, y, nz, this.config.interactions.waterOnFlowingLava || 'cobblestone');
          }
          this.removeFluid(nx, y, nz);
          this.onBlockChanged(nx, y, nz);
          continue;
        }
      }

      if (!neighborFluid) {
        if (this.isAirOrReplaceable(nx, y, nz)) {
          this.setFluid(nx, y, nz, {
            type: fluidType,
            level: nextLevel,
            falling: false,
          });
          this.scheduleUpdate(nx, y, nz, fluidType);
        }
      } else if (neighborFluid.type === fluidType) {
        if (!neighborFluid.falling && neighborFluid.level > nextLevel) {
          this.setFluid(nx, y, nz, {
            type: fluidType,
            level: nextLevel,
            falling: false,
          });
          this.scheduleUpdate(nx, y, nz, fluidType);
        }
      }
    }
  }

  onChunkUnloaded(chunkX, chunkZ, chunkSize = 16) {
    const minX = chunkX * chunkSize;
    const maxX = minX + chunkSize - 1;
    const minZ = chunkZ * chunkSize;
    const maxZ = minZ + chunkSize - 1;

    // Purge queued updates in this chunk
    this.queue = this.queue.filter((item) => {
      const inside = item.x >= minX && item.x <= maxX && item.z >= minZ && item.z <= maxZ;
      if (inside) {
        this.queuedKeys.delete(this.coordKey(item.x, item.y, item.z));
      }
      return !inside;
    });

    // Remove any transient flowing fluids in this chunk
    for (const [key, f] of this.fluids.entries()) {
      const { x, z } = this.parseKey(key);
      if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
        if (f.level > 0 || f.falling) {
          this.fluids.delete(key);
        }
      }
    }
  }

  checkAndCleanOrphans() {
    let orphansRemoved = 0;
    const orphanKeys = [];

    // Scan all active fluids in loaded chunks
    for (const [key, f] of this.fluids.entries()) {
      if (f.level === 0 && !f.falling) continue; // Source block is not an orphan
      const { x, y, z } = this.parseKey(key);
      if (!this.isChunkLoaded(x, z)) continue;

      if (f.falling) {
        // Falling fluid must have fluid of same type directly above it (either source or falling)
        const above = this.getFluid(x, y + 1, z);
        if (!above || above.type !== f.type) {
          orphanKeys.push(key);
        }
      } else {
        // Flowing fluid must have a supplying neighbor with strictly lower level
        let hasSupplier = false;
        const above = this.getFluid(x, y + 1, z);
        if (above && above.type === f.type) {
          hasSupplier = true;
        } else {
          const horiz = [
            [x + 1, y, z],
            [x - 1, y, z],
            [x, y, z + 1],
            [x, y, z - 1],
          ];
          for (const [hx, hy, hz] of horiz) {
            const hf = this.getFluid(hx, hy, hz);
            if (hf && hf.type === f.type) {
              const effLevel = hf.falling ? 0 : hf.level;
              if (effLevel < f.level) {
                hasSupplier = true;
                break;
              }
            }
          }
        }
        if (!hasSupplier) {
          orphanKeys.push(key);
        }
      }
    }

    // Also scan chunk.fluids in all loaded chunks
    if (this.world && this.world.chunks) {
      for (const chunk of this.world.chunks.values()) {
        if (!chunk.fluids) continue;
        for (const [key, f] of chunk.fluids.entries()) {
          if (f.level === 0 && !f.falling) continue;
          const [wx, wy, wz] = key.split(',').map(Number);
          if (f.falling) {
            const above = this.getFluid(wx, wy + 1, wz);
            if (!above || above.type !== f.type) {
              orphanKeys.push(key);
            }
          } else {
            let hasSupplier = false;
            const above = this.getFluid(wx, wy + 1, wz);
            if (above && above.type === f.type) {
              hasSupplier = true;
            } else {
              const horiz = [
                [wx + 1, wy, wz],
                [wx - 1, wy, wz],
                [wx, wy, wz + 1],
                [wx, wy, wz - 1],
              ];
              for (const [hx, hy, hz] of horiz) {
                const hf = this.getFluid(hx, hy, hz);
                if (hf && hf.type === f.type) {
                  const effLevel = hf.falling ? 0 : hf.level;
                  if (effLevel < f.level) {
                    hasSupplier = true;
                    break;
                  }
                }
              }
            }
            if (!hasSupplier) {
              orphanKeys.push(key);
            }
          }
        }
      }
    }

    const uniqueOrphans = Array.from(new Set(orphanKeys));
    for (const key of uniqueOrphans) {
      const [x, y, z] = key.split(',').map(Number);
      this.removeFluid(x, y, z);
      orphansRemoved++;
    }

    return orphansRemoved;
  }
}
