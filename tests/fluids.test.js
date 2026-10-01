import assert from 'node:assert/strict';
import { FluidSimulator } from '../src/fluids/FluidSimulator.js';
import { FLUID_CONFIG } from '../src/config/fluids.js';

console.log('====================================================================');
console.log(' VOXEL REALMS — FLUID SIMULATOR UNIT TESTS (7 SCENARIOS)');
console.log('====================================================================\n');

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    const detail = fn();
    passed++;
    console.log(` [PASS] ${name}${detail ? ` -> ${detail}` : ''}`);
  } catch (err) {
    failed++;
    console.error(` [FAIL] ${name} -> ${err.message}`);
    if (err.stack) console.error(err.stack);
  }
}

class MockWorld {
  constructor() {
    this.blocks = new Map();
  }

  coordKey(x, y, z) {
    return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  }

  setBlock(x, y, z, type) {
    const k = this.coordKey(x, y, z);
    if (!type) this.blocks.delete(k);
    else this.blocks.set(k, type);
  }

  getBlock(x, y, z) {
    return this.blocks.get(this.coordKey(x, y, z)) || null;
  }

  isSolidAt(x, y, z) {
    const b = this.getBlock(x, y, z);
    return Boolean(b && b !== 'water' && b !== 'lava');
  }

  isAirOrReplaceable(x, y, z) {
    const b = this.getBlock(x, y, z);
    return !b || b === 'air';
  }
}

function runUntilSettled(sim, maxTicks = 100) {
  for (let t = 0; t < maxTicks; t++) {
    sim.currentTime += 0.25;
    const processed = sim.tick(sim.currentTime, 500);
    if (sim.queue.length === 0 && processed === 0) break;
  }
}

// ----------------------------------------------------------------------------
// Scenario 1: Water source on flat ground spreads to exactly 7 blocks.
// ----------------------------------------------------------------------------
check('Scenario 1: Water source on flat ground spreads to exactly 7 blocks', () => {
  const world = new MockWorld();
  // Flat stone ground at y = 0 from x=-10..10, z=-10..10
  for (let x = -10; x <= 10; x++) {
    for (let z = -10; z <= 10; z++) {
      world.setBlock(x, 0, z, 'stone');
    }
  }

  const sim = new FluidSimulator(world, FLUID_CONFIG);
  sim.addSource(0, 1, 0, 'water');
  runUntilSettled(sim);

  // Source should be level 0
  const src = sim.getFluid(0, 1, 0);
  assert(src && src.level === 0, 'Source must be level 0');

  // Furthest fluid in +x should be at x = 7 with level 7
  for (let x = 1; x <= 7; x++) {
    const f = sim.getFluid(x, 1, 0);
    assert(f !== null, `Expected water at x=${x}`);
    assert.equal(f.level, x, `Level at x=${x} should be ${x}`);
  }

  // x = 8 must be null (no spread beyond 7 blocks)
  const beyond = sim.getFluid(8, 1, 0);
  assert.equal(beyond, null, 'Water must NOT spread to x=8');

  // Check all four cardinal extremes
  assert(sim.getFluid(-7, 1, 0) !== null, 'Should reach x = -7');
  assert.equal(sim.getFluid(-8, 1, 0), null, 'Should not reach x = -8');
  assert(sim.getFluid(0, 1, 7) !== null, 'Should reach z = 7');
  assert.equal(sim.getFluid(0, 1, 8), null, 'Should not reach z = 8');
  assert(sim.getFluid(0, 1, -7) !== null, 'Should reach z = -7');
  assert.equal(sim.getFluid(0, 1, -8), null, 'Should not reach z = -8');

  return 'Water spread exactly 7 blocks horizontally (levels 1..7)';
});

