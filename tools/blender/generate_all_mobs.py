import bpy
import math
import os

OUT_DIR = r"c:\Users\npal7\OneDrive\PROJECT\project1\MOB"
os.makedirs(OUT_DIR, exist_ok=True)

MAT_CACHE = {}

def clear_scene():
    MAT_CACHE.clear()
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for col in list(bpy.data.collections):
        bpy.data.collections.remove(col)
    for block in list(bpy.data.meshes):
        if block.users == 0:
            bpy.data.meshes.remove(block)
    for block in list(bpy.data.curves):
        if block.users == 0:
            bpy.data.curves.remove(block)
    for block in list(bpy.data.materials):
        if block.users == 0:
            bpy.data.materials.remove(block)

def get_mat(name, color, roughness=0.4, metallic=0.0, emission=0.0, color2=None, noise_scale=25.0, bump_strength=0.0):
    key = (name, color, roughness, metallic, emission, color2, noise_scale, bump_strength)
    if key in MAT_CACHE:
        return MAT_CACHE[key]
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    mat.diffuse_color = color
    mat.roughness = roughness
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if emission > 0 and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = color
            bsdf.inputs["Emission Strength"].default_value = emission

        # Procedural Dual-Color Texture + Surface Bump for detailed fur/feathers/hide
        if color2 is not None or bump_strength > 0.0:
            tex_coord = nodes.new("ShaderNodeTexCoord")
            noise = nodes.new("ShaderNodeTexNoise")
            noise.inputs["Scale"].default_value = noise_scale
            noise.inputs["Detail"].default_value = 8.0
            noise.inputs["Roughness"].default_value = 0.65
            links.new(tex_coord.outputs["Object"], noise.inputs["Vector"])

            if color2 is not None:
                mix = nodes.new("ShaderNodeMix")
                mix.data_type = 'RGBA'
                mix.inputs["A"].default_value = color
                mix.inputs["B"].default_value = color2
                links.new(noise.outputs["Fac"], mix.inputs["Factor"])
                links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])

            if bump_strength > 0.0:
                bump = nodes.new("ShaderNodeBump")
                bump.inputs["Strength"].default_value = bump_strength
                bump.inputs["Distance"].default_value = 0.04
                links.new(noise.outputs["Fac"], bump.inputs["Height"])
                links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    MAT_CACHE[key] = mat
    return mat

def assign_mat(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)

def smooth_obj(obj, subsurf_levels=2, bevel_width=0.0):
    if hasattr(obj.data, "polygons"):
        for p in obj.data.polygons:
            p.use_smooth = True
    if bevel_width > 0:
        bev = obj.modifiers.new(name="Bevel", type='BEVEL')
        bev.width = bevel_width
        bev.segments = 4
    if subsurf_levels > 0:
        mod = obj.modifiers.new(name="Subsurf", type='SUBSURF')
        mod.levels = subsurf_levels
        mod.render_levels = subsurf_levels

def link_to_col(obj, col):
    if col is not None:
        for c in list(obj.users_collection):
            c.objects.unlink(obj)
        col.objects.link(obj)

def add_sphere(name, loc, scale, mat, parent, col=None, rot=(0, 0, 0), subsurf=2):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1.0, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    assign_mat(obj, mat)
    smooth_obj(obj, subsurf_levels=subsurf)
    obj.parent = parent
    link_to_col(obj, col)
    return obj

def add_cylinder(name, loc, scale, mat, parent, col=None, rot=(0, 0, 0), bevel=0.08, subsurf=2):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=1.0, depth=1.0, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    assign_mat(obj, mat)
    smooth_obj(obj, subsurf_levels=subsurf, bevel_width=bevel)
    obj.parent = parent
    link_to_col(obj, col)
    return obj

def add_cone(name, loc, scale, mat, parent, col=None, rot=(0, 0, 0), r1=1.0, r2=0.04, subsurf=1):
    bpy.ops.mesh.primitive_cone_add(vertices=28, radius1=r1, radius2=r2, depth=1.0, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    assign_mat(obj, mat)
    smooth_obj(obj, subsurf_levels=subsurf, bevel_width=0.02)
    obj.parent = parent
    link_to_col(obj, col)
    return obj

def add_curve_tail(name, points, bevel_depth, mat, parent, col=None):
    curve_data = bpy.data.curves.new(name + "_Curve", type='CURVE')
    curve_data.dimensions = '3D'
    curve_data.resolution_u = 16
    curve_data.bevel_depth = bevel_depth
    curve_data.bevel_resolution = 6
    curve_data.use_fill_caps = True
    spline = curve_data.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for i, (px, py, pz) in enumerate(points):
        spline.points[i].co = (px, py, pz, 1.0)
    obj = bpy.data.objects.new(name, curve_data)
    bpy.context.collection.objects.link(obj)
    assign_mat(obj, mat)
    obj.parent = parent
    link_to_col(obj, col)
    return obj

def add_eyes(prefix, ex, ey_abs, ez, radius, mat_iris, parent, col=None, shine=True):
    mat_shine = get_mat("Eye_Shine_White", (1.0, 1.0, 1.0, 1.0), roughness=0.0, emission=1.8)
    for side, y_sign in [("L", 1.0), ("R", -1.0)]:
        ey = y_sign * ey_abs
        add_sphere(f"{prefix}_Eye_{side}", (ex, ey, ez), (radius, radius, radius), mat_iris, parent, col, subsurf=1)
        if shine:
            sr = radius * 0.27
            add_sphere(
                f"{prefix}_EyeShine_{side}",
                (ex + radius * 0.72, ey - y_sign * radius * 0.22, ez + radius * 0.34),
                (sr, sr, sr),
                mat_shine,
                parent,
                col,
                subsurf=1,
            )

def make_root(name, offset=(0.0, 0.0, 0.0), rot_z=0.0, col=None):
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0.0, 0.0, 0.0))
    root = bpy.context.active_object
    root.name = f"{name}_Root"
    link_to_col(root, col)
    return root, offset, rot_z

def finalize_root(root, offset, rot_z):
    root.location = offset
    root.rotation_euler = (0.0, 0.0, rot_z)
    return root

# ==============================================================================
# 1. PIG
# ==============================================================================
def build_pig(offset=(0, 0, 0), rot_z=0.0, col=None):
    root, off, rz = make_root("Pig", offset, rot_z, col)
    m_skin = get_mat("Pig_Skin", (0.95, 0.28, 0.40, 1.0), 0.38)
    m_snout = get_mat("Pig_Snout", (0.88, 0.15, 0.28, 1.0), 0.34)
    m_blush = get_mat("Pig_Blush", (0.96, 0.08, 0.20, 1.0), 0.42)
    m_nostril = get_mat("Pig_Nostril", (0.08, 0.015, 0.025, 1.0), 0.55)
    m_eye = get_mat("Eye_Black", (0.01, 0.01, 0.01, 1.0), 0.04)
    m_hoof = get_mat("Hoof_Brown", (0.14, 0.07, 0.06, 1.0), 0.45)

    add_sphere("Pig_Body", (0.0, 0.0, 1.12), (1.32, 0.98, 0.92), m_skin, root, col)
    add_sphere("Pig_Head", (1.18, 0.0, 1.42), (0.78, 0.76, 0.74), m_skin, root, col)
    add_cylinder("Pig_Snout", (1.88, 0.0, 1.33), (0.31, 0.40, 0.24), m_snout, root, col, rot=(0, math.pi / 2, 0), bevel=0.16)

    for s, ys in [("L", 1), ("R", -1)]:
        add_sphere(f"Pig_Nostril_{s}", (2.02, ys * 0.14, 1.34), (0.045, 0.072, 0.11), m_nostril, root, col, subsurf=1)
        add_sphere(f"Pig_Cheek_{s}", (1.66, ys * 0.52, 1.28), (0.14, 0.12, 0.09), m_blush, root, col, rot=(0, 0, ys * 0.35), subsurf=1)
        add_sphere(f"Pig_Ear_{s}", (1.18, ys * 0.48, 2.02), (0.16, 0.26, 0.34), m_skin, root, col, rot=(ys * 0.48, 0.38, ys * 0.30))
        add_sphere(f"Pig_InnerEar_{s}", (1.23, ys * 0.49, 2.00), (0.09, 0.18, 0.24), m_snout, root, col, rot=(ys * 0.48, 0.38, ys * 0.30))

    add_eyes("Pig", 1.74, 0.35, 1.62, 0.115, m_eye, root, col)

    for nm, lx, ly in [("FL", 0.65, 0.50), ("FR", 0.65, -0.50), ("BL", -0.68, 0.50), ("BR", -0.68, -0.50)]:
        add_sphere(f"Pig_Leg_{nm}", (lx, ly, 0.48), (0.24, 0.24, 0.42), m_skin, root, col)
        add_cylinder(f"Pig_Hoof_{nm}", (lx + 0.02, ly, 0.10), (0.22, 0.22, 0.20), m_hoof, root, col, bevel=0.05, subsurf=1)

    pts = []
    for i in range(45):
        t = i / 44.0
        ang = t * 4.4 * math.pi
        r = 0.18 * (1.0 - 0.3 * t) * math.sin(min(t * 3.5, 1.0) * math.pi / 2)
        pts.append((-1.22 - t * 0.52, r * math.cos(ang), 1.35 + t * 0.32 + r * math.sin(ang)))
    add_curve_tail("Pig_Tail", pts, 0.068, m_snout, root, col)
    return finalize_root(root, off, rz)

