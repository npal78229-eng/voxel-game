import { LIGHTNING_CONFIG } from '../src/config/lightning.js';
import { LightningSystem } from '../src/weather/Lightning.js';

console.log('====================================================================');
console.log(' VOXEL REALMS — LIGHTNING SYSTEM & WEIGHT DISTRIBUTION TESTS');
console.log('====================================================================\n');

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(` [PASS] ${testName}${details ? ' -> ' + details : ''}`);
    passed++;
  } else {
    console.error(` [FAIL] ${testName}${details ? ' -> ' + details : ''}`);
    failed++;
  }
}

// Test 1: Config constants match requirements
assert(
  LIGHTNING_CONFIG.TARGET_WEIGHTS.LIVING === 30 &&
  LIGHTNING_CONFIG.TARGET_WEIGHTS.TREE === 60 &&
  LIGHTNING_CONFIG.TARGET_WEIGHTS.BLOCK === 80,
  'Target weights are exactly Living: 30, Tree: 60, Block: 80',
  `Weights: Living=${LIGHTNING_CONFIG.TARGET_WEIGHTS.LIVING}, Tree=${LIGHTNING_CONFIG.TARGET_WEIGHTS.TREE}, Block=${LIGHTNING_CONFIG.TARGET_WEIGHTS.BLOCK}`
);

assert(
  LIGHTNING_CONFIG.PLAYER_DAMAGE === 5 &&
  LIGHTNING_CONFIG.ANIMAL_DAMAGE === 20 &&
  LIGHTNING_CONFIG.SPLASH_RADIUS === 3.5 &&
  LIGHTNING_CONFIG.THUNDER_SPEED_OF_SOUND === 60,
  'Lightning damage and physics constants match specifications',
  `PlayerDmg: 5HP, AnimalDmg: 20HP, Splash: 3.5m, SoundSpeed: 60m/s`
);

// Test 2: Statistical simulation of 20,000 rolls
// Expected: Living ~17.65%, Tree ~35.29%, Block ~47.06%
const mockSys = new LightningSystem(null, null, null, null);
const SIM_COUNT = 20000;
const stats = mockSys.simulateTargetRolls(SIM_COUNT);

console.log(` Simulating ${SIM_COUNT} rolls:`);
console.log(` - Living: ${stats.living.pct}% (expected ~17.65%)`);
console.log(` - Tree:   ${stats.tree.pct}% (expected ~35.29%)`);
console.log(` - Block:  ${stats.block.pct}% (expected ~47.06%)`);

const livingOk = Math.abs(stats.living.pct - 17.65) < 2.0;
const treeOk = Math.abs(stats.tree.pct - 35.29) < 2.5;
const blockOk = Math.abs(stats.block.pct - 47.06) < 2.5;

assert(
  livingOk && treeOk && blockOk,
  'Target roll statistical distribution matches weights (tolerance ±2.5%)',
  `Living: ${stats.living.pct}%, Tree: ${stats.tree.pct}%, Block: ${stats.block.pct}%`
);

console.log(`\n====================================================================`);
console.log(` LIGHTNING TESTS RESULT: ${passed} PASSED, ${failed} FAILED`);
console.log(`====================================================================\n`);

if (failed > 0) process.exit(1);