// ----------------------------------------------------------------------------
// Scenario 2: Source above hole falls straight down without sideways spread while falling.
// ----------------------------------------------------------------------------
check('Scenario 2: Source above hole falls straight down without sideways spread', () => {
  const world = new MockWorld();
  // Large solid floor far below at y = 0
  // Source at y = 10, over a hole where y = 1..9 is air.
  // Solid pillar surrounding hole from y=0..9, but at y=10 open air around source.
  for (let x = -5; x <= 5; x++) {
    for (let z = -5; z <= 5; z++) {
      world.setBlock(x, 0, z, 'stone');
    }
  }

  const sim = new FluidSimulator(world, FLUID_CONFIG);
  sim.addSource(0, 10, 0, 'water');

  // Tick step by step while it is falling down (y=9, 8, 7...)
  // Run 1 tick: source should fall to (0, 9, 0)
  sim.currentTime += 0.25;
  sim.tick(sim.currentTime, 500);

  // During this first tick, source fell to (0, 9, 0)
  const f9 = sim.getFluid(0, 9, 0);
  assert(f9 && f9.falling, 'Fluid at y=9 must be falling');

  // Verify at y=10 it did NOT spread sideways to (1, 10, 0)
  assert.equal(sim.getFluid(1, 10, 0), null, 'Must not spread to (1, 10, 0) while falling');
  assert.equal(sim.getFluid(-1, 10, 0), null, 'Must not spread to (-1, 10, 0) while falling');
  assert.equal(sim.getFluid(0, 10, 1), null, 'Must not spread to (0, 10, 1) while falling');
  assert.equal(sim.getFluid(0, 10, -1), null, 'Must not spread to (0, 10, -1) while falling');

  return 'Falling water went straight down; 0 sideways spread at source height';
});

// ----------------------------------------------------------------------------
// Scenario 3: Water finds shortest path to drop within 4 blocks and flows towards it.
// ----------------------------------------------------------------------------
check('Scenario 3: Water finds shortest path to drop within 4 blocks and flows towards it', () => {
  const world = new MockWorld();
  // Solid floor at y = 0, but a hole at (3, 0, 0) where y=0 is air!
  for (let x = -5; x <= 5; x++) {
    for (let z = -5; z <= 5; z++) {
      if (x === 3 && z === 0) continue; // the hole!
      world.setBlock(x, 0, z, 'stone');
    }
  }

  const sim = new FluidSimulator(world, FLUID_CONFIG);
  sim.addSource(0, 1, 0, 'water');

  // Run 1 tick for source spread
  sim.currentTime += 0.25;
  sim.tick(sim.currentTime, 500);

  // Because the hole at (3, 0, 0) is dist 3 in +X, and there are NO holes in -X, +Z, -Z,
  // water MUST flow towards +X, and NOT towards -X, +Z, -Z!
  const flowPosX = sim.getFluid(1, 1, 0);
  assert(flowPosX !== null, 'Water must flow towards the hole at +X');
  assert.equal(sim.getFluid(-1, 1, 0), null, 'Water must NOT flow towards -X when hole is at +X');
  assert.equal(sim.getFluid(0, 1, 1), null, 'Water must NOT flow towards +Z when hole is at +X');
  assert.equal(sim.getFluid(0, 1, -1), null, 'Water must NOT flow towards -Z when hole is at +X');

  return 'Water directed exclusively towards hole at (3, 0, 0)';
});

// ----------------------------------------------------------------------------
// Scenario 4: Two water sources with solid floor create infinite water source.
// ----------------------------------------------------------------------------
check('Scenario 4: Two water sources with solid floor create infinite water source', () => {
  const world = new MockWorld();
  for (let x = -10; x <= 10; x++) {
    for (let z = -10; z <= 10; z++) {
      world.setBlock(x, 0, z, 'stone');
    }
  }

  const sim = new FluidSimulator(world, FLUID_CONFIG);
  // Place two sources separated by 1 block: (0, 1, 0) and (2, 1, 0)
  sim.addSource(0, 1, 0, 'water');
  sim.addSource(2, 1, 0, 'water');

  runUntilSettled(sim);

  // The block in between (1, 1, 0) must have become a source (level 0)!
  const middle = sim.getFluid(1, 1, 0);
  assert(middle !== null, 'Middle block must contain fluid');
  assert.equal(middle.level, 0, 'Middle block must be infinite water source (level 0)');

  return 'Middle block at (1, 1, 0) transformed into source (level 0)';
});

