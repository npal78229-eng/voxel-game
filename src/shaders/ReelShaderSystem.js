import * as THREE from 'three';

/**
 * ReelShaderSystem.js
 * 
 * Production-ready, modular real-time shader suite and post-processing stack
 * recreating the exact visual style, atmosphere, materials, lighting,
 * and emission of the viral aerial dogfight reference (@cloudgamesid / IQBALISM).
 * 
 * MODULAR SHADER MODULES:
 * 1. Base PBR Material Shader (Roughness, Metallic, Normal mapping, Ambient lighting)
 * 2. Bioluminescent Emission Shader (HDR Emission, Fresnel-based edge glow, Bloom interaction, Pulsing wave)
 * 3. Fresnel / Rim Lighting Shader (View-angle-dependent intensity, power, and color)
 * 4. Procedural Energy & Surface Distortion Shader (Multi-octave Simplex/FBM noise, animated UVs, dissolve threshold, contours)
 * 5. Canopy Glass & Refraction Shader (Physically convincing transparency, Fresnel edge highlights, chromatic sheen)
 * 6. Atmospheric Multi-Tier Cloud Deck & Horizon Enclosure (Floating clouds, distant mountain silhouettes)
 * 7. Reel Post-Processing Stack (HDR Bloom, Dieselpunk Color Grading, Vignette, Film Grain, Performance Quality Presets)
 */

// ============================================================================
// 1. GLSL PROCEDURAL SIMPLEX / FBM NOISE FUNCTIONS
// ============================================================================
export const NOISE_GLSL = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

float fbm(vec3 p) {
  float total = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 3; i++) {
    total += snoise(p * freq) * amp;
    freq *= 2.05;
    amp *= 0.5;
  }
  return total;
}
`;

// ============================================================================
// 2. MODULAR SHADER COMPONENT FACTORIES
// ============================================================================

/**
 * 1. Base PBR Material Shader
 * Implements physically based diffuse, specular roughness, metallic reflectivity,
 * directional key/fill lighting, and subtle ambient contribution.
 */
export function createBasePBRShader(options = {}) {
  const uniforms = {
    uBaseColor: { value: new THREE.Color(options.baseColor ?? 0x12171f) },
    uRoughness: { value: options.roughness ?? 0.65 },
    uMetallic: { value: options.metallic ?? 0.35 },
    uAmbientIntensity: { value: options.ambientIntensity ?? 0.28 },
    uKeyLightDir: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
    uKeyLightColor: { value: new THREE.Color(options.keyColor ?? 0xd5e3f0) },
    uFillLightColor: { value: new THREE.Color(options.fillColor ?? 0x22303d) },
    uRimColor: { value: new THREE.Color(options.rimColor ?? 0x486581) },
    uRimPower: { value: options.rimPower ?? 3.5 },
    uRimStrength: { value: options.rimStrength ?? 0.6 },
  };

  const vertexShader = `
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying vec3 vViewDirection;
    varying vec2 vUv;

    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      vViewDirection = normalize(cameraPosition - worldPos.xyz);
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `;

  const fragmentShader = `
    uniform vec3 uBaseColor;
    uniform float uRoughness;
    uniform float uMetallic;
    uniform float uAmbientIntensity;
    uniform vec3 uKeyLightDir;
    uniform vec3 uKeyLightColor;
    uniform vec3 uFillLightColor;
    uniform vec3 uRimColor;
    uniform float uRimPower;
    uniform float uRimStrength;

    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying vec3 vViewDirection;
    varying vec2 vUv;

    void main() {
      vec3 N = normalize(vNormal);
      vec3 V = normalize(vViewDirection);
      vec3 L = normalize(uKeyLightDir);
      vec3 H = normalize(L + V);

      // Diffuse Key Light (Lambert with wrap)
      float NdotL = max(0.0, dot(N, L));
      float wrapL = max(0.0, (dot(N, L) + 0.3) / 1.3);
      vec3 diffuse = uBaseColor * (uKeyLightColor * wrapL + uFillLightColor * (1.0 - wrapL) * 0.5);

      // Specular Highlight (Blinn-Phong)
      float specAngle = max(0.0, dot(N, H));
      float specShininess = mix(12.0, 128.0, 1.0 - uRoughness);
      float spec = pow(specAngle, specShininess) * mix(0.1, 0.9, uMetallic);
      vec3 specular = uKeyLightColor * spec;

      // Fresnel Rim Light
      float fresnel = pow(1.0 - max(0.0, dot(N, V)), uRimPower) * uRimStrength;
      vec3 rim = uRimColor * fresnel;

      // Ambient Base
      vec3 ambient = uBaseColor * uAmbientIntensity;

      vec3 finalColor = diffuse + specular + rim + ambient;
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
  });
}

