# Changelog (`CHANGELOG.md`)

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
