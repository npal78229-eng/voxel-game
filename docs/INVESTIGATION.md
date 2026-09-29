# Investigation Report (Task F0): Mobs, Attack Range, Day/Night Spawning, Caves & Ores

## 1. Damage Pipeline Trace

Every code path in the project capable of reducing `playerStats.hp` (`src/main.js:129` `applyPlayerDamage(amount, source)`):

| # | File & Function | Trigger Condition | Distance Measurement | Range Source | Identified Defects |
|---|---|---|---|---|---|
| 1 | `src/polish.js` -> `PassiveMobManager.update()` (lines 581–595) | `mob.spec.hostile && (isNight \|\| distSq < 8 * 8) && distSq < 18 * 18` followed immediately by `distSq < 1.85 * 1.85 && mob.attackCooldown <= 0` | 2D Horizontal center-to-center squared Euclidean distance (`dx * dx + dz * dz`) | Hardcoded magic number `1.85` (`distSq < 1.85 * 1.85`) inside `src/polish.js:590` | **5 Critical Bugs** (detailed below) |
| 2 | `src/controls.js` -> `FirstPersonController.update()` -> `src/main.js:165` | Downward impact velocity upon landing (`onFallDamage(fallDmg)`) | Vertical fall velocity threshold (`velocityY < -13.5`) | Physics gravity constant in `src/controls.js` | Intentional environmental hazard |

### Ranked Root Causes of Problem A ("Mobs damage me when I am clearly outside their attack range")

1. **Rank #1 — Zero Windup Telegraph / Instantaneous Damage on Proximity (`src/polish.js:590`):**
   - There is no `WINDUP -> STRIKE -> RECOVERY` state machine. The very first millisecond a mob's center comes within `1.85` units horizontally, `onPlayerDamaged` fires instantaneously while the player is already moving away or before any visible swing animation occurs.
2. **Rank #2 — Complete Omission of Vertical Distance (`dy` Ignored in `src/polish.js:581–583`):**
   - `distSq` is computed strictly in 2D (`dx * dx + dz * dz`). `playerPosition.y` and `mob.group.position.y` are never compared! A mob standing at the bottom of a cliff, under a bridge, on a different floor, or underneath a flying/jumping player hits the player across infinite vertical distance whenever `(x, z)` align within `1.85` blocks.
3. **Rank #3 — Center-to-Center Distance Instead of Edge-to-Edge AABB Hitbox Gap (`src/polish.js:583`):**
   - Measuring center-to-center (`1.85` blocks) without subtracting AABB half-extents or checking `gapDistance(attackerAABB, targetAABB)` causes inconsistent reach across small vs. large mobs and diagonal orientations.
4. **Rank #4 — No Voxel Line-of-Sight Check (`hasLineOfSight` Missing):**
   - Mobs do not raycast through the voxel grid before starting an attack or applying strike damage. A hostile mob outside a house wall or behind a 1-block stone barrier damages the player right through solid blocks.
5. **Rank #5 — Missing Player Invulnerability Window (`i-frames`):**
   - `applyPlayerDamage` (`src/main.js:129`) has no post-hit invulnerability window (`0.5s`), allowing multiple nearby mobs to stack simultaneous hits in a single frame.

---

## 2. Spawn Pipeline Trace

| # | File & Function | When Invoked | Current Rules Used | Defects Found |
|---|---|---|---|---|
| 1 | `src/polish.js` -> `PassiveMobManager.constructor()` (lines 387–414) | World initialization (`timeOfDay = 0.23`, daytime) | Hardcoded `initialSpawns` array of all 14 mobs within `2..15` blocks of spawn | Spawns `ShadowStalker`, `BloodCrawler`, `GrimWraith`, and `FleshGhoul` (`night_monster` class) **at noon right next to the player**. |
| 2 | `src/polish.js` -> `PassiveMobManager.update()` (line 585) | Every frame | `if (mob.spec.hostile && (isNight \|\| distSq < 8 * 8))` | Because `distSq < 8 * 8` overrides `isNight`, night monsters aggro and attack the player in full daylight whenever the player is within 8 blocks. |
| 3 | `src/polish.js` -> `PassiveMobManager.update()` (lines 559–566 & 619–623) | On mob death (`deadTimer <= 0`) or distance `> 36` blocks | Teleports mob to a `14`-block ring around the player (`playerPosition + 14`) | Respawns/teleports night monsters right back next to the player during the day instead of despawning them at sunrise or enforcing `24..64` block night-only spawning. |
| 4 | `src/main.js` -> `KeyB` (`line 359`) & `/spawn` (`line 398`) | User debug key / console command | `mobs.spawnMob(sx, sz)` | Debug spawn works, but lacks `/spawnstats`, `/testrange`, and daytime save cleanup. |

