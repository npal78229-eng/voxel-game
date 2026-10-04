import * as THREE from 'three';
import blueprintData from './village_v3_blueprint.json';
import { getHighestSolidY } from '../collision.js';

// ============================================================================
// VillageSystem.js — Voxel Village & Clan Territory Generator (v3.0)
// Integrates complete village blueprint (Town Hall, Bell Tower, Market Stalls,
// Houses, Farms, Windmill, Smithy, Clan Banners & Villagers).
// ============================================================================

export class VillageSystem {
  constructor(world, scene, mobsManager = null) {
    this.world = world;
    this.scene = scene;
    this.mobsManager = mobsManager;
    this.villageGenerated = false;
    this.villageOrigin = { x: 28, z: 24 };
    this.villageBounds = { minX: 28, maxX: 28 + 104, minZ: 24, maxZ: 24 + 72 };
    this.clanFlags = [];
    this.portalBounds = null;
    this.portalCenter = null;
  }

  /**
   * Generates the complete village at world coordinates (originX, originZ)
   */
  generateVillage(originX = 28, originZ = 24) {
    if (this.villageGenerated) return;
    this.villageGenerated = true;
    this.villageOrigin = { x: originX, z: originZ };
    this.villageBounds = {
      minX: originX - 4,
      maxX: originX + (blueprintData.villageSize?.[0] || 104) + 4,
      minZ: originZ - 4,
      maxZ: originZ + (blueprintData.villageSize?.[1] || 72) + 4,
    };

    console.log(`[VillageSystem] Generating Village v3 at (${originX}, ${originZ})...`);

    // Sample terrain surface height across the central village plaza
    const sampleY1 = this.world.getSurfaceHeight(originX + 20, originZ + 20);
    const sampleY2 = this.world.getSurfaceHeight(originX + 50, originZ + 35);
    const sampleY3 = this.world.getSurfaceHeight(originX + 80, originZ + 25);
    const baseGroundY = Math.round((sampleY1 + sampleY2 + sampleY3) / 3);

    // 1. Flatten and lay down cobblestone/dirt paths along the central plaza and walkways
    this._generateVillageRoads(originX, originZ, baseGroundY);

    // 2. Build each structure defined in layout from blueprint
    const structures = blueprintData.structures || {};
    const layout = blueprintData.layout || [];

    for (const item of layout) {
      const def = structures[item.structure];
      if (!def || !Array.isArray(def.blocks)) continue;

      const fw = def.footprint?.[0] || 5;
      const fd = def.footprint?.[1] || 5;
      const rot = item.rotation || 0;

      // Calculate structure local ground level
      const structWorldX = originX + item.x;
      const structWorldZ = originZ + item.z;
      const structGroundY = Math.max(16, Math.min(baseGroundY + 2, this.world.getSurfaceHeight(structWorldX + Math.floor(fw / 2), structWorldZ + Math.floor(fd / 2))));

      // Foundation layer underneath structure to avoid floating buildings on sloped ground
      for (let fx = 0; fx < fw; fx++) {
        for (let fz = 0; fz < fd; fz++) {
          const rx = rot === 1 ? (fd - 1) - fz : rot === 2 ? (fw - 1) - fx : rot === 3 ? fz : fx;
          const rz = rot === 1 ? fx : rot === 2 ? (fd - 1) - fz : rot === 3 ? (fw - 1) - fx : fz;
          const bx = structWorldX + rx;
          const bz = structWorldZ + rz;
          for (let fy = structGroundY - 2; fy <= structGroundY; fy++) {
            if (!this.world.getBlock(bx, fy, bz)) {
              this.world.setStructureBlock(bx, fy, bz, 'cobblestone');
            }
          }
        }
      }

      // Place structure blocks
      for (const block of def.blocks) {
        const [dx, dy, dz, blockType] = block;
        let rx = dx;
        let rz = dz;
        if (rot === 1) {
          rx = (fd - 1) - dz;
          rz = dx;
        } else if (rot === 2) {
          rx = (fw - 1) - dx;
          rz = (fd - 1) - dz;
        } else if (rot === 3) {
          rx = dz;
          rz = (fw - 1) - dx;
        }

        const wx = structWorldX + rx;
        const wy = structGroundY + dy;
        const wz = structWorldZ + rz;

        this.world.setStructureBlock(wx, wy, wz, blockType);
      }
    }

    // 3. Place Clan Flags & Banners at designated clanFlagSpots
    const flagSpots = blueprintData.clanFlagSpots || [
      { x: 85, z: 29, clan: 'sword' },
      { x: 88, z: 26, clan: 'bow' },
      { x: 85, z: 23, clan: 'dragon' },
      { x: 88, z: 20, clan: 'magic' },
      { x: 85, z: 17, clan: 'shield' },
    ];
    this._generateClanFlags(originX, originZ, baseGroundY, flagSpots);

    // 4. Construct Ancient Caldera Dragon Portal at the edge of the village
    this._buildCalderaPortal(originX + 94, baseGroundY, originZ + 36);

    // Flush any loaded chunks that had structure blocks placed in them
    if (typeof this.world.flushDirtyChunks === 'function') {
      this.world.flushDirtyChunks();
    }

    // 5. Populate village with Villagers and Female Villagers
    if (this.mobsManager) {
      this._populateVillagers(originX, originZ, baseGroundY);
    }

    console.log(`[VillageSystem] Village v3 generation complete! 5 Clan Flags placed, portal active.`);
  }

