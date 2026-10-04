import * as THREE from 'three';

// ============================================================================
// Complete 14-Mob Blender Suite (1:1 Translation of MOB/generate_all_mobs.py)
// Daytime & Companion Mobs (10):
//   Pig, Dog, Cow, Sheep, Wolf, Rabbit, Bird, Monkey, Chicken, Cat
// Night Horror Hostile Mobs (4):
//   ShadowStalker, BloodCrawler, GrimWraith, FleshGhoul
// ============================================================================

const PI = Math.PI;
const rad = (deg) => (deg * Math.PI) / 180;

// Shared unit geometries in Blender local coordinates (Z-up before basis matrix)
const UNIT_SPHERE_GEO = new THREE.SphereGeometry(1.0, 22, 14);
const UNIT_CYLINDER_GEO = (() => {
  const g = new THREE.CylinderGeometry(1.0, 1.0, 1.0, 20);
  g.rotateX(Math.PI / 2); // Align depth along Blender +Z
  return g;
})();
const CONE_GEO_CACHE = new Map();
function getUnitConeGeo(r1 = 1.0, r2 = 0.04) {
  const key = `${r1.toFixed(3)}_${r2.toFixed(3)}`;
  if (!CONE_GEO_CACHE.has(key)) {
    const g = new THREE.CylinderGeometry(r2, r1, 1.0, 18);
    g.rotateX(Math.PI / 2); // Align depth along Blender +Z (r1 at -0.5, r2 at +0.5)
    CONE_GEO_CACHE.set(key, g);
  }
  return CONE_GEO_CACHE.get(key);
}

// Basis matrix mapping Blender (X_fwd, Y_left, Z_up) -> Three.js (X_left, Y_up, Z_fwd), det = +1
const BLENDER_TO_THREE_MATRIX = new THREE.Matrix4().set(
  0, 1, 0, 0,
  0, 0, 1, 0,
  1, 0, 0, 0,
  0, 0, 0, 1
);

const MAT_CACHE = new Map();
function get_mat(
  name,
  color,
  roughness = 0.4,
  metallic = 0.0,
  emission = 0.0,
  color2 = null
) {
  const key = `${name}_${color.join(',')}_${roughness}_${metallic}_${emission}_${color2 ? color2.join(',') : ''}`;
  if (MAT_CACHE.has(key)) return MAT_CACHE.get(key);

  let r = color[0];
  let g = color[1];
  let b = color[2];
  if (color2) {
    r = r * 0.72 + color2[0] * 0.28;
    g = g * 0.72 + color2[1] * 0.28;
    b = b * 0.72 + color2[2] * 0.28;
  }

  // Convert Blender linear RGB to sRGB for vivid EEVEE-matched appearance
  const col = new THREE.Color().setRGB(
    Math.pow(Math.max(0, r), 1 / 2.2),
    Math.pow(Math.max(0, g), 1 / 2.2),
    Math.pow(Math.max(0, b), 1 / 2.2)
  );

  const mat = new THREE.MeshStandardMaterial({
    name,
    color: col,
    roughness: Math.max(0.08, Math.min(0.95, roughness)),
    metalness: Math.max(0.0, Math.min(0.95, metallic)),
  });

  if (emission > 0) {
    mat.emissive = col.clone();
    mat.emissiveIntensity = Math.min(2.5, emission * 0.45);
  }

  MAT_CACHE.set(key, mat);
  return mat;
}

/**
 * Creates a builder context that collects primitives into anatomical animation pivots
 * (headGroup, legFL, legFR, legBL, legBR, armL, armR, tailPivot) in Blender space.
 */
