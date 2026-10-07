import * as THREE from 'three';

// ============================================================================
// GoldenSunsetShaderSystem.js — Golden Hour Sunset Atmospheric System & Shaders
// Recreates the breathtaking golden sunset atmosphere, volumetric god-ray canopy,
// sea-level cloud inversion, towering basalt sea arches, and distant citadel
// from the viral Dragon Rider flight showcase (@enderlulz).
// ============================================================================

/**
 * 1. PBR Material with Golden Sunset Fresnel Rim Lighting
 * Used on the Dragon Mount scales, saddle, and monolithic stone arches.
 */
export function createGoldenSunsetRimShader(options = {}) {
  const baseColor = new THREE.Color(options.baseColor ?? 0x121418);
  const rimColor = new THREE.Color(options.rimColor ?? 0xff9922); // Radiant amber-gold rim
  const rimPower = options.rimPower ?? 2.8;
  const rimStrength = options.rimStrength ?? 1.8;
  const roughness = options.roughness ?? 0.55;
  const metalness = options.metalness ?? 0.25;

  const mat = new THREE.MeshStandardMaterial({
    color: baseColor,
    roughness: roughness,
    metalness: metalness,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSunRimColor = { value: rimColor };
    shader.uniforms.uSunRimPower = { value: rimPower };
    shader.uniforms.uSunRimStrength = { value: rimStrength };
    shader.uniforms.uSunDir = { value: new THREE.Vector3(0.2, 0.25, 0.95).normalize() };

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `
      #include <common>
      uniform vec3 uSunRimColor;
      uniform float uSunRimPower;
      uniform float uSunRimStrength;
      uniform vec3 uSunDir;
      `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `
      #include <dithering_fragment>
      // Sunset Fresnel Rim Light
      vec3 viewDirNorm = normalize(vViewPosition);
      vec3 normalNorm = normalize(vNormal);
      float fresnel = 1.0 - max(0.0, dot(viewDirNorm, normalNorm));
      fresnel = pow(fresnel, uSunRimPower) * uSunRimStrength;

      // Wrap-around warm sunset light contribution
      float sunDot = max(0.0, dot(normalNorm, uSunDir) * 0.5 + 0.5);
      vec3 goldenRim = uSunRimColor * fresnel * (0.6 + sunDot * 0.8);
      gl_FragColor.rgb += goldenRim;
      `
    );
  };

  return mat;
}

/**
 * 2. Translucent Dragon Wing Membrane Shader
 * Features warm amber subsurface scattering when backlit against the setting sun.
 */
export function createTranslucentWingShader(options = {}) {
  const membraneColor = new THREE.Color(options.baseColor ?? 0x221410);
  const backlitColor = new THREE.Color(options.backlitColor ?? 0xff8811);

  const mat = new THREE.MeshStandardMaterial({
    color: membraneColor,
    roughness: 0.72,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBacklitColor = { value: backlitColor };
    shader.uniforms.uSunDir = { value: new THREE.Vector3(0.2, 0.25, 0.95).normalize() };

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `
      #include <common>
      uniform vec3 uBacklitColor;
      uniform vec3 uSunDir;
      `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `
      #include <dithering_fragment>
      // Subsurface backlit transmission through thin dragon wing membrane
      vec3 vDir = normalize(vViewPosition);
      float backLight = max(0.0, -dot(vDir, uSunDir));
      backLight = pow(backLight, 2.5) * 1.4;
      gl_FragColor.rgb += uBacklitColor * backLight;
      `
    );
  };

  return mat;
}

/**
 * 3. Atmospheric Golden Sunset Sky Enclosure
 * Builds:
 * 1. Low-Angle Radiant Sunset Sun with glowing corona.
 * 2. Volumetric God Rays radiating from the horizon.
 * 3. Sea-Level Golden Cloud Inversion Blanket ($y = 22$–$36\text{m}$) reflecting sunlight like liquid gold.
 * 4. Mid-Altitude Golden Cumulus Deck ($y = 85$–$145\text{m}$).
 * 5. Monolithic Basalt Sea Arches and Needle Spires emerging from the golden cloud sea.
 * 6. Distant Fantasy Spired Citadel silhouette on the horizon.
 */
export class GoldenSunsetAtmosphere {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'Golden_Sunset_Atmosphere_Enclosure';
    this.scene.add(this.group);

    this.cloudClusters = [];
    this.godRays = [];
    this.time = 0;

