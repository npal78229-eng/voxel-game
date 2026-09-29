# Changelog (`CHANGELOG.md`)

## [v2.4.0] — 2026-09-29 (Biome Regions, Mob Auto-Jump & Unstuck, and Night Mob Combat System)

> **Terrain Layout Notice:** Existing world saves store only modified block diffs (`modifiedBlocks`), so old worlds will automatically regenerate with the new large area-wise biome layout (`getBiome(wx, wz, seed)`) while keeping all player-built blocks intact on top.

### Added & Fixed
- **Part A — Area-Wise Biome Distribution ([`src/noise.js`](src/noise.js), [`src/workers/chunkWorker.js`](src/workers/chunkWorker.js)):**
  - Implemented `getBiome(wx, wz, seed)` and `BIOME_TABLE` using two low-frequency domain-warped noise fields (`temperature` & `moisture`, ~220-block feature size) so biome regions are 150–300 blocks wide with zero 5-block specks and zero random surface mixing.
  - Removed global `"sand/gravel near sea level"` surface overrides so a Golden Dunes desert is 100% `sand` (`sand` 4 deep -> `sandstone`), Verdant Meadows is 100% `grass` over `dirt`, Frostbound Tundra is 100% `snow` over `dirt`, and Craggy Alpine Peaks is `stone` (`snow` above `y >= 38`).
  - Added smooth 16-block Gaussian height blending across biome borders so region transitions never produce wall-like cliffs while surface blocks change cleanly at the border.
  - Enforced a minimum 3-block solid surface roof above all caves (`depthBelowSurface >= 3` in [`src/world/gen/caves.js`](src/world/gen/caves.js)).
  - Added `/biome` and `/biomemap` (live 480×480m top-down colored biome map overlay).
- **Part B — Shared AABB Collision, Mob Auto-Jump & 2 Hz Unstuck Ladder ([`src/collision.js`](src/collision.js), [`src/polish.js`](src/polish.js), [`src/controls.js`](src/controls.js)):**
  - Extracted shared `isBoxColliding`, `moveEntityWithAABB`, `evaluateObstacleAhead`, `isCliffDropAhead`, `isChunkLoadedAt`, and `pushEntityOutOfBlocks` into [`src/collision.js`](src/collision.js).
  - Mobs automatically jump 1-block obstacles (`AUTO_JUMP_IMPULSE = sqrt(2 * gravity * 1.25)`, `0.4s` cooldown) and turn away from `>= 2`-block obstacles.
  - Added 2 Hz stuck detection & 4-stage recovery ladder (1. Jump -> 2. Turn 90–180° -> 3. Sidestep Left/Right -> 4. Push out of solid blocks), water swimming buoyancy, passive cliff avoidance (`> 3` blocks), unloaded-chunk freeze, and `pushMobsOutOfBlock` when placing blocks.
  - Updated `/mobdebug on` (`F4`) to render floating 3D telemetry labels (`State | Stuck | JumpCD | Grounded`) above every mob.

---

## [v2.3.0] — 2026-09-29 (Tasks F0 – F5: Combat Range, Spawn Categories, Ranged Magic, 3D Caves & Seeded Ore Veins)

### Added
- **Task F0 Investigation Report ([`docs/INVESTIGATION.md`](docs/INVESTIGATION.md)):** Complete root-cause analysis of damage pipeline, spawn rules, and world generation.
- **Centralized Data Configs (`src/config/`):**
  - [`src/config/mobs.js`](src/config/mobs.js): Hitboxes, edge-to-edge `meleeRange`, `reachY`, `windupTime`, `cooldown`, `damage`, `behaviorClass`, and `attackType` for all 16 mobs.
  - [`src/config/spawning.js`](src/config/spawning.js): `NIGHT_START` (`55%`), `NIGHT_END` (`95%`), `isNightTime()`, `24..64m` spawn ring, caps, and sunrise burn rates.
  - [`src/config/caves.js`](src/config/caves.js) & [`src/config/ores.js`](src/config/ores.js): Tunable 3D cave parameters, `SAVE_WORLD_VERSION = 3`, and triangular ore distribution tables.
- **Task F1 Edge-to-Edge Combat & 3-Phase Melee ([`src/combat/AttackRange.js`](src/combat/AttackRange.js), [`src/combat/attacks/MeleeAttack.js`](src/combat/attacks/MeleeAttack.js)):**
  - Implemented `gapDistance`, `inMeleeRange` (with `reachY` vertical floor guard), and voxel `hasLineOfSight`.
  - Implemented `WINDUP -> STRIKE -> RECOVERY` state machine that re-verifies range & LOS at the exact `STRIKE` instant (`WHOOSH (MISS!)` when stepping back during windup).
  - Added `F4` 3D Combat Debug Visualizer (wireframe hitboxes, melee/cast range rings, green/red LOS lines) and `/testrange` command.
- **Task F2 Categorized Spawning (`passive`, `neutral`, `wild_predator`, `night_monster`):**
  - `night_monster` spawns strictly when `isNight()` is true (`24..64m` away) and burns/despawns at dawn.
  - `wild_predator` (`Wolf` Fang Wolf & `Monkey` Treeswing Ape) attacks on sight day and night.
  - Added `/spawnstats`, `/time set day|night`, and daytime save-load monster cleanup.
- **Task F3 Ranged Magic & Swept Projectiles ([`src/combat/attacks/RangedMagicAttack.js`](src/combat/attacks/RangedMagicAttack.js)):**
  - Added `Hexcaster` (arcane robed mage with kiting `< 6m`, strafing, `1.0s` cast telegraph, and `14 blocks/s` magic bolts) and `Bonewalker` (ballistic bow archer) in [`src/BlenderMobs.js`](src/BlenderMobs.js).
  - Implemented `ProjectileManager` with swept segment-vs-AABB and voxel wall collision.
- **Task F4 Continuous 3D Caves & Seeded Vein Ores ([`src/world/gen/caves.js`](src/world/gen/caves.js), [`src/world/gen/ores.js`](src/world/gen/ores.js)):**
  - Added dual-noise 3D spaghetti tunnels, deep caverns (`y=10..40`), hillside entrances, `12m` spawn protection, and ocean flood protection.
  - Added cross-chunk deterministic 3D vein walks, triangular Y curves, cave-wall exposure bonus, `/orestats`, `F6` Cave & Ore X-Ray mode, and `SAVE_WORLD_VERSION = 3` older-save warning.
- **Task F5 Automated QA Suite ([`tests/run_qa_suite.js`](tests/run_qa_suite.js)):** 14 automated tests verifying F1–F5 checklists (`14 PASSED, 0 FAILED`).