function createMobContext(mobScale = 0.46) {
  const blenderRoot = new THREE.Group();

  const makePivot = (ox, oy, oz) => {
    const p = new THREE.Group();
    p.position.set(ox, oy, oz);
    blenderRoot.add(p);
    return p;
  };

  const headGroup = makePivot(1.0, 0.0, 1.65);
  const tailPivot = makePivot(-1.05, 0.0, 1.25);
  const legFL = makePivot(0.6, 0.4, 0.75);
  const legFR = makePivot(0.6, -0.4, 0.75);
  const legBL = makePivot(-0.6, 0.4, 0.75);
  const legBR = makePivot(-0.6, -0.4, 0.75);
  const armL = makePivot(0.35, 0.65, 1.45);
  const armR = makePivot(0.35, -0.65, 1.45);

  let primaryBodyMat = null;

  function resolvePivot(name, loc) {
    const n = name;
    if (/Tail|Plume|CottonTail|WhipTail/i.test(n)) return tailPivot;
    if (/Wing|PrimaryFeather|UpperArm|Forearm|Deltoid|Fist|Arm|Sleeve|BonyHand|Scythe/i.test(n)) {
      return /_R|Right/i.test(n) || loc[1] < 0 ? armR : armL;
    }
    if (/Leg|Thigh|Shin|Shank|Paw|Hoof|Foot|Claw|Talon|HindFoot|FrontPaw|JointGlow/i.test(n) && !/ScytheClaw/i.test(n)) {
      const isRight = /FR|BR|_R/i.test(n) || loc[1] < 0;
      const isBack = /BL|BR|Hind|Thigh|Shin/i.test(n) || loc[0] < -0.15;
      if (isBack) return isRight ? legBR : legBL;
      return isRight ? legFR : legFL;
    }
    if (
      /Head|Skull|Snout|Muzzle|Jaw|Mouth|Tongue|Nose|Ear|Horn|Antler|Eye|Brow|Comb|Wattle|Beak|Fang|Tooth|Molar|Cheek|Hood|Mandible|Venom|FacePlate|ScreamJaw/i.test(
        n
      )
    ) {
      return headGroup;
    }
    return blenderRoot;
  }

  function attachMesh(name, mesh, loc, scale, rot, mat) {
    if (!primaryBodyMat && /Body|Ribcage|WoolCore|Torso|Chest|Thorax|MainCloak|HunchTorso/i.test(name)) {
      primaryBodyMat = mat.clone();
      mesh.material = primaryBodyMat;
    }
    const targetPivot = resolvePivot(name, loc);
    mesh.position.set(
      loc[0] - targetPivot.position.x,
      loc[1] - targetPivot.position.y,
      loc[2] - targetPivot.position.z
    );
    mesh.scale.set(scale[0], scale[1], scale[2]);
    if (rot) {
      mesh.rotation.set(rot[0], rot[1], rot[2], 'XYZ');
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    targetPivot.add(mesh);
    return mesh;
  }

  function add_sphere(name, loc, scale, mat, rot = [0, 0, 0]) {
    const mesh = new THREE.Mesh(UNIT_SPHERE_GEO, mat);
    return attachMesh(name, mesh, loc, scale, rot, mat);
  }

  function add_cylinder(name, loc, scale, mat, rot = [0, 0, 0]) {
    const mesh = new THREE.Mesh(UNIT_CYLINDER_GEO, mat);
    return attachMesh(name, mesh, loc, scale, rot, mat);
  }

  function add_cone(name, loc, scale, mat, rot = [0, 0, 0], r1 = 1.0, r2 = 0.04) {
    const mesh = new THREE.Mesh(getUnitConeGeo(r1, r2), mat);
    return attachMesh(name, mesh, loc, scale, rot, mat);
  }

  function add_curve_tail(name, points, bevel_depth, mat) {
    const targetPivot = resolvePivot(name, points[0]);
    const vecPts = points.map(
      (p) =>
        new THREE.Vector3(
          p[0] - targetPivot.position.x,
          p[1] - targetPivot.position.y,
          p[2] - targetPivot.position.z
        )
    );
    const curve = new THREE.CatmullRomCurve3(vecPts);
    const tubeGeo = new THREE.TubeGeometry(
      curve,
      Math.max(12, points.length),
      bevel_depth,
      8,
      false
    );
    const mesh = new THREE.Mesh(tubeGeo, mat);
    mesh.castShadow = true;
    targetPivot.add(mesh);
    return mesh;
  }

  function add_eyes(prefix, ex, ey_abs, ez, radius, mat_iris, shine = true) {
    const mat_shine = get_mat('Eye_Shine_White', [1.0, 1.0, 1.0, 1.0], 0.0, 0.0, 1.8);
    for (const [side, y_sign] of [
      ['L', 1.0],
      ['R', -1.0],
    ]) {
      const ey = y_sign * ey_abs;
      add_sphere(`${prefix}_Eye_${side}`, [ex, ey, ez], [radius, radius, radius], mat_iris);
      if (shine) {
        const sr = radius * 0.27;
        add_sphere(
          `${prefix}_EyeShine_${side}`,
          [ex + radius * 0.72, ey - y_sign * radius * 0.22, ez + radius * 0.34],
          [sr, sr, sr],
          mat_shine
        );
      }
    }
  }

  function finalize() {
    const basisGroup = new THREE.Group();
    basisGroup.matrixAutoUpdate = false;
    const scaleMat = new THREE.Matrix4().makeScale(mobScale, mobScale, mobScale);
    basisGroup.matrix.multiplyMatrices(scaleMat, BLENDER_TO_THREE_MATRIX);
    basisGroup.add(blenderRoot);

    const wrapper = new THREE.Group();
    wrapper.add(basisGroup);

    const bodyMat = primaryBodyMat || new THREE.MeshStandardMaterial({ color: 0xffffff });
    return {
      group: wrapper,
      legs: [legFL, legFR, legBL, legBR],
      arms: [armL, armR],
      headGroup,
      tailPivot,
      bodyMat,
      baseColor: bodyMat.color.clone(),
    };
  }

  return { add_sphere, add_cylinder, add_cone, add_curve_tail, add_eyes, finalize };
}

// ==============================================================================
// 1. PIG
// ==============================================================================
export function build_pig() {
  const c = createMobContext(0.46);
  const m_skin = get_mat('Pig_Skin', [0.95, 0.28, 0.40, 1.0], 0.38);
  const m_snout = get_mat('Pig_Snout', [0.88, 0.15, 0.28, 1.0], 0.34);
  const m_blush = get_mat('Pig_Blush', [0.96, 0.08, 0.20, 1.0], 0.42);
  const m_nostril = get_mat('Pig_Nostril', [0.08, 0.015, 0.025, 1.0], 0.55);
  const m_eye = get_mat('Eye_Black', [0.01, 0.01, 0.01, 1.0], 0.04);
  const m_hoof = get_mat('Hoof_Brown', [0.14, 0.07, 0.06, 1.0], 0.45);

  c.add_sphere('Pig_Body', [0.0, 0.0, 1.12], [1.32, 0.98, 0.92], m_skin);
  c.add_sphere('Pig_Head', [1.18, 0.0, 1.42], [0.78, 0.76, 0.74], m_skin);
  c.add_cylinder('Pig_Snout', [1.88, 0.0, 1.33], [0.31, 0.40, 0.24], m_snout, [0, PI / 2, 0]);

  for (const [s, ys] of [['L', 1], ['R', -1]]) {
    c.add_sphere(`Pig_Nostril_${s}`, [2.02, ys * 0.14, 1.34], [0.045, 0.072, 0.11], m_nostril);
    c.add_sphere(`Pig_Cheek_${s}`, [1.66, ys * 0.52, 1.28], [0.14, 0.12, 0.09], m_blush, [0, 0, ys * 0.35]);
    c.add_sphere(`Pig_Ear_${s}`, [1.18, ys * 0.48, 2.02], [0.16, 0.26, 0.34], m_skin, [ys * 0.48, 0.38, ys * 0.30]);
    c.add_sphere(`Pig_InnerEar_${s}`, [1.23, ys * 0.49, 2.00], [0.09, 0.18, 0.24], m_snout, [ys * 0.48, 0.38, ys * 0.30]);
  }
  c.add_eyes('Pig', 1.74, 0.35, 1.62, 0.115, m_eye);
  for (const [nm, lx, ly] of [['FL', 0.65, 0.50], ['FR', 0.65, -0.50], ['BL', -0.68, 0.50], ['BR', -0.68, -0.50]]) {
    c.add_sphere(`Pig_Leg_${nm}`, [lx, ly, 0.48], [0.24, 0.24, 0.42], m_skin);
    c.add_cylinder(`Pig_Hoof_${nm}`, [lx + 0.02, ly, 0.10], [0.22, 0.22, 0.20], m_hoof);
  }
  const pts = [];
  for (let i = 0; i < 32; i++) {
    const t = i / 31.0;
    const ang = t * 4.4 * PI;
    const r = 0.18 * (1.0 - 0.3 * t) * Math.sin(( Math.min(t * 3.5, 1.0) * PI) / 2);
    pts.push([-1.22 - t * 0.52, r * Math.cos(ang), 1.35 + t * 0.32 + r * Math.sin(ang)]);
  }
  c.add_curve_tail('Pig_Tail', pts, 0.068, m_snout);
  return c.finalize();
}

// ==============================================================================
// 2. GERMAN SHEPHERD GUARD DOG
// ==============================================================================
export function build_dog() {
  const c = createMobContext(0.45);
  const m_tan = get_mat('Dog_MahoganyFur', [0.58, 0.24, 0.06, 1.0], 0.52, 0, 0, [0.42, 0.16, 0.03, 1.0]);
  const m_saddle = get_mat('Dog_ObsidianSaddle', [0.04, 0.04, 0.05, 1.0], 0.48, 0, 0, [0.12, 0.08, 0.05, 1.0]);
  const m_cream = get_mat('Dog_CreamUndercoat', [0.86, 0.68, 0.42, 1.0], 0.50, 0, 0, [0.72, 0.52, 0.28, 1.0]);
  const m_nose = get_mat('Dog_WetNose', [0.02, 0.02, 0.02, 1.0], 0.08);
  const m_collar = get_mat('Dog_LeatherCollar', [0.45, 0.04, 0.03, 1.0], 0.32);
  const m_steel = get_mat('Dog_SteelSpike', [0.85, 0.88, 0.92, 1.0], 0.15, 0.92);
  const m_fang = get_mat('Dog_IvoryFang', [0.98, 0.96, 0.90, 1.0], 0.15);
  const m_tongue = get_mat('Dog_PinkTongue', [0.88, 0.18, 0.28, 1.0], 0.30);
  const m_eye = get_mat('Dog_AmberIris', [0.78, 0.36, 0.04, 1.0], 0.05);

  c.add_sphere('Dog_Ribcage', [0.28, 0.0, 1.25], [0.88, 0.68, 0.76], m_tan);
  c.add_sphere('Dog_Abdomen', [-0.52, 0.0, 1.22], [0.82, 0.56, 0.64], m_tan);
  c.add_sphere('Dog_BlackSaddle', [-0.12, 0.0, 1.52], [1.08, 0.65, 0.58], m_saddle);
  c.add_sphere('Dog_ChestMane', [0.82, 0.0, 1.18], [0.64, 0.58, 0.68], m_cream);
  c.add_sphere('Dog_Neck', [0.98, 0.0, 1.62], [0.48, 0.46, 0.56], m_tan, [0, 0.38, 0]);
  c.add_cylinder('Dog_Collar', [1.02, 0.0, 1.52], [0.50, 0.48, 0.11], m_collar, [0, 0.52, 0]);
  for (let ang_deg = 0; ang_deg < 360; ang_deg += 45) {
    const r = rad(ang_deg);
    c.add_cone(`Dog_Stud_${ang_deg}`, [1.02 + 0.22 * Math.cos(r), 0.50 * Math.sin(r), 1.52 - 0.22 * Math.cos(r)], [0.05, 0.05, 0.10], m_steel, [r, 0, 0]);
  }
  c.add_sphere('Dog_Skull', [1.32, 0.0, 1.88], [0.58, 0.54, 0.54], m_tan);
  c.add_sphere('Dog_SkullCrown', [1.22, 0.0, 2.12], [0.45, 0.42, 0.30], m_saddle);
  c.add_sphere('Dog_UpperMuzzle', [1.88, 0.0, 1.80], [0.52, 0.28, 0.24], m_saddle);
  c.add_sphere('Dog_LowerJaw', [1.82, 0.0, 1.60], [0.46, 0.24, 0.16], m_tan, [0, 0.22, 0]);
  c.add_sphere('Dog_Tongue', [1.92, 0.0, 1.64], [0.28, 0.14, 0.05], m_tongue, [0, 0.30, 0]);
  c.add_sphere('Dog_Nose', [2.36, 0.0, 1.86], [0.11, 0.13, 0.10], m_nose);

  for (const [s, ys] of [['L', 1], ['R', -1]]) {
    c.add_cone(`Dog_FangU_${s}`, [2.14, ys * 0.14, 1.72], [0.035, 0.035, 0.12], m_fang, [PI, 0, 0]);
    c.add_cone(`Dog_FangL_${s}`, [2.10, ys * 0.12, 1.66], [0.030, 0.030, 0.10], m_fang);
    c.add_cone(`Dog_EarOuter_${s}`, [1.18, ys * 0.38, 2.46], [0.22, 0.16, 0.54], m_saddle, [-ys * 0.14, 0.18, 0]);
    c.add_cone(`Dog_EarInner_${s}`, [1.24, ys * 0.38, 2.44], [0.13, 0.10, 0.40], m_cream, [-ys * 0.14, 0.18, 0]);
    c.add_sphere(`Dog_Brow_${s}`, [1.68, ys * 0.24, 2.06], [0.16, 0.14, 0.08], m_tan, [0, 0.2, ys * 0.25]);
  }
  c.add_eyes('Dog', 1.74, 0.26, 1.96, 0.085, m_eye);

  for (const [nm, lx, ly, is_back] of [['FL', 0.68, 0.38, false], ['FR', 0.68, -0.38, false], ['BL', -0.78, 0.40, true], ['BR', -0.78, -0.40, true]]) {
    if (is_back) c.add_sphere(`Dog_Thigh_${nm}`, [lx - 0.06, ly, 0.98], [0.34, 0.22, 0.42], m_saddle, [0, -0.25, 0]);
    c.add_sphere(`Dog_UpperLeg_${nm}`, [lx, ly, 0.68], [0.18, 0.17, 0.38], m_tan);
    c.add_sphere(`Dog_LowerLeg_${nm}`, [lx + 0.04, ly, 0.34], [0.13, 0.13, 0.32], m_tan);
    c.add_sphere(`Dog_Paw_${nm}`, [lx + 0.14, ly, 0.10], [0.22, 0.18, 0.11], m_tan);
    for (const [ti, ty_off] of [[-0.08, 0], [0.0, 1], [0.08, 2]]) {
      c.add_cone(`Dog_Claw_${nm}_${ty_off}`, [lx + 0.34, ly + ti, 0.06], [0.025, 0.025, 0.08], m_saddle, [0, PI / 2, 0]);
    }
  }
  c.add_curve_tail('Dog_BushyTail', [[-1.20, 0, 1.32], [-1.58, 0.0, 1.05], [-1.88, 0.0, 0.88], [-2.12, 0.0, 0.95]], 0.14, m_saddle);
  return c.finalize();
}

// ==============================================================================
// 3. COW
// ==============================================================================
export function build_cow() {
  const c = createMobContext(0.46);
  const m_white = get_mat('Cow_White', [0.94, 0.94, 0.92, 1.0], 0.42);
  const m_spot = get_mat('Cow_BlackSpot', [0.05, 0.05, 0.06, 1.0], 0.45);
  const m_muzzle = get_mat('Cow_PinkMuzzle', [0.94, 0.48, 0.54, 1.0], 0.38);
  const m_horn = get_mat('Cow_Horn', [0.88, 0.82, 0.65, 1.0], 0.30);
  const m_udder = get_mat('Cow_Udder', [0.95, 0.58, 0.66, 1.0], 0.40);
  const m_hoof = get_mat('Hoof_Dark', [0.12, 0.10, 0.10, 1.0], 0.45);
  const m_eye = get_mat('Eye_Black', [0.01, 0.01, 0.01, 1.0], 0.04);

  c.add_sphere('Cow_Body', [0.0, 0.0, 1.35], [1.52, 1.02, 1.02], m_white);
  c.add_sphere('Cow_Spot1', [0.25, 0.68, 1.72], [0.55, 0.42, 0.48], m_spot);
  c.add_sphere('Cow_Spot2', [-0.55, -0.65, 1.58], [0.62, 0.45, 0.52], m_spot);
  c.add_sphere('Cow_Spot3', [-0.15, 0.0, 2.08], [0.52, 0.68, 0.35], m_spot);
  c.add_sphere('Cow_Spot4', [-0.82, 0.55, 1.35], [0.45, 0.42, 0.48], m_spot);
  c.add_sphere('Cow_Udder', [-0.35, 0.0, 0.58], [0.38, 0.32, 0.25], m_udder);
  c.add_sphere('Cow_Head', [1.38, 0.0, 1.78], [0.76, 0.72, 0.75], m_white);
  c.add_sphere('Cow_EyePatch', [1.58, 0.36, 1.96], [0.32, 0.28, 0.28], m_spot);
  c.add_sphere('Cow_Muzzle', [1.98, 0.0, 1.58], [0.42, 0.64, 0.42], m_muzzle);

  for (const [s, ys] of [['L', 1], ['R', -1]]) {
    c.add_sphere(`Cow_Nostril_${s}`, [2.34, ys * 0.22, 1.62], [0.06, 0.09, 0.12], m_spot);
    c.add_sphere(`Cow_Ear_${s}`, [1.28, ys * 0.76, 1.98], [0.16, 0.38, 0.18], m_spot, [0, 0, ys * 0.25]);
    c.add_cone(`Cow_Horn_${s}`, [1.25, ys * 0.44, 2.48], [0.14, 0.14, 0.42], m_horn, [-ys * 0.32, 0.15, 0]);
  }
  c.add_eyes('Cow', 1.85, 0.42, 1.98, 0.115, m_eye);
  for (const [nm, lx, ly] of [['FL', 0.82, 0.52], ['FR', 0.82, -0.52], ['BL', -0.85, 0.52], ['BR', -0.85, -0.52]]) {
    c.add_sphere(`Cow_Leg_${nm}`, [lx, ly, 0.62], [0.24, 0.24, 0.60], m_white);
    c.add_cylinder(`Cow_Hoof_${nm}`, [lx + 0.02, ly, 0.11], [0.23, 0.23, 0.22], m_hoof);
  }
  c.add_curve_tail('Cow_Tail', [[-1.42, 0, 1.65], [-1.68, 0, 1.35], [-1.78, 0.05, 0.92]], 0.065, m_white);
  c.add_sphere('Cow_TailTuft', [-1.78, 0.05, 0.82], [0.14, 0.14, 0.22], m_spot);
  return c.finalize();
}

// ==============================================================================
// 4. SHEEP
// ==============================================================================
export function build_sheep() {
  const c = createMobContext(0.46);
  const m_wool = get_mat('Sheep_Wool', [0.96, 0.95, 0.90, 1.0], 0.78);
  const m_face = get_mat('Sheep_Face_Charcoal', [0.12, 0.11, 0.13, 1.0], 0.48);
  const m_hoof = get_mat('Sheep_Hoof', [0.06, 0.05, 0.06, 1.0], 0.40);
  const m_eye = get_mat('Eye_Black', [0.01, 0.01, 0.01, 1.0], 0.04);

  c.add_sphere('Sheep_WoolCore', [0.0, 0.0, 1.22], [1.28, 1.05, 0.98], m_wool);
  const puff_coords = [
    [0.55, 0.55, 1.45, 0.62], [0.55, -0.55, 1.45, 0.62],
    [0.0, 0.72, 1.28, 0.68], [0.0, -0.72, 1.28, 0.68],
    [-0.58, 0.52, 1.42, 0.64], [-0.58, -0.52, 1.42, 0.64],
    [0.28, 0.0, 1.78, 0.66], [-0.38, 0.0, 1.76, 0.66],
    [0.75, 0.0, 1.32, 0.62], [-0.85, 0.0, 1.35, 0.62],
  ];
  puff_coords.forEach(([px, py, pz, pr], idx) => {
    c.add_sphere(`Sheep_WoolPuff_${idx}`, [px, py, pz], [pr, pr, pr], m_wool);
  });
  c.add_sphere('Sheep_Head', [1.28, 0.0, 1.56], [0.68, 0.56, 0.58], m_face);
  c.add_sphere('Sheep_HeadWoolCap', [1.18, 0.0, 1.98], [0.52, 0.54, 0.38], m_wool);
  c.add_sphere('Sheep_HeadWoolPuffL', [1.25, 0.32, 1.92], [0.32, 0.32, 0.28], m_wool);
  c.add_sphere('Sheep_HeadWoolPuffR', [1.25, -0.32, 1.92], [0.32, 0.32, 0.28], m_wool);
  for (const [s, ys] of [['L', 1], ['R', -1]]) {
    c.add_sphere(`Sheep_Ear_${s}`, [1.18, ys * 0.64, 1.62], [0.14, 0.34, 0.14], m_face, [0, 0, ys * 0.2]);
  }
  c.add_eyes('Sheep', 1.72, 0.32, 1.68, 0.10, m_eye);
  for (const [nm, lx, ly] of [['FL', 0.62, 0.44], ['FR', 0.62, -0.44], ['BL', -0.65, 0.44], ['BR', -0.65, -0.44]]) {
    c.add_sphere(`Sheep_Leg_${nm}`, [lx, ly, 0.54], [0.18, 0.18, 0.52], m_face);
    c.add_cylinder(`Sheep_Hoof_${nm}`, [lx + 0.02, ly, 0.10], [0.18, 0.18, 0.18], m_hoof);
  }
  c.add_sphere('Sheep_Tail', [-1.35, 0.0, 1.38], [0.36, 0.34, 0.34], m_wool);
  return c.finalize();
}

// ==============================================================================
// 5. ANGRY RED-EYED DIRE WOLF
// ==============================================================================
export function build_wolf() {
  const c = createMobContext(0.46);
  const m_grey = get_mat('Wolf_TimberHide', [0.16, 0.18, 0.22, 1.0], 0.52, 0, 0, [0.08, 0.09, 0.12, 1.0]);
  const m_silver = get_mat('Wolf_FrostRuff', [0.62, 0.65, 0.70, 1.0], 0.48, 0, 0, [0.35, 0.38, 0.42, 1.0]);
  const m_dark = get_mat('Wolf_ShadowMane', [0.04, 0.04, 0.06, 1.0], 0.55);
  const m_red_eye = get_mat('Wolf_BloodRedEye', [1.0, 0.01, 0.01, 1.0], 0.02, 0, 4.5);
  const m_fang = get_mat('Wolf_RazorFang', [0.98, 0.97, 0.92, 1.0], 0.12);
  const m_gum = get_mat('Wolf_BloodGums', [0.45, 0.02, 0.04, 1.0], 0.35);

  c.add_sphere('Wolf_Body', [-0.05, 0.0, 1.18], [1.38, 0.72, 0.80], m_grey);
  c.add_sphere('Wolf_BackMane', [0.10, 0.0, 1.62], [1.28, 0.50, 0.46], m_dark);
  [0.95, 0.65, 0.30, -0.10, -0.50].forEach((hx, i) => {
    c.add_cone(`Wolf_Hackle_${i}`, [hx, 0.0, 2.02 - i * 0.07], [0.28, 0.12, 0.38], m_dark, [0, -0.55, 0]);
  });
  c.add_sphere('Wolf_ChestMane', [0.82, 0.0, 1.22], [0.72, 0.68, 0.76], m_silver);
  c.add_sphere('Wolf_Head', [1.28, 0.0, 1.74], [0.68, 0.64, 0.62], m_grey);
  c.add_sphere('Wolf_CheekRuff', [1.20, 0.0, 1.58], [0.50, 0.78, 0.46], m_silver);
  c.add_sphere('Wolf_SnoutTop', [1.88, 0.0, 1.68], [0.52, 0.28, 0.22], m_dark);
  c.add_sphere('Wolf_SnoutLower', [1.82, 0.0, 1.44], [0.48, 0.24, 0.16], m_silver, [0, 0.32, 0]);
  c.add_sphere('Wolf_MouthGums', [1.84, 0.0, 1.56], [0.42, 0.22, 0.14], m_gum);
  c.add_sphere('Wolf_Nose', [2.36, 0.0, 1.74], [0.11, 0.13, 0.10], m_dark);

  for (const [s, ys] of [['L', 1], ['R', -1]]) {
    c.add_cylinder(`Wolf_AngryBrow_${s}`, [1.78, ys * 0.25, 1.95], [0.12, 0.24, 0.07], m_dark, [ys * 0.52, 0.28, -ys * 0.45]);
    c.add_cone(`Wolf_FangU_${s}`, [2.18, ys * 0.15, 1.56], [0.04, 0.04, 0.18], m_fang, [PI, 0, 0]);
    c.add_cone(`Wolf_FangL_${s}`, [2.12, ys * 0.13, 1.50], [0.035, 0.035, 0.15], m_fang);
    [1.92, 2.02].forEach((tx, ti) => {
      c.add_cone(`Wolf_Tooth_${s}_${ti}`, [tx, ys * 0.16, 1.58], [0.025, 0.025, 0.09], m_fang, [PI, 0, 0]);
    });
    c.add_cone(`Wolf_Ear_${s}`, [1.15, ys * 0.38, 2.38], [0.22, 0.16, 0.52], m_dark, [-ys * 0.14, 0.16, 0]);
    c.add_cone(`Wolf_InnerEar_${s}`, [1.20, ys * 0.38, 2.35], [0.12, 0.10, 0.36], m_silver, [-ys * 0.14, 0.16, 0]);
  }
  c.add_eyes('Wolf', 1.76, 0.28, 1.84, 0.10, m_red_eye, false);
  for (const [nm, lx, ly] of [['FL', 0.72, 0.38], ['FR', 0.72, -0.38], ['BL', -0.82, 0.38], ['BR', -0.82, -0.38]]) {
    c.add_sphere(`Wolf_Leg_${nm}`, [lx, ly, 0.58], [0.20, 0.20, 0.56], m_grey);
    c.add_sphere(`Wolf_Paw_${nm}`, [lx + 0.08, ly, 0.12], [0.24, 0.20, 0.12], m_dark);
    [-0.07, 0.0, 0.07].forEach((cy_off, ci) => {
      c.add_cone(`Wolf_Claw_${nm}_${ci}`, [lx + 0.30, ly + cy_off, 0.06], [0.028, 0.028, 0.11], m_fang, [0, PI / 2, 0]);
    });
  }
  c.add_sphere('Wolf_Tail', [-1.58, 0.0, 1.12], [0.66, 0.28, 0.30], m_grey, [0, 0.45, 0]);
  c.add_sphere('Wolf_TailTip', [-2.02, 0.0, 0.94], [0.35, 0.24, 0.24], m_dark, [0, 0.45, 0]);
  return c.finalize();
}

// ==============================================================================
// 6. RABBIT
// ==============================================================================
export function build_rabbit() {
  const c = createMobContext(0.42);
  const m_fur = get_mat('Rabbit_White', [0.96, 0.93, 0.90, 1.0], 0.45);
  const m_pink = get_mat('Rabbit_Pink', [0.96, 0.35, 0.48, 1.0], 0.38);
  const m_tooth = get_mat('Rabbit_Tooth', [0.99, 0.99, 0.98, 1.0], 0.20);
  const m_eye = get_mat('Eye_Black', [0.01, 0.01, 0.01, 1.0], 0.04);

  c.add_sphere('Rabbit_Body', [0.0, 0.0, 0.86], [0.92, 0.78, 0.82], m_fur, [0, -0.25, 0]);
  c.add_sphere('Rabbit_Head', [0.68, 0.0, 1.52], [0.62, 0.60, 0.58], m_fur);
  for (const [s, ys] of [['L', 1], ['R', -1]]) {
    c.add_sphere(`Rabbit_Cheek_${s}`, [1.12, ys * 0.22, 1.40], [0.24, 0.26, 0.20], m_fur);
    c.add_sphere(`Rabbit_Ear_${s}`, [0.58, ys * 0.28, 2.48], [0.14, 0.22, 0.68], m_fur, [ys * 0.12, 0.10, 0]);
    c.add_sphere(`Rabbit_InnerEar_${s}`, [0.63, ys * 0.28, 2.46], [0.08, 0.14, 0.54], m_pink, [ys * 0.12, 0.10, 0]);
    c.add_sphere(`Rabbit_HindFoot_${s}`, [0.18, ys * 0.48, 0.16], [0.46, 0.22, 0.16], m_fur);
    c.add_sphere(`Rabbit_FrontPaw_${s}`, [0.66, ys * 0.26, 0.32], [0.20, 0.16, 0.30], m_fur);
  }
  c.add_sphere('Rabbit_Nose', [1.30, 0.0, 1.52], [0.08, 0.11, 0.08], m_pink);
  c.add_cylinder('Rabbit_Teeth', [1.22, 0.0, 1.28], [0.04, 0.11, 0.14], m_tooth);
  c.add_eyes('Rabbit', 1.12, 0.34, 1.66, 0.105, m_eye);
  c.add_sphere('Rabbit_CottonTail', [-0.92, 0.0, 0.58], [0.30, 0.30, 0.30], m_fur);
  return c.finalize();
}

// ==============================================================================
// 7. FIERCE RAPTOR / FALCON BIRD
// ==============================================================================
export function build_bird() {
  const c = createMobContext(0.45);
  const m_plumage = get_mat('Bird_CrimsonHawk', [0.58, 0.10, 0.05, 1.0], 0.42, 0, 0, [0.24, 0.04, 0.02, 1.0]);
  const m_wing_dark = get_mat('Bird_ObsidianFeather', [0.06, 0.07, 0.10, 1.0], 0.38, 0, 0, [0.22, 0.12, 0.06, 1.0]);
  const m_breast = get_mat('Bird_GoldSpeckledBreast', [0.88, 0.64, 0.28, 1.0], 0.45, 0, 0, [0.48, 0.22, 0.08, 1.0]);
  const m_beak_gold = get_mat('Bird_RaptorBeakGold', [0.98, 0.68, 0.04, 1.0], 0.22);
  const m_beak_tip = get_mat('Bird_HookTipBlack', [0.03, 0.03, 0.04, 1.0], 0.18);
  const m_eye = get_mat('Bird_FierceAmberEye', [0.98, 0.52, 0.0, 1.0], 0.04, 0, 0.8);

  c.add_sphere('Bird_Torso', [0.0, 0.0, 1.18], [0.86, 0.58, 0.78], m_plumage, [0, -0.42, 0]);
  c.add_sphere('Bird_SpeckledBreast', [0.32, 0.0, 1.12], [0.64, 0.52, 0.66], m_breast, [0, -0.35, 0]);
  c.add_sphere('Bird_Head', [0.52, 0.0, 1.88], [0.48, 0.44, 0.46], m_plumage);
  c.add_sphere('Bird_NeckCollar', [0.38, 0.0, 1.58], [0.46, 0.46, 0.32], m_breast);
  for (let ci = 0; ci < 5; ci++) {
    c.add_cone(`Bird_CrownPlume_${ci}`, [0.28 - ci * 0.10, 0.0, 2.28 - ci * 0.04], [0.09, 0.05, 0.36], ci % 2 === 0 ? m_wing_dark : m_plumage, [0, -0.75 - ci * 0.1, 0]);
  }
  c.add_cone('Bird_BeakBase', [1.02, 0.0, 1.88], [0.16, 0.14, 0.38], m_beak_gold, [0, PI / 2 + 0.15, 0]);
  c.add_cone('Bird_BeakHookTip', [1.22, 0.0, 1.78], [0.08, 0.07, 0.22], m_beak_tip, [0, PI * 0.82, 0]);
  c.add_cone('Bird_BeakLower', [0.98, 0.0, 1.78], [0.11, 0.10, 0.28], m_beak_gold, [0, PI / 2 - 0.1, 0]);

  for (const [s, ys] of [['L', 1], ['R', -1]]) {
    c.add_sphere(`Bird_WingShoulder_${s}`, [0.08, ys * 0.58, 1.28], [0.58, 0.16, 0.38], m_plumage, [ys * 0.28, -0.35, 0]);
    for (let fi = 0; fi < 6; fi++) {
      c.add_sphere(
        `Bird_PrimaryFeather_${s}_${fi}`,
        [-0.15 - fi * 0.16, ys * (0.62 + fi * 0.03), 1.18 - fi * 0.11],
        [0.45, 0.05, 0.12],
        fi >= 2 ? m_wing_dark : m_plumage,
        [ys * 0.22, 0.42 + fi * 0.06, ys * 0.15]
      );
    }
    c.add_cylinder(`Bird_Brow_${s}`, [0.76, ys * 0.28, 2.02], [0.08, 0.16, 0.05], m_wing_dark, [0, 0.2, ys * 0.35]);
    c.add_sphere(`Bird_Thigh_${s}`, [0.12, ys * 0.28, 0.58], [0.18, 0.16, 0.28], m_plumage);
    c.add_cylinder(`Bird_Shank_${s}`, [0.14, ys * 0.28, 0.25], [0.055, 0.055, 0.36], m_beak_gold);
    [-0.45, -0.15, 0.15].forEach((tang, ti) => {
      c.add_cone(`Bird_Talon_${s}_${ti}`, [0.32, ys * 0.28 + tang * 0.25, 0.06], [0.035, 0.035, 0.18], m_beak_tip, [0, PI / 2, tang]);
    });
    c.add_cone(`Bird_BackTalon_${s}`, [-0.02, ys * 0.28, 0.06], [0.035, 0.035, 0.14], m_beak_tip, [0, -PI / 2, 0]);
  }
  [-0.36, -0.18, 0.0, 0.18, 0.36].forEach((tang, ti) => {
    c.add_sphere(`Bird_TailPlume_${ti}`, [-0.88, tang * 0.65, 0.72], [0.52, 0.12, 0.04], ti % 2 === 0 ? m_wing_dark : m_plumage, [0, 0.45, tang]);
  });
  c.add_eyes('Bird', 0.78, 0.28, 1.92, 0.085, m_eye);
  return c.finalize();
}

// ==============================================================================
// 8. DANGEROUS FERAL BABOON / MANDRILL RAGE MONKEY
// ==============================================================================
export function build_monkey() {
  const c = createMobContext(0.48);
  const m_fur = get_mat('Monkey_CharcoalBeastFur', [0.12, 0.07, 0.04, 1.0], 0.55, 0, 0, [0.28, 0.12, 0.05, 1.0]);
  const m_mane = get_mat('Monkey_AshMane', [0.26, 0.18, 0.12, 1.0], 0.58, 0, 0, [0.10, 0.06, 0.04, 1.0]);
  const m_skin = get_mat('Monkey_ScarredHide', [0.38, 0.16, 0.12, 1.0], 0.45);
  const m_war_red = get_mat('Monkey_MandrillBlood', [0.82, 0.04, 0.04, 1.0], 0.32);
  const m_war_blue = get_mat('Monkey_MandrillCobalt', [0.08, 0.24, 0.68, 1.0], 0.35);
  const m_fang = get_mat('Monkey_KillerFang', [0.96, 0.92, 0.80, 1.0], 0.15);
  const m_eye = get_mat('Monkey_RageEye', [1.0, 0.22, 0.0, 1.0], 0.03, 0, 3.2);
  const m_mouth = get_mat('Mouth_Dark', [0.18, 0.01, 0.02, 1.0], 0.4);
  const m_socket = get_mat('Socket_Black', [0.02, 0.02, 0.02, 1.0], 0.5);

  c.add_sphere('Monkey_Chest', [0.18, 0.0, 1.28], [0.86, 0.88, 0.85], m_fur, [0, 0.35, 0]);
  c.add_sphere('Monkey_Pecs', [0.58, 0.0, 1.28], [0.52, 0.72, 0.58], m_skin);
  c.add_sphere('Monkey_ShoulderMane', [0.28, 0.0, 1.72], [0.78, 0.96, 0.62], m_mane);
  c.add_sphere('Monkey_Skull', [0.58, 0.0, 2.02], [0.60, 0.62, 0.60], m_mane);
  c.add_sphere('Monkey_FacePlate', [0.98, 0.0, 2.02], [0.32, 0.46, 0.42], m_skin);
  c.add_sphere('Monkey_UpperSnout', [1.24, 0.0, 1.90], [0.38, 0.28, 0.20], m_war_red, [0, 0.15, 0]);
  c.add_sphere('Monkey_LowerJaw', [1.16, 0.0, 1.50], [0.42, 0.28, 0.18], m_skin, [0, 0.45, 0]);
  c.add_sphere('Monkey_RoarMouth', [1.18, 0.0, 1.70], [0.34, 0.25, 0.20], m_mouth);

  for (const [s, ys] of [['L', 1], ['R', -1]]) {
    c.add_sphere(`Monkey_EyeSocket_${s}`, [1.14, ys * 0.24, 2.10], [0.13, 0.13, 0.13], m_socket);
    c.add_cylinder(`Monkey_CheekRidge_${s}`, [1.22, ys * 0.24, 1.94], [0.08, 0.28, 0.07], m_war_blue, [0, PI / 2 - 0.2, ys * 0.18]);
    c.add_cylinder(`Monkey_AngryBrow_${s}`, [1.18, ys * 0.24, 2.22], [0.12, 0.24, 0.08], m_war_red, [ys * 0.48, 0.25, -ys * 0.42]);
    c.add_cone(`Monkey_SaberFangU_${s}`, [1.48, ys * 0.17, 1.72], [0.055, 0.055, 0.28], m_fang, [PI, -0.12, 0]);
    c.add_cone(`Monkey_SaberFangL_${s}`, [1.42, ys * 0.14, 1.66], [0.050, 0.050, 0.25], m_fang, [0, 0.12, 0]);
    [1.26, 1.36].forEach((tx, ti) => {
      c.add_cone(`Monkey_MolarU_${s}_${ti}`, [tx, ys * 0.19, 1.76], [0.032, 0.032, 0.12], m_fang, [PI, 0, 0]);
    });
    c.add_sphere(`Monkey_Ear_${s}`, [0.52, ys * 0.66, 2.02], [0.14, 0.26, 0.28], m_skin, [0, 0, ys * 0.3]);
    c.add_sphere(`Monkey_Deltoid_${s}`, [0.38, ys * 0.82, 1.48], [0.36, 0.34, 0.38], m_fur);
    c.add_sphere(`Monkey_Forearm_${s}`, [0.62, ys * 0.84, 0.82], [0.26, 0.26, 0.54], m_fur, [0, 0.28, 0]);
    c.add_sphere(`Monkey_Fist_${s}`, [0.82, ys * 0.82, 0.24], [0.24, 0.24, 0.20], m_skin);
    [-0.09, 0.0, 0.09].forEach((cy, ci) => {
      c.add_cone(`Monkey_Claw_${s}_${ci}`, [1.06, ys * 0.82 + cy, 0.16], [0.035, 0.035, 0.16], m_fang, [0, PI / 2, 0]);
    });
    c.add_sphere(`Monkey_Leg_${s}`, [-0.18, ys * 0.48, 0.48], [0.26, 0.24, 0.46], m_fur);
    c.add_sphere(`Monkey_Foot_${s}`, [0.05, ys * 0.48, 0.12], [0.28, 0.20, 0.12], m_skin);
  }
  c.add_eyes('Monkey', 1.22, 0.24, 2.10, 0.09, m_eye, false);
  c.add_curve_tail('Monkey_WhipTail', [[-0.58, 0, 1.05], [-1.15, 0.12, 1.38], [-1.58, -0.10, 1.88], [-1.35, 0.15, 2.38]], 0.095, m_fur);
  return c.finalize();
}

// ==============================================================================
// 9. CHICKEN
// ==============================================================================
export function build_chicken() {
  const c = createMobContext(0.42);
  const m_white = get_mat('Chicken_White', [0.97, 0.96, 0.94, 1.0], 0.45);
  const m_red = get_mat('Chicken_CombRed', [0.92, 0.06, 0.08, 1.0], 0.35);
  const m_yellow = get_mat('Chicken_BeakYellow', [0.98, 0.68, 0.05, 1.0], 0.32);
  const m_eye = get_mat('Eye_Black', [0.01, 0.01, 0.01, 1.0], 0.04);

  c.add_sphere('Chicken_Body', [0.0, 0.0, 0.92], [0.84, 0.68, 0.72], m_white);
  c.add_sphere('Chicken_Head', [0.58, 0.0, 1.54], [0.46, 0.44, 0.48], m_white);
  [0.42, 0.58, 0.72].forEach((cx, i) => {
    c.add_sphere(`Chicken_Comb_${i}`, [cx, 0.0, 2.02], [0.14, 0.07, 0.18], m_red);
  });
  c.add_sphere('Chicken_Wattle', [0.92, 0.0, 1.28], [0.10, 0.08, 0.16], m_red);
  c.add_cone('Chicken_Beak', [1.06, 0.0, 1.50], [0.15, 0.15, 0.32], m_yellow, [0, PI / 2, 0]);
  for (const [s, ys] of [['L', 1], ['R', -1]]) {
    c.add_sphere(`Chicken_Wing_${s}`, [-0.02, ys * 0.65, 0.95], [0.52, 0.15, 0.36], m_white);
    c.add_cylinder(`Chicken_Leg_${s}`, [0.08, ys * 0.24, 0.24], [0.055, 0.055, 0.44], m_yellow);
    c.add_sphere(`Chicken_Foot_${s}`, [0.18, ys * 0.24, 0.06], [0.18, 0.12, 0.05], m_yellow);
  }
  c.add_sphere('Chicken_Tail', [-0.78, 0.0, 1.22], [0.34, 0.20, 0.42], m_white, [0, -0.45, 0]);
  c.add_eyes('Chicken', 0.88, 0.28, 1.62, 0.085, m_eye);
  return c.finalize();
}

// ==============================================================================
// 10. CAT
// ==============================================================================
export function build_cat() {
  const c = createMobContext(0.44);
  const m_ginger = get_mat('Cat_Ginger', [0.92, 0.36, 0.08, 1.0], 0.42);
  const m_cream = get_mat('Cat_Cream', [0.98, 0.88, 0.76, 1.0], 0.42);
  const m_pink = get_mat('Cat_PinkNose', [0.96, 0.38, 0.50, 1.0], 0.35);
  const m_green = get_mat('Cat_EmeraldEye', [0.08, 0.78, 0.22, 1.0], 0.06);

  c.add_sphere('Cat_Body', [0.0, 0.0, 0.92], [1.02, 0.62, 0.64], m_ginger);
  c.add_sphere('Cat_Chest', [0.64, 0.0, 0.92], [0.52, 0.48, 0.54], m_cream);
  c.add_sphere('Cat_Head', [0.98, 0.0, 1.48], [0.58, 0.62, 0.56], m_ginger);
  for (const [s, ys] of [['L', 1], ['R', -1]]) {
    c.add_sphere(`Cat_Muzzle_${s}`, [1.44, ys * 0.14, 1.36], [0.18, 0.18, 0.14], m_cream);
    c.add_cone(`Cat_Ear_${s}`, [0.95, ys * 0.36, 2.02], [0.20, 0.16, 0.38], m_ginger, [-ys * 0.18, 0.10, 0]);
    c.add_cone(`Cat_InnerEar_${s}`, [1.00, ys * 0.36, 2.00], [0.12, 0.10, 0.28], m_pink, [-ys * 0.18, 0.10, 0]);
  }
  c.add_sphere('Cat_Nose', [1.58, 0.0, 1.44], [0.07, 0.09, 0.07], m_pink);
  c.add_eyes('Cat', 1.42, 0.26, 1.56, 0.095, m_green);
  for (const [nm, lx, ly] of [['FL', 0.54, 0.34], ['FR', 0.54, -0.34], ['BL', -0.62, 0.34], ['BR', -0.62, -0.34]]) {
    c.add_sphere(`Cat_Leg_${nm}`, [lx, ly, 0.46], [0.16, 0.16, 0.44], m_ginger);
    c.add_sphere(`Cat_Paw_${nm}`, [lx + 0.06, ly, 0.10], [0.19, 0.17, 0.10], m_cream);
  }
  c.add_curve_tail('Cat_Tail', [[-0.92, 0, 1.05], [-1.18, 0, 1.42], [-1.12, 0.08, 1.88], [-1.28, 0.12, 2.18]], 0.09, m_ginger);
  return c.finalize();
}

// ==============================================================================
// 11. NIGHT HORROR MOB 1: SHADOW STALKER / WENDIGO
// ==============================================================================
export function build_shadow_stalker() {
  const c = createMobContext(0.52);
  const m_hide = get_mat('Wendigo_VoidBark', [0.03, 0.03, 0.04, 1.0], 0.65, 0, 0, [0.12, 0.04, 0.04, 1.0]);
  const m_bone = get_mat('Wendigo_BleachedSkull', [0.82, 0.78, 0.68, 1.0], 0.42, 0, 0, [0.45, 0.12, 0.08, 1.0]);
  const m_antler = get_mat('Wendigo_BloodAntler', [0.28, 0.04, 0.04, 1.0], 0.38);
  const m_glow = get_mat('Wendigo_CrimsonVoidEye', [1.0, 0.0, 0.08, 1.0], 0.0, 0, 6.0);
  const m_core = get_mat('Wendigo_HeartGlow', [0.95, 0.02, 0.12, 1.0], 0.0, 0, 4.0);

  c.add_sphere('Wendigo_Torso', [0.0, 0.0, 1.85], [0.58, 0.52, 0.95], m_hide, [0, 0.42, 0]);
  c.add_sphere('Wendigo_SoulCore', [0.18, 0.0, 1.85], [0.28, 0.26, 0.42], m_core);
  for (let ri = 0; ri < 4; ri++) {
    const rz_rib = 2.15 - ri * 0.22;
    for (const ys of [1, -1]) {
      c.add_cylinder(`Wendigo_Rib_${ri}_${ys}`, [0.34, ys * 0.28, rz_rib], [0.045, 0.045, 0.38], m_bone, [PI / 2, 0.3, ys * 0.6]);
    }
  }
  c.add_sphere('Wendigo_Skull', [0.68, 0.0, 2.75], [0.54, 0.40, 0.44], m_bone);
  c.add_sphere('Wendigo_SnoutSkull', [1.22, 0.0, 2.62], [0.48, 0.22, 0.20], m_bone, [0, 0.25, 0]);
  c.add_sphere('Wendigo_JawBone', [1.12, 0.0, 2.35], [0.44, 0.18, 0.14], m_bone, [0, 0.55, 0]);

  for (const [s, ys] of [['L', 1], ['R', -1]]) {
    c.add_sphere(`Wendigo_EyeSocket_${s}`, [0.96, ys * 0.26, 2.78], [0.14, 0.12, 0.14], m_hide);
    c.add_sphere(`Wendigo_VoidEye_${s}`, [1.02, ys * 0.28, 2.78], [0.08, 0.08, 0.08], m_glow);
    c.add_curve_tail(`Wendigo_AntlerMain_${s}`, [[0.58, ys * 0.24, 3.05], [0.35, ys * 0.62, 3.55], [0.15, ys * 0.95, 4.05], [0.45, ys * 1.12, 4.45]], 0.065, m_antler);
    c.add_cone(`Wendigo_AntlerTine1_${s}`, [0.48, ys * 0.68, 3.82], [0.05, 0.02, 0.45], m_antler, [-ys * 0.35, 0.45, 0], 1.0, 0.04);
    c.add_cone(`Wendigo_AntlerTine2_${s}`, [0.28, ys * 0.98, 4.28], [0.05, 0.02, 0.42], m_antler, [-ys * 0.25, 0.35, 0], 1.0, 0.04);
    c.add_sphere(`Wendigo_UpperArm_${s}`, [0.38, ys * 0.72, 2.12], [0.18, 0.18, 0.68], m_hide, [0, 0.25, 0]);
    c.add_sphere(`Wendigo_Forearm_${s}`, [0.68, ys * 0.78, 1.22], [0.15, 0.15, 0.64], m_hide, [0, 0.38, 0]);
    [-0.12, -0.04, 0.04, 0.12].forEach((cy_off, ci) => {
      c.add_cone(`Wendigo_ScytheClaw_${s}_${ci}`, [1.05, ys * 0.78 + cy_off, 0.58], [0.04, 0.01, 0.48], m_bone, [0, PI * 0.72, 0]);
    });
    c.add_sphere(`Wendigo_Thigh_${s}`, [-0.18, ys * 0.42, 1.08], [0.22, 0.20, 0.58], m_hide, [0, -0.35, 0]);
    c.add_sphere(`Wendigo_Shin_${s}`, [-0.02, ys * 0.42, 0.45], [0.15, 0.15, 0.52], m_hide, [0, 0.25, 0]);
  }
  return c.finalize();
}

// ==============================================================================
// 12. NIGHT HORROR MOB 2: ABYSSAL BLOOD CRAWLER
// ==============================================================================
export function build_blood_crawler() {
  const c = createMobContext(0.48);
  const m_chitin = get_mat('Crawler_ObsidianChitin', [0.04, 0.02, 0.06, 1.0], 0.25, 0.45, 0, [0.18, 0.02, 0.08, 1.0]);
  const m_sac = get_mat('Crawler_BloodAbdomen', [0.38, 0.01, 0.04, 1.0], 0.35, 0, 0, [0.08, 0.01, 0.02, 1.0]);
  const m_glow_red = get_mat('Crawler_RedEyeGlow', [1.0, 0.02, 0.02, 1.0], 0.0, 0, 5.5);
  const m_venom = get_mat('Crawler_VenomFang', [0.85, 0.05, 0.15, 1.0], 0.12, 0, 1.5);

  c.add_sphere('Crawler_Thorax', [0.45, 0.0, 0.95], [0.78, 0.68, 0.52], m_chitin);
  c.add_sphere('Crawler_Abdomen', [-0.85, 0.0, 1.25], [1.12, 0.92, 0.82], m_sac, [0, -0.22, 0]);

  [[-0.55, 0.38, 1.88], [-0.55, -0.38, 1.88], [-1.05, 0.48, 1.82], [-1.05, -0.48, 1.82], [-0.82, 0.0, 1.98], [-1.42, 0.0, 1.68]].forEach(([sx, sy, sz], si) => {
    c.add_sphere(`Crawler_BloodOrb_${si}`, [sx, sy, sz - 0.12], [0.18, 0.18, 0.14], m_glow_red);
    c.add_cone(`Crawler_DorsalSpike_${si}`, [sx, sy, sz + 0.15], [0.10, 0.02, 0.48], m_chitin, [0, -0.35, 0]);
  });

  [-0.55, -0.38, -0.20, -0.07, 0.07, 0.20, 0.38, 0.55].forEach((eang, ei) => {
    const ex = 1.15 * Math.cos(eang * 0.5);
    const ey = 0.72 * Math.sin(eang);
    const ez = 1.12 + (Math.abs(eang) < 0.25 ? 0.08 : 0.0);
    const er = Math.abs(eang) < 0.25 ? 0.085 : 0.065;
    c.add_sphere(`Crawler_Eye_${ei}`, [ex, ey, ez], [er, er, er], m_glow_red);
  });

  for (const [s, ys] of [['L', 1], ['R', -1]]) {
    c.add_cone(`Crawler_Mandible_${s}`, [1.38, ys * 0.26, 0.78], [0.14, 0.12, 0.56], m_chitin, [0, PI * 0.62, -ys * 0.35]);
    c.add_cone(`Crawler_VenomTip_${s}`, [1.62, ys * 0.14, 0.62], [0.07, 0.01, 0.28], m_venom, [0, PI * 0.75, -ys * 0.55]);
    [0.78, 0.42, 0.05, -0.32].forEach((lx_base, li) => {
      const leg_pts = [
        [lx_base, ys * 0.52, 0.92],
        [lx_base + (0.25 - li * 0.15), ys * 1.38, 1.65],
        [lx_base + (0.35 - li * 0.22), ys * 1.95, 0.06],
      ];
      c.add_curve_tail(`Crawler_Leg_${s}_${li}`, leg_pts, 0.085, m_chitin);
      c.add_sphere(`Crawler_JointGlow_${s}_${li}`, leg_pts[1], [0.11, 0.11, 0.11], m_glow_red);
    });
  }
  return c.finalize();
}

// ==============================================================================
// 13. NIGHT HORROR MOB 3: GRIM WRAITH / SOUL REAPER
// ==============================================================================
export function build_grim_wraith() {
  const c = createMobContext(0.50);
  const m_cloak = get_mat('Wraith_ShadowCloak', [0.02, 0.03, 0.05, 1.0], 0.75, 0, 0, [0.05, 0.12, 0.16, 1.0]);
  const m_skull = get_mat('Wraith_PhantomBone', [0.75, 0.82, 0.80, 1.0], 0.38);
  const m_soul = get_mat('Wraith_SoulFireCyan', [0.0, 1.0, 0.72, 1.0], 0.0, 0, 6.5);
  const m_blade = get_mat('Wraith_RunicScythe', [0.55, 0.75, 0.82, 1.0], 0.12, 0.95);
  const m_void = get_mat('Pure_Void', [0.01, 0.01, 0.01, 1.0], 1.0);

  c.add_cone('Wraith_MainCloak', [0.0, 0.0, 1.55], [1.05, 0.88, 2.35], m_cloak, [0, 0, 0], 1.0, 0.35);
  for (let ti = 0; ti < 8; ti++) {
    const ang = ti * (PI / 4.0);
    c.add_cone(`Wraith_Tatter_${ti}`, [0.78 * Math.cos(ang), 0.72 * Math.sin(ang), 0.55], [0.24, 0.12, 0.85], m_cloak, [0.25 * Math.sin(ang), -0.25 * Math.cos(ang), ang]);
  }
  c.add_sphere('Wraith_SoulVortex', [0.38, 0.0, 1.78], [0.32, 0.32, 0.48], m_soul);
  c.add_sphere('Wraith_HoodCowl', [0.18, 0.0, 2.75], [0.66, 0.62, 0.68], m_cloak);
  c.add_sphere('Wraith_VoidInsideHood', [0.42, 0.0, 2.72], [0.48, 0.46, 0.52], m_void);
  c.add_sphere('Wraith_Skull', [0.54, 0.0, 2.76], [0.36, 0.34, 0.40], m_skull);
  c.add_sphere('Wraith_ScreamJaw', [0.62, 0.0, 2.48], [0.24, 0.22, 0.20], m_skull, [0, 0.42, 0]);

  for (const [s, ys] of [['L', 1], ['R', -1]]) {
    c.add_sphere(`Wraith_SoulEye_${s}`, [0.86, ys * 0.15, 2.80], [0.08, 0.08, 0.08], m_soul);
    c.add_sphere(`Wraith_Sleeve_${s}`, [0.42, ys * 0.78, 1.95], [0.42, 0.24, 0.48], m_cloak, [0, 0.45, ys * 0.25]);
    c.add_sphere(`Wraith_BonyHand_${s}`, [0.82, ys * 0.78, 1.78], [0.16, 0.14, 0.12], m_skull);
  }
  c.add_curve_tail('Wraith_ScytheStaff', [[0.82, 0.78, 0.25], [0.85, 0.78, 1.78], [0.90, 0.68, 3.45]], 0.055, m_cloak);
  c.add_cone('Wraith_ScytheBlade', [1.28, 0.12, 3.35], [0.22, 0.03, 1.58], m_blade, [1.35, 0.45, -0.35]);
  c.add_cone('Wraith_ScytheSoulEdge', [1.32, 0.08, 3.32], [0.08, 0.01, 1.48], m_soul, [1.35, 0.45, -0.35]);
  return c.finalize();
}

// ==============================================================================
// 14. NIGHT HORROR MOB 4: FLESH GHOUL / MUTANT NIGHT CRAWLER
// ==============================================================================
export function build_flesh_ghoul() {
  const c = createMobContext(0.48);
  const m_flesh = get_mat('Ghoul_DecayedFlesh', [0.28, 0.24, 0.22, 1.0], 0.58, 0, 0, [0.38, 0.08, 0.08, 1.0]);
  const m_gore = get_mat('Ghoul_ExposedMuscle', [0.48, 0.03, 0.04, 1.0], 0.35);
  const m_bone = get_mat('Ghoul_BoneBlade', [0.85, 0.80, 0.68, 1.0], 0.35);
  const m_toxic = get_mat('Ghoul_ToxicEye', [0.65, 1.0, 0.0, 1.0], 0.0, 0, 5.5);

  c.add_sphere('Ghoul_HunchTorso', [0.05, 0.0, 1.38], [0.98, 0.88, 0.86], m_flesh, [0, 0.45, 0]);
  c.add_sphere('Ghoul_MutantShoulderL', [0.32, 0.82, 1.72], [0.52, 0.48, 0.52], m_gore);
  c.add_sphere('Ghoul_MutantShoulderR', [0.32, -0.78, 1.58], [0.44, 0.42, 0.44], m_flesh);

  [[0.35, 0.85, 2.22], [0.15, 0.68, 2.12], [0.35, -0.80, 2.02], [0.0, 0.0, 2.25], [-0.45, 0.0, 2.05], [-0.85, 0.0, 1.78]].forEach(([sx, sy, sz], si) => {
    c.add_cone(`Ghoul_BoneSpike_${si}`, [sx, sy, sz], [0.12, 0.02, 0.55], m_bone, [sy * 0.25, -0.35, 0]);
  });

  c.add_sphere('Ghoul_Skull', [0.98, 0.0, 1.68], [0.58, 0.56, 0.54], m_flesh);
  c.add_sphere('Ghoul_MawCavity', [1.35, 0.0, 1.52], [0.38, 0.38, 0.34], m_gore);
  c.add_sphere('Ghoul_EyeCenter', [1.42, 0.0, 1.92], [0.10, 0.10, 0.10], m_toxic);

  for (const [s, ys] of [['L', 1], ['R', -1]]) {
    c.add_sphere(`Ghoul_EyeSide_${s}`, [1.42, ys * 0.28, 1.78], [0.085, 0.085, 0.085], m_toxic);
    c.add_sphere(`Ghoul_SplitJaw_${s}`, [1.48, ys * 0.26, 1.38], [0.36, 0.16, 0.18], m_flesh, [0, 0.25, ys * 0.42]);
    for (let ti = 0; ti < 4; ti++) {
      c.add_cone(`Ghoul_JawTooth_${s}_${ti}`, [1.35 + ti * 0.10, ys * 0.18, 1.44], [0.035, 0.01, 0.16], m_bone, [-ys * 0.8, 0, 0]);
    }
    c.add_sphere(`Ghoul_Arm_${s}`, [0.68, ys * 0.86, 0.92], [0.28, 0.28, 0.68], m_flesh, [0, 0.35, 0]);
    c.add_cone(`Ghoul_ArmBlade_${s}`, [1.18, ys * 0.86, 0.42], [0.14, 0.02, 0.78], m_bone, [0, PI * 0.65, 0]);
    c.add_sphere(`Ghoul_Leg_${s}`, [-0.52, ys * 0.52, 0.52], [0.28, 0.26, 0.52], m_flesh);
  }
  return c.finalize();
}

export function build_hexcaster() {
  const c = createMobContext(0.48);
  const robe = get_mat('Hex_Robe', [0.14, 0.05, 0.28, 1.0], 0.85, 0.0, 0.0, [0.06, 0.02, 0.14, 1.0]);
  const trim = get_mat('Hex_Trim', [0.58, 0.22, 0.88, 1.0], 0.4, 0.2, 1.5);
  const void_m = get_mat('Hex_Void', [0.02, 0.01, 0.05, 1.0], 0.98);
  const eye_glow = get_mat('Hex_Eye', [0.85, 0.35, 1.0, 1.0], 0.1, 0.0, 6.0);
  const hand_mat = get_mat('Hex_Hand', [0.68, 0.42, 0.95, 1.0], 0.2, 0.1, 4.0);

  c.add_cone('Hex_RobeLower', [0, 0, 0.72], [0.54, 0.54, 1.35], robe, [0, 0, 0], 1.0, 0.35);
  c.add_sphere('Hex_Torso', [0, 0, 1.28], [0.28, 0.34, 0.38], robe);
  c.add_cone('Hex_Mantle', [0, 0, 1.48], [0.42, 0.42, 0.28], trim, [0, 0, 0], 1.0, 0.5);

  c.add_cone('Hex_Hood', [0.04, 0, 1.84], [0.32, 0.32, 0.48], robe, [0, 0.14, 0], 1.0, 0.2);
  c.add_sphere('Hex_FaceVoid', [0.14, 0, 1.76], [0.16, 0.18, 0.2], void_m);
  for (const [s, ys] of [['L', 1], ['R', -1]]) {
    c.add_sphere(`Hex_Eye_${s}`, [0.27, ys * 0.08, 1.78], [0.045, 0.055, 0.032], eye_glow);
    c.add_sphere(`Hex_Arm_${s}`, [0.46, ys * 0.36, 1.32], [0.14, 0.14, 0.38], hand_mat, [0, 0.3, ys * 0.2]);
    c.add_cone(`Hex_RuneShard_${s}`, [0.54, ys * 0.36, 1.48], [0.05, 0.05, 0.22], eye_glow);
  }

  return c.finalize();
}

export function build_bonewalker() {
  const c = createMobContext(0.48);
  const bone = get_mat('Bone_White', [0.82, 0.79, 0.72, 1.0], 0.65, 0.0, 0.0, [0.62, 0.58, 0.52, 1.0]);
  const dark = get_mat('Bone_Dark', [0.12, 0.12, 0.14, 1.0], 0.9);
  const eye = get_mat('Bone_Eye', [0.35, 0.88, 1.0, 1.0], 0.1, 0.0, 5.0);
  const wood = get_mat('Bow_Wood', [0.38, 0.22, 0.09, 1.0], 0.7);

  c.add_cylinder('Bone_Pelvis', [0, 0, 0.76], [0.18, 0.18, 0.14], bone);
  c.add_cylinder('Bone_Spine', [0, 0, 1.12], [0.08, 0.08, 0.65], bone);
  for (let r = 0; r < 3; r++) {
    c.add_sphere(`Bone_Rib_${r}`, [0.04, 0, 1.02 + r * 0.14], [0.22, 0.28, 0.06], bone);
  }
  c.add_sphere('Bone_Head', [0.04, 0, 1.62], [0.24, 0.22, 0.26], bone);
  for (const [s, ys] of [['L', 1], ['R', -1]]) {
    c.add_sphere(`Bone_Eye_${s}`, [0.22, ys * 0.08, 1.64], [0.04, 0.045, 0.035], eye);
    c.add_cylinder(`Bone_Leg_${s}`, [0, ys * 0.14, 0.38], [0.06, 0.06, 0.72], bone);
    c.add_cylinder(`Bone_Arm_${s}`, [0.24, ys * 0.28, 1.26], [0.05, 0.05, 0.58], bone, [0, 0.45, 0]);
  }
  c.add_cylinder('Bone_BowStave', [0.54, -0.22, 1.26], [0.035, 0.035, 0.78], wood, [0.2, 0, 0]);
  c.add_cylinder('Bone_BowString', [0.46, -0.22, 1.26], [0.012, 0.012, 0.76], dark, [0.2, 0, 0]);

  return c.finalize();
}

// ==============================================================================
// 15. SOUL SKELETON (Summoned minion of GrimWraith, blocky with cyan glowing ribs & eyes)
// ==============================================================================
export function build_soul_skeleton() {
  const c = createMobContext(0.48);
  const m_bone = get_mat('SoulSkel_Bone', [0.78, 0.82, 0.84, 1.0], 0.52, 0, 0, [0.45, 0.55, 0.60, 1.0]);
  const m_dark = get_mat('SoulSkel_DarkBone', [0.12, 0.16, 0.18, 1.0], 0.70);
  const m_cyan = get_mat('SoulSkel_SoulCyan', [0.0, 1.0, 0.82, 1.0], 0.0, 0, 6.0);

  c.add_cylinder('SoulSkel_Pelvis', [0, 0, 0.76], [0.18, 0.18, 0.14], m_bone);
  c.add_cylinder('SoulSkel_Spine', [0, 0, 1.15], [0.08, 0.08, 0.65], m_bone);
  c.add_sphere('SoulSkel_SoulCore', [0.06, 0, 1.22], [0.16, 0.16, 0.26], m_cyan);

  // Ribs with cyan glowing slits
  for (let r = 0; r < 3; r++) {
    const rz = 1.04 + r * 0.16;
    c.add_sphere(`SoulSkel_Rib_${r}`, [0.04, 0, rz], [0.22, 0.30, 0.06], m_bone);
    c.add_sphere(`SoulSkel_RibGlow_${r}`, [0.08, 0, rz], [0.12, 0.22, 0.04], m_cyan);
  }

  // Skull with Screaming Jaw & Cyan Glowing Eye Sockets
  c.add_sphere('SoulSkel_Skull', [0.12, 0, 1.70], [0.26, 0.24, 0.28], m_bone);
  c.add_sphere('SoulSkel_Jaw', [0.22, 0, 1.48], [0.18, 0.14, 0.10], m_bone, [0, 0.25, 0]);

  for (const [s, ys] of [['L', 1], ['R', -1]]) {
    c.add_sphere(`SoulSkel_EyeSocket_${s}`, [0.30, ys * 0.09, 1.74], [0.06, 0.06, 0.06], m_dark);
    c.add_sphere(`SoulSkel_CyanEye_${s}`, [0.32, ys * 0.09, 1.74], [0.045, 0.045, 0.045], m_cyan);

    // Arms: Arm_R has claw scratches that animate forward
    c.add_cylinder(`SoulSkel_UpperArm_${s}`, [0.08, ys * 0.35, 1.30], [0.055, 0.055, 0.45], m_bone, [0, 0.2, ys * 0.15]);
    c.add_cylinder(`SoulSkel_Forearm_${s}`, [0.20, ys * 0.35, 0.95], [0.05, 0.05, 0.42], m_bone, [0, 0.4, 0]);
    c.add_sphere(`SoulSkel_Hand_${s}`, [0.28, ys * 0.35, 0.78], [0.08, 0.07, 0.09], m_bone);

    // Claws on both hands, extra prominent on right hand for Claw Scratch
    [-0.04, 0.0, 0.04].forEach((cy_off, ci) => {
      c.add_cone(
        `SoulSkel_Claw_${s}_${ci}`,
        [0.34, ys * 0.35 + cy_off, 0.76],
        [0.025, 0.01, 0.18],
        m_cyan,
        [0, PI * 0.65, 0]
      );
    });

    // Legs
    c.add_cylinder(`SoulSkel_Leg_${s}`, [0, ys * 0.16, 0.40], [0.065, 0.065, 0.72], m_bone);
    c.add_sphere(`SoulSkel_Foot_${s}`, [0.08, ys * 0.16, 0.07], [0.14, 0.08, 0.07], m_bone);
  }

  return c.finalize();
}

// ==============================================================================
// 16. VILLAGER (Classic Friendly Minecraft Villager with folded arms, robe & nose)
// ==============================================================================
export function build_villager() {
  const c = createMobContext(0.48);
  const m_skin = get_mat('Villager_Skin', [0.82, 0.60, 0.48, 1.0], 0.65);
  const m_robe = get_mat('Villager_Robe_Brown', [0.38, 0.24, 0.16, 1.0], 0.85);
  const m_robe_trim = get_mat('Villager_Robe_Trim', [0.28, 0.18, 0.12, 1.0], 0.80);
  const m_belt = get_mat('Villager_Belt_Emerald', [0.12, 0.68, 0.28, 1.0], 0.40, 0.1, 0.8);
  const m_nose = get_mat('Villager_Nose', [0.75, 0.52, 0.42, 1.0], 0.60);
  const m_unibrow = get_mat('Villager_Brow', [0.22, 0.15, 0.10, 1.0], 0.85);
  const m_eye_green = get_mat('Villager_Eye_Green', [0.15, 0.58, 0.22, 1.0], 0.2, 0, 1.2);
  const m_shoes = get_mat('Villager_Shoe', [0.16, 0.12, 0.10, 1.0], 0.8);

  // Head and Features
  c.add_sphere('Villager_Head', [0.0, 0.0, 1.70], [0.34, 0.32, 0.38], m_skin);
  c.add_sphere('Villager_Nose', [0.35, 0.0, 1.58], [0.12, 0.08, 0.18], m_nose);
  c.add_cylinder('Villager_Unibrow', [0.28, 0.0, 1.78], [0.04, 0.04, 0.42], m_unibrow, [rad(90), 0, 0]);
  c.add_sphere('Villager_Eye_L', [0.28, 0.11, 1.68], [0.05, 0.05, 0.05], m_eye_green);
  c.add_sphere('Villager_Eye_R', [0.28, -0.11, 1.68], [0.05, 0.05, 0.05], m_eye_green);

  // Body & Robe
  c.add_cylinder('Villager_Robe', [0.0, 0.0, 1.05], [0.35, 0.37, 0.88], m_robe);
  c.add_cylinder('Villager_Belt', [0.0, 0.0, 0.98], [0.37, 0.39, 0.14], m_belt);

  // Folded Arms
  c.add_cylinder('Villager_FoldedArms_Middle', [0.26, 0.0, 1.15], [0.11, 0.11, 0.52], m_robe, [rad(90), 0, 0]);
  c.add_sphere('Villager_Hand_L', [0.26, 0.18, 1.15], [0.075, 0.075, 0.075], m_skin);
  c.add_sphere('Villager_Hand_R', [0.26, -0.18, 1.15], [0.075, 0.075, 0.075], m_skin);
  c.add_cylinder('Villager_Sleeve_L', [0.10, 0.28, 1.25], [0.11, 0.11, 0.36], m_robe, [0, rad(25), 0]);
  c.add_cylinder('Villager_Sleeve_R', [0.10, -0.28, 1.25], [0.11, 0.11, 0.36], m_robe, [0, rad(25), 0]);

  // Legs & Feet
  for (const [s, ys] of [['L', 1], ['R', -1]]) {
    c.add_cylinder(`Villager_Leg_${s}`, [0.0, ys * 0.14, 0.38], [0.11, 0.11, 0.70], m_robe_trim);
    c.add_sphere(`Villager_Foot_${s}`, [0.06, ys * 0.14, 0.06], [0.13, 0.10, 0.08], m_shoes);
  }

  return c.finalize();
}

// ==============================================================================
// 17. VILLAGER FEMALE (Village Artisan with styled hair, collar, and apron)
// ==============================================================================
export function build_villager_female() {
  const c = createMobContext(0.48);
  const m_skin = get_mat('VillagerF_Skin', [0.85, 0.64, 0.52, 1.0], 0.65);
  const m_hair = get_mat('VillagerF_Hair', [0.26, 0.14, 0.08, 1.0], 0.75);
  const m_robe = get_mat('VillagerF_Robe', [0.42, 0.28, 0.20, 1.0], 0.85);
  const m_apron = get_mat('VillagerF_Apron', [0.18, 0.48, 0.52, 1.0], 0.75);
  const m_trim = get_mat('VillagerF_Trim', [0.78, 0.72, 0.65, 1.0], 0.70);
  const m_nose = get_mat('VillagerF_Nose', [0.78, 0.56, 0.45, 1.0], 0.60);
  const m_eye = get_mat('VillagerF_Eye', [0.12, 0.52, 0.35, 1.0], 0.2, 0, 1.2);
  const m_shoes = get_mat('VillagerF_Shoe', [0.20, 0.14, 0.12, 1.0], 0.8);

  // Head, Hairstyles and Features
  c.add_sphere('VillagerF_Head', [0.0, 0.0, 1.70], [0.32, 0.30, 0.36], m_skin);
  c.add_sphere('VillagerF_Hair_Top', [-0.04, 0.0, 1.94], [0.34, 0.34, 0.20], m_hair);
  c.add_sphere('VillagerF_Hair_Braid_L', [-0.08, 0.26, 1.60], [0.11, 0.09, 0.42], m_hair);
  c.add_sphere('VillagerF_Hair_Braid_R', [-0.08, -0.26, 1.60], [0.11, 0.09, 0.42], m_hair);
  c.add_sphere('VillagerF_Nose', [0.32, 0.0, 1.60], [0.10, 0.07, 0.15], m_nose);
  c.add_sphere('VillagerF_Eye_L', [0.27, 0.10, 1.70], [0.048, 0.048, 0.048], m_eye);
  c.add_sphere('VillagerF_Eye_R', [0.27, -0.10, 1.70], [0.048, 0.048, 0.048], m_eye);

  // Robe, Collar & Artisan Apron
  c.add_cylinder('VillagerF_Robe', [0.0, 0.0, 1.05], [0.34, 0.36, 0.88], m_robe);
  c.add_cylinder('VillagerF_Apron', [0.10, 0.0, 1.02], [0.25, 0.28, 0.52], m_apron);
  c.add_cylinder('VillagerF_Collar', [0.14, 0.0, 1.48], [0.22, 0.30, 0.08], m_trim);

  // Folded Arms
  c.add_cylinder('VillagerF_FoldedArms', [0.24, 0.0, 1.15], [0.10, 0.10, 0.48], m_robe, [rad(90), 0, 0]);
  c.add_sphere('VillagerF_Hand_L', [0.24, 0.16, 1.15], [0.07, 0.07, 0.07], m_skin);
  c.add_sphere('VillagerF_Hand_R', [0.24, -0.16, 1.15], [0.07, 0.07, 0.07], m_skin);

  // Legs & Feet
  for (const [s, ys] of [['L', 1], ['R', -1]]) {
    c.add_cylinder(`VillagerF_Leg_${s}`, [0.0, ys * 0.13, 0.38], [0.10, 0.10, 0.70], m_robe);
    c.add_sphere(`VillagerF_Foot_${s}`, [0.05, ys * 0.13, 0.06], [0.12, 0.09, 0.08], m_shoes);
  }

  return c.finalize();
}

export const BLENDER_MOB_BUILDERS = {
  Pig: build_pig,
  Snorter: build_pig,
  Dog: build_dog,
  Cow: build_cow,
  Moobeast: build_cow,
  Sheep: build_sheep,
  Woolback: build_sheep,
  Wolf: build_wolf,
  FangWolf: build_wolf,
  Rabbit: build_rabbit,
  Bird: build_bird,
  Monkey: build_monkey,
  TreeswingApe: build_monkey,
  Chicken: build_chicken,
  Cluck: build_chicken,
  Cat: build_cat,
  Villager: build_villager,
  VillagerFemale: build_villager_female,
  ShadowStalker: build_shadow_stalker,
  Shambler: build_shadow_stalker,
  BloodCrawler: build_blood_crawler,
  Crawler: build_blood_crawler,
  GrimWraith: build_grim_wraith,
  Wraith: build_grim_wraith,
  SoulSkeleton: build_soul_skeleton,
  FleshGhoul: build_flesh_ghoul,
  Bloater: build_flesh_ghoul,
  Hexcaster: build_hexcaster,
  Bonewalker: build_bonewalker,
};

export const ALL_14_BLENDER_MOB_TYPES = [
  'Pig',
  'Dog',
  'Cow',
  'Sheep',
  'Rabbit',
  'Bird',
  'Cat',
  'Chicken',
  'Wolf',
  'Monkey',
  'Villager',
  'VillagerFemale',
  'ShadowStalker',
  'BloodCrawler',
  'GrimWraith',
  'SoulSkeleton',
  'FleshGhoul',
  'Hexcaster',
  'Bonewalker',
];

export function createBlenderMobInstance(mobType = 'Pig') {
  const key = Object.keys(BLENDER_MOB_BUILDERS).find(
    (k) => k.toLowerCase() === String(mobType).toLowerCase()
  );
  const fn = key ? BLENDER_MOB_BUILDERS[key] : build_pig;
  return fn();
}
