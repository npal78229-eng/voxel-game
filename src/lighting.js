import * as THREE from 'three';

// ============================================================================
// Phase 1 & Phase 3 — Lighting Pass (Ambient + Player-Tracking Sunlight)
// ============================================================================

export function setupLighting(scene) {
  // 1. Ambient Light: Soft base illumination so caves & shaded cliffs remain readable
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.44);
  scene.add(ambientLight);

  // 2. Sky/Ground Hemisphere Light
  const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x4d3319, 0.28);
  hemiLight.position.set(0, 40, 0);
  scene.add(hemiLight);

  // 3. Directional Sunlight angled asymmetrically so top (+Y) faces are brightest,
  //    +X/+Z faces are mid-tone, and -X/-Z faces are shaded
  const sunLight = new THREE.DirectionalLight(0xfff5e0, 1.45);
  sunLight.position.set(24, 42, 18);
  sunLight.castShadow = true;

  sunLight.shadow.mapSize.width = 1024;
  sunLight.shadow.mapSize.height = 1024;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 110;
  const d = 40;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;

  scene.add(sunLight);
  scene.add(sunLight.target);

  function updateSunFollow(playerPosition) {
    sunLight.position.set(
      playerPosition.x + 24,
      42,
      playerPosition.z + 18
    );
    sunLight.target.position.set(playerPosition.x, 0, playerPosition.z);
    sunLight.target.updateMatrixWorld();
  }

  return { ambientLight, hemiLight, sunLight, updateSunFollow };
}
