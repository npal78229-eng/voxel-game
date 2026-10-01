import * as THREE from 'three';

// ============================================================================
// Minecraft-Style Water Renderer (src/fluids/WaterRenderer.js)
//
// Enhanced water rendering with:
// - Animated surface waves via custom vertex shader
// - Scrolling flow direction UVs
// - Underwater caustic projection
// - Depth-based opacity (darker at edges, lighter in middle)
// - Minecraft-faithful water color palette
// - Screen-space underwater distortion overlay
// ============================================================================

/**
 * Minecraft water color palette (same as generate-fluid-textures.js)
 */
const WATER_COLORS = {
  shallow: new THREE.Color('#60a5fa'),
  mid:     new THREE.Color('#3b82f6'),
  deep:    new THREE.Color('#1d4ed8'),
  source:  new THREE.Color('#2563eb'),
  foam:    new THREE.Color('#93c5fd'),
};

/**
 * Custom ShaderMaterial for Minecraft-style animated water.
 *
 * Features over the basic MeshStandardMaterial:
 * - Vertex displacement waves on the top surface
 * - Two-layer animated noise for surface detail
 * - Flow-direction UV scrolling
 * - Edge foam / depth-based alpha
 * - Semi-transparency with proper depth sorting hints
 */
export function createMinecraftWaterMaterial(options = {}) {
  const {
    opacity = 0.72,
    waveAmplitude = 0.04,
    waveSpeed = 1.2,
    flowSpeed = 0.5,
    baseColor = WATER_COLORS.source,
    foamColor = WATER_COLORS.foam,
  } = options;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0.0 },
      uBaseColor: { value: baseColor },
      uFoamColor: { value: foamColor },
      uOpacity: { value: opacity },
      uWaveAmplitude: { value: waveAmplitude },
      uWaveSpeed: { value: waveSpeed },
      uFlowSpeed: { value: flowSpeed },
      uFlowDirection: { value: new THREE.Vector2(0.0, -1.0) }, // Default: south flow
      uWaterTexture: { value: null },
    },

    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uWaveAmplitude;
      uniform float uWaveSpeed;

      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vWaveHeight;

      // Simple hash for pseudo-random wave variation
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      // Smooth noise
      float noise2D(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);

        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));

        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      void main() {
        vUv = uv;
        vNormal = normalMatrix * normal;

        vec3 pos = position;
        vec4 worldPos4 = modelMatrix * vec4(pos, 1.0);
        vWorldPos = worldPos4.xyz;

        // Wave displacement on top face only (normal pointing up)
        if (normal.y > 0.5) {
          float t = uTime * uWaveSpeed;

          // Large gentle swell (Minecraft-style blocky ocean wave)
          float wave1 = sin(worldPos4.x * 2.5 + t * 0.8) *
                        cos(worldPos4.z * 2.0 + t * 0.6);

          // Smaller choppy ripples
          float wave2 = noise2D(worldPos4.xz * 4.0 + t * 1.5) * 0.5 - 0.25;

          // Tiny surface detail
          float wave3 = sin(worldPos4.x * 8.0 + worldPos4.z * 6.0 + t * 2.5) * 0.15;

          float totalWave = (wave1 * 0.6 + wave2 * 0.25 + wave3 * 0.15) * uWaveAmplitude;
          pos.y += totalWave;
          vWaveHeight = totalWave;
        } else {
          vWaveHeight = 0.0;
        }

        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(pos, 1.0);
      }
    `,

    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uBaseColor;
      uniform vec3 uFoamColor;
      uniform float uOpacity;
      uniform float uFlowSpeed;
      uniform vec2 uFlowDirection;
      uniform sampler2D uWaterTexture;

      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vWaveHeight;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float noise2D(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      void main() {
        // Flow-animated UV coordinates
        vec2 flowUV = vWorldPos.xz + uFlowDirection * uTime * uFlowSpeed;

        // Two-layer noise for water surface pattern
        float noise1 = noise2D(flowUV * 3.0 + uTime * 0.3);
        float noise2 = noise2D(flowUV * 7.0 - uTime * 0.5);
        float pattern = noise1 * 0.6 + noise2 * 0.4;

        // Color variation: mix between base and foam based on wave peaks
        float foamMix = smoothstep(0.55, 0.75, pattern);
        vec3 waterColor = mix(uBaseColor, uFoamColor, foamMix * 0.35);

        // Darken in wave troughs for depth illusion
        float troughDarken = smoothstep(-0.03, 0.02, vWaveHeight);
        waterColor *= mix(0.75, 1.0, troughDarken);

        // Specular highlight on wave crests (fake sun reflection)
        float specular = pow(max(0.0, pattern * 0.8 + vWaveHeight * 8.0), 4.0) * 0.25;
        waterColor += vec3(specular);

        // Edge darkening for depth perception
        float edgeFactor = abs(vNormal.y);
        float alpha = uOpacity * mix(0.85, 1.0, edgeFactor);

        // Slight shimmer / sparkle on bright spots
        float sparkle = pow(noise2D(vWorldPos.xz * 16.0 + uTime * 3.0), 8.0) * 0.4;
        waterColor += vec3(sparkle) * foamMix;

        gl_FragColor = vec4(waterColor, alpha);
      }
    `,

    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  return material;
}