    this.buildSunsetSunAndGodRays();
    this.buildCloudInversionSea();
    this.buildGoldenCumulusClouds();
    this.buildMonolithicRockArches();
    this.buildDistantCitadelSilhouette();
  }

  buildSunsetSunAndGodRays() {
    // 1. Blinding Low-Angle Sunset Sun Disc on Horizon
    const sunGroup = new THREE.Group();
    sunGroup.name = 'Sunset_Sun_Disc_Group';

    // Core bright sun sphere
    const sunCoreMat = new THREE.MeshBasicMaterial({
      color: 0xfff0aa,
    });
    const sunCore = new THREE.Mesh(new THREE.SphereGeometry(32, 16, 16), sunCoreMat);
    sunCore.position.set(0, 42, 680); // Low on horizon in +Z
    sunGroup.add(sunCore);

    // Glowing Sunset Corona Disc
    const coronaMat = new THREE.MeshBasicMaterial({
      color: 0xff9515,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const corona = new THREE.Mesh(new THREE.CircleGeometry(120, 32), coronaMat);
    corona.position.set(0, 42, 675);
    corona.rotation.y = Math.PI;
    sunGroup.add(corona);

    // Outer Golden Glow Halo
    const outerHaloMat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const outerHalo = new THREE.Mesh(new THREE.CircleGeometry(260, 32), outerHaloMat);
    outerHalo.position.set(0, 42, 670);
    outerHalo.rotation.y = Math.PI;
    sunGroup.add(outerHalo);

    // 2. Volumetric God Rays radiating outwards and upwards through cloud breaks
    const rayMat = new THREE.MeshBasicMaterial({
      color: 0xffd277,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const numRays = 18;
    for (let i = 0; i < numRays; i++) {
      const angle = -Math.PI * 0.38 + (i / numRays) * (Math.PI * 0.76);
      const length = 550 + (i % 3) * 120;
      const width = 28 + (i % 4) * 16;

      const rayGeo = new THREE.PlaneGeometry(width, length);
      const ray = new THREE.Mesh(rayGeo, rayMat);
      ray.position.set(Math.sin(angle) * 180, 42 + Math.cos(angle) * 120, 640);
      ray.rotation.z = -angle * 0.85;
      sunGroup.add(ray);
      this.godRays.push(ray);
    }

    this.group.add(sunGroup);
    this.sunGroup = sunGroup;
  }

  buildCloudInversionSea() {
    // Sea-Level Golden Cloud Inversion Blanket (Liquid Gold horizon reflection)
    const seaMat = new THREE.MeshLambertMaterial({
      color: 0xf5a32b,
      transparent: true,
      opacity: 0.88,
    });

    // Vast horizontal planar cloud sea deck at y = 24m
    const seaPuffs = new THREE.Group();
    seaPuffs.name = 'Cloud_Inversion_Sea_Deck';

    for (let i = 0; i < 48; i++) {
      const angle = (i / 48) * Math.PI * 2;
      const dist = 60 + Math.random() * 520;
      const w = 45 + Math.random() * 55;
      const d = 45 + Math.random() * 55;
      const h = 6 + Math.random() * 6;

      const puff = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), seaMat);
      puff.position.set(
        Math.cos(angle) * dist,
        22 + Math.random() * 6,
        Math.sin(angle) * dist
      );
      seaPuffs.add(puff);
    }

    this.group.add(seaPuffs);
  }

  buildGoldenCumulusClouds() {
    // Upper golden cumulus clouds glowing amber under the setting sun
    const cumulusMat = new THREE.MeshLambertMaterial({
      color: 0xffca7a, // Radiant warm golden amber
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });

    const highCirrusMat = new THREE.MeshLambertMaterial({
      color: 0xe69138, // Deep orange sunset cirrus
      transparent: true,
      opacity: 0.60,
      depthWrite: false,
    });

    // 36 Mid-Altitude Cumulus Clusters
    for (let i = 0; i < 36; i++) {
      const cluster = new THREE.Group();
      const numPuffs = 4 + Math.floor(Math.random() * 4);
      const baseW = 24 + Math.random() * 28;
      const baseH = 6 + Math.random() * 4;
      const baseD = 18 + Math.random() * 20;

      for (let p = 0; p < numPuffs; p++) {
        const pw = baseW * (0.6 + Math.random() * 0.5);
        const ph = baseH * (0.6 + Math.random() * 0.4);
        const pd = baseD * (0.6 + Math.random() * 0.5);
        const puff = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, pd), cumulusMat);
        puff.position.set(
          (Math.random() - 0.5) * baseW * 0.7,
          (Math.random() - 0.5) * baseH * 0.35,
          (Math.random() - 0.5) * baseD * 0.7
        );
        cluster.add(puff);
      }

      const angle = (i / 36) * Math.PI * 2;
      const radius = 90 + Math.random() * 420;
      cluster.position.set(
        Math.cos(angle) * radius,
        85 + Math.random() * 35,
        Math.sin(angle) * radius
      );
      cluster.userData = {
        speed: 0.5 + Math.random() * 0.5,
        wrapRadius: 480,
      };
      this.group.add(cluster);
      this.cloudClusters.push(cluster);
    }

    // High Altitude Golden Cirrus Streaks
    for (let i = 0; i < 18; i++) {
      const w = 60 + Math.random() * 70;
      const h = 3.5;
      const d = 16 + Math.random() * 12;
      const streak = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), highCirrusMat);
      const angle = (i / 18) * Math.PI * 2;
      const radius = 140 + Math.random() * 460;
      streak.position.set(
        Math.cos(angle) * radius,
        145 + Math.random() * 25,
        Math.sin(angle) * radius
      );
      streak.rotation.y = angle + 0.3;
      this.group.add(streak);
    }
  }

  buildMonolithicRockArches() {
    // Recreates the colossal natural stone arches, sea stacks, and needle spires from the reel!
    const rockMat = createGoldenSunsetRimShader({
      baseColor: 0x241d1a, // Dark basalt obsidian rock
      rimColor: 0xffa033,  // Catching golden hour sunset rim light
      rimPower: 2.5,
      rimStrength: 2.2,
      roughness: 0.75,
    });

    const monolithGroup = new THREE.Group();
    monolithGroup.name = 'Monolithic_Stone_Arches_Group';

    // 1. Signature Colossal Stone Arch on Right (as seen directly in reel screenshot!)
    const archGroup = new THREE.Group();
    archGroup.position.set(110, 24, 180);

    // Left Pillar of Arch
    const pL = new THREE.Mesh(new THREE.BoxGeometry(16, 75, 18), rockMat);
    pL.position.set(-24, 35, 0);
    pL.rotation.z = -0.12;
    archGroup.add(pL);

    // Right Pillar of Arch
    const pR = new THREE.Mesh(new THREE.BoxGeometry(18, 90, 20), rockMat);
    pR.position.set(28, 42, 0);
    pR.rotation.z = 0.08;
    archGroup.add(pR);

    // Curved Arch Keystone Span across top
    const span = new THREE.Mesh(new THREE.BoxGeometry(62, 18, 22), rockMat);
    span.position.set(2, 78, 0);
    span.rotation.z = -0.06;
    archGroup.add(span);

    monolithGroup.add(archGroup);

    // 2. Colossal Stone Spires & Needle Stacks rising from the golden cloud sea
    const spireCoords = [
      { x: -95, z: 140, h: 85, w: 14 },
      { x: -55, z: 210, h: 105, w: 16 },
      { x: -140, z: 280, h: 70, w: 12 },
      { x: 160, z: 260, h: 95, w: 18 },
      { x: 75, z: 340, h: 115, w: 22 },
      { x: -80, z: 390, h: 80, w: 15 },
      { x: 220, z: 190, h: 65, w: 12 },
      { x: -180, z: 120, h: 90, w: 16 },
    ];

    spireCoords.forEach((s, idx) => {
      const spire = new THREE.Mesh(new THREE.ConeGeometry(s.w, s.h, 6), rockMat);
      spire.position.set(s.x, 24 + s.h * 0.45, s.z);
      spire.rotation.y = (idx * 0.7);
      monolithGroup.add(spire);
    });

    this.group.add(monolithGroup);
  }

  buildDistantCitadelSilhouette() {
    // Distant Fantasy Spired Citadel / Castle on the horizon in front of the sun
    const citadelMat = new THREE.MeshBasicMaterial({
      color: 0x3d2415, // Dark silhouette against blinding sunset
    });

    const castleGroup = new THREE.Group();
    castleGroup.position.set(0, 36, 590); // Directly aligned with sunset horizon

    // Central Grand Keep Tower
    const keep = new THREE.Mesh(new THREE.BoxGeometry(18, 55, 18), citadelMat);
    keep.position.set(0, 25, 0);
    const keepSpire = new THREE.Mesh(new THREE.ConeGeometry(12, 35, 6), citadelMat);
    keepSpire.position.set(0, 70, 0);
    castleGroup.add(keep, keepSpire);

    // Flanking Spires & Wall Ramparts
    [-22, 22].forEach(ox => {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(6, 7, 45, 8), citadelMat);
      tower.position.set(ox, 20, 0);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(7, 25, 6), citadelMat);
      spire.position.set(ox, 55, 0);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(16, 22, 6), citadelMat);
      wall.position.set(ox * 0.5, 11, 0);
      castleGroup.add(tower, spire, wall);
    });

    this.group.add(castleGroup);
  }

  update(deltaTime, centerPos) {
    this.time += deltaTime;

    // Follow center coordinates so horizon stays vast and infinite around camera/mount
    if (centerPos) {
      this.group.position.x = centerPos.x;
      this.group.position.z = centerPos.z;
    }

    // Drifting clouds
    const windSpeed = 3.6;
    for (let i = 0; i < this.cloudClusters.length; i++) {
      const c = this.cloudClusters[i];
      c.position.x += deltaTime * windSpeed * c.userData.speed;
      const maxR = c.userData.wrapRadius || 480;
      if (c.position.x > maxR) c.position.x -= maxR * 2;
      if (c.position.x < -maxR) c.position.x += maxR * 2;
    }

    // Subtle breathing pulse on god rays
    for (let i = 0; i < this.godRays.length; i++) {
      const r = this.godRays[i];
      r.material.opacity = 0.14 + Math.sin(this.time * 1.5 + i * 0.4) * 0.04;
    }
  }
}