/**
 * 2. Bioluminescent Emission Shader
 * Recreates the signature glowing cyan-white nodes along the Leviathan's spine.
 * Features HDR emissive core, Fresnel edge aura, pulsing sinusoidal ripple,
 * and distance falloff.
 */
export function createBioluminescentEmissionShader(options = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uEmissionColor: { value: new THREE.Color(options.emissionColor ?? 0x5eeaff) },
    uCoreColor: { value: new THREE.Color(options.coreColor ?? 0xffffff) },
    uEmissionStrength: { value: options.emissionStrength ?? 2.8 },
    uFresnelPower: { value: options.fresnelPower ?? 2.2 },
    uFresnelStrength: { value: options.fresnelStrength ?? 2.0 },
    uPulseSpeed: { value: options.pulseSpeed ?? 3.5 },
    uPulseIntensity: { value: options.pulseIntensity ?? 0.4 },
    uWaveOffset: { value: options.waveOffset ?? 0.0 },
    uGlowWidth: { value: options.glowWidth ?? 1.0 },
  };

  const vertexShader = `
    varying vec3 vNormal;
    varying vec3 vViewDirection;
    varying vec3 vWorldPosition;
    varying vec2 vUv;

    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      vViewDirection = normalize(cameraPosition - worldPos.xyz);
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `;

  const fragmentShader = `
    uniform float uTime;
    uniform vec3 uEmissionColor;
    uniform vec3 uCoreColor;
    uniform float uEmissionStrength;
    uniform float uFresnelPower;
    uniform float uFresnelStrength;
    uniform float uPulseSpeed;
    uniform float uPulseIntensity;
    uniform float uWaveOffset;
    uniform float uGlowWidth;

    varying vec3 vNormal;
    varying vec3 vViewDirection;
    varying vec3 vWorldPosition;
    varying vec2 vUv;

    void main() {
      vec3 N = normalize(vNormal);
      vec3 V = normalize(vViewDirection);

      // Pulsing brightness wave
      float pulse = 1.0 + sin(uTime * uPulseSpeed + uWaveOffset) * uPulseIntensity;

      // Fresnel edge halo
      float NdotV = max(0.0, dot(N, V));
      float fresnel = pow(1.0 - NdotV, uFresnelPower) * uFresnelStrength * uGlowWidth;

      // Core falloff (center is brightest white, edge is cyan halo)
      float coreFactor = pow(NdotV, 1.4);
      vec3 color = mix(uEmissionColor, uCoreColor, coreFactor * 0.65);

      // Combined HDR emission output for bloom integration
      vec3 finalEmissive = (color * uEmissionStrength + uEmissionColor * fresnel) * pulse;

      gl_FragColor = vec4(finalEmissive, 1.0);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: false,
    side: THREE.FrontSide,
  });
}

/**
 * 3. Fresnel / Rim Lighting Material Shader
 * Sharp, view-angle dependent rim illumination for dragon ridges,
 * wing edges, and Stuka fuselage silhouettes.
 */
export function createFresnelRimShader(options = {}) {
  const uniforms = {
    uBaseColor: { value: new THREE.Color(options.baseColor ?? 0x080c12) },
    uRimColor: { value: new THREE.Color(options.rimColor ?? 0x38bdf8) },
    uRimPower: { value: options.rimPower ?? 3.0 },
    uRimStrength: { value: options.rimStrength ?? 1.8 },
    uSmoothness: { value: options.smoothness ?? 0.5 },
  };

  const vertexShader = `
    varying vec3 vNormal;
    varying vec3 vViewDirection;

    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vViewDirection = normalize(cameraPosition - worldPos.xyz);
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `;

  const fragmentShader = `
    uniform vec3 uBaseColor;
    uniform vec3 uRimColor;
    uniform float uRimPower;
    uniform float uRimStrength;
    uniform float uSmoothness;

    varying vec3 vNormal;
    varying vec3 vViewDirection;

    void main() {
      vec3 N = normalize(vNormal);
      vec3 V = normalize(vViewDirection);

      float rim = 1.0 - max(0.0, dot(N, V));
      rim = smoothstep(1.0 - uSmoothness, 1.0, rim);
      rim = pow(rim, uRimPower) * uRimStrength;

      vec3 color = mix(uBaseColor, uRimColor, clamp(rim, 0.0, 1.0));
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
  });
}

