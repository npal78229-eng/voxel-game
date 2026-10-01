import {
  DAY_LENGTH_SECONDS,
  TIME_CONFIG,
  isNightFraction,
  isDawnFraction,
} from '../src/config/time.js';
import { CLIMATE_CONFIG } from '../src/config/climate.js';
import { SPAWN_CONFIG } from '../src/config/spawning.js';

console.log('====================================================================');
console.log(' VOXEL REALMS — TIME & 20-MINUTE DAY/NIGHT CYCLE TESTS');
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

// Test 1: Master day length is 1200 seconds (20 real minutes)
assert(
  DAY_LENGTH_SECONDS === 1200 && TIME_CONFIG.DAY_LENGTH_SECONDS === 1200,
  'Master day length is exactly 1200 seconds (20 minutes)',
  `DAY_LENGTH_SECONDS = ${DAY_LENGTH_SECONDS}s`
);

// Test 2: Cycle fractions sum to 1.0 (50% day, 8% dusk, 34% night, 8% dawn)
const sumFractions =
  TIME_CONFIG.DAY_FRACTION +
  TIME_CONFIG.DUSK_FRACTION +
  TIME_CONFIG.NIGHT_FRACTION +
  TIME_CONFIG.DAWN_FRACTION;
assert(
  Math.abs(sumFractions - 1.0) < 0.0001 &&
  TIME_CONFIG.DAY_FRACTION === 0.50 &&
  TIME_CONFIG.DUSK_FRACTION === 0.08 &&
  TIME_CONFIG.NIGHT_FRACTION === 0.34 &&
  TIME_CONFIG.DAWN_FRACTION === 0.08,
  'Cycle breakdown matches exactly 50% day, 8% dusk, 34% night, 8% dawn',
  `Day: 50%, Dusk: 8%, Night: 34%, Dawn: 8% (Sum = ${sumFractions})`
);

// Test 3: Climate and Spawning configs are strictly synchronized to centralized time
assert(
  CLIMATE_CONFIG.DAY_DURATION_SECONDS === 1200 &&
  CLIMATE_CONFIG.BASE_NIGHT_START === TIME_CONFIG.NIGHT_START &&
  CLIMATE_CONFIG.BASE_NIGHT_END === TIME_CONFIG.NIGHT_END &&
  SPAWN_CONFIG.NIGHT_START === TIME_CONFIG.NIGHT_START &&
  SPAWN_CONFIG.NIGHT_END === TIME_CONFIG.NIGHT_END,
  'Climate and Spawning configs are derived from time.js',
  `nightStart = ${TIME_CONFIG.NIGHT_START}, nightEnd = ${TIME_CONFIG.NIGHT_END}`
);

// Test 4: Night and dawn fractions
assert(
  !isNightFraction(0.25) && // Noon is day
  !isNightFraction(0.52) && // Dusk is twilight
  isNightFraction(0.60) &&  // Early night
  isNightFraction(0.75) &&  // Midnight
  isNightFraction(0.90) &&  // Late night
  !isNightFraction(0.95),   // Dawn is sunrise
  'isNightFraction accurately identifies night window [0.58 .. 0.92]'
);

assert(
  isDawnFraction(0.95) &&
  isDawnFraction(0.01) &&
  !isDawnFraction(0.25),
  'isDawnFraction accurately identifies sunrise burn window'
);

console.log(`\n====================================================================`);
console.log(` TIME TESTS RESULT: ${passed} PASSED, ${failed} FAILED`);
console.log(`====================================================================\n`);

if (failed > 0) process.exit(1);