# ==============================================================================
# 2. DETAILED GERMAN SHEPHERD / GUARD DOG (Upgraded Texture & Anatomy)
# ==============================================================================
def build_dog(offset=(0, 0, 0), rot_z=0.0, col=None):
    root, off, rz = make_root("Dog", offset, rot_z, col)
    m_tan = get_mat("Dog_MahoganyFur", (0.58, 0.24, 0.06, 1.0), 0.52, color2=(0.42, 0.16, 0.03, 1.0), noise_scale=35.0, bump_strength=0.35)
    m_saddle = get_mat("Dog_ObsidianSaddle", (0.04, 0.04, 0.05, 1.0), 0.48, color2=(0.12, 0.08, 0.05, 1.0), noise_scale=40.0, bump_strength=0.38)
    m_cream = get_mat("Dog_CreamUndercoat", (0.86, 0.68, 0.42, 1.0), 0.50, color2=(0.72, 0.52, 0.28, 1.0), noise_scale=30.0, bump_strength=0.25)
    m_nose = get_mat("Dog_WetNose", (0.02, 0.02, 0.02, 1.0), 0.08, bump_strength=0.15)
    m_collar = get_mat("Dog_LeatherCollar", (0.45, 0.04, 0.03, 1.0), 0.32)
    m_steel = get_mat("Dog_SteelSpike", (0.85, 0.88, 0.92, 1.0), 0.15, metallic=0.92)
    m_fang = get_mat("Dog_IvoryFang", (0.98, 0.96, 0.90, 1.0), 0.15)
    m_tongue = get_mat("Dog_PinkTongue", (0.88, 0.18, 0.28, 1.0), 0.30)
    m_eye = get_mat("Dog_AmberIris", (0.78, 0.36, 0.04, 1.0), 0.05)

    # Muscular Ribcage, Waist, & Black Saddle Coat
    add_sphere("Dog_Ribcage", (0.28, 0.0, 1.25), (0.88, 0.68, 0.76), m_tan, root, col)
    add_sphere("Dog_Abdomen", (-0.52, 0.0, 1.22), (0.82, 0.56, 0.64), m_tan, root, col)
    add_sphere("Dog_BlackSaddle", (-0.12, 0.0, 1.52), (1.08, 0.65, 0.58), m_saddle, root, col)
    add_sphere("Dog_ChestMane", (0.82, 0.0, 1.18), (0.64, 0.58, 0.68), m_cream, root, col)
    add_sphere("Dog_Neck", (0.98, 0.0, 1.62), (0.48, 0.46, 0.56), m_tan, root, col, rot=(0, 0.38, 0))

    # Studded Guard Collar
    add_cylinder("Dog_Collar", (1.02, 0.0, 1.52), (0.50, 0.48, 0.11), m_collar, root, col, rot=(0, 0.52, 0), bevel=0.03)
    for ang_deg in range(0, 360, 45):
        rad = math.radians(ang_deg)
        sx = 1.02 + 0.22 * math.cos(rad)
        sy = 0.50 * math.sin(rad)
        sz = 1.52 - 0.22 * math.cos(rad)
        add_cone(f"Dog_Stud_{ang_deg}", (sx, sy, sz), (0.05, 0.05, 0.10), m_steel, root, col, rot=(rad, 0, 0))

    # Sculpted Shepherd Head, Black Mask Muzzle, & Jaws with Fangs
    add_sphere("Dog_Skull", (1.32, 0.0, 1.88), (0.58, 0.54, 0.54), m_tan, root, col)
    add_sphere("Dog_SkullCrown", (1.22, 0.0, 2.12), (0.45, 0.42, 0.30), m_saddle, root, col)
    add_sphere("Dog_UpperMuzzle", (1.88, 0.0, 1.80), (0.52, 0.28, 0.24), m_saddle, root, col)
    add_sphere("Dog_LowerJaw", (1.82, 0.0, 1.60), (0.46, 0.24, 0.16), m_tan, root, col, rot=(0, 0.22, 0))
    add_sphere("Dog_Tongue", (1.92, 0.0, 1.64), (0.28, 0.14, 0.05), m_tongue, root, col, rot=(0, 0.30, 0))
    add_sphere("Dog_Nose", (2.36, 0.0, 1.86), (0.11, 0.13, 0.10), m_nose, root, col, subsurf=1)

    # Sharp Canine Fangs + Pointed Alert Shepherd Ears + Articulated Legs & Claws
    for s, ys in [("L", 1), ("R", -1)]:
        add_cone(f"Dog_FangU_{s}", (2.14, ys * 0.14, 1.72), (0.035, 0.035, 0.12), m_fang, root, col, rot=(math.pi, 0, 0))
        add_cone(f"Dog_FangL_{s}", (2.10, ys * 0.12, 1.66), (0.030, 0.030, 0.10), m_fang, root, col)
        add_cone(f"Dog_EarOuter_{s}", (1.18, ys * 0.38, 2.46), (0.22, 0.16, 0.54), m_saddle, root, col, rot=(-ys * 0.14, 0.18, 0))
        add_cone(f"Dog_EarInner_{s}", (1.24, ys * 0.38, 2.44), (0.13, 0.10, 0.40), m_cream, root, col, rot=(-ys * 0.14, 0.18, 0))
        add_sphere(f"Dog_Brow_{s}", (1.68, ys * 0.24, 2.06), (0.16, 0.14, 0.08), m_tan, root, col, rot=(0, 0.2, ys * 0.25))

    add_eyes("Dog", 1.74, 0.26, 1.96, 0.085, m_eye, root, col)

    for nm, lx, ly, is_back in [("FL", 0.68, 0.38, False), ("FR", 0.68, -0.38, False), ("BL", -0.78, 0.40, True), ("BR", -0.78, -0.40, True)]:
        if is_back:
            add_sphere(f"Dog_Thigh_{nm}", (lx - 0.06, ly, 0.98), (0.34, 0.22, 0.42), m_saddle, root, col, rot=(0, -0.25, 0))
        add_sphere(f"Dog_UpperLeg_{nm}", (lx, ly, 0.68), (0.18, 0.17, 0.38), m_tan, root, col)
        add_sphere(f"Dog_LowerLeg_{nm}", (lx + 0.04, ly, 0.34), (0.13, 0.13, 0.32), m_tan, root, col)
        add_sphere(f"Dog_Paw_{nm}", (lx + 0.14, ly, 0.10), (0.22, 0.18, 0.11), m_tan, root, col, subsurf=1)
        for ti, ty_off in enumerate([-0.08, 0.0, 0.08]):
            add_cone(f"Dog_Claw_{nm}_{ti}", (lx + 0.34, ly + ty_off, 0.06), (0.025, 0.025, 0.08), m_saddle, root, col, rot=(0, math.pi / 2, 0))

    pts = [(-1.20, 0, 1.32), (-1.58, 0.0, 1.05), (-1.88, 0.0, 0.88), (-2.12, 0.0, 0.95)]
    add_curve_tail("Dog_BushyTail", pts, 0.14, m_saddle, root, col)
    return finalize_root(root, off, rz)

# ==============================================================================
# 3. COW
# ==============================================================================
def build_cow(offset=(0, 0, 0), rot_z=0.0, col=None):
    root, off, rz = make_root("Cow", offset, rot_z, col)
    m_white = get_mat("Cow_White", (0.94, 0.94, 0.92, 1.0), 0.42)
    m_spot = get_mat("Cow_BlackSpot", (0.05, 0.05, 0.06, 1.0), 0.45)
    m_muzzle = get_mat("Cow_PinkMuzzle", (0.94, 0.48, 0.54, 1.0), 0.38)
    m_horn = get_mat("Cow_Horn", (0.88, 0.82, 0.65, 1.0), 0.30)
    m_udder = get_mat("Cow_Udder", (0.95, 0.58, 0.66, 1.0), 0.40)
    m_hoof = get_mat("Hoof_Dark", (0.12, 0.10, 0.10, 1.0), 0.45)
    m_eye = get_mat("Eye_Black", (0.01, 0.01, 0.01, 1.0), 0.04)

    add_sphere("Cow_Body", (0.0, 0.0, 1.35), (1.52, 1.02, 1.02), m_white, root, col)
    add_sphere("Cow_Spot1", (0.25, 0.68, 1.72), (0.55, 0.42, 0.48), m_spot, root, col)
    add_sphere("Cow_Spot2", (-0.55, -0.65, 1.58), (0.62, 0.45, 0.52), m_spot, root, col)
    add_sphere("Cow_Spot3", (-0.15, 0.0, 2.08), (0.52, 0.68, 0.35), m_spot, root, col)
    add_sphere("Cow_Spot4", (-0.82, 0.55, 1.35), (0.45, 0.42, 0.48), m_spot, root, col)
    add_sphere("Cow_Udder", (-0.35, 0.0, 0.58), (0.38, 0.32, 0.25), m_udder, root, col)
    add_sphere("Cow_Head", (1.38, 0.0, 1.78), (0.76, 0.72, 0.75), m_white, root, col)
    add_sphere("Cow_EyePatch", (1.58, 0.36, 1.96), (0.32, 0.28, 0.28), m_spot, root, col)
    add_sphere("Cow_Muzzle", (1.98, 0.0, 1.58), (0.42, 0.64, 0.42), m_muzzle, root, col)

    for s, ys in [("L", 1), ("R", -1)]:
        add_sphere(f"Cow_Nostril_{s}", (2.34, ys * 0.22, 1.62), (0.06, 0.09, 0.12), m_spot, root, col, subsurf=1)
        add_sphere(f"Cow_Ear_{s}", (1.28, ys * 0.76, 1.98), (0.16, 0.38, 0.18), m_spot, root, col, rot=(0, 0, ys * 0.25))
        add_cone(f"Cow_Horn_{s}", (1.25, ys * 0.44, 2.48), (0.14, 0.14, 0.42), m_horn, root, col, rot=(-ys * 0.32, 0.15, 0))

    add_eyes("Cow", 1.85, 0.42, 1.98, 0.115, m_eye, root, col)

    for nm, lx, ly in [("FL", 0.82, 0.52), ("FR", 0.82, -0.52), ("BL", -0.85, 0.52), ("BR", -0.85, -0.52)]:
        add_sphere(f"Cow_Leg_{nm}", (lx, ly, 0.62), (0.24, 0.24, 0.60), m_white, root, col)
        add_cylinder(f"Cow_Hoof_{nm}", (lx + 0.02, ly, 0.11), (0.23, 0.23, 0.22), m_hoof, root, col, bevel=0.05, subsurf=1)

    pts = [(-1.42, 0, 1.65), (-1.68, 0, 1.35), (-1.78, 0.05, 0.92)]
    add_curve_tail("Cow_Tail", pts, 0.065, m_white, root, col)
    add_sphere("Cow_TailTuft", (-1.78, 0.05, 0.82), (0.14, 0.14, 0.22), m_spot, root, col)
    return finalize_root(root, off, rz)