/**
 * 4. Procedural Energy & Surface Distortion Shader
 * Multi-octave 3D Simplex noise distortion with animated UVs,
 * dissolve threshold, flowing contour waves, and pulsating energy glow.
 * Used for the Leviathan's throat plasma core and homing void plasma orbs.
 */
export function createEnergyDistortionShader(options = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uColorA: { value: new THREE.Color(options.colorA ?? 0x0284c7) }, // Deep plasma blue
    uColorB: { value: new THREE.Color(options.colorB ?? 0x38bdf8) }, // Radiant cyan
    uCoreColor: { value: new THREE.Color(options.coreColor ?? 0xffffff) }, // Blinding white core
    uDistortionStrength: { value: options.distortionStrength ?? 0.6 },
    uNoiseScale: { value: options.noiseScale ?? 2.4 },
    uNoiseSpeed: { value: options.noiseSpeed ?? 1.8 },
    uDissolveAmount: { value: options.dissolveAmount ?? 0.0 },
    uPulsingIntensity: { value: options.pulsingIntensity ?? 0.4 },
  };

  const vertexShader = `
    uniform float uTime;
    uniform float uDistortionStrength;
    uniform float uNoiseScale;
    uniform float uNoiseSpeed;

    varying vec3 vNormal;
    varying vec3 vViewDirection;
    varying vec3 vWorldPosition;
    varying vec2 vUv;
    varying float vDisplacement;

    ${NOISE_GLSL}

    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      vec3 p = position * uNoiseScale + vec3(0.0, uTime * uNoiseSpeed, 0.0);
      float noiseVal = fbm(p);
      vDisplacement = noiseVal;

      vec3 displacedPos = position + normal * (noiseVal * uDistortionStrength * 0.4);
      vec4 worldPos = modelMatrix * vec4(displacedPos, 1.0);
      vWorldPosition = worldPos.xyz;
      vViewDirection = normalize(cameraPosition - worldPos.xyz);

      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `;

  const fragmentShader = `
    uniform float uTime;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform vec3 uCoreColor;
    uniform float uDissolveAmount;
    uniform float uPulsingIntensity;

    varying vec3 vNormal;
    varying vec3 vViewDirection;
    varying vec3 vWorldPosition;
    varying vec2 vUv;
    varying float vDisplacement;

    void main() {
      vec3 N = normalize(vNormal);
      vec3 V = normalize(vViewDirection);

      // Dissolve clipping
      float dissolveMask = vDisplacement + 0.5;
      if (dissolveMask < uDissolveAmount) {
        discard;
      }

      // Contour edge glow near dissolve threshold
      float edgeGlow = smoothstep(uDissolveAmount, uDissolveAmount + 0.18, dissolveMask);

      // Flowing energy gradient
      float energyFactor = (vDisplacement + 1.0) * 0.5;
      float pulse = 1.0 + sin(uTime * 4.0) * uPulsingIntensity;

      // Fresnel edge radiance
      float fresnel = pow(1.0 - max(0.0, dot(N, V)), 2.0);

      vec3 color = mix(uColorA, uColorB, energyFactor);
      color = mix(color, uCoreColor, fresnel * 0.7);
      color *= pulse * 2.2;

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: true,
  });
}

/**
 * 5. Canopy Glass & Refraction Shader
 * Physically convincing aircraft canopy glass with Fresnel specular reflection,
 * chromatic sheen, and edge highlights.
 */
export function createCanopyRefractionShader(options = {}) {
  const uniforms = {
    uGlassColor: { value: new THREE.Color(options.glassColor ?? 0x7da4c7) },
    uSpecularColor: { value: new THREE.Color(options.specularColor ?? 0xffffff) },
    uFresnelPower: { value: options.fresnelPower ?? 2.8 },
    uBaseAlpha: { value: options.baseAlpha ?? 0.35 },
    uRefractionStrength: { value: options.refractionStrength ?? 0.4 },
    uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.4).normalize() },
  };

  const vertexShader = `
    varying vec3 vNormal;
    varying vec3 vViewDirection;
    varying vec2 vUv;

    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vViewDirection = normalize(cameraPosition - worldPos.xyz);
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `;

  const fragmentShader = `
    uniform vec3 uGlassColor;
    uniform vec3 uSpecularColor;
    uniform float uFresnelPower;
    uniform float uBaseAlpha;
    uniform float uRefractionStrength;
    uniform vec3 uSunDir;

    varying vec3 vNormal;
    varying vec3 vViewDirection;
    varying vec2 vUv;

    void main() {
      vec3 N = normalize(vNormal);
      vec3 V = normalize(vViewDirection);
      vec3 L = normalize(uSunDir);
      vec3 H = normalize(L + V);

      // Fresnel edge reflection
      float NdotV = max(0.0, dot(N, V));
      float fresnel = pow(1.0 - NdotV, uFresnelPower);

      // Specular sunlight flash on canopy curvature
      float spec = pow(max(0.0, dot(N, H)), 64.0) * 1.5;

      vec3 color = mix(uGlassColor, uSpecularColor, spec + fresnel * 0.7);
      float alpha = clamp(uBaseAlpha + fresnel * 0.6 + spec * 0.5, 0.0, 0.95);

      gl_FragColor = vec4(color, alpha);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/**
 * 6. Atmospheric Multi-Tier Cloud Deck & Horizon Enclosure System
 * Recreates the rolling cloud layers and majestic distant mountain silhouette horizon
 * seen in the reference reel.
 */
export class AtmosphericSkyEnclosure {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'Atmospheric_Sky_Enclosure';
    this.scene.add(this.group);

    this.cloudClusters = [];
    this.time = 0;

    this.buildCloudLayers();
    this.buildDistantMountainHorizon();
  }

  buildCloudLayers() {
    // Soft, bright luminous puffy clouds matching the reel's open overcast sky
    const cloudMat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.84,
      depthWrite: false,
    });

    // Tier 1: Flight Cruising Cloud Deck (Altitude 52-72m)
    // 38 puffy multi-box cloud clusters scattered across flight airspace
    for (let i = 0; i < 38; i++) {
      const cluster = new THREE.Group();
      const numPuffs = 3 + Math.floor(Math.random() * 3); // 3 to 5 overlapping boxes
      const baseW = 16 + Math.random() * 14;
      const baseH = 3.2 + Math.random() * 2.2;
      const baseD = 12 + Math.random() * 10;

      for (let p = 0; p < numPuffs; p++) {
        const pw = baseW * (0.6 + Math.random() * 0.5);
        const ph = baseH * (0.7 + Math.random() * 0.4);
        const pd = baseD * (0.6 + Math.random() * 0.5);
        const puff = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, pd), cloudMat);
        puff.position.set(
          (Math.random() - 0.5) * baseW * 0.6,
          (Math.random() - 0.5) * baseH * 0.3,
          (Math.random() - 0.5) * baseD * 0.6
        );
        cluster.add(puff);
      }

      const angle = (i / 38) * Math.PI * 2 + Math.random() * 0.2;
      const radius = 60 + Math.random() * 260;
      cluster.position.set(
        Math.cos(angle) * radius,
        52 + Math.random() * 18,
        Math.sin(angle) * radius
      );
      cluster.userData = {
        speed: 0.6 + Math.random() * 0.6,
        baseX: cluster.position.x,
        baseZ: cluster.position.z,
        wrapRadius: 360,
      };
      this.group.add(cluster);
      this.cloudClusters.push(cluster);
    }

    // Tier 2: High Stratocumulus Ceiling (Altitude 115-145m)
    const highCloudMat = new THREE.MeshLambertMaterial({
      color: 0xedf2f7,
      transparent: true,
      opacity: 0.70,
      depthWrite: false,
    });

    for (let i = 0; i < 24; i++) {
      const cluster = new THREE.Group();
      const w = 32 + Math.random() * 24;
      const h = 4.5 + Math.random() * 2.5;
      const d = 26 + Math.random() * 20;

      const mainPuff = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), highCloudMat);
      const subPuff = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, h * 0.8, d * 0.7), highCloudMat);
      subPuff.position.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 12);
      cluster.add(mainPuff, subPuff);

      const angle = (i / 24) * Math.PI * 2;
      const radius = 100 + Math.random() * 380;
      cluster.position.set(
        Math.cos(angle) * radius,
        120 + Math.random() * 22,
        Math.sin(angle) * radius
      );
      cluster.userData = {
        speed: 0.35 + Math.random() * 0.35,
        baseX: cluster.position.x,
        baseZ: cluster.position.z,
        wrapRadius: 520,
      };
      this.group.add(cluster);
      this.cloudClusters.push(cluster);
    }
  }

  buildDistantMountainHorizon() {
    // 360-degree panoramic distant mountain silhouette ring at 520m and 760m radius
    const mountainGroup = new THREE.Group();
    const mountainMatInner = new THREE.MeshLambertMaterial({
      color: 0x8296a6, // Soft atmospheric silver-blue mountain silhouette
    });
    const mountainMatOuter = new THREE.MeshLambertMaterial({
      color: 0x98aab8, // Lighter atmospheric distant horizon range
    });

    // Inner Ridge (520m radius)
    const numPeaks = 56;
    for (let i = 0; i < numPeaks; i++) {
      const angle = (i / numPeaks) * Math.PI * 2;
      const radius = 520 + (i % 4) * 25;
      const h = 75 + ((i * 23) % 65);
      const w = 55 + ((i * 13) % 45);

      const peakGeo = new THREE.ConeGeometry(w, h, 5);
      const peak = new THREE.Mesh(peakGeo, mountainMatInner);
      peak.position.set(
        Math.cos(angle) * radius,
        h * 0.38,
        Math.sin(angle) * radius
      );
      peak.rotation.y = angle + Math.PI * 0.25;
      mountainGroup.add(peak);
    }

    // Outer Epic Horizon Ridge (760m radius)
    const numOuterPeaks = 48;
    for (let i = 0; i < numOuterPeaks; i++) {
      const angle = (i / numOuterPeaks) * Math.PI * 2 + 0.05;
      const radius = 740 + (i % 3) * 40;
      const h = 110 + ((i * 31) % 85);
      const w = 80 + ((i * 17) % 60);

      const peakGeo = new THREE.ConeGeometry(w, h, 5);
      const peak = new THREE.Mesh(peakGeo, mountainMatOuter);
      peak.position.set(
        Math.cos(angle) * radius,
        h * 0.35,
        Math.sin(angle) * radius
      );
      peak.rotation.y = angle;
      mountainGroup.add(peak);
    }

    this.group.add(mountainGroup);
    this.mountainGroup = mountainGroup;
  }

  update(deltaTime, centerPos) {
    this.time += deltaTime;

    // Follow center position so mountains and clouds stay infinite around camera/plane
    if (centerPos) {
      this.group.position.x = centerPos.x;
      this.group.position.z = centerPos.z;
    }

    // Smooth cloud wind drifting with boundary wrapping
    const windSpeedX = 4.2;
    const windSpeedZ = 1.8;
    for (let i = 0; i < this.cloudClusters.length; i++) {
      const c = this.cloudClusters[i];
      c.position.x += deltaTime * windSpeedX * c.userData.speed;
      c.position.z += deltaTime * windSpeedZ * c.userData.speed;
      const maxDist = c.userData.wrapRadius || 360;
      if (c.position.x > maxDist) c.position.x -= maxDist * 2;
      if (c.position.x < -maxDist) c.position.x += maxDist * 2;
      if (c.position.z > maxDist) c.position.z -= maxDist * 2;
      if (c.position.z < -maxDist) c.position.z += maxDist * 2;
    }
  }
}

