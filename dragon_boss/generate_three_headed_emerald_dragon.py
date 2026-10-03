import bpy
import math
import os
import random

OUTPUT_DIR = r"c:\Users\npal7\OneDrive\PROJECT\project1\three_headed_emerald_dragon"
os.makedirs(OUTPUT_DIR, exist_ok=True)
BLEND_PATH = os.path.join(OUTPUT_DIR, "three_headed_emerald_dragon.blend")
RENDER_PATH = os.path.join(OUTPUT_DIR, "three_headed_emerald_dragon_render.png")
GLB_PATH = os.path.join(OUTPUT_DIR, "three_headed_emerald_dragon.glb")

# -------------------------------------------------------------------------
# Scene Cleanup
# -------------------------------------------------------------------------
def clear_all():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for col in list(bpy.data.collections):
        bpy.data.collections.remove(col)
    for block in list(bpy.data.actions):
        bpy.data.actions.remove(block)
    for block in list(bpy.data.meshes):
        bpy.data.meshes.remove(block)
    for block in list(bpy.data.materials):
        bpy.data.materials.remove(block)
    for block in list(bpy.data.cameras):
        bpy.data.cameras.remove(block)
    for block in list(bpy.data.lights):
        bpy.data.lights.remove(block)

# -------------------------------------------------------------------------
# Materials Palette with Procedural Micro-Voxel Detailing
# -------------------------------------------------------------------------
def create_materials():
    mats = {}

    # 1. Dark Basalt / Obsidian Green Scales (Micro-Voxel Tiled Normal & Color)
    m = bpy.data.materials.new("Mat_Dragon_DarkScales")
    nodes = m.node_tree.nodes
    links = m.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 0.55

    tex_coord = nodes.new("ShaderNodeTexCoord")
    brick = nodes.new("ShaderNodeTexBrick")
    brick.inputs["Scale"].default_value = 7.0
    brick.inputs["Mortar Size"].default_value = 0.025
    brick.inputs["Mortar Smooth"].default_value = 0.0
    brick.inputs["Color1"].default_value = (0.010, 0.045, 0.018, 1.0)
    brick.inputs["Color2"].default_value = (0.018, 0.075, 0.030, 1.0)
    brick.inputs["Mortar"].default_value = (0.004, 0.014, 0.007, 1.0)

    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.35
    bump.inputs["Distance"].default_value = 0.10

    links.new(tex_coord.outputs["Object"], brick.inputs["Vector"])
    links.new(brick.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(brick.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    mats["DarkScales"] = m

    # 2. Rich Deep Emerald (Scale Plates & Armor)
    m = bpy.data.materials.new("Mat_Dragon_EmeraldPlate")
    nodes = m.node_tree.nodes
    links = m.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 0.44

    tex_coord = nodes.new("ShaderNodeTexCoord")
    brick = nodes.new("ShaderNodeTexBrick")
    brick.inputs["Scale"].default_value = 6.5
    brick.inputs["Mortar Size"].default_value = 0.02
    brick.inputs["Color1"].default_value = (0.020, 0.12, 0.045, 1.0)
    brick.inputs["Color2"].default_value = (0.035, 0.18, 0.065, 1.0)
    brick.inputs["Mortar"].default_value = (0.008, 0.035, 0.014, 1.0)

    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.30
    bump.inputs["Distance"].default_value = 0.08

    links.new(tex_coord.outputs["Object"], brick.inputs["Vector"])
    links.new(brick.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(brick.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    mats["EmeraldPlate"] = m

    # 3. Obsidian Belly & Armor Base
    m = bpy.data.materials.new("Mat_Dragon_ObsidianArmor")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.010, 0.016, 0.012, 1.0)
    b.inputs["Roughness"].default_value = 0.65
    b.inputs["Metallic"].default_value = 0.18
    mats["ObsidianArmor"] = m

    # 4. Vibrant Neon Emerald Crystal (Saturated lime-green crystal, no white blowout)
    m = bpy.data.materials.new("Mat_Dragon_NeonCrystal")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.15, 1.0, 0.20, 1.0)
    b.inputs["Roughness"].default_value = 0.12
    if "Emission Color" in b.inputs:
        b.inputs["Emission Color"].default_value = (0.15, 1.0, 0.20, 1.0)
        b.inputs["Emission Strength"].default_value = 10.0
    elif "Emission" in b.inputs:
        b.inputs["Emission"].default_value = (0.15, 1.0, 0.20, 1.0)
    mats["NeonCrystal"] = m

    # 5. Glowing Neon-Green Eyes
    m = bpy.data.materials.new("Mat_Dragon_NeonEye")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.22, 1.0, 0.18, 1.0)
    b.inputs["Roughness"].default_value = 0.05
    if "Emission Color" in b.inputs:
        b.inputs["Emission Color"].default_value = (0.22, 1.0, 0.18, 1.0)
        b.inputs["Emission Strength"].default_value = 18.0
    elif "Emission" in b.inputs:
        b.inputs["Emission"].default_value = (0.22, 1.0, 0.18, 1.0)
    mats["NeonEye"] = m

    # 6. Eye Slit Pupil
    m = bpy.data.materials.new("Mat_Dragon_Pupil")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.005, 0.008, 0.005, 1.0)
    b.inputs["Roughness"].default_value = 0.20
    mats["Pupil"] = m

    # 7. Blazing Green Fire Energy Core (Saturated Emerald Fire)
    m = bpy.data.materials.new("Mat_Dragon_FireBeam")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.20, 1.0, 0.24, 1.0)
    b.inputs["Roughness"].default_value = 0.05
    if "Emission Color" in b.inputs:
        b.inputs["Emission Color"].default_value = (0.20, 1.0, 0.24, 1.0)
        b.inputs["Emission Strength"].default_value = 18.0
    elif "Emission" in b.inputs:
        b.inputs["Emission"].default_value = (0.20, 1.0, 0.24, 1.0)
    mats["FireBeam"] = m

    # 8. Razor Sharp Ivory Teeth
    m = bpy.data.materials.new("Mat_Dragon_IvoryTeeth")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.90, 0.88, 0.78, 1.0)
    b.inputs["Roughness"].default_value = 0.25
    mats["IvoryTeeth"] = m

    # 9. Wing Membrane (Emerald Dragon Webbing)
    m = bpy.data.materials.new("Mat_Dragon_WingMembrane")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.018, 0.11, 0.038, 1.0)
    b.inputs["Roughness"].default_value = 0.45
    mats["WingMembrane"] = m

    # 10. Wing Spars
    m = bpy.data.materials.new("Mat_Dragon_WingSpar")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.012, 0.045, 0.018, 1.0)
    b.inputs["Roughness"].default_value = 0.50
    mats["WingSpar"] = m

    # 11. Ruined Obsidian Tower Stone
    m = bpy.data.materials.new("Mat_Obsidian_Stone")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.014, 0.010, 0.018, 1.0)
    b.inputs["Roughness"].default_value = 0.38
    b.inputs["Metallic"].default_value = 0.25
    mats["Obsidian"] = m

    # 12. Cracked Deepslate Terrain
    m = bpy.data.materials.new("Mat_Terrain_Deepslate")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.024, 0.028, 0.026, 1.0)
    b.inputs["Roughness"].default_value = 0.85
    mats["Terrain"] = m

    # 13. Square Minecraft Moon
    m = bpy.data.materials.new("Mat_Square_Moon")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.88, 0.95, 1.0, 1.0)
    b.inputs["Roughness"].default_value = 0.08
    if "Emission Color" in b.inputs:
        b.inputs["Emission Color"].default_value = (0.88, 0.95, 1.0, 1.0)
        b.inputs["Emission Strength"].default_value = 22.0
    elif "Emission" in b.inputs:
        b.inputs["Emission"].default_value = (0.88, 0.95, 1.0, 1.0)
    mats["Moon"] = m

    # 14. Volumetric Toxic Green Mist (Ground mist, not opaque ceiling)
    mat_fog = bpy.data.materials.new("Mat_Toxic_Fog")
    nodes = mat_fog.node_tree.nodes
    nodes.clear()
    vol_node = nodes.new("ShaderNodeVolumePrincipled")
    vol_node.inputs["Color"].default_value = (0.03, 0.18, 0.06, 1.0)
    vol_node.inputs["Density"].default_value = 0.0030  # Atmospheric ground haze
    vol_node.inputs["Anisotropy"].default_value = 0.45
    output_node = nodes.new("ShaderNodeOutputMaterial")
    mat_fog.node_tree.links.new(vol_node.outputs["Volume"], output_node.inputs["Volume"])
    mats["Fog"] = mat_fog

    return mats