# ==============================================================================
# 4. SHEEP
# ==============================================================================
def build_sheep(offset=(0, 0, 0), rot_z=0.0, col=None):
    root, off, rz = make_root("Sheep", offset, rot_z, col)
    m_wool = get_mat("Sheep_Wool", (0.96, 0.95, 0.90, 1.0), 0.78, bump_strength=0.25)
    m_face = get_mat("Sheep_Face_Charcoal", (0.12, 0.11, 0.13, 1.0), 0.48)
    m_hoof = get_mat("Sheep_Hoof", (0.06, 0.05, 0.06, 1.0), 0.40)
    m_eye = get_mat("Eye_Black", (0.01, 0.01, 0.01, 1.0), 0.04)

    add_sphere("Sheep_WoolCore", (0.0, 0.0, 1.22), (1.28, 1.05, 0.98), m_wool, root, col)
    puff_coords = [
        (0.55, 0.55, 1.45, 0.62), (0.55, -0.55, 1.45, 0.62),
        (0.0, 0.72, 1.28, 0.68),  (0.0, -0.72, 1.28, 0.68),
        (-0.58, 0.52, 1.42, 0.64), (-0.58, -0.52, 1.42, 0.64),
        (0.28, 0.0, 1.78, 0.66),  (-0.38, 0.0, 1.76, 0.66),
        (0.75, 0.0, 1.32, 0.62),  (-0.85, 0.0, 1.35, 0.62),
    ]
    for idx, (px, py, pz, pr) in enumerate(puff_coords):
        add_sphere(f"Sheep_WoolPuff_{idx}", (px, py, pz), (pr, pr, pr), m_wool, root, col, subsurf=1)

    add_sphere("Sheep_Head", (1.28, 0.0, 1.56), (0.68, 0.56, 0.58), m_face, root, col)
    add_sphere("Sheep_HeadWoolCap", (1.18, 0.0, 1.98), (0.52, 0.54, 0.38), m_wool, root, col)
    add_sphere("Sheep_HeadWoolPuffL", (1.25, 0.32, 1.92), (0.32, 0.32, 0.28), m_wool, root, col, subsurf=1)
    add_sphere("Sheep_HeadWoolPuffR", (1.25, -0.32, 1.92), (0.32, 0.32, 0.28), m_wool, root, col, subsurf=1)

    for s, ys in [("L", 1), ("R", -1)]:
        add_sphere(f"Sheep_Ear_{s}", (1.18, ys * 0.64, 1.62), (0.14, 0.34, 0.14), m_face, root, col, rot=(0, 0, ys * 0.2))

    add_eyes("Sheep", 1.72, 0.32, 1.68, 0.10, m_eye, root, col)

    for nm, lx, ly in [("FL", 0.62, 0.44), ("FR", 0.62, -0.44), ("BL", -0.65, 0.44), ("BR", -0.65, -0.44)]:
        add_sphere(f"Sheep_Leg_{nm}", (lx, ly, 0.54), (0.18, 0.18, 0.52), m_face, root, col)
        add_cylinder(f"Sheep_Hoof_{nm}", (lx + 0.02, ly, 0.10), (0.18, 0.18, 0.18), m_hoof, root, col, bevel=0.04, subsurf=1)

    add_sphere("Sheep_Tail", (-1.35, 0.0, 1.38), (0.36, 0.34, 0.34), m_wool, root, col)
    return finalize_root(root, off, rz)

# ==============================================================================
# 5. ANGRY RED-EYED DIRE WOLF (Glowing Red Eyes, Angry Brow, Bared Fangs, Bristling Hackles)
# ==============================================================================
def build_wolf(offset=(0, 0, 0), rot_z=0.0, col=None):
    root, off, rz = make_root("Wolf", offset, rot_z, col)
    m_grey = get_mat("Wolf_TimberHide", (0.16, 0.18, 0.22, 1.0), 0.52, color2=(0.08, 0.09, 0.12, 1.0), noise_scale=35.0, bump_strength=0.45)
    m_silver = get_mat("Wolf_FrostRuff", (0.62, 0.65, 0.70, 1.0), 0.48, color2=(0.35, 0.38, 0.42, 1.0), noise_scale=30.0, bump_strength=0.35)
    m_dark = get_mat("Wolf_ShadowMane", (0.04, 0.04, 0.06, 1.0), 0.55, bump_strength=0.50)
    m_red_eye = get_mat("Wolf_BloodRedEye", (1.0, 0.01, 0.01, 1.0), 0.02, emission=4.5)
    m_fang = get_mat("Wolf_RazorFang", (0.98, 0.97, 0.92, 1.0), 0.12)
    m_gum = get_mat("Wolf_BloodGums", (0.45, 0.02, 0.04, 1.0), 0.35)

    add_sphere("Wolf_Body", (-0.05, 0.0, 1.18), (1.38, 0.72, 0.80), m_grey, root, col)
    add_sphere("Wolf_BackMane", (0.10, 0.0, 1.62), (1.28, 0.50, 0.46), m_dark, root, col)
    # Spiky bristling dorsal hackles along back & neck
    for i, hx in enumerate([0.95, 0.65, 0.30, -0.10, -0.50]):
        add_cone(f"Wolf_Hackle_{i}", (hx, 0.0, 2.02 - i * 0.07), (0.28, 0.12, 0.38), m_dark, root, col, rot=(0, -0.55, 0))

    add_sphere("Wolf_ChestMane", (0.82, 0.0, 1.22), (0.72, 0.68, 0.76), m_silver, root, col)
    add_sphere("Wolf_Head", (1.28, 0.0, 1.74), (0.68, 0.64, 0.62), m_grey, root, col)
    add_sphere("Wolf_CheekRuff", (1.20, 0.0, 1.58), (0.50, 0.78, 0.46), m_silver, root, col)

    # Snarling Open Jaws & Bared Fangs
    add_sphere("Wolf_SnoutTop", (1.88, 0.0, 1.68), (0.52, 0.28, 0.22), m_dark, root, col)
    add_sphere("Wolf_SnoutLower", (1.82, 0.0, 1.44), (0.48, 0.24, 0.16), m_silver, root, col, rot=(0, 0.32, 0))
    add_sphere("Wolf_MouthGums", (1.84, 0.0, 1.56), (0.42, 0.22, 0.14), m_gum, root, col)
    add_sphere("Wolf_Nose", (2.36, 0.0, 1.74), (0.11, 0.13, 0.10), m_dark, root, col, subsurf=1)

    for s, ys in [("L", 1), ("R", -1)]:
        # Angry Heavy V-Slanted Brow Ridges over Glowing Red Eyes
        add_cylinder(f"Wolf_AngryBrow_{s}", (1.78, ys * 0.25, 1.95), (0.12, 0.24, 0.07), m_dark, root, col, rot=(ys * 0.52, 0.28, -ys * 0.45), bevel=0.02)
        # Bared Upper & Lower Canine Fangs + Row of Teeth
        add_cone(f"Wolf_FangU_{s}", (2.18, ys * 0.15, 1.56), (0.04, 0.04, 0.18), m_fang, root, col, rot=(math.pi, 0, 0))
        add_cone(f"Wolf_FangL_{s}", (2.12, ys * 0.13, 1.50), (0.035, 0.035, 0.15), m_fang, root, col)
        for ti, tx in enumerate([1.92, 2.02]):
            add_cone(f"Wolf_Tooth_{s}_{ti}", (tx, ys * 0.16, 1.58), (0.025, 0.025, 0.09), m_fang, root, col, rot=(math.pi, 0, 0))
        # Pointed Upright Wolf Ears
        add_cone(f"Wolf_Ear_{s}", (1.15, ys * 0.38, 2.38), (0.22, 0.16, 0.52), m_dark, root, col, rot=(-ys * 0.14, 0.16, 0))
        add_cone(f"Wolf_InnerEar_{s}", (1.20, ys * 0.38, 2.35), (0.12, 0.10, 0.36), m_silver, root, col, rot=(-ys * 0.14, 0.16, 0))

    # Glowing Blood-Red Eyes
    add_eyes("Wolf", 1.76, 0.28, 1.84, 0.10, m_red_eye, root, col, shine=False)

    for nm, lx, ly in [("FL", 0.72, 0.38), ("FR", 0.72, -0.38), ("BL", -0.82, 0.38), ("BR", -0.82, -0.38)]:
        add_sphere(f"Wolf_Leg_{nm}", (lx, ly, 0.58), (0.20, 0.20, 0.56), m_grey, root, col)
        add_sphere(f"Wolf_Paw_{nm}", (lx + 0.08, ly, 0.12), (0.24, 0.20, 0.12), m_dark, root, col, subsurf=1)
        for ci, cy_off in enumerate([-0.07, 0.0, 0.07]):
            add_cone(f"Wolf_Claw_{nm}_{ci}", (lx + 0.30, ly + cy_off, 0.06), (0.028, 0.028, 0.11), m_fang, root, col, rot=(0, math.pi / 2, 0))

    add_sphere("Wolf_Tail", (-1.58, 0.0, 1.12), (0.66, 0.28, 0.30), m_grey, root, col, rot=(0, 0.45, 0))
    add_sphere("Wolf_TailTip", (-2.02, 0.0, 0.94), (0.35, 0.24, 0.24), m_dark, root, col, rot=(0, 0.45, 0))
    return finalize_root(root, off, rz)