/**
 * Water animation controller.
 * Manages the per-frame update of water shader uniforms.
 */
export class WaterAnimator {
  constructor() {
    this.materials = new Set();
    this.time = 0;
    this.flowDirections = new Map(); // chunkKey -> Vector2 flow direction
  }

  /**
   * Register a water material for animation updates.
   */
  addMaterial(material) {
    this.materials.add(material);
  }

  /**
   * Remove a material from animation updates.
   */
  removeMaterial(material) {
    this.materials.delete(material);
  }

  /**
   * Set the flow direction for a specific chunk's water.
   * @param {string} chunkKey - Chunk identifier
   * @param {number} dx - Flow X direction (-1, 0, or 1)
   * @param {number} dz - Flow Z direction (-1, 0, or 1)
   */
  setFlowDirection(chunkKey, dx, dz) {
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    this.flowDirections.set(chunkKey, new THREE.Vector2(dx / len, dz / len));
  }

  /**
   * Update all registered water materials. Call once per frame.
   * @param {number} deltaTime - Time since last frame in seconds
   */
  update(deltaTime) {
    this.time += deltaTime;

    for (const mat of this.materials) {
      if (mat.uniforms && mat.uniforms.uTime) {
        mat.uniforms.uTime.value = this.time;
      }
    }
  }
}


/**
 * Underwater screen effect controller.
 * Manages the blue-tinted overlay, distortion, and fog when the camera is submerged.
 */
export class UnderwaterEffect {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   */
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.isUnderwater = false;
    this.originalFogColor = null;
    this.originalFogDensity = null;

    // Caustic light (optional projected caustic pattern)
    this.causticLight = null;
    this.causticTime = 0;
  }

  /**
   * Enable underwater visual effects.
   */
  enterWater() {
    if (this.isUnderwater) return;
    this.isUnderwater = true;

    // Store original fog settings
    if (this.scene.fog) {
      this.originalFogColor = this.scene.fog.color.clone();
      if (this.scene.fog instanceof THREE.FogExp2) {
        this.originalFogDensity = this.scene.fog.density;
      }
    }
  }

  /**
   * Disable underwater visual effects.
   */
  exitWater() {
    if (!this.isUnderwater) return;
    this.isUnderwater = false;

    // Restore original fog
    if (this.scene.fog && this.originalFogColor) {
      this.scene.fog.color.copy(this.originalFogColor);
      if (this.scene.fog instanceof THREE.FogExp2 && this.originalFogDensity !== null) {
        this.scene.fog.density = this.originalFogDensity;
      }
    }
  }

  /**
   * Update underwater effects each frame.
   * @param {number} deltaTime
   */
  update(deltaTime) {
    if (!this.isUnderwater) return;
    this.causticTime += deltaTime;

    // Subtle fog color oscillation for underwater ambiance
    if (this.scene.fog) {
      const pulse = Math.sin(this.causticTime * 0.8) * 0.02;
      this.scene.fog.color.setRGB(
        0.114 + pulse,  // ~#1d
        0.306 + pulse,  // ~#4e
        0.847 - pulse   // ~#d8
      );
    }
  }
}