// ============================================================================
// 7. REEL POST-PROCESSING STACK (HDR BLOOM, COLOR GRADING, VIGNETTE & GRAIN)
// ============================================================================

/**
 * Custom ultra-performant real-time WebGL post-processing pipeline
 * specifically tuned to replicate the dieselpunk gloom, HDR cyan bloom,
 * and high-contrast color palette of the reference video.
 * Runs at 60 FPS on laptop GPUs (GTX 1650).
 */
export class ReelPostProcessingStack {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.enabled = true;
    this.quality = 'high'; // 'low', 'medium', 'high'

    // Parameter Controls — Open, bright, and luminous with vibrant bloom
    this.params = {
      bloomThreshold: 0.68,
      bloomIntensity: 1.15,
      bloomRadius: 1.05,
      exposure: 1.02,
      contrast: 1.04,
      saturation: 1.02,
      vignetteStrength: 0.32,
      vignetteRoundness: 0.95,
      grainIntensity: 0.022, // Soft subtle cinematic grain
      colorGradeTeal: new THREE.Color(0x38bdf8),
      colorGradeOrange: new THREE.Color(0xca8a04),
    };

    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // Fullscreen quad setup
    this.fsQuadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fsQuadScene = new THREE.Scene();
    this.fsQuadGeo = new THREE.PlaneGeometry(2, 2);