---

## 3. World Generation Pipeline Trace (`src/noise.js` & `src/workers/chunkWorker.js`)

1. **Terrain (`src/noise.js:243–264`):**
   - Uses deterministic `SeededSimplexNoise` (`fbm2D` + ridge noise) evaluated at world `(wx, wz)`.
2. **Caves (`src/noise.js:266–271` `isCaveVoid`):**
   - Currently evaluates a single high-threshold 3D simplex noise (`noise3D(wx * 0.065, wy * 0.081, wz * 0.065) > 0.61`).
   - **Defects:** Produces disconnected bubble pockets rather than continuous winding **spaghetti tunnels** (`|n1| < t1 && |n2| < t2`), large **cavern chambers** (`y=10..40`), rare **hillside entrances**, **ocean floor flood protection**, or a **12-block spawn protection radius** around `(8, 11)`.
3. **Ores (`src/noise.js:390–404`):**
   - Currently uses a single shared 3D simplex field (`oreNoise > 0.71`) partitioned by hard elevation cutoffs (`wy < 9`, `wy < 15`, `wy < 24`).
   - **Defects:** All ores share the exact same noise blobs; there are no per-ore seeded RNG vein walks (`hash(worldSeed, chunkX, chunkZ, oreId)`), no triangular Y distribution curves, no cross-chunk border vein continuity, and no cave-wall exposure bonus.

---

## 4. Fix Plan (Tasks F1 – F5)

- **Task F1 (`src/combat/AttackRange.js` & `src/config/mobs.js`):**
  - Implement `gapDistance(attacker, target)` (3D AABB edge-to-edge gap), `inMeleeRange(attacker, target, range)`, and `hasLineOfSight(world, from, to)` (voxel DDA raycast).
  - Replace all direct damage with a 3-phase `WINDUP -> STRIKE -> RECOVERY` state machine that re-verifies `inMeleeRange` and `hasLineOfSight` at the exact `STRIKE` instant.
  - Add `F4` 3D combat debug overlay (wireframe AABB hitboxes, melee/cast range rings, green/red LOS lines, floating phase text) and `/testrange` command.
- **Task F2 (`src/config/spawning.js` & `src/polish.js`):**
  - Classify every mob into `passive`, `neutral`, `wild_predator` (`Wolf`, `Monkey` — attack day or night on sight within `senseRange`), and `night_monster` (`ShadowStalker`, `BloodCrawler`, `GrimWraith`, `FleshGhoul`, `Hexcaster`, `Bonewalker` — spawn ONLY when `isNight()` is true between `24..64` blocks, burn/despawn at sunrise, and are stripped from daytime save loads).
  - Add `/spawn <mobId>`, `/time set day|night`, and `/spawnstats`.
- **Task F3 (`src/combat/attacks/MeleeAttack.js`, `src/combat/attacks/RangedMagicAttack.js`, `Hexcaster` & `Bonewalker`):**
  - Implement shared attack interface (`canStart`, `start`, `update`, `cancel`) and `ProjectileManager` with **swept segment-vs-AABB collision** (`14 blocks/s` magic bolts for `Hexcaster` with kiting at `< 6` blocks and strafing; arced arrows for `Bonewalker`).
- **Task F4 (`src/config/caves.js`, `src/config/ores.js`, `src/world/gen/caves.js`, `src/world/gen/ores.js`):**
  - Implement 3D dual-field spaghetti tunnels + deep caverns (`y=10..40`) + hillside entrances + 12-block spawn safety + ocean roof protection.
  - Implement deterministic cross-chunk seeded 3D random-walk ore veins with triangular depth distributions, biome bonuses, cave exposure bonuses, `/orestats`, `F6` Cave X-Ray mode, and save version bump (`SAVE_VERSION = 3` with older-save warning banner).
- **Task F5 (QA & Automated Verification):**
  - Run automated test suite (`tests/run_qa_suite.js`) covering `AttackRange.js`, swept projectile collisions, spawn rules, and 5-seed cave/ore statistics, and update `DESIGN.md` and `CHANGELOG.md`.
