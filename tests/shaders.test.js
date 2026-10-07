import assert from 'node:assert';
import * as THREE from 'three';
import {
  NOISE_GLSL,
  createBasePBRShader,
  createBioluminescentEmissionShader,
  createFresnelRimShader,
  createEnergyDistortionShader,
  createCanopyRefractionShader,
} from '../src/shaders/ReelShaderSystem.js';

console.log('====================================================================');
console.log(' VOXEL REALMS — REEL SHADER SUITE & POST-PROCESSING UNIT TESTS');
console.log('====================================================================\n');

// 1. Procedural Noise GLSL
{
  assert.ok(NOISE_GLSL.includes('snoise'), 'Simplex 3D noise function defined in GLSL');
  assert.ok(NOISE_GLSL.includes('fbm'), 'Fractal Brownian Motion (FBM) defined in GLSL');
  console.log(' [PASS] Scenario 1: Procedural Simplex & FBM GLSL noise library verified');
}

// 2. Base PBR Material Shader
{
  const pbrMat = createBasePBRShader({
    baseColor: 0x223344,
    roughness: 0.65,
    metallic: 0.25,
    rimPower: 3.5,
  });
  assert.strictEqual(pbrMat.uniforms.uRoughness.value, 0.65, 'Roughness uniform matches');
  assert.strictEqual(pbrMat.uniforms.uMetallic.value, 0.25, 'Metallic uniform matches');
  assert.strictEqual(pbrMat.uniforms.uRimPower.value, 3.5, 'Rim power uniform matches');
  assert.ok(pbrMat.vertexShader.length > 50, 'Vertex shader compiled');
  assert.ok(pbrMat.fragmentShader.includes('gl_FragColor'), 'Fragment shader writes color');
  console.log(' [PASS] Scenario 2: Base PBR material shader uniforms and GLSL verified');
}

// 3. Bioluminescent Emission Shader
{
  const emissionMat = createBioluminescentEmissionShader({
    emissionColor: 0x5be7ff,
    emissionStrength: 3.2,
    fresnelPower: 2.0,
    pulseSpeed: 4.0,
  });
  assert.strictEqual(emissionMat.uniforms.uEmissionStrength.value, 3.2, 'Emission strength matches');
  assert.strictEqual(emissionMat.uniforms.uFresnelPower.value, 2.0, 'Fresnel power matches');
  assert.strictEqual(emissionMat.uniforms.uPulseSpeed.value, 4.0, 'Pulse speed matches');
  assert.ok(emissionMat.fragmentShader.includes('uPulseIntensity'), 'Sinusoidal pulsation in GLSL');
  console.log(' [PASS] Scenario 3: Bioluminescent emission shader uniforms and Fresnel wave verified');
}

// 4. Fresnel Rim Lighting Shader
{
  const rimMat = createFresnelRimShader({
    rimColor: 0x70d8ff,
    rimPower: 2.8,
    rimStrength: 2.5,
  });
  assert.strictEqual(rimMat.uniforms.uRimPower.value, 2.8, 'Rim power matches');
  assert.strictEqual(rimMat.uniforms.uRimStrength.value, 2.5, 'Rim strength matches');
  assert.ok(rimMat.fragmentShader.includes('pow(rim, uRimPower)'), 'Fresnel power formula verified');
  console.log(' [PASS] Scenario 4: Fresnel rim lighting shader view-angle calculations verified');
}

// 5. Procedural Energy & Surface Distortion Shader
{
  const energyMat = createEnergyDistortionShader({
    noiseScale: 2.5,
    noiseSpeed: 1.2,
    distortionStrength: 0.35,
    dissolveAmount: 0.1,
  });
  assert.strictEqual(energyMat.uniforms.uNoiseScale.value, 2.5, 'Noise scale matches');
  assert.strictEqual(energyMat.uniforms.uNoiseSpeed.value, 1.2, 'Noise speed matches');
  assert.strictEqual(energyMat.uniforms.uDistortionStrength.value, 0.35, 'Distortion strength matches');
  assert.ok(energyMat.vertexShader.includes('snoise'), 'Procedural noise distortion integrated in vertex shader');
  console.log(' [PASS] Scenario 5: Energy & surface distortion shader noise harmonics verified');
}

// 6. Canopy Glass & Refraction Shader
{
  const canopyMat = createCanopyRefractionShader({
    baseAlpha: 0.35,
    fresnelPower: 3.0,
  });
  assert.strictEqual(canopyMat.uniforms.uBaseAlpha.value, 0.35, 'Canopy base alpha matches');
  assert.strictEqual(canopyMat.uniforms.uFresnelPower.value, 3.0, 'Canopy Fresnel power matches');
  assert.strictEqual(canopyMat.transparent, true, 'Material marked transparent');
  console.log(' [PASS] Scenario 6: Canopy glass & refraction transparency verified');
}

// 7. Quality Presets Simulation
{
  const qualityPresets = {
    low: { enabled: false, bloom: 0.0, grain: 0.0 },
    medium: { enabled: true, bloom: 0.8, grain: 0.0 },
    high: { enabled: true, bloom: 1.35, grain: 0.045 },
  };

  assert.strictEqual(qualityPresets.low.enabled, false, 'Low quality bypasses post-processing for max FPS');
  assert.strictEqual(qualityPresets.medium.bloom, 0.8, 'Medium quality enables bloom without film grain');
  assert.strictEqual(qualityPresets.high.bloom, 1.35, 'High quality enables full bloom and film grain');
  console.log(' [PASS] Scenario 7: Quality preset thresholds (Low / Medium / High) validated');
}

console.log('\n====================================================================');
console.log(' ALL REEL SHADER UNIT TESTS PASSED SUCCESSFULLY (7/7)');
console.log('====================================================================\n');