# ==============================================================================
# 6. RABBIT
# ==============================================================================
def build_rabbit(offset=(0, 0, 0), rot_z=0.0, col=None):
    root, off, rz = make_root("Rabbit", offset, rot_z, col)
    m_fur = get_mat("Rabbit_White", (0.96, 0.93, 0.90, 1.0), 0.45)
    m_pink = get_mat("Rabbit_Pink", (0.96, 0.35, 0.48, 1.0), 0.38)
    m_tooth = get_mat("Rabbit_Tooth", (0.99, 0.99, 0.98, 1.0), 0.20)
    m_eye = get_mat("Eye_Black", (0.01, 0.01, 0.01, 1.0), 0.04)

    add_sphere("Rabbit_Body", (0.0, 0.0, 0.86), (0.92, 0.78, 0.82), m_fur, root, col, rot=(0, -0.25, 0))
    add_sphere("Rabbit_Head", (0.68, 0.0, 1.52), (0.62, 0.60, 0.58), m_fur, root, col)

    for s, ys in [("L", 1), ("R", -1)]:
        add_sphere(f"Rabbit_Cheek_{s}", (1.12, ys * 0.22, 1.40), (0.24, 0.26, 0.20), m_fur, root, col)
        add_sphere(f"Rabbit_Ear_{s}", (0.58, ys * 0.28, 2.48), (0.14, 0.22, 0.68), m_fur, root, col, rot=(ys * 0.12, 0.10, 0))
        add_sphere(f"Rabbit_InnerEar_{s}", (0.63, ys * 0.28, 2.46), (0.08, 0.14, 0.54), m_pink, root, col, rot=(ys * 0.12, 0.10, 0))
        add_sphere(f"Rabbit_HindFoot_{s}", (0.18, ys * 0.48, 0.16), (0.46, 0.22, 0.16), m_fur, root, col)
        add_sphere(f"Rabbit_FrontPaw_{s}", (0.66, ys * 0.26, 0.32), (0.20, 0.16, 0.30), m_fur, root, col)

    add_sphere("Rabbit_Nose", (1.30, 0.0, 1.52), (0.08, 0.11, 0.08), m_pink, root, col, subsurf=1)
    add_cylinder("Rabbit_Teeth", (1.22, 0.0, 1.28), (0.04, 0.11, 0.14), m_tooth, root, col, bevel=0.02, subsurf=1)
    add_eyes("Rabbit", 1.12, 0.34, 1.66, 0.105, m_eye, root, col)
    add_sphere("Rabbit_CottonTail", (-0.92, 0.0, 0.58), (0.30, 0.30, 0.30), m_fur, root, col)
    return finalize_root(root, off, rz)

# ==============================================================================
# 7. DETAILED FIERCE RAPTOR / FALCON BIRD (Layered Plumage, Hooked Beak, Talons)
# ==============================================================================
def build_bird(offset=(0, 0, 0), rot_z=0.0, col=None):
    root, off, rz = make_root("Bird", offset, rot_z, col)
    m_plumage = get_mat("Bird_CrimsonHawk", (0.58, 0.10, 0.05, 1.0), 0.42, color2=(0.24, 0.04, 0.02, 1.0), noise_scale=42.0, bump_strength=0.40)
    m_wing_dark = get_mat("Bird_ObsidianFeather", (0.06, 0.07, 0.10, 1.0), 0.38, color2=(0.22, 0.12, 0.06, 1.0), noise_scale=50.0, bump_strength=0.42)
    m_breast = get_mat("Bird_GoldSpeckledBreast", (0.88, 0.64, 0.28, 1.0), 0.45, color2=(0.48, 0.22, 0.08, 1.0), noise_scale=38.0, bump_strength=0.32)
    m_beak_gold = get_mat("Bird_RaptorBeakGold", (0.98, 0.68, 0.04, 1.0), 0.22)
    m_beak_tip = get_mat("Bird_HookTipBlack", (0.03, 0.03, 0.04, 1.0), 0.18)
    m_eye = get_mat("Bird_FierceAmberEye", (0.98, 0.52, 0.0, 1.0), 0.04, emission=0.8)

    # Proud Aerodynamic Raptor Torso & Speckled Breast
    add_sphere("Bird_Torso", (0.0, 0.0, 1.18), (0.86, 0.58, 0.78), m_plumage, root, col, rot=(0, -0.42, 0))
    add_sphere("Bird_SpeckledBreast", (0.32, 0.0, 1.12), (0.64, 0.52, 0.66), m_breast, root, col, rot=(0, -0.35, 0))
    add_sphere("Bird_Head", (0.52, 0.0, 1.88), (0.48, 0.44, 0.46), m_plumage, root, col)
    add_sphere("Bird_NeckCollar", (0.38, 0.0, 1.58), (0.46, 0.46, 0.32), m_breast, root, col)

    # Layered Crown Crest Feathers (5 distinct swept-back plumes)
    for ci in range(5):
        add_cone(f"Bird_CrownPlume_{ci}", (0.28 - ci * 0.10, 0.0, 2.28 - ci * 0.04), (0.09, 0.05, 0.36), m_wing_dark if ci % 2 == 0 else m_plumage, root, col, rot=(0, -0.75 - ci * 0.1, 0))

    # Sharp Hooked Raptor Beak (Upper Mandible + Hooked Black Tip + Lower Jaw)
    add_cone("Bird_BeakBase", (1.02, 0.0, 1.88), (0.16, 0.14, 0.38), m_beak_gold, root, col, rot=(0, math.pi / 2 + 0.15, 0))
    add_cone("Bird_BeakHookTip", (1.22, 0.0, 1.78), (0.08, 0.07, 0.22), m_beak_tip, root, col, rot=(0, math.pi * 0.82, 0))
    add_cone("Bird_BeakLower", (0.98, 0.0, 1.78), (0.11, 0.10, 0.28), m_beak_gold, root, col, rot=(0, math.pi / 2 - 0.1, 0))

    # Multi-Layered Sculpted Wings (Coverts + 6 Primary Flight Feathers per wing!)
    for s, ys in [("L", 1), ("R", -1)]:
        add_sphere(f"Bird_WingShoulder_{s}", (0.08, ys * 0.58, 1.28), (0.58, 0.16, 0.38), m_plumage, root, col, rot=(ys * 0.28, -0.35, 0))
        for fi in range(6):
            fx = -0.15 - fi * 0.16
            fy = ys * (0.62 + fi * 0.03)
            fz = 1.18 - fi * 0.11
            add_sphere(
                f"Bird_PrimaryFeather_{s}_{fi}",
                (fx, fy, fz),
                (0.45, 0.05, 0.12),
                m_wing_dark if fi >= 2 else m_plumage,
                root,
                col,
                rot=(ys * 0.22, 0.42 + fi * 0.06, ys * 0.15),
                subsurf=1,
            )
        # Fierce Supraorbital Raptor Brow
        add_cylinder(f"Bird_Brow_{s}", (0.76, ys * 0.28, 2.02), (0.08, 0.16, 0.05), m_wing_dark, root, col, rot=(0, 0.2, ys * 0.35), bevel=0.01)
        # Feathered Thighs + Scaly Shanks + 4 Curved Black Talons
        add_sphere(f"Bird_Thigh_{s}", (0.12, ys * 0.28, 0.58), (0.18, 0.16, 0.28), m_plumage, root, col)
        add_cylinder(f"Bird_Shank_{s}", (0.14, ys * 0.28, 0.25), (0.055, 0.055, 0.36), m_beak_gold, root, col, bevel=0.01, subsurf=1)
        for ti, tang in enumerate([-0.45, -0.15, 0.15]):
            add_cone(f"Bird_Talon_{s}_{ti}", (0.32, ys * 0.28 + tang * 0.25, 0.06), (0.035, 0.035, 0.18), m_beak_tip, root, col, rot=(0, math.pi / 2, tang))
        add_cone(f"Bird_BackTalon_{s}", (-0.02, ys * 0.28, 0.06), (0.035, 0.035, 0.14), m_beak_tip, root, col, rot=(0, -math.pi / 2, 0))

    # Fanned Layered Tail Plumes (5 feathers)
    for ti, tang in enumerate([-0.36, -0.18, 0.0, 0.18, 0.36]):
        add_sphere(f"Bird_TailPlume_{ti}", (-0.88, tang * 0.65, 0.72), (0.52, 0.12, 0.04), m_wing_dark if ti % 2 == 0 else m_plumage, root, col, rot=(0, 0.45, tang))

    add_eyes("Bird", 0.78, 0.28, 1.92, 0.085, m_eye, root, col)
    return finalize_root(root, off, rz)