// ----------------------------------------------------------------------------
// Scenario 5: Lava spreads only 3 blocks (levels 0, 2, 4, 6).
// ----------------------------------------------------------------------------
check('Scenario 5: Lava spreads only 3 blocks (levels 0, 2, 4, 6)', () => {
  const world = new MockWorld();
  for (let x = -6; x <= 6; x++) {
    for (let z = -6; z <= 6; z++) {
      world.setBlock(x, 0, z, 'stone');
    }
  }

  const sim = new FluidSimulator(world, FLUID_CONFIG);
  sim.addSource(0, 1, 0, 'lava');
  runUntilSettled(sim, 50);

  const src = sim.getFluid(0, 1, 0);
  assert(src && src.level === 0 && src.type === 'lava', 'Lava source at (0,1,0)');

  const l1 = sim.getFluid(1, 1, 0);
  assert(l1 !== null, 'Lava at x=1');
  assert.equal(l1.level, 2, 'Lava at x=1 should have level 2');

  const l2 = sim.getFluid(2, 1, 0);
  assert(l2 !== null, 'Lava at x=2');
  assert.equal(l2.level, 4, 'Lava at x=2 should have level 4');

  const l3 = sim.getFluid(3, 1, 0);
  assert(l3 !== null, 'Lava at x=3');
  assert.equal(l3.level, 6, 'Lava at x=3 should have level 6');

  // x=4 should be null
  assert.equal(sim.getFluid(4, 1, 0), null, 'Lava must NOT reach x=4');
  assert.equal(sim.getFluid(-4, 1, 0), null, 'Lava must NOT reach x=-4');

  return 'Lava spread exactly 3 blocks (levels 0, 2, 4, 6)';
});

// ----------------------------------------------------------------------------
// Scenario 6: Water/Lava interactions (obsidian, cobblestone, stone).
// ----------------------------------------------------------------------------
check('Scenario 6: Water/Lava interactions (obsidian, cobblestone, stone)', () => {
  // Sub-case 6A: Water touches Lava Source -> Obsidian
  {
    const world = new MockWorld();
    for (let x = -5; x <= 5; x++) {
      for (let z = -5; z <= 5; z++) {
        world.setBlock(x, 0, z, 'stone');
      }
    }
    const sim = new FluidSimulator(world, FLUID_CONFIG);
    sim.addSource(1, 1, 0, 'lava');
    sim.addSource(0, 1, 0, 'water');
    sim.currentTime += 0.25;
    sim.tick(sim.currentTime, 100);

    assert.equal(world.getBlock(1, 1, 0), 'obsidian', 'Water on lava source must form obsidian');
  }

  // Sub-case 6B: Water touches Flowing Lava -> Cobblestone
  {
    const world = new MockWorld();
    for (let x = -5; x <= 5; x++) {
      for (let z = -5; z <= 5; z++) {
        world.setBlock(x, 0, z, 'stone');
      }
    }
    const sim = new FluidSimulator(world, FLUID_CONFIG);
    sim.setFluid(1, 1, 0, { type: 'lava', level: 4, falling: false });
    sim.addSource(0, 1, 0, 'water');
    sim.currentTime += 0.25;
    sim.tick(sim.currentTime, 100);

    assert.equal(world.getBlock(1, 1, 0), 'cobblestone', 'Water on flowing lava must form cobblestone');
  }

  // Sub-case 6C: Lava flowing DOWN onto Water -> Stone
  {
    const world = new MockWorld();
    world.setBlock(0, 0, 0, 'stone');
    const sim = new FluidSimulator(world, FLUID_CONFIG);
    sim.addSource(0, 1, 0, 'water');
    sim.addSource(0, 2, 0, 'lava');
    sim.currentTime += 1.5;
    sim.tick(sim.currentTime, 100);

    assert.equal(world.getBlock(0, 1, 0), 'stone', 'Lava flowing down on water must form stone');
  }

  return 'All 3 reactions verified: lava source->obsidian, flowing lava->cobblestone, lava down->stone';
});

// ----------------------------------------------------------------------------
// Scenario 7: Removing source makes flow retreat and disappear.
// ----------------------------------------------------------------------------
check('Scenario 7: Removing source makes flow retreat and disappear', () => {
  const world = new MockWorld();
  for (let x = -10; x <= 10; x++) {
    for (let z = -10; z <= 10; z++) {
      world.setBlock(x, 0, z, 'stone');
    }
  }

  const sim = new FluidSimulator(world, FLUID_CONFIG);
  sim.addSource(0, 1, 0, 'water');
  runUntilSettled(sim);

  assert(sim.getFluid(5, 1, 0) !== null, 'Water should be present before removal');

  // Now remove source
  sim.removeSource(0, 1, 0);
  runUntilSettled(sim);

  // All flowing water should have retreated and disappeared!
  for (let x = -8; x <= 8; x++) {
    for (let z = -8; z <= 8; z++) {
      assert.equal(sim.getFluid(x, 1, z), null, `Water at (${x}, 1, ${z}) should have retreated completely`);
    }
  }

  return 'All flowing fluid retreated and 0 fluid blocks remained';
});

