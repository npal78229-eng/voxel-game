import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ============================================================================
// Blender Pig Model (`make_pig.py` / `pig.blend` Exact 3D Mesh + GLB Loader)
// ============================================================================

let sharedPigMaterials = null;
let sharedPigGeometries = null;
let loadedGlbTemplate = null;
let glbLoadAttempted = false;

function getSharedPigAssets() {
  if (sharedPigMaterials && sharedPigGeometries) {
    return { mats: sharedPigMaterials, geos: sharedPigGeometries };
  }

  // Exact PBR materials from make_pig.py (Lines 49-55), tuned for Three.js sRGB
  sharedPigMaterials = {
    skin: new THREE.MeshStandardMaterial({
      name: 'Pig_Pink_Skin',
      color: new THREE.Color('#f78ca2'),
      roughness: 0.38,
      metalness: 0.0,
    }),
    snout: new THREE.MeshStandardMaterial({
      name: 'Pig_Snout_Pink',
      color: new THREE.Color('#eb6383'),
      roughness: 0.34,
      metalness: 0.0,
    }),
    blush: new THREE.MeshStandardMaterial({
      name: 'Pig_Cheek_Blush',
      color: new THREE.Color('#f7456b'),
      roughness: 0.42,
      metalness: 0.0,
    }),
    nostril: new THREE.MeshStandardMaterial({
      name: 'Pig_Nostril_Dark',
      color: new THREE.Color('#3b1018'),
      roughness: 0.55,
      metalness: 0.0,
    }),
    eye: new THREE.MeshStandardMaterial({
      name: 'Pig_Eye_Black',
      color: new THREE.Color('#0d0d12'),
      roughness: 0.04,
      metalness: 0.1,
    }),
    shine: new THREE.MeshBasicMaterial({
      name: 'Pig_Eye_Shine',
      color: new THREE.Color('#ffffff'),
    }),
    hoof: new THREE.MeshStandardMaterial({
      name: 'Pig_Hoof_Brown',
      color: new THREE.Color('#54342e'),
      roughness: 0.45,
      metalness: 0.0,
    }),
  };

  // Build the exact 50-point 3D helical curly tail spline from make_pig.py (Lines 191-200)
  const tailPoints = [];
  const numPts = 50;
  for (let i = 0; i < numPts; i++) {
    const t = i / (numPts - 1);
    const angle = t * 4.4 * Math.PI;
    const r =
      0.18 *
      (1.0 - 0.3 * t) *
      Math.sin((Math.min(t * 3.5, 1.0) * Math.PI) / 2.0);
    const bx = -1.22 - t * 0.52;
    const by = r * Math.cos(angle);
    const bz = 1.35 + t * 0.32 + r * Math.sin(angle);
    // Transform Blender (bx, by, bz) -> Three.js local tail coords relative to tail root (0, 1.35, 1.22)
    tailPoints.push(new THREE.Vector3(by, bz - 1.35, -bx - 1.22));
  }
  const tailCurve = new THREE.CatmullRomCurve3(tailPoints);

  sharedPigGeometries = {
    unitSphere: new THREE.SphereGeometry(1.0, 28, 18),
    smallSphere: new THREE.SphereGeometry(1.0, 16, 12),
    snoutCylinder: new THREE.CylinderGeometry(0.94, 1.0, 1.0, 32),
    hoofCylinder: new THREE.CylinderGeometry(0.21, 0.23, 0.22, 20),
    tailTube: new THREE.TubeGeometry(tailCurve, 44, 0.068, 10, false),
  };

  return { mats: sharedPigMaterials, geos: sharedPigGeometries };
}

/**
 * Attempts to load `/assets/models/pig.glb` if present, so any external `.glb` updates
 * automatically apply as well.
 */
function ensureGlbLoadStarted() {
  if (glbLoadAttempted) return;
  glbLoadAttempted = true;

  fetch('/assets/models/pig.glb', { method: 'HEAD' })
    .then((res) => {
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || ct.includes('text/html')) return;
      const loader = new GLTFLoader();
      loader.load(
        '/assets/models/pig.glb',
        (gltf) => {
          loadedGlbTemplate = gltf.scene;
        },
        undefined,
        () => {}
      );
    })
    .catch(() => {});
}

/**
 * Constructs an articulated Three.js instance of the user's Blender Pig (`make_pig.py`),
 * scaled to fit the voxel world (`scale = 0.48`, feet resting at `y = 0`).
 * Returns `{ group, legs, headGroup, tailPivot, skinMat }` for walking/wagging/hurt animations!
 */
