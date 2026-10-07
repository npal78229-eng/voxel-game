import * as THREE from 'three';

// ============================================================================
// Phase 1 & Phase 3 — Lighting Pass (Ambient + Player-Tracking Sunlight)
// ============================================================================

export function setupLighting(scene) {
  // 1. Ambient Light: Soft, luminous overcast sky fill so terrain and shadows stay clear
  const ambientLight = new THREE.AmbientLight(0xdde8f2, 0.82);
  scene.add(ambientLight);

  // 2. Sky/Ground Hemisphere Light
  const hemiLight = new THREE.HemisphereLight(0xe4edf5, 0x485842, 0.55);
  hemiLight.position.set(0, 60, 0);
  scene.add(hemiLight);

  // 3. Directional Sunlight illuminating landscape and aircraft with soft shadows
  const sunLight = new THREE.DirectionalLight(0xfff8ee, 1.55);
  sunLight.position.set(35, 80, 25);
  sunLight.castShadow = true;

  sunLight.shadow.mapSize.width = 1024;
  sunLight.shadow.mapSize.height = 1024;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 160;
  const d = 55;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;

  scene.add(sunLight);
  scene.add(sunLight.target);

  function updateSunFollow(playerPosition) {
    const py = playerPosition.y ?? 20;
    sunLight.position.set(
      playerPosition.x + 35,
      py + 65,
      playerPosition.z + 25
    );
    sunLight.target.position.set(playerPosition.x, py, playerPosition.z);
    sunLight.target.updateMatrixWorld();
  }

  return { ambientLight, hemiLight, sunLight, updateSunFollow };
}