  _generateVillageRoads(originX, originZ, baseGroundY) {
    // Generate cobblestone & gravel walkways connecting main square and buildings
    const roadSegments = [
      // East-West Main Thoroughfare
      { x1: originX + 6, z1: originZ + 22, x2: originX + 90, z2: originZ + 22, width: 3 },
      // North-South Avenue past Town Hall & Well
      { x1: originX + 22, z1: originZ + 4, x2: originX + 22, z2: originZ + 60, width: 3 },
      // Market Square Plaza
      { x1: originX + 18, z1: originZ + 18, x2: originX + 32, z2: originZ + 30, width: 2 },
      // Clan Territory Avenue
      { x1: originX + 80, z1: originZ + 14, x2: originX + 88, z2: originZ + 34, width: 3 },
    ];

    for (const seg of roadSegments) {
      const minX = Math.min(seg.x1, seg.x2);
      const maxX = Math.max(seg.x1, seg.x2);
      const minZ = Math.min(seg.z1, seg.z2);
      const maxZ = Math.max(seg.z1, seg.z2);

      for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
          const sy = Math.max(16, this.world.getSurfaceHeight(x, z));
          const blockType = (x + z) % 3 === 0 ? 'gravel' : 'cobblestone';
          this.world.setStructureBlock(x, sy, z, blockType);
          // Clear 2 blocks of air above path
          this.world.setStructureBlock(x, sy + 1, z, null);
          this.world.setStructureBlock(x, sy + 2, z, null);
        }
      }
    }
  }

  _generateClanFlags(originX, originZ, baseGroundY, flagSpots) {
    const clanColors = {
      sword: { banner: 0xb91c1c, accent: 0xf59e0b, name: 'Clan of the Blade (Sword)' },
      bow: { banner: 0x0284c7, accent: 0x38bdf8, name: 'Clan of the Gale (Bow)' },
      dragon: { banner: 0x15803d, accent: 0x4ade80, name: 'Clan of the Wyrm (Dragon)' },
      magic: { banner: 0x7e22ce, accent: 0xc084fc, name: 'Clan of the Arcane (Magic)' },
      shield: { banner: 0x334155, accent: 0x94a3b8, name: 'Clan of the Aegis (Shield)' },
    };

    for (const spot of flagSpots) {
      const fx = originX + spot.x;
      const fz = originZ + spot.z;
      const fy = Math.max(16, this.world.getSurfaceHeight(fx, fz));
      const info = clanColors[spot.clan] || clanColors.sword;

      // 1. Build tall wooden pole (5 blocks of wood)
      for (let y = 0; y <= 5; y++) {
        this.world.setStructureBlock(fx, fy + y, fz, 'pine_log');
      }
      // Golden finial on top
      this.world.setStructureBlock(fx, fy + 6, fz, 'gold_ore');
      this.world.setStructureBlock(fx, fy + 7, fz, 'torch');

      // 2. High-detail 3D Clan Banner in the Three.js scene
      const bannerGroup = new THREE.Group();
      bannerGroup.position.set(fx + 0.5, fy + 4.5, fz + 0.5);

      // Banner cloth geometry
      const bannerMat = new THREE.MeshStandardMaterial({
        color: info.banner,
        roughness: 0.65,
        metalness: 0.1,
        side: THREE.DoubleSide,
      });
      const accentMat = new THREE.MeshStandardMaterial({
        color: info.accent,
        roughness: 0.45,
        metalness: 0.4,
        emissive: new THREE.Color(info.accent),
        emissiveIntensity: 0.35,
      });

      // Main flag tapestry
      const clothGeo = new THREE.BoxGeometry(0.08, 2.6, 1.4);
      const cloth = new THREE.Mesh(clothGeo, bannerMat);
      cloth.position.set(0.1, -0.6, 0.7);
      bannerGroup.add(cloth);

      // Clan Insignia emblem on both sides
      const emblemGeo = new THREE.BoxGeometry(0.12, 0.8, 0.8);
      const emblem = new THREE.Mesh(emblemGeo, accentMat);
      emblem.position.set(0.1, -0.5, 0.7);
      bannerGroup.add(emblem);

      // Crossbars and tassels
      const barGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8);
      barGeo.rotateX(Math.PI / 2);
      const barMesh = new THREE.Mesh(barGeo, new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.6 }));
      barMesh.position.set(0.1, 0.7, 0.7);
      bannerGroup.add(barMesh);

      this.scene.add(bannerGroup);
      this.clanFlags.push({
        clan: spot.clan,
        name: info.name,
        position: new THREE.Vector3(fx + 0.5, fy + 1.0, fz + 0.5),
        bannerGroup,
      });
    }
  }

  _buildCalderaPortal(px, groundY, pz) {
    const py = Math.max(16, this.world.getSurfaceHeight(px, pz));

    // 4x5 Obsidian Portal Gateway
    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 5; y++) {
        const isBorder = x === 0 || x === 3 || y === 0 || y === 4;
        const wx = px + x;
        const wy = py + y;
        const wz = pz;

        if (isBorder) {
          this.world.setStructureBlock(wx, wy, wz, 'obsidian');
        } else {
          // Shimmering mystical portal interior (gem_ore glowing frame)
          this.world.setStructureBlock(wx, wy, wz, 'gem_ore');
        }
      }
    }

    // Portal Platform & Warning Torches
    for (let dx = -1; dx <= 4; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        this.world.setStructureBlock(px + dx, py - 1, pz + dz, 'stone_bricks');
      }
    }
    this.world.setStructureBlock(px - 1, py, pz - 1, 'torch');
    this.world.setStructureBlock(px - 1, py, pz + 1, 'torch');
    this.world.setStructureBlock(px + 4, py, pz - 1, 'torch');
    this.world.setStructureBlock(px + 4, py, pz + 1, 'torch');

    // Portal Entry Trigger Bounds (Player walks through center)
    this.portalBounds = {
      minX: px + 0.8,
      maxX: px + 2.4,
      minY: py + 0.5,
      maxY: py + 3.8,
      minZ: pz - 0.8,
      maxZ: pz + 0.8,
    };
    this.portalCenter = new THREE.Vector3(px + 1.5, py + 1.0, pz);

    // Glowing dimensional portal energy plane
    const portalCoreGeo = new THREE.PlaneGeometry(2.0, 3.2);
    const portalMat = new THREE.MeshBasicMaterial({
      color: 0x39ff14,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
    });
    const portalMesh = new THREE.Mesh(portalCoreGeo, portalMat);
    portalMesh.position.set(px + 1.5, py + 2.0, pz + 0.05);
    this.scene.add(portalMesh);
    this.portalMesh = portalMesh;
  }

  _populateVillagers(originX, originZ, baseGroundY) {
    const villagerSpots = [
      { x: originX + 22, z: originZ + 8, type: 'Villager' }, // Town Hall Elder
      { x: originX + 24, z: originZ + 24, type: 'VillagerFemale' }, // Central Well Artisan
      { x: originX + 20, z: originZ + 26, type: 'Villager' }, // Market Trader
      { x: originX + 14, z: originZ + 16, type: 'VillagerFemale' }, // House A
      { x: originX + 38, z: originZ + 16, type: 'Villager' }, // House B
      { x: originX + 68, z: originZ + 24, type: 'Villager' }, // Smithy Craftsman
      { x: originX + 84, z: originZ + 26, type: 'VillagerFemale' }, // Clan House Champion
      { x: originX + 32, z: originZ + 48, type: 'Villager' }, // Farm Tender
    ];

    for (const spot of villagerSpots) {
      const topY = Math.max(16, this.world.getSurfaceHeight(spot.x, spot.z));
      const mob = this.mobsManager.spawnMobAt(spot.type, spot.x, spot.z);
      if (mob) {
        console.log(`[VillageSystem] Spawned ${spot.type} at (${spot.x}, ${topY}, ${spot.z})`);
      }
    }
  }

  /**
   * Checks if a player's position intersects the Ancient Caldera Portal
   */
  checkPortalCollision(playerPos) {
    if (!this.portalBounds || !playerPos) return false;
    return (
      playerPos.x >= this.portalBounds.minX &&
      playerPos.x <= this.portalBounds.maxX &&
      playerPos.y >= this.portalBounds.minY &&
      playerPos.y <= this.portalBounds.maxY &&
      playerPos.z >= this.portalBounds.minZ &&
      playerPos.z <= this.portalBounds.maxZ
    );
  }

  /**
   * Per-frame animation for clan banners waving gently
   */
  update(delta) {
    if (this.portalMesh) {
      this.portalMesh.material.opacity = 0.55 + Math.sin(performance.now() * 0.005) * 0.18;
    }
    const t = performance.now() * 0.002;
    for (let i = 0; i < this.clanFlags.length; i++) {
      const flag = this.clanFlags[i];
      if (flag.bannerGroup) {
        flag.bannerGroup.rotation.y = Math.sin(t + i * 1.2) * 0.08;
      }
    }
  }
}