# -------------------------------------------------------------------------
# Helper Primitive Mesh Builders
# -------------------------------------------------------------------------
def create_block(name, loc, size, mat, col=None, rot_deg=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(
        size=1.0,
        location=loc,
        rotation=(math.radians(rot_deg[0]), math.radians(rot_deg[1]), math.radians(rot_deg[2]))
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for p in obj.data.polygons:
        p.use_smooth = False
    if mat:
        obj.data.materials.append(mat)
    if col:
        for c in list(obj.users_collection):
            c.objects.unlink(obj)
        col.objects.link(obj)
    return obj

def create_spike(name, loc, base_rad, height, mat, col=None, rot_deg=(0,0,0)):
    bpy.ops.mesh.primitive_cone_add(
        vertices=4,
        radius1=base_rad,
        radius2=0.0,
        depth=height,
        location=loc,
        rotation=(math.radians(rot_deg[0]), math.radians(rot_deg[1]), math.radians(rot_deg[2]))
    )
    obj = bpy.context.active_object
    obj.name = name
    for p in obj.data.polygons:
        p.use_smooth = False
    if mat:
        obj.data.materials.append(mat)
    if col:
        for c in list(obj.users_collection):
            c.objects.unlink(obj)
        col.objects.link(obj)
    return obj

# -------------------------------------------------------------------------
# Build Dragon Geometry (Trident Neck Configuration & Frontal Hero Stance)
# -------------------------------------------------------------------------
def build_dragon(mats):
    col = bpy.data.collections.new("01_Dragon_Boss")
    bpy.context.scene.collection.children.link(col)

    # 1. MAIN CHEST & BODY (Heavily Armored Voxel Matrix)
    create_block("Dragon_Chest_Core", (0.0, 0.4, 4.0), (3.8, 3.4, 3.2), mats["DarkScales"], col)
    create_block("Dragon_Hips", (0.0, -2.0, 3.6), (3.2, 2.6, 2.6), mats["DarkScales"], col)
    create_block("Dragon_Underbelly", (0.0, 0.2, 2.3), (2.8, 3.0, 0.5), mats["ObsidianArmor"], col)

    # Front Tiered Ventral Chest Plates (Layered down the chest)
    chest_plates = [
        # (y, z, sx, sy, sz, rot_x)
        (1.9, 5.2, 3.2, 0.5, 0.9, -15),
        (2.1, 4.4, 3.0, 0.5, 0.9, -20),
        (2.1, 3.5, 2.8, 0.5, 0.9, -22),
        (1.9, 2.6, 2.5, 0.5, 0.9, -24),
        (1.6, 1.8, 2.1, 0.5, 0.8, -26),
    ]
    for idx, (py, pz, psx, psy, psz, rx) in enumerate(chest_plates):
        create_block(f"Chest_Plate_{idx+1}", (0.0, py, pz), (psx, psy, psz), mats["EmeraldPlate"], col, rot_deg=(rx, 0, 0))
        # Small glowing emerald crystal accents in center and flanks
        create_block(f"Chest_Crystal_{idx+1}", (0.0, py + 0.24, pz), (0.28, 0.18, 0.28), mats["NeonCrystal"], col, rot_deg=(rx, 0, 0))
        if idx in (1, 2):
            create_block(f"Chest_Crystal_{idx+1}_L", (-0.95, py + 0.20, pz), (0.22, 0.16, 0.22), mats["NeonCrystal"], col, rot_deg=(rx, 0, 0))
            create_block(f"Chest_Crystal_{idx+1}_R", (0.95, py + 0.20, pz), (0.22, 0.16, 0.22), mats["NeonCrystal"], col, rot_deg=(rx, 0, 0))

    # Dorsal Back Spines
    for idx, (py, pz, h, rx) in enumerate([
        (1.2, 5.8, 1.8, 8),
        (0.2, 5.9, 1.9, 4),
        (-0.8, 5.7, 1.6, -4),
        (-1.8, 5.3, 1.4, -10),
    ]):
        create_spike(f"Back_Spike_{idx+1}", (0.0, py, pz), 0.45, h, mats["NeonCrystal"], col, rot_deg=(rx, 0, 0))

    # 2. MASSIVE FRONT LEGS (Foreground Framing - Planted Wide on Ground)
    for side, sign in [("L", -1.0), ("R", 1.0)]:
        # Upper Shoulder / Thigh
        create_block(f"Leg_Front_Upper_{side}", (sign * 2.8, 1.2, 3.6), (1.5, 1.6, 1.8), mats["DarkScales"], col, rot_deg=(10, sign * -12, 0))
        # Shoulder Armor Plate with Neon Emerald Gem
        create_block(f"Leg_Front_ShoulderPlate_{side}", (sign * 3.5, 1.4, 3.6), (0.35, 1.5, 1.6), mats["EmeraldPlate"], col, rot_deg=(10, sign * -12, 0))
        create_block(f"Leg_Front_ShoulderGem_{side}", (sign * 3.65, 1.4, 3.6), (0.18, 0.30, 0.30), mats["NeonCrystal"], col, rot_deg=(10, sign * -12, 0))

        # Knee Joint & Forward Armor Spur
        create_block(f"Leg_Front_Knee_{side}", (sign * 3.5, 2.2, 2.2), (1.35, 1.45, 1.3), mats["DarkScales"], col)
        create_spike(f"Leg_Front_KneeSpur_{side}", (sign * 3.5, 2.9, 2.2), 0.26, 0.75, mats["NeonCrystal"], col, rot_deg=(85, 0, 0))

        # Lower Shin (Thick pillar tapering down to ground)
        create_block(f"Leg_Front_Shin_{side}", (sign * 3.9, 3.0, 1.1), (1.3, 1.4, 1.4), mats["DarkScales"], col)

        # Foreground Paw Foot
        create_block(f"Foot_Front_{side}", (sign * 4.2, 4.0, 0.35), (1.7, 2.0, 0.65), mats["DarkScales"], col)

        # 4 Heavy Glowing Emerald Claws on each front foot
        for c_idx, ox in enumerate([-0.55, -0.18, 0.18, 0.55]):
            create_spike(f"Claw_Front_{side}_{c_idx+1}", (sign * 4.2 + ox, 5.0, 0.22), 0.16, 0.70, mats["NeonCrystal"], col, rot_deg=(90, 0, 0))

    # 3. REAR LEGS (Supporting Rear Stance)
    for side, sign in [("L", -1.0), ("R", 1.0)]:
        create_block(f"Leg_Rear_Upper_{side}", (sign * 2.6, -2.2, 3.2), (1.4, 1.6, 1.8), mats["DarkScales"], col)
        create_block(f"Leg_Rear_Shin_{side}", (sign * 3.0, -2.4, 1.6), (1.2, 1.3, 1.4), mats["DarkScales"], col)
        create_block(f"Foot_Rear_{side}", (sign * 3.2, -2.0, 0.35), (1.5, 1.7, 0.65), mats["DarkScales"], col)
        for c_idx, ox in enumerate([-0.45, 0.0, 0.45]):
            create_spike(f"Claw_Rear_{side}_{c_idx+1}", (sign * 3.2 + ox, -1.1, 0.22), 0.15, 0.60, mats["NeonCrystal"], col, rot_deg=(90, 0, 0))

    # 4. LONG DRAGON TAIL
    tail_segments = [
        ((0.0, -3.6, 3.3), (1.6, 1.7, 1.5)),
        ((0.0, -5.3, 2.9), (1.3, 1.7, 1.3)),
        ((0.0, -7.0, 2.5), (1.0, 1.7, 1.0)),
        ((0.0, -8.7, 2.1), (0.7, 1.7, 0.7)),
        ((0.0, -10.4, 1.7), (0.5, 1.8, 0.5)),
    ]
    for idx, (loc, sz) in enumerate(tail_segments):
        create_block(f"Tail_Seg_{idx+1}", loc, sz, mats["DarkScales"], col)
        create_block(f"Tail_Under_{idx+1}", (loc[0], loc[1], loc[2] - sz[2]*0.5), (sz[0]*0.8, sz[1]*1.02, 0.18), mats["ObsidianArmor"], col)
    # Spade Fin
    create_block("Tail_Fin_H", (0.0, -11.3, 1.7), (2.0, 1.2, 0.16), mats["EmeraldPlate"], col)
    create_block("Tail_Fin_V", (0.0, -11.3, 1.7), (0.16, 1.2, 1.6), mats["NeonCrystal"], col)

    # 5. THREE LONG POWERFUL NECKS (True 'W' / Trident Spread)
    # A. CENTER NECK (Rises high, vertical, towering straight into top-center)
    c_neck_coords = [
        ((0.0, 1.4, 5.4), (1.6, 1.35, 1.0), (0.0, 1.4, 6.15), 1.0, 8),
        ((0.0, 1.5, 6.3), (1.5, 1.30, 1.0), (0.0, 1.5, 7.05), 1.1, 10),
        ((0.0, 1.6, 7.2), (1.45, 1.25, 1.0), (0.0, 1.6, 7.95), 1.15, 12),
        ((0.0, 1.7, 8.1), (1.4, 1.20, 1.0), (0.0, 1.7, 8.85), 1.15, 14),
        ((0.0, 1.8, 9.0), (1.35, 1.15, 1.0), (0.0, 1.8, 9.75), 1.10, 16),
    ]
    for i, (loc, sz, spk_pt, spk_h, rot_x) in enumerate(c_neck_coords):
        create_block(f"Neck_C_Block_{i+1}", loc, sz, mats["DarkScales"], col, rot_deg=(rot_x*0.5, 0, 0))
        create_block(f"Neck_C_Throat_{i+1}", (loc[0], loc[1] + sz[1]*0.48, loc[2]), (sz[0]*0.80, 0.32, sz[2]*0.88), mats["EmeraldPlate"], col, rot_deg=(rot_x*0.5, 0, 0))
        create_spike(f"Neck_C_Spike_{i+1}", spk_pt, 0.32, spk_h, mats["NeonCrystal"], col, rot_deg=(rot_x, 0, 0))

    # B. LEFT & RIGHT FLANK NECKS (Arching widely outward to the sides!)
    flank_neck_coords = [
        ((1.3, 1.2, 5.2), (1.5, 1.30, 1.0), (1.3, 1.2, 5.95), 0.95, 8, 12),
        ((2.1, 1.4, 6.0), (1.4, 1.25, 1.0), (2.1, 1.4, 6.75), 1.05, 10, 16),
        ((2.9, 1.6, 6.8), (1.35, 1.20, 1.0), (2.9, 1.6, 7.55), 1.10, 12, 20),
        ((3.7, 1.8, 7.6), (1.30, 1.15, 1.0), (3.7, 1.8, 8.35), 1.10, 14, 24),
        ((4.4, 2.0, 8.4), (1.25, 1.10, 1.0), (4.4, 2.0, 9.15), 1.00, 16, 26),
    ]
    for side, sign in [("L", -1.0), ("R", 1.0)]:
        for i, (loc, sz, spk_pt, spk_h, rx, ry) in enumerate(flank_neck_coords):
            create_block(f"Neck_{side}_Block_{i+1}", (sign*loc[0], loc[1], loc[2]), sz, mats["DarkScales"], col, rot_deg=(rx*0.5, sign*ry, 0))
            create_block(f"Neck_{side}_Throat_{i+1}", (sign*loc[0], loc[1] + sz[1]*0.46, loc[2]), (sz[0]*0.80, 0.30, sz[2]*0.85), mats["EmeraldPlate"], col, rot_deg=(rx*0.5, sign*ry, 0))
            create_spike(f"Neck_{side}_Spike_{i+1}", (sign*spk_pt[0], spk_pt[1], spk_pt[2]), 0.30, spk_h, mats["NeonCrystal"], col, rot_deg=(rx, sign*(ry+15), 0))

    # 6. THREE MASSIVE ROARING HEADS (Enlarged 1.35x, Gaping Jaws with Green Fire Torrents)
    head_specs = [
        # code, center_x, center_y, center_z, yaw_deg, pitch_deg
        ("C", 0.0, 1.8, 9.8, 0.0, 26.0),         # Center: Roaring high straight up/forward!
        ("L", -5.0, 2.0, 8.9, 24.0, 14.0),       # Left: Splayed outward, tilted up in roar
        ("R", 5.0, 2.0, 8.9, -24.0, 14.0),       # Right: Splayed outward, tilted up in roar
    ]

    for code, hx, hy, hz, yaw, pitch in head_specs:
        rad_y = math.radians(yaw)
        rad_p = math.radians(pitch)

        fwd_x = math.sin(-rad_y) * math.cos(rad_p)
        fwd_y = math.cos(rad_y) * math.cos(rad_p)
        fwd_z = math.sin(rad_p)

        up_x = -math.sin(-rad_y) * math.sin(rad_p)
        up_y = -math.cos(rad_y) * math.sin(rad_p)
        up_z = math.cos(rad_p)

        # Upper Skull Block (Larger and wider for terrifying boss silhouette)
        create_block(f"Skull_{code}", (hx, hy, hz), (2.1, 1.8, 1.4), mats["DarkScales"], col, rot_deg=(pitch, 0, yaw))

        # Snout (Extending forward)
        sn_x = hx + fwd_x * 1.5
        sn_y = hy + fwd_y * 1.5
        sn_z = hz + fwd_z * 1.5
        create_block(f"Snout_{code}", (sn_x, sn_y, sn_z), (1.65, 1.9, 0.95), mats["DarkScales"], col, rot_deg=(pitch, 0, yaw))
        # Snout Top Armor Ridge
        create_block(f"SnoutRidge_{code}", (sn_x + up_x*0.48, sn_y + up_y*0.48, sn_z + up_z*0.48), (1.1, 1.8, 0.26), mats["EmeraldPlate"], col, rot_deg=(pitch, 0, yaw))

        # Glowing Neon Green Eyes
        for e_side, e_sign in [("L", -1.0), ("R", 1.0)]:
            e_x = hx + e_sign * 1.02 * math.cos(rad_y) + fwd_x * 0.55
            e_y = hy + e_sign * 1.02 * math.sin(-rad_y) + fwd_y * 0.55
            e_z = hz + fwd_z * 0.55 + up_z * 0.18
            create_block(f"Eye_{code}_{e_side}", (e_x, e_y, e_z), (0.18, 0.52, 0.32), mats["NeonEye"], col, rot_deg=(pitch, 0, yaw))
            create_block(f"Pupil_{code}_{e_side}", (e_x * 1.03, e_y * 1.03, e_z), (0.08, 0.18, 0.28), mats["Pupil"], col, rot_deg=(pitch, 0, yaw))
            create_block(f"Brow_{code}_{e_side}", (e_x * 0.96, e_y, e_z + 0.32), (0.40, 0.95, 0.28), mats["NeonCrystal"], col, rot_deg=(pitch + 4, e_sign * 12, yaw))

        # MULTI-TIERED SEGMENTED HORNS (Swept Upwards and Backwards into the Sky!)
        for h_side, h_sign in [("1", -1.0), ("2", 1.0)]:
            splay = 18.0 if code == "C" else 22.0
            # Base horn block
            hb_x = hx + h_sign * 0.82 * math.cos(rad_y) - fwd_x * 0.4 + up_x * 0.75
            hb_y = hy + h_sign * 0.82 * math.sin(-rad_y) - fwd_y * 0.4 + up_y * 0.75
            hb_z = hz - fwd_z * 0.4 + up_z * 0.75
            create_block(f"HornBase_{code}_{h_side}", (hb_x, hb_y, hb_z), (0.52, 0.60, 0.65), mats["NeonCrystal"], col, rot_deg=(pitch + 28, h_sign * splay, yaw))
            # Mid horn block
            hm_x = hb_x - fwd_x * 0.6 + up_x * 0.65
            hm_y = hb_y - fwd_y * 0.6 + up_y * 0.65
            hm_z = hb_z - fwd_z * 0.6 + up_z * 0.65
            create_block(f"HornMid_{code}_{h_side}", (hm_x, hm_y, hm_z), (0.44, 0.54, 0.70), mats["NeonCrystal"], col, rot_deg=(pitch + 42, h_sign * (splay+4), yaw))
            # Tip horn block
            ht_x = hm_x - fwd_x * 0.6 + up_x * 0.65
            ht_y = hm_y - fwd_y * 0.6 + up_y * 0.65
            ht_z = hm_z - fwd_z * 0.6 + up_z * 0.65
            create_block(f"HornTip_{code}_{h_side}", (ht_x, ht_y, ht_z), (0.34, 0.46, 0.78), mats["NeonCrystal"], col, rot_deg=(pitch + 56, h_sign * (splay+8), yaw))
            # Horn terminal spike
            he_x = ht_x - fwd_x * 0.55 + up_x * 0.60
            he_y = ht_y - fwd_y * 0.55 + up_y * 0.60
            he_z = ht_z - fwd_z * 0.55 + up_z * 0.60
            create_spike(f"HornSpk_{code}_{h_side}", (he_x, he_y, he_z), 0.24, 0.85, mats["NeonCrystal"], col, rot_deg=(pitch + 56, h_sign * (splay+8), yaw))

        # Secondary Temple Spines (Side horns)
        for t_side, t_sign in [("L", -1.0), ("R", 1.0)]:
            create_spike(f"TempleSpk_{code}_{t_side}", (hx + t_sign*1.1, hy - 0.2, hz + 0.1), 0.20, 0.75, mats["NeonCrystal"], col, rot_deg=(0, t_sign * 85, yaw))

        # Upper Fangs (Sharp Ivory Teeth)
        for f_idx, (fx, fy, fz, fh) in enumerate([
            (-0.62, 2.0, -0.48, 0.48),
            (-0.66, 1.4, -0.46, 0.40),
            (-0.68, 0.8, -0.44, 0.32),
            (0.62, 2.0, -0.48, 0.48),
            (0.66, 1.4, -0.46, 0.40),
            (0.68, 0.8, -0.44, 0.32),
        ]):
            fang_x = hx + fx * math.cos(rad_y) + fy * fwd_x
            fang_y = hy + fx * math.sin(-rad_y) + fy * fwd_y
            fang_z = hz + fy * fwd_z + fz * up_z
            create_spike(f"FangUpper_{code}_{f_idx+1}", (fang_x, fang_y, fang_z), 0.14, fh, mats["IvoryTeeth"], col, rot_deg=(180 + pitch, 0, yaw))

        # LOWER JAW (Dropped wide open downwards in roaring maw)
        jaw_drop_deg = pitch - 42.0  # Open mouth angle dropped down deep
        rad_jd = math.radians(jaw_drop_deg)
        jaw_fwd_x = math.sin(-rad_y) * math.cos(rad_jd)
        jaw_fwd_y = math.cos(rad_y) * math.cos(rad_jd)
        jaw_fwd_z = math.sin(rad_jd)

        jw_x = hx + jaw_fwd_x * 1.3
        jw_y = hy + jaw_fwd_y * 1.3
        jw_z = hz + jaw_fwd_z * 1.3 - 0.35
        create_block(f"LowerJaw_{code}", (jw_x, jw_y, jw_z), (1.5, 2.0, 0.48), mats["DarkScales"], col, rot_deg=(jaw_drop_deg, 0, yaw))
        create_block(f"JawUnder_{code}", (jw_x, jw_y, jw_z - 0.26), (1.25, 2.02, 0.22), mats["ObsidianArmor"], col, rot_deg=(jaw_drop_deg, 0, yaw))
        create_spike(f"ChinSpur_{code}", (jw_x + jaw_fwd_x*0.7, jw_y + jaw_fwd_y*0.7, jw_z - 0.40), 0.20, 0.65, mats["NeonCrystal"], col, rot_deg=(170, 0, yaw))

        # Lower Teeth
        for f_idx, (fx, fy, fz, fh) in enumerate([
            (-0.58, 1.8, 0.28, 0.42),
            (-0.62, 1.2, 0.26, 0.36),
            (0.58, 1.8, 0.28, 0.42),
            (0.62, 1.2, 0.26, 0.36),
        ]):
            tf_x = jw_x + fx * math.cos(rad_y) + (fy - 1.3) * jaw_fwd_x
            tf_y = jw_y + fx * math.sin(-rad_y) + (fy - 1.3) * jaw_fwd_y
            tf_z = jw_z + (fy - 1.3) * jaw_fwd_z + fz
            create_spike(f"FangLower_{code}_{f_idx+1}", (tf_x, tf_y, tf_z), 0.13, fh, mats["IvoryTeeth"], col, rot_deg=(jaw_drop_deg, 0, yaw))

        # BLAZING GREEN FIRE TORRENT INSIDE MOUTH
        fc_x = hx + fwd_x * 0.8
        fc_y = hy + fwd_y * 0.8
        fc_z = hz + fwd_z * 0.8 - 0.28
        create_block(f"FireCore_{code}", (fc_x, fc_y, fc_z), (0.90, 1.3, 0.65), mats["FireBeam"], col, rot_deg=(pitch, 0, yaw))

        fb_x = hx + fwd_x * 1.5
        fb_y = hy + fwd_y * 1.5
        fb_z = hz + fwd_z * 1.5 - 0.20
        create_block(f"FireBeam_{code}", (fb_x, fb_y, fb_z), (0.68, 1.8, 0.52), mats["FireBeam"], col, rot_deg=(pitch - 10, 0, yaw))

        # Mouth Green Point Light
        m_light = bpy.data.lights.new(name=f"Light_Mouth_{code}", type='POINT')
        m_light.energy = 750.0
        m_light.color = (0.18, 1.0, 0.25)
        m_light_obj = bpy.data.objects.new(f"Light_Mouth_{code}", m_light)
        m_light_obj.location = (fc_x, fc_y, fc_z)
        col.objects.link(m_light_obj)

    # 7. HUGE MAJESTIC WINGS (Raised High Into Sky, Framing Upper Frame)
    for side, sign in [("L", -1.0), ("R", 1.0)]:
        create_block(f"Wing_Joint_{side}", (sign * 2.4, 0.4, 5.4), (1.1, 1.1, 1.1), mats["DarkScales"], col)

        # Inner Arm Spar (Arching steeply up and out!)
        # Pitch: +28 degrees up!
        create_block(f"Wing_Spar_In_{side}", (sign * 5.8, 0.0, 8.2), (4.8, 0.85, 0.85), mats["WingSpar"], col, rot_deg=(22, sign * -32, sign * 24))
        # Inner Membrane Webbing
        create_block(f"Wing_Mem_In_{side}", (sign * 5.6, -1.6, 7.0), (4.6, 3.5, 0.12), mats["WingMembrane"], col, rot_deg=(-24, sign * -28, sign * 22))

        # Outer Arm Spar (Reaching high into upper corners: X=13.5, Z=13.2)
        create_block(f"Wing_Spar_Out_{side}", (sign * 11.2, -0.6, 12.0), (6.0, 0.70, 0.70), mats["WingSpar"], col, rot_deg=(28, sign * -38, sign * 28))
        # Outer Membrane Webbing
        create_block(f"Wing_Mem_Out_{side}", (sign * 11.0, -2.4, 10.4), (5.5, 4.2, 0.10), mats["WingMembrane"], col, rot_deg=(-22, sign * -34, sign * 25))

        # Wing Fingers extending down
        for f_idx, (fx, fy, fz, fl) in enumerate([
            (7.2, -2.5, 7.5, 4.2),
            (10.5, -3.2, 9.5, 4.8),
            (13.6, -3.8, 11.2, 4.5),
        ]):
            create_block(f"Wing_Finger_{side}_{f_idx+1}", (sign * fx, fy, fz), (0.36, fl, 0.36), mats["DarkScales"], col, rot_deg=(-26, sign * -25, sign * 18))

        # Crystalline Spines along Wing Top Ridge
        for spk_idx, (sx, sy, sz) in enumerate([
            (4.4, 0.1, 8.6),
            (7.2, -0.3, 10.4),
            (10.2, -0.8, 12.4),
            (13.2, -1.3, 14.2),
        ]):
            create_spike(f"Wing_TopSpike_{side}_{spk_idx+1}", (sign * sx, sy, sz), 0.26, 0.95, mats["NeonCrystal"], col, rot_deg=(0, sign * 45, 0))

    print("Three-headed dragon geometry created successfully.")

# -------------------------------------------------------------------------
# Environment: Monolith Towers, Green Fire, Square Moon, Ground Mist Glow
# -------------------------------------------------------------------------
def build_environment(mats):
    col = bpy.data.collections.new("02_Dark_Fantasy_Environment")
    bpy.context.scene.collection.children.link(col)

    # 1. Cracked Deepslate Terrain Ground
    create_block("Terrain_Platform_Base", (0.0, 0.0, -0.5), (65.0, 65.0, 1.0), mats["Terrain"], col)

    # Stepped cracked foreground blocks
    terrain_steps = [
        ((-4.2, 5.0, 0.1), (4.5, 4.0, 0.35)),
        ((4.2, 5.0, 0.1), (4.5, 4.0, 0.35)),
        ((0.0, 7.5, 0.15), (6.0, 4.2, 0.40)),
        ((-6.5, 9.0, 0.25), (4.5, 3.8, 0.50)),
        ((6.5, 9.0, 0.25), (4.5, 3.8, 0.50)),
        ((0.0, 12.0, 0.30), (8.0, 4.8, 0.60)),
    ]
    for idx, (loc, sz) in enumerate(terrain_steps):
        create_block(f"Terrain_Step_{idx+1}", loc, sz, mats["Terrain"], col)

    # 2. Ruined Obsidian Monolith Towers (Framing Midground)
    tower_specs = [
        # (center_x, center_y, height, width)
        (-13.0, 3.0, 16.0, 4.0),    # Left foreground tower
        (-17.5, -2.0, 21.0, 4.6),   # Left background tower
        (13.0, 3.0, 16.0, 4.0),     # Right foreground tower
        (17.5, -2.0, 21.0, 4.6),    # Right background tower
        (-8.5, -11.0, 15.0, 3.8),   # Rear left tower
        (8.5, -11.0, 15.0, 3.8),    # Rear right tower
    ]
    for t_idx, (tx, ty, th, tw) in enumerate(tower_specs):
        create_block(f"Obsidian_Tower_{t_idx+1}_Base", (tx, ty, th*0.5), (tw, tw, th), mats["Obsidian"], col)
        # Jagged ruined tops
        create_block(f"Obsidian_Tower_{t_idx+1}_Ruin1", (tx - tw*0.2, ty - tw*0.2, th + 0.8), (tw*0.5, tw*0.5, 1.6), mats["Obsidian"], col)
        create_block(f"Obsidian_Tower_{t_idx+1}_Ruin2", (tx + tw*0.25, ty + tw*0.2, th + 0.4), (tw*0.4, tw*0.4, 0.8), mats["Obsidian"], col)

        # Bright Green Fire Brazier Column atop tower
        create_block(f"Tower_GreenFlame_{t_idx+1}", (tx, ty, th + 1.2), (1.2, 1.2, 2.4), mats["FireBeam"], col)

        # Tower Fire Light
        fl_light = bpy.data.lights.new(name=f"Tower_Light_{t_idx+1}", type='POINT')
        fl_light.energy = 950.0
        fl_light.color = (0.18, 1.0, 0.25)
        fl_obj = bpy.data.objects.new(f"Tower_Light_{t_idx+1}", fl_light)
        fl_obj.location = (tx, ty, th + 2.0)
        col.objects.link(fl_obj)

    # 3. Floating Glowing Green Cubic Embers (70 Particles)
    random.seed(42)
    for p_idx in range(70):
        px = random.uniform(-14.0, 14.0)
        py = random.uniform(-2.0, 14.0)
        pz = random.uniform(1.2, 14.0)
        psize = random.uniform(0.12, 0.32)
        create_block(f"Toxic_Ember_{p_idx+1}", (px, py, pz), (psize, psize, psize), mats["FireBeam"], col, rot_deg=(random.uniform(0, 45), random.uniform(0, 45), random.uniform(0, 45)))

    # 4. Square Minecraft Moon in the Upper-Right Sky (Visible in camera frame!)
    # Positioned at (12.0, -4.0, 14.5) to sit perfectly in the upper-right quadrant
    moon_loc = (12.0, -4.0, 14.5)
    create_block("Minecraft_Square_Moon", moon_loc, (5.5, 0.5, 5.5), mats["Moon"], col, rot_deg=(25, 20, -15))

    # Moonlight Directional Sun Lamp
    moon_light = bpy.data.lights.new(name="Moonlight_Key", type='SUN')
    moon_light.energy = 3.8
    moon_light.color = (0.82, 0.92, 1.0)
    moon_light_obj = bpy.data.objects.new("Moonlight_Key", moon_light)
    moon_light_obj.location = moon_loc
    moon_light_obj.rotation_euler = (math.radians(-48), math.radians(24), math.radians(138))
    col.objects.link(moon_light_obj)

    # 5. Low Volumetric Mist Layer (Ground mist only, z: -1 to 5)
    create_block("Volumetric_Toxic_Fog", (0.0, 4.0, 2.5), (65.0, 65.0, 6.0), mats["Fog"], col)

    # 6. Dramatic Green Ground Fissure Underlighting (Illuminating the dragon's belly & legs)
    fissure_light = bpy.data.lights.new(name="Ground_Fissure_Light", type='AREA')
    fissure_light.energy = 2800.0
    fissure_light.size = 12.0
    fissure_light.color = (0.12, 1.0, 0.22)
    fissure_obj = bpy.data.objects.new("Ground_Fissure_Light", fissure_light)
    fissure_obj.location = (0.0, 3.5, 0.4)
    fissure_obj.rotation_euler = (math.radians(-90), 0, 0)  # Pointing up towards dragon chest!
    col.objects.link(fissure_obj)

    print("Dark fantasy Minecraft environment built.")

# -------------------------------------------------------------------------
# Frontal Hero Camera Setup (Exact Match to User Reference Composition)
# -------------------------------------------------------------------------
def setup_camera():
    col = bpy.data.collections.new("00_Hero_Camera")
    bpy.context.scene.collection.children.link(col)

    # Focus Target Empty (Centered on dragon chest and heads)
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0.0, 1.5, 6.2))
    target = bpy.context.active_object
    target.name = "Camera_Hero_Target"
    for c in list(target.users_collection):
        c.objects.unlink(target)
    col.objects.link(target)

    # Frontal Low-Angle Hero Camera
    cam_data = bpy.data.cameras.new("Hero_Boss_Camera")
    cam_data.lens = 27.0  # 27mm wide angle for immense boss scale
    cam_data.clip_end = 350.0

    # Depth of Field focusing on central roaring head
    cam_data.dof.use_dof = True
    cam_data.dof.focus_object = target
    cam_data.dof.aperture_fstop = 4.0

    cam_obj = bpy.data.objects.new("Hero_Boss_Camera", cam_data)
    # Ground level looking up at the colossal dragon
    cam_obj.location = (0.0, 16.5, 3.2)
    col.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj

    # Track-To constraint
    tt = cam_obj.constraints.new(type='TRACK_TO')
    tt.target = target
    tt.track_axis = 'TRACK_NEGATIVE_Z'
    tt.up_axis = 'UP_Y'

    print("Frontal hero camera positioned.")

