# Voxel Realms — Architecture & Combat/World-Gen Design (`DESIGN.md`)

## 1. Centralized Configuration Architecture (Master Rule #3)

All gameplay tuning numbers live in dedicated per-system data files under `src/config/`:

| System | Config File | Responsibilities |
|---|---|---|
| **Mobs & Combat** | [`src/config/mobs.js`](../src/config/mobs.js) | `PLAYER_COMBAT_CONFIG` (`0.5s` i-frames, hitbox) and `MOB_CONFIGS` (`behaviorClass`, `attackType`, `meleeRange`, `castRange`, `minComfortDist`, `reachY`, `windupTime`, `cooldown`, `damage`, `knockback`, `senseRange`). |
| **Day/Night Spawning** | [`src/config/spawning.js`](../src/config/spawning.js) | `NIGHT_START = 0.55`, `NIGHT_END = 0.95`, `isNightTime()`, `MIN_SPAWN_DIST = 24`, `MAX_SPAWN_DIST = 64`, `SPAWN_INTERVAL_SECONDS = 2.0`, per-class caps, and `SUNLIGHT_BURN_DPS = 4.0`. |
| **3D Caves** | [`src/config/caves.js`](../src/config/caves.js) | Dual-field 3D spaghetti tunnel frequencies/thresholds, deep cavern rooms (`y=10..40`), hillside entrance probability (`0.025`), `12`-block spawn protection radius, and ocean flood protection. |
| **Seeded Ore Veins** | [`src/config/ores.js`](../src/config/ores.js) | `SAVE_WORLD_VERSION = 3` and `ORE_CONFIGS` (`coal_ore`, `iron_ore`, `redstone_ore`, `gold_ore`, `emerald_ore`, `gem_ore`) with triangular Y distributions, biome multipliers, and cave-wall exposure bonuses. |

---

## 2. Edge-to-Edge Combat & Swept Projectile Pipeline (Tasks F1 & F3)

1. **Edge-to-Edge AABB Range & Vertical Reach ([`src/combat/AttackRange.js`](../src/combat/AttackRange.js)):**
   - `gapDistance(attacker, target)` measures the shortest 3D Euclidean distance between the two AABB hitboxes (`0` if overlapping).
   - `inMeleeRange(attacker, target, range, reachY)` enforces both `gapDistance <= range` and `verticalGap <= reachY` (`1.0m` default), preventing mobs on another floor or below a ledge from hitting the player.
   - `hasLineOfSight(world, from, to)` performs a stepped voxel raycast from the attacker's eye/hand to the player's chest so solid walls block attacks.
2. **3-Phase Melee State Machine ([`src/combat/attacks/MeleeAttack.js`](../src/combat/attacks/MeleeAttack.js)):**
   - Every melee attack progresses through `WINDUP` (mob stops walking, raises limbs to telegraph) -> `STRIKE` (single instant where `inMeleeRange` and `hasLineOfSight` are re-evaluated at **current** positions; stepping outside the ring causes a `"WHOOSH (MISS!)"` with zero damage) -> `RECOVERY` (`cooldown`).
3. **Ranged Magic & Swept Collision ([`src/combat/attacks/RangedMagicAttack.js`](../src/combat/attacks/RangedMagicAttack.js)):**
   - `Hexcaster` (`attackType: 'ranged'`, `castRange: 14m`, `minComfortDist: 6m`) kites backward when the player approaches closer than `6m` and strafes sideways during its `1.0s` `CASTING` telegraph before firing a `14 blocks/s` magic bolt.
   - `ProjectileManager` uses `sweptSegmentIntersectsAABB(prevPos, nextPos, radius, aabb)` and swept voxel raycasting every frame so fast bolts/arrows never tunnel through the player or thin walls.

---

## 3. Categorized Spawning & Sunrise Despawn (Task F2)

- **`passive` (`Pig`, `Cow`, `Sheep`, `Rabbit`, `Bird`, `Cat`, `Chicken`):** Never attack (`damage: 0`), flee when hit.
- **`neutral` (`Dog`):** Peaceful unless provoked by player attack.
- **`wild_predator` (`Wolf` Fang Wolf, `Monkey` Treeswing Ape):** Spawn day and night in biome groups; aggro on sight (`senseRange: 14m` + `hasLineOfSight`) at any time of day; `Monkey` performs snatch-and-bite hit-and-retreat maneuvers.
- **`night_monster` (`ShadowStalker`, `BloodCrawler`, `FleshGhoul`, `Hexcaster`, `GrimWraith`, `Bonewalker`):**
  - Spawn **ONLY when `isNight()` is `true`**, `24..64` blocks from the player, outside the view cone when possible.
  - At sunrise (`isNight() === false`), sunlight-sensitive monsters catch fire (`4.0 DPS`) while others despawn gradually beyond `24m` and immediately beyond `64m`.
  - Loading a save during the day automatically strips leftover `night_monster` entities.

