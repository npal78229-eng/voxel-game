// ============================================================================
// Centralized Fluid Physics & Rendering Configuration (Master Rule #2)
// Tuning parameters for Minecraft-style Water and Lava simulation,
// entity buoyancy, air/drowning meter, fire damage, and screen effects.
// ============================================================================

export const FLUID_CONFIG = {
  water: {
    type: 'water',
    tickDelay: 0.25, // 0.25s per tick
    maxLevel: 7, // Flowing levels 1..7 (spreads up to 7 blocks from source)
    levelDrop: 1, // Drops by 1 level per horizontal block
    holeSearchRange: 4, // 4 blocks search for cliff/drop
    infiniteSource: true, // 2 adjacent sources over solid floor create new source
    sinkTerminalSpeed: 2.0, // terminal sink speed in water: 2 blocks/s
    swimUpSpeed: 3.5, // Space to swim up: 3.5 blocks/s
    horizontalSpeedMultiplier: 0.5, // half speed
    sprintSwimMultiplier: 0.72,
    flowPushForce: 1.8, // gentle constant push
    fallingPushForce: 3.2, // stronger in falling columns
    drowningSeconds: 15.0, // 15 seconds of air (10 bubbles)
    drowningDps: 2.0, // 2 HP per second once air runs out
    bubbleCount: 10,
    bubbleRefillRate: 5.0, // bubbles per second when head out of water
    underwaterFogNear: 2.0,
    underwaterFogFar: 28.0,
    underwaterFogColor: '#1d4ed8',
    // --- Minecraft-Style Water Rendering & Animation Rules ---
    animation: {
      waveAmplitude: 0.04,       // Vertex displacement height for surface waves
      waveSpeed: 1.2,            // Wave oscillation speed multiplier
      flowSpeed: 0.5,            // UV scroll speed for flow texture
      textureFrameRate: 10,      // Animated texture frame rate (Hz)
      textureFrameCount: 16,     // Number of frames in strip texture
      sparkleIntensity: 0.4,     // Surface sparkle highlight brightness
      causticIntensity: 0.8,     // Underwater caustic pattern strength
    },
    render: {
      opacity: 0.72,             // Base water transparency
      roughness: 0.08,           // Low roughness for glossy reflection
      depthWrite: false,         // Don't write to depth buffer (transparent)
    },
  },
  lava: {
    type: 'lava',
    tickDelay: 1.5, // 1.5s per tick (much slower flow)
    maxLevel: 6, // Levels 0, 2, 4, 6 (spreads up to 3 blocks from source)
    levelDrop: 2, // Drops by 2 levels per horizontal block
    holeSearchRange: 2, // 2 blocks search for cliff/drop
    infiniteSource: false, // lava never creates infinite sources
    sinkTerminalSpeed: 1.0, // sink ~ 1 block/s
    swimUpSpeed: 1.5, // swim up ~ 1.5 blocks/s
    horizontalSpeedMultiplier: 0.35, // much slower (0.35x)
    flowPushForce: 1.2,
    fallingPushForce: 2.4,
    damageInterval: 0.5, // 4 HP every 0.5 seconds (respects 0.5s i-frames)
    damagePerHit: 4,
    burnDuration: 15.0, // On fire for 15 seconds after exiting lava
    burnDps: 1.0, // 1 HP/s while burning
    inLavaFogNear: 0.5,
    inLavaFogFar: 2.0, // very short fog (1 to 2 blocks)
    inLavaFogColor: '#ea580c',
  },
  budget: {
    maxUpdatesPerTick: 200,
    debounceRemeshMs: 100, // 0.1s debounce re-meshing
  },
  interactions: {
    waterOnLavaSource: 'obsidian',
    waterOnFlowingLava: 'cobblestone',
    lavaDownOnWater: 'stone',
  },
};