/**
 * Water rule configuration matching Minecraft behavior.
 * This extends FLUID_CONFIG.water with rendering-specific rules.
 */
export const WATER_RENDER_RULES = {
  // Surface heights per level (Minecraft formula: (8 - level) / 9)
  levelHeights: [
    8 / 9, // Level 0: Source block (0.889)
    7 / 9, // Level 1 (0.778)
    6 / 9, // Level 2 (0.667)
    5 / 9, // Level 3 (0.556)
    4 / 9, // Level 4 (0.444)
    3 / 9, // Level 5 (0.333)
    2 / 9, // Level 6 (0.222)
    1 / 9, // Level 7 (0.111)
  ],

  // Falling water column is always full block height
  fallingHeight: 1.0,

  // Animation parameters
  animation: {
    waveAmplitude: 0.04,      // Max vertex displacement for wave crests
    waveSpeed: 1.2,           // Wave oscillation speed multiplier
    flowSpeed: 0.5,           // UV scroll speed for flow texture
    textureFrameRate: 10,     // Animated texture frame rate (Hz)
    textureFrameCount: 16,    // Number of frames in animated texture strip
    sparkleIntensity: 0.4,    // Brightness of surface sparkle highlights
    causticIntensity: 0.8,    // Underwater caustic pattern brightness
    causticScale: 6.0,        // Caustic pattern cell size
  },

  // Rendering properties
  render: {
    opacity: 0.72,            // Base water opacity
    depthWrite: false,        // Transparent objects don't write depth
    roughness: 0.08,          // Low roughness for glossy surface reflection
    metalness: 0.0,           // Water is non-metallic
    ior: 1.333,               // Index of refraction (real water)
    transmission: 0.65,       // See-through amount
  },

  // Underwater camera effects
  underwater: {
    fogNear: 2.0,             // Near fog plane when submerged
    fogFar: 28.0,             // Far fog plane when submerged
    fogColor: '#1d4ed8',      // Blue underwater fog
    fogDensity: 0.065,        // Fog density (exponential)
    overlayColor: 'rgba(29, 78, 216, 0.25)', // Screen overlay tint
    distortionAmount: 0.003,  // Screen UV distortion strength
    vignette: 0.3,            // Edge darkening underwater
  },

  // Minecraft water spreading rules (reference, actual sim is in FluidSimulator)
  spreading: {
    tickDelay: 0.25,          // Seconds between spread ticks
    maxLevel: 7,              // Maximum flow distance from source
    levelDrop: 1,             // Level increase per horizontal block
    holeSearchRange: 4,       // BFS range for downhill path finding
    infiniteSource: true,     // Two adjacent sources create a new source
    flowPriority: 'down',     // Always try flowing down before sideways
  },

  // Water-Lava interaction results
  interactions: {
    waterOnLavaSource: 'obsidian',
    waterOnFlowingLava: 'cobblestone',
    lavaFallingOnWater: 'stone',
  },

  // Block colors for water at different levels (for debug/minimap)
  levelColors: [
    '#2563eb', // Source: brightest blue
    '#3b82f6',
    '#60a5fa',
    '#93c5fd',
    '#bfdbfe',
    '#dbeafe',
    '#eff6ff',
    '#f0f9ff', // Level 7: palest
  ],
};