---

## 4. Continuous 3D Caves & Cross-Chunk Vein Ores (Task F4)

- **[`src/world/gen/caves.js`](../src/world/gen/caves.js):** Evaluates two independent 3D simplex fields (`|n1| < thresh && |n2| < thresh`) in world coordinates for seamless cross-chunk spaghetti tunnels, combined with low-frequency caverns (`y=10..40`), hillside entrances, a `12m` spawn protection radius around `(8, 11)`, and ocean roof protection.
- **[`src/world/gen/ores.js`](../src/world/gen/ores.js):** Uses a deterministic PRNG seeded from `(worldSeed, chunkX, chunkZ, oreId)` (zero `Math.random()`) to grow 3D random-walk veins with triangular depth distributions, checking neighboring chunk veins near borders so veins are never sliced across chunk boundaries.

---

## 5. Biome Regions (Part A) & Mob Auto-Jump / Unstuck (Part B)

### 5.1 Root Causes Found (Section 0 Audit)
1. **Why Terrain Blocks Mixed Together (Part A):**
   - `getNaturalBlockAt(wx, wy, wz)` in [`src/noise.js`](../src/noise.js) contained a global height override (`if (surfaceY <= SEA_LEVEL + 1) return this._hash2(wx, wz) < 0.28 ? 'gravel' : 'sand';`), which scattered random gravel and sand patches into every biome (Plains, Woods, Dunes, etc.) whenever terrain dipped near `y = 18..19`.
   - `getBiomeAt(wx, wz)` mixed high-frequency `ridge` (`0.012` scale) and `cont` (`0.007` scale) overrides into the biome selector, flipping small 5–20 block pockets to stone/snow inside warm or temperate biomes.
   - `evaluateCaveAt` allowed hillside entrances to carve up to `surfaceY`, punching stone/dirt holes through the surface biome layer.
   - `chunkWorker.js` called `getNaturalBlockAt` per block `(wx, wy, wz)` rather than computing `getBiome(wx, wz, seed)` once per `(wx, wz)` column.
2. **Why Animals & Mobs Got Stuck on Blocks (Part B):**
   - In [`src/polish.js`](../src/polish.js), mobs had no vertical velocity (`velocityY`), no gravity, no shared AABB collision resolution (`X -> Z -> Y`), and no auto-jump impulse (`sqrt(2 * gravity * 1.25)`). Instead, they checked `blockAtTorso` (`y + 0.6`) and snapped `y` to `world.getSurfaceHeight(x, z)`, which stopped every mob permanently against any 1-block step or player-placed wall.
   - Mobs lacked a `0.5s` (2 Hz) stuck-detection & 4-stage recovery ladder (Jump -> Turn 90–180° -> Sidestep Left/Right -> Push Up out of solid block), cliff-drop avoidance (`> 3` blocks for passive mobs), water buoyancy, and unloaded-chunk freeze protection.

### 5.2 Solution Architecture
- **Part A (`src/noise.js` & `src/workers/chunkWorker.js`):**
  - `getBiome(wx, wz, seed)` uses two low-frequency domain-warped noise fields (`temperature` and `moisture`, feature size ~200–260 blocks) with `BIOME_EDGE_BLEND = 0` to map deterministically to the 10-biome table (`BIOME_TABLE`), where each biome strictly owns its `surface`, `sub`, `deepSub`, and `underwaterFloor` blocks.
  - Smooth height blending across borders computes a weighted average of neighboring biome base heights and roughness over a `16`-block kernel so region transitions have zero wall-like cliffs while surface block borders remain crisp.
  - Caves carve strictly `<= surfaceY - 3` (leaving at least 3 solid biome blocks on top).
- **Part B (`src/collision.js` & `src/polish.js`):**
  - Shared `resolveEntityAABBCollision` (`X -> Z -> Y`), `checkAutoJumpObstacle`, `isChunkLoadedAt`, and `pushMobOutOfBlocks` in [`src/collision.js`](../src/collision.js) drive both player and mob physics, auto-jumping 1-block obstacles (`0.4s` cooldown), swimming in water, avoiding `> 3`-block cliffs for passive animals, freezing over unloaded chunks, and executing the 2 Hz 4-stage stuck recovery ladder.

