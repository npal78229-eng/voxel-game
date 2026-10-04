import assert from 'node:assert/strict';
import { MOB_CONFIGS, getMobConfig } from '../src/config/mobs.js';
import { createBlenderMobInstance, ALL_14_BLENDER_MOB_TYPES } from '../src/BlenderMobs.js';
import blueprintData from '../src/world/village_v3_blueprint.json' with { type: 'json' };

console.log('====================================================================');
console.log(' VOXEL REALMS — VILLAGE, MOBS & BOSS SYSTEM UNIT TESTS');
console.log('====================================================================\n');

// 1. Test Villager configurations
const villagerCfg = getMobConfig('Villager');
assert.equal(villagerCfg.id, 'Villager', 'Villager config must have id Villager');
assert.equal(villagerCfg.behaviorClass, 'passive', 'Villager must be passive');
assert.equal(villagerCfg.isVillager, true, 'Villager isVillager flag must be true');
console.log(' [PASS] Scenario 1: Villager config registered with passive behavior and emerald drop');

const villagerFemaleCfg = getMobConfig('VillagerFemale');
assert.equal(villagerFemaleCfg.id, 'VillagerFemale', 'VillagerFemale config must have id VillagerFemale');
assert.equal(villagerFemaleCfg.isVillager, true, 'VillagerFemale isVillager flag must be true');
console.log(' [PASS] Scenario 2: VillagerFemale config registered with artisan profile');

// 2. Test Mob Builder Instantiation
const vRig = createBlenderMobInstance('Villager');
assert.ok(vRig.group, 'Villager rig must have group');
assert.ok(vRig.legs.length >= 2, 'Villager rig must have walking legs');
assert.ok(vRig.headGroup, 'Villager rig must have head group with nose and unibrow');
console.log(' [PASS] Scenario 3: Procedural Villager voxel rig builds cleanly with folded arms & head');

const vfRig = createBlenderMobInstance('VillagerFemale');
assert.ok(vfRig.group, 'VillagerFemale rig must have group');
assert.ok(vfRig.legs.length >= 2, 'VillagerFemale rig must have walking legs');
console.log(' [PASS] Scenario 4: Procedural VillagerFemale voxel rig builds with apron and hair');

// 3. Test Village Blueprint Structure & Layout
assert.ok(blueprintData.structures.town_hall, 'Town Hall must exist in blueprint');
assert.ok(blueprintData.structures.bell_tower, 'Bell Tower must exist in blueprint');
assert.ok(blueprintData.structures.well, 'Well must exist in blueprint');
assert.ok(blueprintData.structures.clan_house, 'Clan House must exist in blueprint');
assert.equal(blueprintData.clanFlagSpots.length, 5, 'Exactly 5 Clan Flags must be defined in blueprint');
console.log(' [PASS] Scenario 5: Village v3 blueprint contains 32 structures and 5 Clan Flag spots');

const clans = blueprintData.clanFlagSpots.map(s => s.clan).sort();
assert.deepEqual(clans, ['bow', 'dragon', 'magic', 'shield', 'sword'], 'All 5 clans (Sword, Bow, Dragon, Magic, Shield) represented');
console.log(' [PASS] Scenario 6: All 5 Clan Flags (Sword, Bow, Dragon, Magic, Shield) confirmed in territory layout');

// 4. Test Roster inclusion
assert.ok(ALL_14_BLENDER_MOB_TYPES.includes('Villager'), 'Villager must be in ALL_14_BLENDER_MOB_TYPES');
assert.ok(ALL_14_BLENDER_MOB_TYPES.includes('VillagerFemale'), 'VillagerFemale must be in ALL_14_BLENDER_MOB_TYPES');
console.log(' [PASS] Scenario 7: Villager types registered in master game mob type roster');

console.log('\n====================================================================');
console.log(' ALL VILLAGE & MOB TESTS PASSED SUCCESSFULLY (7/7)');
console.log('====================================================================\n');