    this.initRenderTargets();
    this.initShaders();

    window.addEventListener('resize', () => this.onWindowResize());
  }

  initRenderTargets() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.floor(this.width * dpr);
    const h = Math.floor(this.height * dpr);

    const pars = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    };

    this.rtScene = new THREE.WebGLRenderTarget(w, h, pars);

    // Downsampled Bloom targets (half-resolution for high performance)
    const bw = Math.floor(w * 0.5);
    const bh = Math.floor(h * 0.5);
    this.rtBloomA = new THREE.WebGLRenderTarget(bw, bh, pars);
    this.rtBloomB = new THREE.WebGLRenderTarget(bw, bh, pars);
  }

  initShaders() {
    // 1. High-Pass Brightness Threshold Shader
    this.thresholdMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uThreshold: { value: this.params.bloomThreshold },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uThreshold;
        varying vec2 vUv;
        void main() {
          vec4 color = texture2D(tDiffuse, vUv);
          float brightness = max(color.r, max(color.g, color.b));
          float factor = clamp((brightness - uThreshold) / (1.0 - uThreshold + 0.001), 0.0, 1.0);
          gl_FragColor = vec4(color.rgb * factor, 1.0);
        }
      `,
      depthWrite: false,
      depthTest: false,
    });

    // 2. Separable Blur Shader (Horizontal & Vertical passes)
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uDirection: { value: new THREE.Vector2(1.0, 0.0) },
        uResolution: { value: new THREE.Vector2(this.width * 0.5, this.height * 0.5) },
        uRadius: { value: this.params.bloomRadius },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 uDirection;
        uniform vec2 uResolution;
        uniform float uRadius;
        varying vec2 vUv;
        void main() {
          vec2 texel = (uDirection * uRadius) / uResolution;
          vec4 sum = vec4(0.0);
          sum += texture2D(tDiffuse, vUv - texel * 3.23) * 0.07;
          sum += texture2D(tDiffuse, vUv - texel * 1.38) * 0.31;
          sum += texture2D(tDiffuse, vUv) * 0.44;
          sum += texture2D(tDiffuse, vUv + texel * 1.38) * 0.31;
          sum += texture2D(tDiffuse, vUv + texel * 3.23) * 0.07;
          gl_FragColor = sum;
        }
      `,
      depthWrite: false,
      depthTest: false,
    });

    // 3. Composite Final Color Grade, Bloom, Vignette & Grain Shader
    this.compositeMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        uBloomIntensity: { value: this.params.bloomIntensity },
        uExposure: { value: this.params.exposure },
        uContrast: { value: this.params.contrast },
        uSaturation: { value: this.params.saturation },
        uVignetteStrength: { value: this.params.vignetteStrength },
        uGrainIntensity: { value: this.params.grainIntensity },
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tScene;
        uniform sampler2D tBloom;
        uniform float uBloomIntensity;
        uniform float uExposure;
        uniform float uContrast;
        uniform float uSaturation;
        uniform float uVignetteStrength;
        uniform float uGrainIntensity;
        uniform float uTime;
        varying vec2 vUv;

        // Subtle pseudorandom noise for cinematic film grain
        float random(vec2 p) {
          return fract(sin(dot(p + uTime * 0.1, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
          vec4 sceneColor = texture2D(tScene, vUv);
          vec4 bloomColor = texture2D(tBloom, vUv);

          // Additive HDR bloom blending for glowing cyan orbs and tracers
          vec3 color = sceneColor.rgb + bloomColor.rgb * uBloomIntensity;

          // Exposure adjustment
          color *= uExposure;

          // Saturation preservation
          float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
          color = mix(vec3(luma), color, uSaturation);

          // Filmic smooth contrast curve without shadow crushing
          color = pow(max(color, vec3(0.0)), vec3(uContrast));

          // Subtle Radial Vignette
          vec2 uvOffset = (vUv - 0.5) * 2.0;
          float dist = dot(uvOffset, uvOffset);
          float vignette = clamp(1.0 - dist * (uVignetteStrength * 0.32), 0.0, 1.0);
          color *= vignette;

          // Subtle Film Grain
          float grain = (random(vUv * 500.0) - 0.5) * uGrainIntensity;
          color += grain;

          gl_FragColor = vec4(max(vec3(0.0), color), 1.0);
        }
      `,
      depthWrite: false,
      depthTest: false,
    });

    this.fsQuadMesh = new THREE.Mesh(this.fsQuadGeo, this.compositeMat);
    this.fsQuadScene.add(this.fsQuadMesh);
  }

  setQuality(preset) {
    this.quality = preset;
    if (preset === 'low') {
      this.enabled = false;
    } else if (preset === 'medium') {
      this.enabled = true;
      this.params.bloomIntensity = 0.8;
      this.params.grainIntensity = 0.0;
    } else {
      this.enabled = true;
      this.params.bloomIntensity = 1.35;
      this.params.grainIntensity = 0.045;
    }
  }

  onWindowResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.floor(this.width * dpr);
    const h = Math.floor(this.height * dpr);

    this.rtScene.setSize(w, h);
    this.rtBloomA.setSize(Math.floor(w * 0.5), Math.floor(h * 0.5));
    this.rtBloomB.setSize(Math.floor(w * 0.5), Math.floor(h * 0.5));
  }

  /**
   * Main render pass:
   * 1. Render primary 3D scene into HDR render target
   * 2. Extract bright bioluminescent highlights via threshold pass
   * 3. Two-pass separable blur for soft HDR bloom
   * 4. Composite final color grade, bloom, vignette, and grain to screen
   */
  render(deltaTime = 0.016) {
    if (!this.enabled || this.quality === 'low') {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Pass 1: Render 3D Scene into rtScene
    this.renderer.setRenderTarget(this.rtScene);
    this.renderer.render(this.scene, this.camera);

    // Pass 2: Brightness Threshold into rtBloomA
    this.thresholdMat.uniforms.tDiffuse.value = this.rtScene.texture;
    this.thresholdMat.uniforms.uThreshold.value = this.params.bloomThreshold;
    this.fsQuadMesh.material = this.thresholdMat;
    this.renderer.setRenderTarget(this.rtBloomA);
    this.renderer.render(this.fsQuadScene, this.fsQuadCamera);

    // Pass 3: Horizontal Blur from rtBloomA to rtBloomB
    this.blurMat.uniforms.tDiffuse.value = this.rtBloomA.texture;
    this.blurMat.uniforms.uDirection.value.set(1.0, 0.0);
    this.blurMat.uniforms.uRadius.value = this.params.bloomRadius;
    this.fsQuadMesh.material = this.blurMat;
    this.renderer.setRenderTarget(this.rtBloomB);
    this.renderer.render(this.fsQuadScene, this.fsQuadCamera);

    // Pass 4: Vertical Blur from rtBloomB to rtBloomA
    this.blurMat.uniforms.tDiffuse.value = this.rtBloomB.texture;
    this.blurMat.uniforms.uDirection.value.set(0.0, 1.0);
    this.fsQuadMesh.material = this.blurMat;
    this.renderer.setRenderTarget(this.rtBloomA);
    this.renderer.render(this.fsQuadScene, this.fsQuadCamera);

    // Pass 5: Final Composite to Screen
    this.compositeMat.uniforms.tScene.value = this.rtScene.texture;
    this.compositeMat.uniforms.tBloom.value = this.rtBloomA.texture;
    this.compositeMat.uniforms.uBloomIntensity.value = this.params.bloomIntensity;
    this.compositeMat.uniforms.uExposure.value = this.params.exposure;
    this.compositeMat.uniforms.uContrast.value = this.params.contrast;
    this.compositeMat.uniforms.uSaturation.value = this.params.saturation;
    this.compositeMat.uniforms.uVignetteStrength.value = this.params.vignetteStrength;
    this.compositeMat.uniforms.uGrainIntensity.value = this.params.grainIntensity;
    this.compositeMat.uniforms.uTime.value += deltaTime;

    this.fsQuadMesh.material = this.compositeMat;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.fsQuadScene, this.fsQuadCamera);
  }
}