# ==============================================================================
# 8. DANGEROUS FERAL BABOON / RAGE APE MONKEY (Scowling, Giant Fangs, War-Paint Ridges, Muscular)
# ==============================================================================
def build_monkey(offset=(0, 0, 0), rot_z=0.0, col=None):
    root, off, rz = make_root("Monkey", offset, rot_z, col)
    m_fur = get_mat("Monkey_CharcoalBeastFur", (0.12, 0.07, 0.04, 1.0), 0.55, color2=(0.28, 0.12, 0.05, 1.0), noise_scale=35.0, bump_strength=0.48)
    m_mane = get_mat("Monkey_AshMane", (0.26, 0.18, 0.12, 1.0), 0.58, color2=(0.10, 0.06, 0.04, 1.0), noise_scale=42.0, bump_strength=0.52)
    m_skin = get_mat("Monkey_ScarredHide", (0.38, 0.16, 0.12, 1.0), 0.45, bump_strength=0.30)
    m_war_red = get_mat("Monkey_MandrillBlood", (0.82, 0.04, 0.04, 1.0), 0.32)
    m_war_blue = get_mat("Monkey_MandrillCobalt", (0.08, 0.24, 0.68, 1.0), 0.35, bump_strength=0.35)
    m_fang = get_mat("Monkey_KillerFang", (0.96, 0.92, 0.80, 1.0), 0.15)
    m_eye = get_mat("Monkey_RageEye", (1.0, 0.22, 0.0, 1.0), 0.03, emission=3.2)

    # Hulking Muscular Torso, Broad Shoulders, & Spiky Mane
    add_sphere("Monkey_Chest", (0.18, 0.0, 1.28), (0.86, 0.88, 0.85), m_fur, root, col, rot=(0, 0.35, 0))
    add_sphere("Monkey_Pecs", (0.58, 0.0, 1.28), (0.52, 0.72, 0.58), m_skin, root, col)
    add_sphere("Monkey_ShoulderMane", (0.28, 0.0, 1.72), (0.78, 0.96, 0.62), m_mane, root, col)

    # Fierce Mandrill/Baboon Skull, Ridged Snout, & Roaring Open Jaw
    add_sphere("Monkey_Skull", (0.58, 0.0, 2.02), (0.60, 0.62, 0.60), m_mane, root, col)
    add_sphere("Monkey_FacePlate", (0.98, 0.0, 2.02), (0.32, 0.46, 0.42), m_skin, root, col)
    add_sphere("Monkey_UpperSnout", (1.24, 0.0, 1.90), (0.38, 0.28, 0.20), m_war_red, root, col, rot=(0, 0.15, 0))
    add_sphere("Monkey_LowerJaw", (1.16, 0.0, 1.50), (0.42, 0.28, 0.18), m_skin, root, col, rot=(0, 0.45, 0))
    add_sphere("Monkey_RoarMouth", (1.18, 0.0, 1.70), (0.34, 0.25, 0.20), get_mat("Mouth_Dark", (0.18, 0.01, 0.02, 1.0), 0.4), root, col)

    # Mandrill Nasal War-Paint Ridges + Giant Saber Fangs + Angry Brow + Muscular Arms with Claws
    for s, ys in [("L", 1), ("R", -1)]:
        add_sphere(f"Monkey_EyeSocket_{s}", (1.14, ys * 0.24, 2.10), (0.13, 0.13, 0.13), get_mat("Socket_Black", (0.02, 0.02, 0.02, 1.0), 0.5), root, col)
        add_cylinder(f"Monkey_CheekRidge_{s}", (1.22, ys * 0.24, 1.94), (0.08, 0.28, 0.07), m_war_blue, root, col, rot=(0, math.pi / 2 - 0.2, ys * 0.18), bevel=0.02)
        add_cylinder(f"Monkey_AngryBrow_{s}", (1.18, ys * 0.24, 2.22), (0.12, 0.24, 0.08), m_war_red, root, col, rot=(ys * 0.48, 0.25, -ys * 0.42), bevel=0.02)
        # 4 Giant Protruding Saber Fangs
        add_cone(f"Monkey_SaberFangU_{s}", (1.48, ys * 0.17, 1.72), (0.055, 0.055, 0.28), m_fang, root, col, rot=(math.pi, -0.12, 0))
        add_cone(f"Monkey_SaberFangL_{s}", (1.42, ys * 0.14, 1.66), (0.050, 0.050, 0.25), m_fang, root, col, rot=(0, 0.12, 0))
        for ti, tx in enumerate([1.26, 1.36]):
            add_cone(f"Monkey_MolarU_{s}_{ti}", (tx, ys * 0.19, 1.76), (0.032, 0.032, 0.12), m_fang, root, col, rot=(math.pi, 0, 0))
        # Pointed Feral Ears
        add_sphere(f"Monkey_Ear_{s}", (0.52, ys * 0.66, 2.02), (0.14, 0.26, 0.28), m_skin, root, col, rot=(0, 0, ys * 0.3))
        # Hulking Muscular Shoulders, Forearms, & Clawed Fists
        add_sphere(f"Monkey_Deltoid_{s}", (0.38, ys * 0.82, 1.48), (0.36, 0.34, 0.38), m_fur, root, col)
        add_sphere(f"Monkey_Forearm_{s}", (0.62, ys * 0.84, 0.82), (0.26, 0.26, 0.54), m_fur, root, col, rot=(0, 0.28, 0))
        add_sphere(f"Monkey_Fist_{s}", (0.82, ys * 0.82, 0.24), (0.24, 0.24, 0.20), m_skin, root, col)
        for ci, cy in enumerate([-0.09, 0.0, 0.09]):
            add_cone(f"Monkey_Claw_{s}_{ci}", (1.06, ys * 0.82 + cy, 0.16), (0.035, 0.035, 0.16), m_fang, root, col, rot=(0, math.pi / 2, 0))
        # Muscular Haunches & Legs
        add_sphere(f"Monkey_Leg_{s}", (-0.18, ys * 0.48, 0.48), (0.26, 0.24, 0.46), m_fur, root, col)
        add_sphere(f"Monkey_Foot_{s}", (0.05, ys * 0.48, 0.12), (0.28, 0.20, 0.12), m_skin, root, col)

    add_eyes("Monkey", 1.22, 0.24, 2.10, 0.09, m_eye, root, col, shine=False)

    # Spiked Whip Tail
    pts = [(-0.58, 0, 1.05), (-1.15, 0.12, 1.38), (-1.58, -0.10, 1.88), (-1.35, 0.15, 2.38)]
    add_curve_tail("Monkey_WhipTail", pts, 0.095, m_fur, root, col)
    return finalize_root(root, off, rz)

# ==============================================================================
# 9. CHICKEN
# ==============================================================================
def build_chicken(offset=(0, 0, 0), rot_z=0.0, col=None):
    root, off, rz = make_root("Chicken", offset, rot_z, col)
    m_white = get_mat("Chicken_White", (0.97, 0.96, 0.94, 1.0), 0.45)
    m_red = get_mat("Chicken_CombRed", (0.92, 0.06, 0.08, 1.0), 0.35)
    m_yellow = get_mat("Chicken_BeakYellow", (0.98, 0.68, 0.05, 1.0), 0.32)
    m_eye = get_mat("Eye_Black", (0.01, 0.01, 0.01, 1.0), 0.04)

    add_sphere("Chicken_Body", (0.0, 0.0, 0.92), (0.84, 0.68, 0.72), m_white, root, col)
    add_sphere("Chicken_Head", (0.58, 0.0, 1.54), (0.46, 0.44, 0.48), m_white, root, col)

    for i, cx in enumerate([0.42, 0.58, 0.72]):
        add_sphere(f"Chicken_Comb_{i}", (cx, 0.0, 2.02), (0.14, 0.07, 0.18), m_red, root, col, subsurf=1)
    add_sphere("Chicken_Wattle", (0.92, 0.0, 1.28), (0.10, 0.08, 0.16), m_red, root, col, subsurf=1)
    add_cone("Chicken_Beak", (1.06, 0.0, 1.50), (0.15, 0.15, 0.32), m_yellow, root, col, rot=(0, math.pi / 2, 0))

    for s, ys in [("L", 1), ("R", -1)]:
        add_sphere(f"Chicken_Wing_{s}", (-0.02, ys * 0.65, 0.95), (0.52, 0.15, 0.36), m_white, root, col)
        add_cylinder(f"Chicken_Leg_{s}", (0.08, ys * 0.24, 0.24), (0.055, 0.055, 0.44), m_yellow, root, col, bevel=0.01, subsurf=1)
        add_sphere(f"Chicken_Foot_{s}", (0.18, ys * 0.24, 0.06), (0.18, 0.12, 0.05), m_yellow, root, col, subsurf=1)

    add_sphere("Chicken_Tail", (-0.78, 0.0, 1.22), (0.34, 0.20, 0.42), m_white, root, col, rot=(0, -0.45, 0))
    add_eyes("Chicken", 0.88, 0.28, 1.62, 0.085, m_eye, root, col)
    return finalize_root(root, off, rz)

# ==============================================================================
# 10. CAT
# ==============================================================================
def build_cat(offset=(0, 0, 0), rot_z=0.0, col=None):
    root, off, rz = make_root("Cat", offset, rot_z, col)
    m_ginger = get_mat("Cat_Ginger", (0.92, 0.36, 0.08, 1.0), 0.42)
    m_cream = get_mat("Cat_Cream", (0.98, 0.88, 0.76, 1.0), 0.42)
    m_pink = get_mat("Cat_PinkNose", (0.96, 0.38, 0.50, 1.0), 0.35)
    m_green = get_mat("Cat_EmeraldEye", (0.08, 0.78, 0.22, 1.0), 0.06)

    add_sphere("Cat_Body", (0.0, 0.0, 0.92), (1.02, 0.62, 0.64), m_ginger, root, col)
    add_sphere("Cat_Chest", (0.64, 0.0, 0.92), (0.52, 0.48, 0.54), m_cream, root, col)
    add_sphere("Cat_Head", (0.98, 0.0, 1.48), (0.58, 0.62, 0.56), m_ginger, root, col)

    for s, ys in [("L", 1), ("R", -1)]:
        add_sphere(f"Cat_Muzzle_{s}", (1.44, ys * 0.14, 1.36), (0.18, 0.18, 0.14), m_cream, root, col, subsurf=1)
        add_cone(f"Cat_Ear_{s}", (0.95, ys * 0.36, 2.02), (0.20, 0.16, 0.38), m_ginger, root, col, rot=(-ys * 0.18, 0.10, 0))
        add_cone(f"Cat_InnerEar_{s}", (1.00, ys * 0.36, 2.00), (0.12, 0.10, 0.28), m_pink, root, col, rot=(-ys * 0.18, 0.10, 0))

    add_sphere("Cat_Nose", (1.58, 0.0, 1.44), (0.07, 0.09, 0.07), m_pink, root, col, subsurf=1)
    add_eyes("Cat", 1.42, 0.26, 1.56, 0.095, m_green, root, col)

    for nm, lx, ly in [("FL", 0.54, 0.34), ("FR", 0.54, -0.34), ("BL", -0.62, 0.34), ("BR", -0.62, -0.34)]:
        add_sphere(f"Cat_Leg_{nm}", (lx, ly, 0.46), (0.16, 0.16, 0.44), m_ginger, root, col)
        add_sphere(f"Cat_Paw_{nm}", (lx + 0.06, ly, 0.10), (0.19, 0.17, 0.10), m_cream, root, col, subsurf=1)

    pts = [(-0.92, 0, 1.05), (-1.18, 0, 1.42), (-1.12, 0.08, 1.88), (-1.28, 0.12, 2.18)]
    add_curve_tail("Cat_Tail", pts, 0.09, m_ginger, root, col)
    return finalize_root(root, off, rz)

