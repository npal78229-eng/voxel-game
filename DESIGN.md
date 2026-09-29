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
