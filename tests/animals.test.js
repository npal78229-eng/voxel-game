import { MOB_CONFIGS } from '../src/config/mobs.js';
import {
  rollAnimalGroupSize,
  ANIMAL_GROUP_MIN,
  ANIMAL_GROUP_MAX,
  MAX_SAME_SPECIES_NEARBY,
  SAME_SPECIES_RADIUS,
} from '../src/config/animals.js';

console.log('====================================================================');
console.log(' VOXEL REALMS — ANIMAL SPAWNING & PANIC CONFIG TESTS');
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

// Test 1: rollAnimalGroupSize returns 1..4 across 10,000 iterations
const rolls = { 1: 0, 2: 0, 3: 0, 4: 0, outOfBounds: 0 };
for (let i = 0; i < 10000; i++) {
  const r = rollAnimalGroupSize();
  if (r in rolls) rolls[r]++;
  else rolls.outOfBounds++;
}
assert(
  rolls.outOfBounds === 0 && rolls[1] > 0 && rolls[2] > 0 && rolls[3] > 0 && rolls[4] > 0,
  'rollAnimalGroupSize generates 1..4 inclusive across 10,000 rolls',
  `Distribution: 1:${rolls[1]}, 2:${rolls[2]}, 3:${rolls[3]}, 4:${rolls[4]}`
);

// Test 2: Density cap constants
assert(
  ANIMAL_GROUP_MIN === 1 &&
  ANIMAL_GROUP_MAX === 4 &&
  MAX_SAME_SPECIES_NEARBY === 4 &&
  SAME_SPECIES_RADIUS === 32,
  'Centralized density cap constants match requirements',
  `min=${ANIMAL_GROUP_MIN}, max=${ANIMAL_GROUP_MAX}, nearbyCap=${MAX_SAME_SPECIES_NEARBY}, radius=${SAME_SPECIES_RADIUS}m`
);

// Test 3: Passive animals have reaction: 'panic', panicSpeedMult: 1.6, panicDuration: [6, 10]
const passiveAnimals = ['Pig', 'Cow', 'Sheep', 'Rabbit', 'Chicken', 'Cat', 'Bird'];
let allPassivePanic = true;
for (const id of passiveAnimals) {
  const cfg = MOB_CONFIGS[id];
  if (!cfg || cfg.reaction !== 'panic' || cfg.panicSpeedMult !== 1.6) {
    allPassivePanic = false;
    break;
  }
  const [minD, maxD] = cfg.panicDuration || [];
  if (minD !== 6 || maxD !== 10) {
    allPassivePanic = false;
    break;
  }
}
assert(
  allPassivePanic,
  'All 7 passive animals configured with reaction="panic", speedMult=1.6, duration=[6, 10]'
);

// Test 4: Hostile predators and night monsters have reaction: 'retaliate'
const hostileMobs = [
  'Dog', 'Wolf', 'Monkey',
  'ShadowStalker', 'BloodCrawler', 'FleshGhoul', 'Hexcaster', 'GrimWraith', 'SoulSkeleton', 'Bonewalker'
];
let allRetaliate = true;
for (const id of hostileMobs) {
  const cfg = MOB_CONFIGS[id];
  if (!cfg || cfg.reaction !== 'retaliate') {
    allRetaliate = false;
    break;
  }
}
assert(
  allRetaliate,
  'All combat and predator mobs configured with reaction="retaliate"'
);

console.log(`\n====================================================================`);
console.log(` ANIMAL TESTS RESULT: ${passed} PASSED, ${failed} FAILED`);
console.log(`====================================================================\n`);

if (failed > 0) process.exit(1);