# ==============================================================================
# NIGHT HORROR MOB 1: SHADOW STALKER / WENDIGO (Skull Head, Antlers, Ribcage, Scythe Claws)
# ==============================================================================
def build_shadow_stalker(offset=(0, 0, 0), rot_z=0.0, col=None):
    root, off, rz = make_root("ShadowStalker", offset, rot_z, col)
    m_hide = get_mat("Wendigo_VoidBark", (0.03, 0.03, 0.04, 1.0), 0.65, color2=(0.12, 0.04, 0.04, 1.0), noise_scale=35.0, bump_strength=0.60)
    m_bone = get_mat("Wendigo_BleachedSkull", (0.82, 0.78, 0.68, 1.0), 0.42, color2=(0.45, 0.12, 0.08, 1.0), noise_scale=28.0, bump_strength=0.35)
    m_antler = get_mat("Wendigo_BloodAntler", (0.28, 0.04, 0.04, 1.0), 0.38, bump_strength=0.30)
    m_glow = get_mat("Wendigo_CrimsonVoidEye", (1.0, 0.0, 0.08, 1.0), 0.0, emission=6.0)
    m_core = get_mat("Wendigo_HeartGlow", (0.95, 0.02, 0.12, 1.0), 0.0, emission=4.0)

    # Tall Hunched Spine, Exposed Ribcage & Glowing Heart Core
    add_sphere("Wendigo_Torso", (0.0, 0.0, 1.85), (0.58, 0.52, 0.95), m_hide, root, col, rot=(0, 0.42, 0))
    add_sphere("Wendigo_SoulCore", (0.18, 0.0, 1.85), (0.28, 0.26, 0.42), m_core, root, col)
    for ri in range(4):
        rz_rib = 2.15 - ri * 0.22
        for ys in [1, -1]:
            add_cylinder(f"Wendigo_Rib_{ri}_{ys}", (0.34, ys * 0.28, rz_rib), (0.045, 0.045, 0.38), m_bone, root, col, rot=(math.pi / 2, 0.3, ys * 0.6), bevel=0.01)

    # Deer/Stag Monster Skull & Screaming Jaw
    add_sphere("Wendigo_Skull", (0.68, 0.0, 2.75), (0.54, 0.40, 0.44), m_bone, root, col)
    add_sphere("Wendigo_SnoutSkull", (1.22, 0.0, 2.62), (0.48, 0.22, 0.20), m_bone, root, col, rot=(0, 0.25, 0))
    add_sphere("Wendigo_JawBone", (1.12, 0.0, 2.35), (0.44, 0.18, 0.14), m_bone, root, col, rot=(0, 0.55, 0))

    for s, ys in [("L", 1), ("R", -1)]:
        # Hollow Eye Sockets + Glowing Crimson Void Orbs
        add_sphere(f"Wendigo_EyeSocket_{s}", (0.96, ys * 0.26, 2.78), (0.14, 0.12, 0.14), m_hide, root, col)
        add_sphere(f"Wendigo_VoidEye_{s}", (1.02, ys * 0.28, 2.78), (0.08, 0.08, 0.08), m_glow, root, col)
        # Branching Multi-Point Antlers
        antler_pts = [(0.58, ys * 0.24, 3.05), (0.35, ys * 0.62, 3.55), (0.15, ys * 0.95, 4.05), (0.45, ys * 1.12, 4.45)]
        add_curve_tail(f"Wendigo_AntlerMain_{s}", antler_pts, 0.065, m_antler, root, col)
        add_cone(f"Wendigo_AntlerTine1_{s}", (0.48, ys * 0.68, 3.82), (0.05, 0.02, 0.45), m_antler, root, col, rot=(-ys * 0.35, 0.45, 0))
        add_cone(f"Wendigo_AntlerTine2_{s}", (0.28, ys * 0.98, 4.28), (0.05, 0.02, 0.42), m_antler, root, col, rot=(-ys * 0.25, 0.35, 0))
        # Long Gaunt Arms & 4 Giant Bone-Scythe Claws
        add_sphere(f"Wendigo_UpperArm_{s}", (0.38, ys * 0.72, 2.12), (0.18, 0.18, 0.68), m_hide, root, col, rot=(0, 0.25, 0))
        add_sphere(f"Wendigo_Forearm_{s}", (0.68, ys * 0.78, 1.22), (0.15, 0.15, 0.64), m_hide, root, col, rot=(0, 0.38, 0))
        for ci, cy_off in enumerate([-0.12, -0.04, 0.04, 0.12]):
            add_cone(f"Wendigo_ScytheClaw_{s}_{ci}", (1.05, ys * 0.78 + cy_off, 0.58), (0.04, 0.01, 0.48), m_bone, root, col, rot=(0, math.pi * 0.72, 0))
        # Digitigrade Monster Legs
        add_sphere(f"Wendigo_Thigh_{s}", (-0.18, ys * 0.42, 1.08), (0.22, 0.20, 0.58), m_hide, root, col, rot=(0, -0.35, 0))
        add_sphere(f"Wendigo_Shin_{s}", (-0.02, ys * 0.42, 0.45), (0.15, 0.15, 0.52), m_hide, root, col, rot=(0, 0.25, 0))

    return finalize_root(root, off, rz)

# ==============================================================================
# NIGHT HORROR MOB 2: ABYSSAL BLOOD CRAWLER (8 Glowing Red Eyes, 8 Spiked Legs, Venom Mandibles)
# ==============================================================================
def build_blood_crawler(offset=(0, 0, 0), rot_z=0.0, col=None):
    root, off, rz = make_root("BloodCrawler", offset, rot_z, col)
    m_chitin = get_mat("Crawler_ObsidianChitin", (0.04, 0.02, 0.06, 1.0), 0.25, metallic=0.45, color2=(0.18, 0.02, 0.08, 1.0), noise_scale=30.0, bump_strength=0.45)
    m_sac = get_mat("Crawler_BloodAbdomen", (0.38, 0.01, 0.04, 1.0), 0.35, color2=(0.08, 0.01, 0.02, 1.0), noise_scale=22.0, bump_strength=0.50)
    m_glow_red = get_mat("Crawler_RedEyeGlow", (1.0, 0.02, 0.02, 1.0), 0.0, emission=5.5)
    m_venom = get_mat("Crawler_VenomFang", (0.85, 0.05, 0.15, 1.0), 0.12, emission=1.5)

    # Cephalothorax & Swollen Spiked Blood-Sac Abdomen
    add_sphere("Crawler_Thorax", (0.45, 0.0, 0.95), (0.78, 0.68, 0.52), m_chitin, root, col)
    add_sphere("Crawler_Abdomen", (-0.85, 0.0, 1.25), (1.12, 0.92, 0.82), m_sac, root, col, rot=(0, -0.22, 0))

    # Glowing Pustules & Bone Spikes on Abdomen
    for si, (sx, sy, sz) in enumerate([(-0.55, 0.38, 1.88), (-0.55, -0.38, 1.88), (-1.05, 0.48, 1.82), (-1.05, -0.48, 1.82), (-0.82, 0.0, 1.98), (-1.42, 0.0, 1.68)]):
        add_sphere(f"Crawler_BloodOrb_{si}", (sx, sy, sz - 0.12), (0.18, 0.18, 0.14), m_glow_red, root, col, subsurf=1)
        add_cone(f"Crawler_DorsalSpike_{si}", (sx, sy, sz + 0.15), (0.10, 0.02, 0.48), m_chitin, root, col, rot=(0, -0.35, 0))

    # Cluster of 8 Glowing Crimson Eyes across the Carapace Brow
    eye_angles = [-0.55, -0.38, -0.20, -0.07, 0.07, 0.20, 0.38, 0.55]
    for ei, eang in enumerate(eye_angles):
        ex = 1.15 * math.cos(eang * 0.5)
        ey = 0.72 * math.sin(eang)
        ez = 1.12 + (0.08 if abs(eang) < 0.25 else 0.0)
        er = 0.085 if abs(eang) < 0.25 else 0.065
        add_sphere(f"Crawler_Eye_{ei}", (ex, ey, ez), (er, er, er), m_glow_red, root, col, subsurf=1)

    # Giant Pincer Mandibles & 8 Jointed Spiked Arachnid Legs
    for s, ys in [("L", 1), ("R", -1)]:
        add_cone(f"Crawler_Mandible_{s}", (1.38, ys * 0.26, 0.78), (0.14, 0.12, 0.56), m_chitin, root, col, rot=(0, math.pi * 0.62, -ys * 0.35))
        add_cone(f"Crawler_VenomTip_{s}", (1.62, ys * 0.14, 0.62), (0.07, 0.01, 0.28), m_venom, root, col, rot=(0, math.pi * 0.75, -ys * 0.55))

        for li, lx_base in enumerate([0.78, 0.42, 0.05, -0.32]):
            leg_pts = [
                (lx_base, ys * 0.52, 0.92),
                (lx_base + (0.25 - li * 0.15), ys * 1.38, 1.65),
                (lx_base + (0.35 - li * 0.22), ys * 1.95, 0.06),
            ]
            add_curve_tail(f"Crawler_Leg_{s}_{li}", leg_pts, 0.085, m_chitin, root, col)
            add_sphere(f"Crawler_JointGlow_{s}_{li}", leg_pts[1], (0.11, 0.11, 0.11), m_glow_red, root, col, subsurf=1)

    return finalize_root(root, off, rz)