// ----------------------------------------------------------------------------
// Scenario 8: Negative chunk coordinates (-1, -1) and orphan cleaning.
// ----------------------------------------------------------------------------
check('Scenario 8: Negative chunk coordinates (-1, -1) and orphan cleaner', () => {
  const world = new MockWorld();
  // Floor in chunk (-1, -1): x in [-24, -8], z in [-24, -8]
  for (let x = -24; x <= -8; x++) {
    for (let z = -24; z <= -8; z++) {
      world.setBlock(x, 0, z, 'stone');
    }
  }

  const sim = new FluidSimulator(world, FLUID_CONFIG);
  // Source at (-16, 1, -16) in chunk (-1, -1)
  sim.addSource(-16, 1, -16, 'water');
  runUntilSettled(sim);

  const src = sim.getFluid(-16, 1, -16);
  assert(src && src.level === 0, 'Source in negative coords must be level 0');

  // Verify spread in negative coordinates
  for (let dx = 1; dx <= 7; dx++) {
    const f = sim.getFluid(-16 + dx, 1, -16);
    assert(f !== null, `Expected water at x = ${-16 + dx}`);
    assert.equal(f.level, dx, `Expected level ${dx} at x = ${-16 + dx}`);
  }
  assert.equal(sim.getFluid(-16 + 8, 1, -16), null, 'Water must not spread past 7 blocks in negative coords');

  // Test orphan cleaner: inject an orphan floating fluid block at (-20, 5, -20)
  sim.setFluid(-20, 5, -20, { type: 'water', level: 3, falling: false });
  assert(sim.getFluid(-20, 5, -20) !== null, 'Orphan should exist before cleaning');

  const removedCount = sim.checkAndCleanOrphans();
  assert(removedCount >= 1, 'Orphan cleaner should have removed the unsupplied fluid');
  assert.equal(sim.getFluid(-20, 5, -20), null, 'Orphan fluid should be deleted');

  return 'Negative coordinates (-1, -1) spread accurately & orphan cleaner cleared stray fluid';
});

// ----------------------------------------------------------------------------
// Scenario 9: Placing a solid block inside fluid displaces fluid without phantom water
// ----------------------------------------------------------------------------
check('Scenario 9: Placing solid block inside fluid displaces it without phantom water', () => {
  const world = new MockWorld();
  for (let x = -5; x <= 5; x++) {
    for (let z = -5; z <= 5; z++) {
      world.setBlock(x, 0, z, 'stone');
    }
  }

  const sim = new FluidSimulator(world, FLUID_CONFIG);
  sim.addSource(0, 1, 0, 'water');
  runUntilSettled(sim);

  assert(sim.getFluid(0, 1, 0) !== null, 'Water source should exist');

  // Place solid block at (0, 1, 0)
  world.setBlock(0, 1, 0, 'dirt');
  sim.onBlockChanged(0, 1, 0);
  runUntilSettled(sim);

  // Fluid at (0, 1, 0) must be null
  assert.equal(sim.getFluid(0, 1, 0), null, 'Fluid inside placed solid block must be removed');
  // Air above (0, 2, 0) must NOT have water
  assert.equal(sim.getFluid(0, 2, 0), null, 'Water must NOT spawn on top of placed solid block');

  return 'Solid block displacement removed fluid and caused 0 phantom water spawns';
});

// ----------------------------------------------------------------------------
// Scenario 10: Placing and removing blocks on dry land never spawns fluid
// ----------------------------------------------------------------------------
check('Scenario 10: Placing and removing blocks on dry land never spawns fluid', () => {
  const world = new MockWorld();
  for (let x = -5; x <= 5; x++) {
    for (let z = -5; z <= 5; z++) {
      world.setBlock(x, 10, z, 'grass');
    }
  }

  const sim = new FluidSimulator(world, FLUID_CONFIG);

  // Place a block on dry land
  world.setBlock(0, 11, 0, 'stone');
  sim.onBlockChanged(0, 11, 0);
  runUntilSettled(sim);
  assert.equal(sim.fluids.size, 0, 'Placing block on dry land must not spawn any fluid');

  // Remove the block from dry land
  world.setBlock(0, 11, 0, null);
  sim.onBlockChanged(0, 11, 0);
  runUntilSettled(sim);
  assert.equal(sim.fluids.size, 0, 'Removing block on dry land must not spawn any fluid');

  return '0 fluid spawned across dry land block placement and removal';
});

console.log(`\n====================================================================`);
console.log(` FLUID TESTS RESULT: ${passed} PASSED, ${failed} FAILED`);
console.log(`====================================================================\n`);

if (failed > 0) {
  process.exit(1);
}