---

## 6. Audit & Architecture: GrimWraith Combat, SoulSkeleton & Minecraft-Style Fluid Physics

### 6.1 Audit Part 1: GrimWraith & Mob Multi-Attack Architecture
1. **GrimWraith Model Inspection (`src/BlenderMobs.js`):**
   - The model `build_grim_wraith()` creates all required visual elements: `Wraith_MainCloak` with 8 tattered hem cones, cyan glowing `Wraith_SoulVortex`, `Wraith_HoodCowl`, `Wraith_VoidInsideHood`, screaming `Wraith_Skull` + `Wraith_ScreamJaw`, cyan `Wraith_SoulEye_L/R`, sleeves, and bony hands.
   - The giant Soul-Reaper Scythe is composed of `Wraith_ScytheStaff`, `Wraith_ScytheBlade`, and cyan `Wraith_ScytheSoulEdge`.
   - In `createMobContext()`, primitives matching `/Scythe/i` and `loc[1] > 0` are attached directly to `armL` (left arm pivot), while right arm meshes attach to `armR`, and skull/jaw attach to `headGroup`.
   - **Animation Rigging Hooks**: The rig returns `arms: [armL, armR]`, `headGroup`, `tailPivot`, `legs`. Animating `armL` poses the scythe overhead for windup and down for strikes. Animating `armR` and `armL` together provides casting poses for summons and soul beams.
2. **Current AI & Attack State:**
   - In `src/config/mobs.js`, `GrimWraith` had `behaviorClass: 'night_monster'`, `attackType: 'ranged'`, `rangedStyle: 'magic_bolt'`, which only supported a single attack.
   - In `src/mobAttacks.js`, `NIGHT_MOB_ATTACKS.GrimWraith` had 3 attack definitions (`scythe_slash`, `summon_skeletons`, `soul_steal`), but the combat state machine was tied to an ad-hoc controller rather than a general, multi-attack architecture supporting both single and multi-attack mobs.
   - Sunlight damage: `GrimWraith` has `burnsInSunlight: true` and takes `4.0 DPS` via `DaylightBurnSystem` (`src/daylightBurn.js`) when exposed to open daytime sky.

### 6.2 Audit Part 1.5: Why the Previous Skeleton "Did Nothing" (10-Point Wiring Checklist)
1. **Model Registration [FAIL previously]:** In `src/BlenderMobs.js`, `build_bonewalker()` called `makeCollector()`, an undefined function! This threw a fatal runtime `ReferenceError` during instantiation.
2. **Config Entry [FAIL previously]:** `Bonewalker` had a single attack config in `MOB_CONFIGS`, but was not recognized by `NIGHT_MOB_ATTACKS` (which had a hard-coded 4-mob map).
3. **AI Update Loop [FAIL previously]:** Summoned mobs created via `summonWraithSkeletons` failed on model creation or defaulted to standard melee without proper owner-tracking or claw scratch execution.
4. **Attack Dispatch [FAIL previously]:** Missing unified `AttackController` capable of selecting between attacks or running custom melee strikes like Claw Scratch.
5. **Target Acquisition [FAIL previously]:** Skeletons did not synchronize their target with their owner's target, resulting in idle wandering.
6. **Damage Path [PASS/WARN]:** Direct melee damage path exists in `MeleeAttack.js` and `tryAttackMob`, but lacked the specific Claw Scratch damage (2 HP) and knockback tuning.
7. **Chunk-Loaded Freeze [PASS]:** `isChunkLoadedAt` freezes mobs over unloaded chunks. Summoned mobs must always be placed on loaded columns.
8. **Despawn Rules [FAIL previously]:** Night monster cleanup at dawn would delete summoned mobs immediately or leave them orphaned without crumbling on parent Wraith death.
9. **Collision Size [PASS]:** Hitbox size (`0.75 x 1.85 x 0.75`) matches skeleton dimensions.
10. **Console & Debug [FAIL previously]:** `/spawn Bonewalker` crashed due to `makeCollector()`. `/forceattack` was not implemented.

### 6.3 Audit Part 2: Water & Lava Systems
1. **Data Storage:**
   - Chunks store blocks in `Map<"wx,wy,wz", blockType>` in `src/chunk.js`.
   - There is NO fluid level data, no source vs flowing distinction, and no falling column tracking.