# ==============================================================================
# NIGHT HORROR MOB 3: GRIM WRAITH / SOUL REAPER (Hooded Skull, Cyan Soul-Fire Core, Giant Scythe)
# ==============================================================================
def build_grim_wraith(offset=(0, 0, 0), rot_z=0.0, col=None):
    root, off, rz = make_root("GrimWraith", offset, rot_z, col)
    m_cloak = get_mat("Wraith_ShadowCloak", (0.02, 0.03, 0.05, 1.0), 0.75, color2=(0.05, 0.12, 0.16, 1.0), noise_scale=25.0, bump_strength=0.55)
    m_skull = get_mat("Wraith_PhantomBone", (0.75, 0.82, 0.80, 1.0), 0.38, bump_strength=0.30)
    m_soul = get_mat("Wraith_SoulFireCyan", (0.0, 1.0, 0.72, 1.0), 0.0, emission=6.5)
    m_blade = get_mat("Wraith_RunicScythe", (0.55, 0.75, 0.82, 1.0), 0.12, metallic=0.95)

    # Floating Tattered Shroud Robe & Tattered Hem Strips
    add_cone("Wraith_MainCloak", (0.0, 0.0, 1.55), (1.05, 0.88, 2.35), m_cloak, root, col, r1=1.0, r2=0.35, subsurf=2)
    for ti in range(8):
        ang = ti * (math.pi / 4.0)
        add_cone(f"Wraith_Tatter_{ti}", (0.78 * math.cos(ang), 0.72 * math.sin(ang), 0.55), (0.24, 0.12, 0.85), m_cloak, root, col, rot=(0.25 * math.sin(ang), -0.25 * math.cos(ang), ang))

    # Glowing Cyan Soul-Core Vortex inside Chest
    add_sphere("Wraith_SoulVortex", (0.38, 0.0, 1.78), (0.32, 0.32, 0.48), m_soul, root, col)

    # Deep Cowl Hood & Screaming Phantom Skull with Soul-Fire Eyes
    add_sphere("Wraith_HoodCowl", (0.18, 0.0, 2.75), (0.66, 0.62, 0.68), m_cloak, root, col)
    add_sphere("Wraith_VoidInsideHood", (0.42, 0.0, 2.72), (0.48, 0.46, 0.52), get_mat("Pure_Void", (0, 0, 0, 1), 1.0), root, col)
    add_sphere("Wraith_Skull", (0.54, 0.0, 2.76), (0.36, 0.34, 0.40), m_skull, root, col)
    add_sphere("Wraith_ScreamJaw", (0.62, 0.0, 2.48), (0.24, 0.22, 0.20), m_skull, root, col, rot=(0, 0.42, 0))

    for s, ys in [("L", 1), ("R", -1)]:
        add_sphere(f"Wraith_SoulEye_{s}", (0.86, ys * 0.15, 2.80), (0.08, 0.08, 0.08), m_soul, root, col)
        add_sphere(f"Wraith_Sleeve_{s}", (0.42, ys * 0.78, 1.95), (0.42, 0.24, 0.48), m_cloak, root, col, rot=(0, 0.45, ys * 0.25))
        add_sphere(f"Wraith_BonyHand_{s}", (0.82, ys * 0.78, 1.78), (0.16, 0.14, 0.12), m_skull, root, col)

    # Giant Soul-Reaper Scythe (Staff + Glowing Runic Crescent Blade)
    staff_pts = [(0.82, 0.78, 0.25), (0.85, 0.78, 1.78), (0.90, 0.68, 3.45)]
    add_curve_tail("Wraith_ScytheStaff", staff_pts, 0.055, m_cloak, root, col)
    add_cone("Wraith_ScytheBlade", (1.28, 0.12, 3.35), (0.22, 0.03, 1.58), m_blade, root, col, rot=(1.35, 0.45, -0.35))
    add_cone("Wraith_ScytheSoulEdge", (1.32, 0.08, 3.32), (0.08, 0.01, 1.48), m_soul, root, col, rot=(1.35, 0.45, -0.35))

    return finalize_root(root, off, rz)

# ==============================================================================
# NIGHT HORROR MOB 4: FLESH GHOUL / MUTANT NIGHT CRAWLER (Split Jaw, 3 Toxic Eyes, Shoulder Spines)
# ==============================================================================
def build_flesh_ghoul(offset=(0, 0, 0), rot_z=0.0, col=None):
    root, off, rz = make_root("FleshGhoul", offset, rot_z, col)
    m_flesh = get_mat("Ghoul_DecayedFlesh", (0.28, 0.24, 0.22, 1.0), 0.58, color2=(0.38, 0.08, 0.08, 1.0), noise_scale=28.0, bump_strength=0.55)
    m_gore = get_mat("Ghoul_ExposedMuscle", (0.48, 0.03, 0.04, 1.0), 0.35, bump_strength=0.45)
    m_bone = get_mat("Ghoul_BoneBlade", (0.85, 0.80, 0.68, 1.0), 0.35)
    m_toxic = get_mat("Ghoul_ToxicEye", (0.65, 1.0, 0.0, 1.0), 0.0, emission=5.5)

    # Hulking Asymmetric Mutant Back & Exposed Spine
    add_sphere("Ghoul_HunchTorso", (0.05, 0.0, 1.38), (0.98, 0.88, 0.86), m_flesh, root, col, rot=(0, 0.45, 0))
    add_sphere("Ghoul_MutantShoulderL", (0.32, 0.82, 1.72), (0.52, 0.48, 0.52), m_gore, root, col)
    add_sphere("Ghoul_MutantShoulderR", (0.32, -0.78, 1.58), (0.44, 0.42, 0.44), m_flesh, root, col)

    # Dorsal Bone Spikes erupting from back & shoulders
    for si, (sx, sy, sz) in enumerate([(0.35, 0.85, 2.22), (0.15, 0.68, 2.12), (0.35, -0.80, 2.02), (0.0, 0.0, 2.25), (-0.45, 0.0, 2.05), (-0.85, 0.0, 1.78)]):
        add_cone(f"Ghoul_BoneSpike_{si}", (sx, sy, sz), (0.12, 0.02, 0.55), m_bone, root, col, rot=(sy * 0.25, -0.35, 0))

    # Split-Jaw Horror Head + 3 Glowing Toxic Eyes
    add_sphere("Ghoul_Skull", (0.98, 0.0, 1.68), (0.58, 0.56, 0.54), m_flesh, root, col)
    add_sphere("Ghoul_MawCavity", (1.35, 0.0, 1.52), (0.38, 0.38, 0.34), m_gore, root, col)
    add_sphere("Ghoul_EyeCenter", (1.42, 0.0, 1.92), (0.10, 0.10, 0.10), m_toxic, root, col)

    for s, ys in [("L", 1), ("R", -1)]:
        add_sphere(f"Ghoul_EyeSide_{s}", (1.42, ys * 0.28, 1.78), (0.085, 0.085, 0.085), m_toxic, root, col)
        # Split Mandible Jaws lined with Jagged Teeth
        add_sphere(f"Ghoul_SplitJaw_{s}", (1.48, ys * 0.26, 1.38), (0.36, 0.16, 0.18), m_flesh, root, col, rot=(0, 0.25, ys * 0.42))
        for ti in range(4):
            add_cone(f"Ghoul_JawTooth_{s}_{ti}", (1.35 + ti * 0.10, ys * 0.18, 1.44), (0.035, 0.01, 0.16), m_bone, root, col, rot=(-ys * 0.8, 0, 0))
        # Knuckle-Dragging Forearms with Giant Bone-Blade Claws
        add_sphere(f"Ghoul_Arm_{s}", (0.68, ys * 0.86, 0.92), (0.28, 0.28, 0.68), m_flesh, root, col, rot=(0, 0.35, 0))
        add_cone(f"Ghoul_ArmBlade_{s}", (1.18, ys * 0.86, 0.42), (0.14, 0.02, 0.78), m_bone, root, col, rot=(0, math.pi * 0.65, 0))
        add_sphere(f"Ghoul_Leg_{s}", (-0.52, ys * 0.52, 0.52), (0.28, 0.26, 0.52), m_flesh, root, col)

    return finalize_root(root, off, rz)