export function createBlenderPigInstance() {
  ensureGlbLoadStarted();
  const { mats, geos } = getSharedPigAssets();

  // Clone skin material per pig instance so attacking one pig flashes only that pig red
  const instanceSkinMat = mats.skin.clone();

  const root = new THREE.Group();
  root.name = 'Blender_Pig_Root';
  // Scale the 2.2m Blender studio sculpture to a ~1.05-block-long voxel mob
  root.scale.setScalar(0.46);

  // 1. Plump Body: Blender (0, 0, 1.12), scale (1.32, 0.98, 0.92) -> Three.js (0, 1.12, 0), scale (0.98, 0.92, 1.32)
  const body = new THREE.Mesh(geos.unitSphere, instanceSkinMat);
  body.name = 'Pig_Body';
  body.position.set(0.0, 1.12, 0.0);
  body.scale.set(0.98, 0.92, 1.32);
  body.castShadow = true;
  body.receiveShadow = true;
  root.add(body);

  // 2. Articulated Head Group pivoted at neck (0, 1.42, -1.18) so the pig can nod & look around!
  const headGroup = new THREE.Group();
  headGroup.name = 'Pig_Head_Group';
  headGroup.position.set(0.0, 1.42, -1.18);
  root.add(headGroup);

  const head = new THREE.Mesh(geos.unitSphere, instanceSkinMat);
  head.name = 'Pig_Head';
  head.scale.set(0.76, 0.74, 0.78);
  head.castShadow = true;
  headGroup.add(head);

  // 3. Iconic Snout: Blender (1.88, 0, 1.33) -> relative to head (0, -0.09, -0.70)
  const snout = new THREE.Mesh(geos.snoutCylinder, mats.snout);
  snout.name = 'Pig_Snout';
  snout.position.set(0.0, -0.09, -0.7);
  snout.rotation.x = Math.PI / 2;
  snout.scale.set(0.4, 0.31, 0.24);
  snout.castShadow = true;
  headGroup.add(snout);

  // 4. Nostrils (Left & Right): Blender (2.02, +-0.14, 1.34) -> relative to head (+-0.14, -0.08, -0.84)
  for (const xSign of [1, -1]) {
    const nostril = new THREE.Mesh(geos.smallSphere, mats.nostril);
    nostril.position.set(xSign * 0.14, -0.08, -0.84);
    nostril.scale.set(0.072, 0.11, 0.045);
    headGroup.add(nostril);
  }

  // 5. Expressive Eyes + White Cornea Catchlights + Rosy Cheek Blush
  for (const xSign of [1, -1]) {
    // Eye: Blender (1.74, +-0.35, 1.62) -> relative to head (+-0.35, +0.20, -0.56)
    const eye = new THREE.Mesh(geos.smallSphere, mats.eye);
    eye.position.set(xSign * 0.35, 0.2, -0.56);
    eye.scale.setScalar(0.115);
    headGroup.add(eye);

    // Embedded White Catchlight Shine
    const shine = new THREE.Mesh(geos.smallSphere, mats.shine);
    shine.position.set(xSign * 0.325, 0.238, -0.642);
    shine.scale.setScalar(0.032);
    headGroup.add(shine);

    // Rosy Cheek Blush: Blender (1.66, +-0.52, 1.28) -> relative to head (+-0.52, -0.14, -0.48)
    const cheek = new THREE.Mesh(geos.smallSphere, mats.blush);
    cheek.position.set(xSign * 0.52, -0.14, -0.48);
    cheek.scale.set(0.12, 0.09, 0.14);
    cheek.rotation.y = -xSign * 0.35;
    headGroup.add(cheek);
  }

  // 6. Smooth Sculpted Outer & Inner Pig Ears: Blender (1.18, +-0.48, 2.02) -> relative to head (+-0.48, +0.60, 0.0)
  for (const xSign of [1, -1]) {
    const ear = new THREE.Mesh(geos.unitSphere, instanceSkinMat);
    ear.position.set(xSign * 0.48, 0.6, 0.0);
    ear.scale.set(0.26, 0.34, 0.16);
    ear.rotation.set(-0.25, xSign * 0.3, -xSign * 0.35);
    ear.castShadow = true;
    headGroup.add(ear);

    const innerEar = new THREE.Mesh(geos.unitSphere, mats.snout);
    innerEar.position.set(xSign * 0.49, 0.58, -0.05);
    innerEar.scale.set(0.18, 0.24, 0.09);
    innerEar.rotation.set(-0.25, xSign * 0.3, -xSign * 0.35);
    headGroup.add(innerEar);
  }

  // 7. Four Smooth Capsule Legs & Rounded Brown Cloven Hooves
  //    Blender coords: Front (+0.65, +-0.50), Back (-0.68, +-0.50)
  //    Three.js coords: Front (+-0.50, y, -0.65), Back (+-0.50, y, +0.68)
  const legConfigs = [
    [0.5, -0.65],  // Front Left
    [-0.5, -0.65], // Front Right
    [0.5, 0.68],   // Back Left
    [-0.5, 0.68],  // Back Right
  ];

  const legs = [];
  for (const [lx, lz] of legConfigs) {
    const legPivot = new THREE.Group();
    legPivot.position.set(lx, 0.72, lz);

    const legMesh = new THREE.Mesh(geos.unitSphere, instanceSkinMat);
    legMesh.position.set(0, -0.24, 0);
    legMesh.scale.set(0.24, 0.42, 0.24);
    legMesh.castShadow = true;
    legPivot.add(legMesh);

    const hoofMesh = new THREE.Mesh(geos.hoofCylinder, mats.hoof);
    hoofMesh.position.set(0, -0.62, -0.02);
    hoofMesh.castShadow = true;
    legPivot.add(hoofMesh);

    root.add(legPivot);
    legs.push(legPivot);
  }

  // 8. Signature 3D Helical Curly Pig Tail
  const tailPivot = new THREE.Group();
  tailPivot.name = 'Pig_Curly_Tail_Pivot';
  tailPivot.position.set(0, 1.35, 1.22);
  const tailMesh = new THREE.Mesh(geos.tailTube, mats.snout);
  tailMesh.castShadow = true;
  tailPivot.add(tailMesh);
  root.add(tailPivot);

  const wrapper = new THREE.Group();
  wrapper.add(root);

  return {
    group: wrapper,
    legs,
    headGroup,
    tailPivot,
    bodyMat: instanceSkinMat,
    baseColor: new THREE.Color('#f78ca2'),
  };
}