2. **Meshing & Rendering:**
   - `src/workers/chunkWorker.js` filters transparent blocks (`water`) into `transEntries` and opaque blocks into `opaqueEntries`.
   - `water` is rendered using an `InstancedMesh` of standard 1x1x1 cubes with `sharedWaterMaterial` (`depthWrite: false`).
   - `lava` is treated as a solid opaque block and rendered as 1x1x1 cubes with `sharedMaterial`.
   - There are NO variable heights, NO corner averaging, NO flow direction geometry, and NO fluid quad meshing.
3. **Fluid Simulation:**
   - Zero fluid physics or flow simulation exists in the codebase. Water and lava are static placeable voxels.
4. **Entity Physics in Fluid:**
   - In `src/controls.js`, player collision checks ignore water entirely (`b !== 'water'`). The player falls through water at full gravity, takes full fall damage upon hitting the seabed, cannot swim up, and has no drowning or oxygen bubble UI.
   - Lava does not slow the player, does not inflict fire damage, and does not burn dropped items.
   - Mobs have basic buoyancy upward acceleration (`18.0 * dt`) in `collision.js`, but no lava avoidance or lava slowdown.
5. **Block Definition & Magma:**
   - `lava` is defined with `name: 'Molten Lava'` and tile 45. There is NO separate `Molten Magma` block in the game.
6. **Texture & Visuals:**
   - Both water and lava are single 16x16 static tiles in `public/assets/blocks/atlas.png`.
   - No animated frame strips exist; only a primitive shader UV scroll offset was attempted.

---

## 7. Audit & Architecture: Forest Biomes, Climate System, Animal Climate Behavior & Flying Birds

### 7.1 Section 0 Codebase Audit Findings
1. **Biomes & Terrain (`src/noise.js` & `src/workers/chunkWorker.js`):**
   - `BIOME_TABLE` contains 10 canonical biomes. `getBiome(wx, wz, seed)` maps 2D low-frequency temperature/moisture fields to biome records.
   - Surface, subsurface (`sub`, `deepSub`), and `underwaterFloor` are strictly owned per biome with 0 random block mixing.
   - `getSurfaceHeight(wx, wz)` blends baseHeight and roughness over a 16-block kernel using $C^1$-continuous smoothstep ($3t^2 - 2t^3$).
   - Three new high-moisture forest biomes will be added: `darkwood` (`forest_floor`), `maple_forest` (`maple_floor`), and `redwood` (`needle_floor`).
2. **Trees & Determinism (`src/noise.js`):**
   - `_hasTreeRootAt` and `_getTreeBlockAt` evaluate deterministic tree positions across chunk boundaries without `Math.random()`.
   - We will centralize tree dimensions, spacing, and branch rules in `src/config/trees.js`.
   - Dark Oak features a 2x2 trunk with wide 3-layer flat canopy (radius 4-5).
   - Maple features an oval canopy (radius 3-4) with red, orange, and yellow leaf variants.
   - Redwood features a 24-40 block tall cone canopy with 2x2 base trunk and 1x1 upper trunk.
3. **Texture Atlas (`tools/generate-textures.js` & `src/blocks.js`):**
   - Generates 16x16 grid (256 tiles max) in 32x32 pixel art. Currently tiles 0..70 are utilized; tiles 71..255 are free.
   - New textures for Dark Oak, Maple, Redwood, forest floors, moss, and cross-plane plant sprites will be assigned indices 71..105.
4. **Day/Night Cycle & Sunlight Burning (`src/config/spawning.js`, `src/daylightBurn.js`, `src/polish.js`):**
   - `timeOfDay` was duplicated between `polish.js` and `spawning.js`.
   - Central `ClimateSystem` (`src/climate/ClimateSystem.js`) will become the single source of truth for sun position, night boundaries (`NIGHT_START`, `NIGHT_END`), day length variation by season, and sunlight burning.
5. **Environment & Weather:**
   - Smooth weather state machine (`clear`, `partly_cloudy`, `overcast`, `light_rain`, `heavy_rain`, `thunderstorm`, `snow`, `fog`, `dust_haze`).
   - Seasonal foliage tint, leaf thinning, render-only snow buildup, and wet darkening will be implemented via shader uniforms (`sharedShaderUniforms`) with zero chunk re-meshing.