# ==============================================================================
# STUDIO & NIGHT LIGHTING SETUP + RENDER PIPELINE
# ==============================================================================
def setup_studio(pedestal_radius=3.2, cam_loc=(5.4, -4.6, 2.85), cam_target_loc=(0.35, 0.0, 1.18), lens=48, view_dist=6.8, night_mode=False):
    m_ground = get_mat(
        "Ground_NightObsidian" if night_mode else "Ground_PastureGreen",
        (0.05, 0.06, 0.09, 1.0) if night_mode else (0.18, 0.48, 0.16, 1.0),
        0.82,
        bump_strength=0.35 if night_mode else 0.15,
    )
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=pedestal_radius, depth=0.18, location=(0.0, 0.0, -0.09))
    ground = bpy.context.active_object
    ground.name = "Ground_Pedestal"
    assign_mat(ground, m_ground)
    smooth_obj(ground, subsurf_levels=1, bevel_width=0.05)

    bpy.ops.object.light_add(type='SUN', location=(5.0, -5.0, 8.0))
    sun = bpy.context.active_object
    sun.name = "Key_Light"
    sun.data.energy = 1.8 if night_mode else 4.2
    sun.data.color = (0.55, 0.68, 1.0) if night_mode else (1.0, 0.97, 0.92)
    sun.rotation_euler = (math.radians(45), math.radians(15), math.radians(38))

    bpy.ops.object.light_add(type='AREA', location=(4.5, 4.5, 4.0))
    fill = bpy.context.active_object
    fill.name = "Fill_Light"
    fill.data.energy = 90.0 if night_mode else 180.0
    fill.data.size = 4.5
    fill.data.color = (0.35, 0.50, 0.95) if night_mode else (0.90, 0.95, 1.0)
    fill.rotation_euler = (math.radians(60), 0.0, math.radians(-130))

    bpy.ops.object.light_add(type='AREA', location=(-4.5, -2.5, 4.5))
    rim = bpy.context.active_object
    rim.name = "Rim_Light"
    rim.data.energy = 260.0 if night_mode else 200.0
    rim.data.size = 3.5
    rim.data.color = (0.95, 0.12, 0.25) if night_mode else (1.0, 0.90, 0.95)
    rim.rotation_euler = (math.radians(55), 0.0, math.radians(110))

    bpy.ops.object.empty_add(type='PLAIN_AXES', location=cam_target_loc)
    cam_target = bpy.context.active_object
    cam_target.name = "Camera_Focus"

    bpy.ops.object.camera_add(location=cam_loc)
    cam = bpy.context.active_object
    cam.name = "Main_Camera"
    cam.data.lens = lens
    track = cam.constraints.new(type='TRACK_TO')
    track.target = cam_target
    track.track_axis = 'TRACK_NEGATIVE_Z'
    track.up_axis = 'UP_Y'
    bpy.context.scene.camera = cam

    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.02, 0.03, 0.07, 1.0) if night_mode else (0.35, 0.58, 0.85, 1.0)
        bg.inputs[1].default_value = 0.35 if night_mode else 0.65

    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                for space in area.spaces:
                    if space.type == 'VIEW_3D':
                        space.shading.type = 'MATERIAL'
                        space.shading.color_type = 'MATERIAL'
                        if space.region_3d:
                            space.region_3d.view_location = cam_target_loc
                            space.region_3d.view_distance = view_dist

def save_and_render(name, res_x=960, res_y=720):
    blend_path = os.path.join(OUT_DIR, f"{name}.blend")
    render_path = os.path.join(OUT_DIR, f"{name}_render.png")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)

    scene = bpy.context.scene
    engines = [item.identifier for item in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    if 'BLENDER_EEVEE_NEXT' in engines:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    elif 'BLENDER_EEVEE' in engines:
        scene.render.engine = 'BLENDER_EEVEE'
    else:
        scene.render.engine = 'CYCLES'

    scene.render.resolution_x = res_x
    scene.render.resolution_y = res_y
    scene.render.filepath = render_path
    bpy.ops.render.render(write_still=True)
    print(f"[MOB] Saved {blend_path} & rendered {render_path}")

def main():
    # 1. Regenerate the 4 upgraded animals + 4 new Night Horror Mobs individually
    individual_targets = [
        ("dog",            build_dog,            False, (5.2, -4.4, 2.8), (0.35, 0.0, 1.35)),
        ("bird",           build_bird,           False, (4.4, -3.8, 2.6), (0.25, 0.0, 1.35)),
        ("monkey",         build_monkey,         False, (4.8, -4.2, 2.8), (0.35, 0.0, 1.35)),
        ("wolf",           build_wolf,           True,  (5.2, -4.4, 2.8), (0.35, 0.0, 1.35)),
        ("shadow_stalker", build_shadow_stalker, True,  (6.2, -5.4, 3.8), (0.35, 0.0, 2.25)),
        ("blood_crawler",  build_blood_crawler,  True,  (5.8, -5.0, 3.2), (0.15, 0.0, 1.15)),
        ("grim_wraith",    build_grim_wraith,    True,  (6.0, -5.2, 3.6), (0.35, 0.0, 2.15)),
        ("flesh_ghoul",    build_flesh_ghoul,    True,  (5.4, -4.6, 3.0), (0.35, 0.0, 1.35)),
    ]

    for mob_name, builder_fn, is_night, cloc, ctarg in individual_targets:
        clear_scene()
        mob_col = bpy.data.collections.new(f"Mob_{mob_name.capitalize()}")
        bpy.context.scene.collection.children.link(mob_col)
        builder_fn(offset=(0, 0, 0), rot_z=0.0, col=mob_col)
        setup_studio(pedestal_radius=3.4, cam_loc=cloc, cam_target_loc=ctarg, lens=46, view_dist=7.2, night_mode=is_night)
        save_and_render(mob_name, res_x=960, res_y=720)

    # 2. Dedicated Night Horror Mobs Showcase Scene (MOB/night_horror_mobs.blend)
    clear_scene()
    horror_col = bpy.data.collections.new("NIGHT_HORROR_MOBS")
    bpy.context.scene.collection.children.link(horror_col)
    horror_lineup = [
        ("ShadowStalker", build_shadow_stalker, (-5.5,  0.6, 0.0), -math.radians(72)),
        ("BloodCrawler",  build_blood_crawler,  (-2.0, -0.8, 0.0), -math.radians(82)),
        ("GrimWraith",    build_grim_wraith,    ( 2.0, -0.8, 0.0), -math.radians(98)),
        ("FleshGhoul",    build_flesh_ghoul,    ( 5.5,  0.6, 0.0), -math.radians(108)),
        ("AngryWolf",     build_wolf,           (-3.6, -3.4, 0.0), -math.radians(78)),
        ("FeralMonkey",   build_monkey,         ( 3.6, -3.4, 0.0), -math.radians(102)),
    ]
    for label, fn, pos, rz in horror_lineup:
        sc = bpy.data.collections.new(f"Horror_{label}")
        horror_col.children.link(sc)
        fn(offset=pos, rot_z=rz, col=sc)

    setup_studio(pedestal_radius=9.8, cam_loc=(0.0, -13.8, 5.4), cam_target_loc=(0.0, -0.8, 1.65), lens=38, view_dist=14.0, night_mode=True)
    save_and_render("night_horror_mobs", res_x=1600, res_y=960)

    # 3. Complete 14-Mob Master Scene (MOB/all_mobs.blend) — Day & Night Mobs Together!
    clear_scene()
    master_col = bpy.data.collections.new("MOB")
    bpy.context.scene.collection.children.link(master_col)

    all_layout = [
        # Tier 1: Front Row
        ("Pig",           build_pig,            (-6.4, -4.0, 0.0),  -math.radians(68)),
        ("Dog",           build_dog,            (-3.2, -4.5, 0.0),  -math.radians(80)),
        ("Rabbit",        build_rabbit,         ( 0.0, -4.7, 0.0),  -math.radians(90)),
        ("Bird",          build_bird,           ( 3.2, -4.5, 0.0),  -math.radians(100)),
        ("Cat",           build_cat,            ( 6.4, -4.0, 0.0),  -math.radians(112)),
        # Tier 2: Middle Row
        ("Cow",           build_cow,            (-6.8,  0.0, 0.35), -math.radians(72)),
        ("Sheep",         build_sheep,          (-3.4,  0.4, 0.35), -math.radians(82)),
        ("Wolf",          build_wolf,           ( 0.0,  0.6, 0.35), -math.radians(90)),
        ("Monkey",        build_monkey,         ( 3.4,  0.4, 0.35), -math.radians(98)),
        ("Chicken",       build_chicken,        ( 6.8,  0.0, 0.35), -math.radians(108)),
        # Tier 3: Elevated Dark Horror Ridge (Back Row)
        ("ShadowStalker", build_shadow_stalker, (-5.8,  4.4, 0.85), -math.radians(76)),
        ("BloodCrawler",  build_blood_crawler,  (-2.0,  4.8, 0.85), -math.radians(85)),
        ("GrimWraith",    build_grim_wraith,    ( 2.0,  4.8, 0.85), -math.radians(95)),
        ("FleshGhoul",    build_flesh_ghoul,    ( 5.8,  4.4, 0.85), -math.radians(104)),
    ]

    for label, fn, pos, rz in all_layout:
        sc = bpy.data.collections.new(f"Mob_{label}")
        master_col.children.link(sc)
        fn(offset=pos, rot_z=rz, col=sc)

    # Middle terrace + Back Dark Horror Ridge terrace
    m_terrace = get_mat("Terrace_Grass", (0.15, 0.42, 0.14, 1.0), 0.82)
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=10.5, depth=0.36, location=(0.0, 0.5, 0.17))
    t1 = bpy.context.active_object
    t1.scale = (1.0, 0.45, 1.0)
    assign_mat(t1, m_terrace)
    smooth_obj(t1, 1, 0.05)

    m_horror_ridge = get_mat("Horror_ObsidianRidge", (0.05, 0.04, 0.08, 1.0), 0.75, bump_strength=0.45)
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=10.0, depth=0.86, location=(0.0, 4.6, 0.42))
    t2 = bpy.context.active_object
    t2.scale = (1.0, 0.35, 1.0)
    assign_mat(t2, m_horror_ridge)
    smooth_obj(t2, 1, 0.05)

    setup_studio(
        pedestal_radius=13.0,
        cam_loc=(0.0, -18.5, 7.2),
        cam_target_loc=(0.0, -0.2, 1.65),
        lens=35,
        view_dist=18.5,
        night_mode=False,
    )
    save_and_render("all_mobs", res_x=1600, res_y=960)

if __name__ == "__main__":
    main()