# -------------------------------------------------------------------------
# Main Execution Flow
# -------------------------------------------------------------------------
def main():
    print("=== Starting Three-Headed Emerald Dragon Generation ===")
    clear_all()
    mats = create_materials()
    build_dragon(mats)
    build_environment(mats)
    setup_camera()

    scene = bpy.context.scene

    # Render Engine: Blender Cycles GPU
    scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'CUDA'
    for d in prefs.devices:
        d.use = (d.type == 'CUDA' and 'NVIDIA' in d.name)
    scene.cycles.device = 'GPU'
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = 'OPENIMAGEDENOISE'

    # Widescreen Cinematic 16:9
    scene.render.resolution_x = 2560
    scene.render.resolution_y = 1440
    scene.render.film_transparent = False

    # AgX High Contrast
    if hasattr(scene.view_settings, "view_transform"):
        scene.view_settings.view_transform = 'AgX'
        scene.view_settings.look = 'AgX - High Contrast'

    # Save Blend Scene
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
    print(f"Master scene saved: {BLEND_PATH}")

    # Render Still
    scene.render.filepath = RENDER_PATH
    print(f"Rendering Cycles still to: {RENDER_PATH} ...")
    bpy.ops.render.render(write_still=True)
    print(f"Cycles render finished: {RENDER_PATH}")

    # Export glTF GLB
    try:
        bpy.ops.export_scene.gltf(filepath=GLB_PATH, export_format='GLB')
        print(f"Game-ready glTF export finished: {GLB_PATH}")
    except Exception as e:
        print(f"glTF export note: {e}")

    print("=== Three-Headed Emerald Dragon Finished Successfully ===")

if __name__ == "__main__":
    main()