6. **Mob AI & Flying Birds:**
   - `Bird` (Crimson Raptor Falcon) in `src/BlenderMobs.js` has wing shoulder and 6 primary flight feathers on each side attached to `armL` (`mob.arms[0]`) and `armR` (`mob.arms[1]`).
   - Root cause of birds not flying: `Bird` was configured with `behaviorClass: 'passive'` in `src/config/mobs.js` and updated in `src/polish.js` as a ground mob subject to standard gravity, terrain snapping, and auto-jump without wing animation.
   - Solution: Set `behaviorClass: 'flying'`, wire `src/ai/BirdFlightAI.js` with 3D flight states (`Perch`, `TakeOff`, `Fly`, `Soar`, `Land`, `Flee`, `Migrate`), terrain following, obstacle raycasts, banking, and procedural wing flapping via `mob.arms[0]` and `mob.arms[1]`.
   - Animal climate AI: `src/climate/AnimalClimateBehavior.js` computes climate modifiers every 1s (staggered) and drives `Shelter`, `Rest`, `Drink`, `Huddle`.



---

## 8. Architecture: Plants, Fluids, Animal Panic, Spawn Caps, Long Days & Lightning

### 8.1 Phase 1 — Upright Cross-Plane Plants
- **Texture Generation & Atlas Orientation**:
  paintCrossSprite(tileIdx, name, drawFn) paints to standard top-origin pixel buffer (y=0 top, y=15 bottom). Plant roots and stem bases reside at y=15, while caps, flower petals, and grass tips reside at y=1..6.
- **Cross-Plane Geometry**:
  createCrossPlaneGeometry() creates diagonal intersecting planes with Y bounds in [-0.5, 0.5] (height 1.0) and bottom centered at cell floor wy - 0.5. Mushrooms use height scaled to 0.62.
- **Ground Integrity & Slash Commands**:
  Plants only generate when y === surfaceY + 1 over solid soil (grass, dirt, forest_floor, maple_floor, needle_floor, moss). If the ground beneath is removed, the plant drops.
  Commands /plantcheck and /spawnplants provided for audit.

### 8.2 Phase 2 — Minecraft Fluid Mechanics & Zero Stray Water
- **Orphan Prevention**:
  FluidSimulator enforces strict loaded-chunk boundaries (isChunkLoadedAt(x, z)). Unloaded chunks are treated as impenetrable boundaries rather than open air. Unloading chunks purges queued items inside those chunks.
- **Fluid Model**:
  Source = level 0. Flowing water = levels 1..7 (spread 7). Flowing lava = levels 0, 2, 4, 6 (spread 3). Falling fluid is flagged and renders full height.
- **Raycast & Bucket Rules**:
  Standard mining & block placement ignores fluids. Placing a solid block into fluid replaces the fluid and triggers neighbor updates. Buckets (bucket_empty, bucket_water, bucket_lava) craftable via 3 iron items in V-shape.
- **Entity Dynamics**:
  Water slows entity descent to 2 blocks/s, reduces horizontal speed, pushes with flow gradient, cancels fall damage, and tracks 10 bubbles (15s air) with 2 HP/s drowning. Lava applies 4 HP/0.5s damage, 0.35x speed, and 15s fire burning.

### 8.3 Phase 3 — Panic AI State Machine
- reaction: 'panic' added to all non-combative animals (Pig, Cow, Sheep, Rabbit, Chicken, Cat, Bird).
- Taking damage triggers Panic state: sprints at panicSpeedMult: 1.6 for random 6..10s, zigzagging away from damage source every 0.8..1.5s (+/-60 deg random angle), auto-jumping 1-block steps, avoiding cliffs > 3 blocks and lava pools.
- Same-species animals within 10 blocks trigger herd alarm after 0.2..0.6s.
- Bird takes off immediately into high-speed escape flight.

### 8.4 Phase 4 — Animal Spawning Groups (Max 4)
- Centralized in src/config/animals.js:
  ANIMAL_GROUP_MIN = 1, ANIMAL_GROUP_MAX = 4, MAX_SAME_SPECIES_NEARBY = 4, SAME_SPECIES_RADIUS = 32.
- Spawning trims group size so local density of the same species never exceeds 4.

### 8.5 Phase 5 — 20-Minute Master Day/Night Cycle
- Centralized in src/config/time.js:
  DAY_LENGTH_SECONDS = 1200 (20 minutes).
  Cycle breakdown: 50% daylight, 8% dusk, 34% night, 8% dawn.
  All solar, lunar, star, mob burn, and weather timers strictly derive from this single constant.

### 8.6 Phase 6 — Lightning Strike System
- Centralized in src/config/lightning.js and src/weather/Lightning.js:
  Strikes occur only in rain (thunderstorms: 8..20s, light rain: 90..180s).
  Normalized weights: living 30 (17.6%), tree 60 (35.3%), block 80 (47.1%).
  Player hit: 5 HP + fire. Animal hit: 20 HP + fire + herd panic. Tree hit: logs become charred_log, leaves burn away. Block hit: ground becomes scorched_ground.
