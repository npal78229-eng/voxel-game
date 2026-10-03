import bpy
import math
import os
import random

OUTPUT_DIR = r"c:\Users\npal7\OneDrive\PROJECT\project1\three_headed_emerald_dragon"
os.makedirs(OUTPUT_DIR, exist_ok=True)

ARENA_BLEND = os.path.join(OUTPUT_DIR, "dragon_boss_arena.blend")
ARENA_GLB = os.path.join(OUTPUT_DIR, "dragon_boss_arena.glb")
ARENA_RENDER = os.path.join(OUTPUT_DIR, "dragon_arena_battle_showcase.png")

# -------------------------------------------------------------------------
# Scene Cleaning
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
# Material Library (Dangerous Dark Fantasy Voxel Palette)
# -------------------------------------------------------------------------
def create_materials():
    mats = {}

    # 1. Dark Basalt / Obsidian Green Dragon Scales
    m = bpy.data.materials.new("Mat_Dragon_DarkScales")
    nodes = m.node_tree.nodes
    links = m.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 0.55

    tex_coord = nodes.new("ShaderNodeTexCoord")
    brick = nodes.new("ShaderNodeTexBrick")
    brick.inputs["Scale"].default_value = 7.0
    brick.inputs["Mortar Size"].default_value = 0.025
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

    # 2. Rich Deep Emerald Plates
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

    # 3. Jagged Black Obsidian Crag Stone
    m = bpy.data.materials.new("Mat_Obsidian_Stone")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.012, 0.009, 0.016, 1.0)
    b.inputs["Roughness"].default_value = 0.30
    b.inputs["Metallic"].default_value = 0.35
    mats["Obsidian"] = m

    # 4. Arena Cracked Deepslate Floor
    m = bpy.data.materials.new("Mat_Arena_Deepslate")
    nodes = m.node_tree.nodes
    links = m.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 0.85

    tex_coord = nodes.new("ShaderNodeTexCoord")
    brick = nodes.new("ShaderNodeTexBrick")
    brick.inputs["Scale"].default_value = 4.5
    brick.inputs["Mortar Size"].default_value = 0.035
    brick.inputs["Color1"].default_value = (0.022, 0.025, 0.024, 1.0)
    brick.inputs["Color2"].default_value = (0.032, 0.038, 0.035, 1.0)
    brick.inputs["Mortar"].default_value = (0.008, 0.010, 0.009, 1.0)

    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.45
    bump.inputs["Distance"].default_value = 0.14

    links.new(tex_coord.outputs["Object"], brick.inputs["Vector"])
    links.new(brick.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(brick.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    mats["ArenaFloor"] = m

    # 5. Dangerous Glowing Toxic Green Magma / Lava Fissure (Deep Saturated Emerald Glow)
    m = bpy.data.materials.new("Mat_Toxic_Lava_Fissure")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.06, 0.95, 0.15, 1.0)
    b.inputs["Roughness"].default_value = 0.08
    if "Emission Color" in b.inputs:
        b.inputs["Emission Color"].default_value = (0.06, 0.95, 0.15, 1.0)
        b.inputs["Emission Strength"].default_value = 7.5
    elif "Emission" in b.inputs:
        b.inputs["Emission"].default_value = (0.06, 0.95, 0.15, 1.0)
    mats["ToxicLava"] = m

    # 6. Vibrant Neon Emerald Crystal & Horns
    m = bpy.data.materials.new("Mat_Neon_EmeraldCrystal")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.10, 0.95, 0.20, 1.0)
    b.inputs["Roughness"].default_value = 0.12
    if "Emission Color" in b.inputs:
        b.inputs["Emission Color"].default_value = (0.10, 0.95, 0.20, 1.0)
        b.inputs["Emission Strength"].default_value = 8.5
    elif "Emission" in b.inputs:
        b.inputs["Emission"].default_value = (0.10, 0.95, 0.20, 1.0)
    mats["NeonCrystal"] = m

    # 7. Bedrock Spire / Altar Stone
    m = bpy.data.materials.new("Mat_Bedrock_Stone")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.015, 0.018, 0.016, 1.0)
    b.inputs["Roughness"].default_value = 0.92
    mats["Bedrock"] = m

    # 8. Ivory Teeth & Bone
    m = bpy.data.materials.new("Mat_Dragon_IvoryTeeth")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.90, 0.88, 0.78, 1.0)
    b.inputs["Roughness"].default_value = 0.25
    mats["IvoryTeeth"] = m

    # 9. Wing Membrane
    m = bpy.data.materials.new("Mat_Dragon_WingMembrane")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.018, 0.11, 0.038, 1.0)
    b.inputs["Roughness"].default_value = 0.45
    mats["WingMembrane"] = m

    # 10. Wing Spar
    m = bpy.data.materials.new("Mat_Dragon_WingSpar")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.012, 0.045, 0.018, 1.0)
    b.inputs["Roughness"].default_value = 0.50
    mats["WingSpar"] = m

    # 11. Square Moon
    m = bpy.data.materials.new("Mat_Square_Moon")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.88, 0.95, 1.0, 1.0)
    b.inputs["Roughness"].default_value = 0.08
    if "Emission Color" in b.inputs:
        b.inputs["Emission Color"].default_value = (0.88, 0.95, 1.0, 1.0)
        b.inputs["Emission Strength"].default_value = 24.0
    elif "Emission" in b.inputs:
        b.inputs["Emission"].default_value = (0.88, 0.95, 1.0, 1.0)
    mats["Moon"] = m

    # 12. Void Underbelly
    m = bpy.data.materials.new("Mat_Void_Abyss")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.003, 0.003, 0.005, 1.0)
    b.inputs["Roughness"].default_value = 0.98
    mats["Void"] = m

    return mats

# -------------------------------------------------------------------------
# Helper Primitive Functions
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
# Build Open & Dangerous Dragon Spawn Arena
# -------------------------------------------------------------------------
def build_dangerous_arena(mats):
    col = bpy.data.collections.new("01_Dangerous_Dragon_Arena")
    bpy.context.scene.collection.children.link(col)

    print("Building Open & Dangerous Dragon Spawn Arena...")

    # 1. EXPANSIVE FRACTURED TECTONIC CONTINENT (110m across, open sky)
    # The base landmass is composed of broken irregular deepslate slabs
    main_slabs = [
        ((0.0, 0.0, -1.5), (96.0, 96.0, 3.0), 0),
        ((0.0, 0.0, -3.2), (84.0, 84.0, 2.5), 25),
        ((0.0, 0.0, -5.2), (70.0, 70.0, 3.5), 45),
        ((-28.0, 18.0, -1.0), (32.0, 42.0, 2.6), 12),
        ((30.0, 22.0, -1.0), (36.0, 38.0, 2.8), -8),
        ((-24.0, -30.0, -1.2), (40.0, 34.0, 2.4), -15),
        ((26.0, -28.0, -1.2), (38.0, 36.0, 2.5), 18),
    ]
    for idx, (loc, sz, rz) in enumerate(main_slabs):
        create_block(f"Tectonic_Slab_{idx+1}", loc, sz, mats["ArenaFloor"], col, rot_deg=(0, 0, rz))

    # Jagged underside hanging crags (floating island bottom)
    under_crags = [
        ((0, 0, -8.0), (50, 50, 4.0), 10),
        ((12, -10, -11.0), (34, 30, 4.5), 30),
        ((-15, 14, -10.5), (28, 32, 4.0), -20),
        ((0, 0, -14.0), (18, 18, 5.0), 45),
    ]
    for idx, (loc, sz, rz) in enumerate(under_crags):
        create_block(f"Underside_Crag_{idx+1}", loc, sz, mats["Void"], col, rot_deg=(0, 0, rz))

    # 2. DANGEROUS GLOWING TOXIC LAVA FISSURES (Tearing across the terrain)
    # Radiating and branching fracture trenches filled with glowing magma
    fissure_specs = [
        # Center branching out North
        ((0.0, 24.0, 0.1), (2.8, 36.0, 0.5), 0),
        ((-6.0, 38.0, 0.1), (2.2, 24.0, 0.5), -28),
        ((8.0, 40.0, 0.1), (2.2, 22.0, 0.5), 32),
        # Center branching out South
        ((0.0, -24.0, 0.1), (3.0, 34.0, 0.5), 0),
        ((-12.0, -36.0, 0.1), (2.4, 26.0, 0.5), 25),
        ((14.0, -34.0, 0.1), (2.4, 24.0, 0.5), -30),
        # Center branching East & West
        ((26.0, 0.0, 0.1), (38.0, 2.8, 0.5), 0),
        ((38.0, -12.0, 0.1), (24.0, 2.2, 0.5), 20),
        ((-26.0, 0.0, 0.1), (38.0, 2.8, 0.5), 0),
        ((-38.0, 10.0, 0.1), (22.0, 2.2, 0.5), -22),
        # Diagonal chasms
        ((20.0, 20.0, 0.1), (30.0, 2.6, 0.5), 45),
        ((-20.0, -20.0, 0.1), (30.0, 2.6, 0.5), 45),
        ((-20.0, 20.0, 0.1), (30.0, 2.6, 0.5), -45),
        ((20.0, -20.0, 0.1), (30.0, 2.6, 0.5), -45),
    ]
    for idx, (loc, sz, rz) in enumerate(fissure_specs):
        # Glowing magma bed inside fissure
        create_block(f"Toxic_Fissure_Magma_{idx+1}", loc, sz, mats["ToxicLava"], col, rot_deg=(0, 0, rz))
        # Raised dark jagged basalt banks lining the fissure edges
        rad = math.radians(rz)
        perp_x = -math.sin(rad) * (sz[0] * 0.5 + 1.2)
        perp_y = math.cos(rad) * (sz[0] * 0.5 + 1.2)
        create_block(f"Fissure_Bank_L_{idx+1}", (loc[0] + perp_x, loc[1] + perp_y, loc[2] + 0.4), (1.8, sz[1] * 0.85, 0.9), mats["Obsidian"], col, rot_deg=(0, 0, rz))
        create_block(f"Fissure_Bank_R_{idx+1}", (loc[0] - perp_x, loc[1] - perp_y, loc[2] + 0.4), (1.8, sz[1] * 0.85, 0.9), mats["Obsidian"], col, rot_deg=(0, 0, rz))

    # 3. THE DRAGON SPAWN EPICENTER (The "Calamity Caldera")
    # Sunken 28m volcanic crater in the center where the dragon spawns
    print("Building Dragon Spawn Caldera...")
    caldera_rad = 15.0

    # Stepped sunken crater walls
    create_block("Caldera_Rim_Outer", (0.0, 0.0, 0.6), (36.0, 36.0, 1.4), mats["Bedrock"], col)
    create_block("Caldera_Rim_Inner", (0.0, 0.0, 0.2), (30.0, 30.0, 1.8), mats["Obsidian"], col)
    
    # Molten toxic magma lake at the caldera floor
    create_block("Caldera_Magma_Lake", (0.0, 0.0, -0.6), (25.0, 25.0, 0.8), mats["ToxicLava"], col)

    # Floating black obsidian crust plates inside the magma
    crust_coords = [
        (-6.0, -6.0, 5.0, 5.0, 15),
        (7.0, -5.0, 4.5, 6.0, -20),
        (-5.0, 7.0, 5.5, 4.8, 30),
        (6.0, 6.0, 5.0, 5.0, -10),
    ]
    for idx, (cx, cy, sx, sy, rz) in enumerate(crust_coords):
        create_block(f"Magma_Crust_{idx+1}", (cx, cy, -0.3), (sx, sy, 0.45), mats["Obsidian"], col, rot_deg=(0, 0, rz))

    # CENTRAL ELEVATED OBSIDIAN SPAWN CRAG (The Wyrm's Throne)
    # The dragon spawns on this colossal jagged jagged basalt crag rising out of the magma
    create_block("Spawn_Crag_Base", (0.0, 0.0, 1.0), (12.0, 12.0, 2.6), mats["Obsidian"], col)
    create_block("Spawn_Crag_Mid", (0.0, 0.0, 2.5), (9.0, 9.0, 2.0), mats["Obsidian"], col)
    create_block("Spawn_Crag_Perch", (0.0, 0.0, 4.0), (7.0, 7.0, 1.8), mats["Bedrock"], col)

    # Glowing runic fissures etched into the spawn perch
    create_block("Spawn_Rune_X", (0.0, 0.0, 4.95), (6.2, 0.8, 0.15), mats["ToxicLava"], col, rot_deg=(0, 0, 45))
    create_block("Spawn_Rune_Y", (0.0, 0.0, 4.95), (6.2, 0.8, 0.15), mats["ToxicLava"], col, rot_deg=(0, 0, -45))
    create_block("Spawn_Rune_Ring", (0.0, 0.0, 4.92), (3.0, 3.0, 0.15), mats["NeonCrystal"], col)

    # 4. RING OF 12 JAGGED OBSIDIAN FANGS (Ringing the Caldera Rim)
    # Menacing, sharp teeth bursting upward and outward at dangerous angles
    for idx in range(12):
        angle = idx * 30.0
        rad_a = math.radians(angle)
        fx = math.sin(rad_a) * (caldera_rad + 1.5)
        fy = math.cos(rad_a) * (caldera_rad + 1.5)
        fang_h = 7.0 + (idx % 3) * 3.5  # 7m to 14m high
        tilt_deg = 20.0 + (idx % 4) * 5.0
        # Pointing outward away from the center
        fang_tilt_x = math.cos(rad_a) * tilt_deg
        fang_tilt_y = -math.sin(rad_a) * tilt_deg

        # Base block
        create_block(f"Caldera_Fang_Base_{idx+1}", (fx, fy, 2.0), (3.0, 3.0, 3.5), mats["Obsidian"], col, rot_deg=(fang_tilt_x, fang_tilt_y, -angle))
        # Sharp obsidian spike tip
        create_spike(f"Caldera_Fang_Spike_{idx+1}", (fx, fy, 2.0 + fang_h * 0.5), 1.8, fang_h, mats["Obsidian"], col, rot_deg=(fang_tilt_x, fang_tilt_y, -angle))

        # Glowing green crystalline veins on select fangs
        if idx % 2 == 0:
            create_spike(f"Fang_Emerald_Spur_{idx+1}", (fx * 0.95, fy * 0.95, 3.5), 0.45, 3.2, mats["NeonCrystal"], col, rot_deg=(fang_tilt_x * 1.2, fang_tilt_y * 1.2, -angle))

    # 5. DANGEROUS OBSIDIAN SPIRE CLUSTERS ACROSS THE OPEN BATTLEFIELD
    # Scattered naturally to create tactical cover without enclosing or boxing in the sky
    spire_locations = [
        (-32.0, 24.0, 16.0, 35),
        (34.0, 26.0, 14.0, -25),
        (-30.0, -28.0, 18.0, 15),
        (36.0, -22.0, 15.0, -40),
        (0.0, 44.0, 12.0, 10),
        (-42.0, 0.0, 13.0, -15),
        (45.0, 0.0, 14.0, 22),
    ]
    for idx, (sx, sy, sh, rot_z) in enumerate(spire_locations):
        # Column cluster
        create_block(f"Battlefield_Spire_{idx+1}_Base", (sx, sy, sh * 0.4), (4.5, 4.5, sh * 0.8), mats["Obsidian"], col, rot_deg=(4, -6, rot_z))
        create_spike(f"Battlefield_Spire_{idx+1}_Peak", (sx, sy, sh * 0.8 + 2.5), 2.4, 6.0, mats["Obsidian"], col, rot_deg=(4, -6, rot_z))
        # Adjacent shattered basalt column
        create_block(f"Basalt_Pillar_{idx+1}", (sx + 3.2, sy - 2.8, sh * 0.25), (2.8, 2.8, sh * 0.5), mats["Bedrock"], col, rot_deg=(0, 0, rot_z + 30))

    # 6. ANCIENT CRUMBLING RUINED ARCH (Far Perimeter Horizon - 52m away)
    # Colossal ancient gate remnants, shattered and broken, leaving sky wide open
    arch_y = 52.0
    # Left ruined pillar
    create_block("Ruined_Arch_Pillar_L", (-16.0, arch_y, 10.0), (5.0, 5.0, 20.0), mats["Obsidian"], col, rot_deg=(0, 4, 10))
    create_block("Ruined_Arch_Capital_L", (-16.0, arch_y, 21.0), (6.5, 6.5, 2.5), mats["Obsidian"], col)
    # Right ruined pillar (snapped in half)
    create_block("Ruined_Arch_Pillar_R", (16.0, arch_y, 6.0), (5.0, 5.0, 12.0), mats["Obsidian"], col, rot_deg=(0, -6, -15))
    create_block("Ruined_Arch_Fallen_Block", (18.5, arch_y - 2.0, 1.5), (4.5, 4.5, 3.0), mats["Obsidian"], col, rot_deg=(18, 12, 40))
    # Tumbled broken lintel slab leaning diagonally
    create_block("Ruined_Arch_Lintel_Broken", (-8.0, arch_y, 19.5), (14.0, 4.2, 3.2), mats["Obsidian"], col, rot_deg=(0, 28, 5))

    # 7. FLOATING VOID ISLANDS (Drifting around the perimeter abyss)
    void_islands = [
        ((-58.0, 35.0, 6.0), (14.0, 16.0, 6.0), 25),
        ((62.0, 40.0, 10.0), (16.0, 14.0, 7.0), -35),
        ((-54.0, -45.0, -2.0), (15.0, 15.0, 5.5), 45),
        ((58.0, -42.0, 4.0), (18.0, 16.0, 6.5), -15),
        ((0.0, -62.0, -4.0), (20.0, 14.0, 5.0), 10),
    ]
    for idx, (vloc, vsz, vrz) in enumerate(void_islands):
        create_block(f"Void_Island_Top_{idx+1}", vloc, vsz, mats["ArenaFloor"], col, rot_deg=(0, 0, vrz))
        create_block(f"Void_Island_Under_{idx+1}", (vloc[0], vloc[1], vloc[2] - vsz[2] * 0.6), (vsz[0] * 0.7, vsz[1] * 0.7, vsz[2] * 0.8), mats["Void"], col, rot_deg=(0, 0, vrz + 15))

    # 8. TOXIC FISSURE LIGHT SOURCES (Upward Green Magma Glow)
    fissure_light_coords = [
        (0.0, 7.5, 2.0, 1200.0),      # Central caldera front magma
        (0.0, -7.5, 2.0, 1200.0),     # Central caldera rear magma
        (0.0, 22.0, 1.2, 900.0),      # North chasm
        (0.0, -22.0, 1.2, 900.0),     # South chasm
        (22.0, 0.0, 1.2, 900.0),      # East chasm
        (-22.0, 0.0, 1.2, 900.0),     # West chasm
    ]
    for idx, (lx, ly, lz, energy) in enumerate(fissure_light_coords):
        f_light = bpy.data.lights.new(name=f"Light_Fissure_{idx+1}", type='POINT')
        f_light.energy = energy
        f_light.color = (0.15, 1.0, 0.25)
        f_light.shadow_soft_size = 2.5
        l_obj = bpy.data.objects.new(f"Light_Fissure_{idx+1}", f_light)
        l_obj.location = (lx, ly, lz)
        col.objects.link(l_obj)

    print("Dangerous Dragon Spawn Arena geometry built successfully.")

# -------------------------------------------------------------------------
# Build the Three-Headed Emerald Dragon perched on the Spawn Caldera Crag
# -------------------------------------------------------------------------
def build_dragon_on_spawn_crag(mats):
    col = bpy.data.collections.new("02_Three_Headed_Dragon_Boss")
    bpy.context.scene.collection.children.link(col)

    print("Building Three-Headed Emerald Titan on the Caldera Spawn Crag...")

    # The spawn crag perch surface is at Z = 4.9m.
    # Center origin of the dragon body: (0.0, 0.0, 9.4)
    # 1. MAIN CHEST & BODY
    create_block("Dragon_Chest_Core", (0.0, 0.0, 9.4), (4.4, 3.8, 3.6), mats["DarkScales"], col)
    create_block("Dragon_Hips", (0.0, -2.8, 8.8), (3.6, 3.0, 3.0), mats["DarkScales"], col)
    create_block("Dragon_Underbelly", (0.0, -0.2, 7.4), (3.2, 3.4, 0.7), mats["Obsidian"], col)

    # Front Tiered Ventral Chest Armor Plates with Emerald Gems
    chest_plates = [
        (2.0, 10.8, 3.5, 0.5, 0.9, -15),
        (2.1, 9.9, 3.3, 0.5, 0.9, -20),
        (2.0, 9.0, 3.0, 0.5, 0.9, -22),
        (1.8, 8.1, 2.6, 0.5, 0.9, -24),
        (1.5, 7.3, 2.2, 0.5, 0.8, -26),
    ]
    for idx, (py, pz, psx, psy, psz, rx) in enumerate(chest_plates):
        create_block(f"Chest_Plate_{idx+1}", (0.0, py, pz), (psx, psy, psz), mats["EmeraldPlate"], col, rot_deg=(rx, 0, 0))
        create_block(f"Chest_Gem_{idx+1}", (0.0, py + 0.24, pz), (0.35, 0.20, 0.35), mats["NeonCrystal"], col, rot_deg=(rx, 0, 0))
        if idx in (1, 2):
            create_block(f"Chest_Gem_{idx+1}_L", (-1.1, py + 0.20, pz), (0.26, 0.16, 0.26), mats["NeonCrystal"], col, rot_deg=(rx, 0, 0))
            create_block(f"Chest_Gem_{idx+1}_R", (1.1, py + 0.20, pz), (0.26, 0.16, 0.26), mats["NeonCrystal"], col, rot_deg=(rx, 0, 0))

    # Dorsal Back Spines
    for idx, (py, pz, h, rx) in enumerate([
        (0.8, 11.4, 2.2, 8),
        (-0.4, 11.5, 2.3, 4),
        (-1.6, 11.2, 2.0, -4),
        (-2.6, 10.7, 1.7, -10),
    ]):
        create_spike(f"Back_Spike_{idx+1}", (0.0, py, pz), 0.50, h, mats["NeonCrystal"], col, rot_deg=(rx, 0, 0))

    # 2. MASSIVE FRONT LEGS (Grasping the rim of the spawn crag at Z=4.9m)
    for side, sign in [("L", -1.0), ("R", 1.0)]:
        # Upper Shoulder
        create_block(f"Leg_Front_Upper_{side}", (sign * 3.4, 1.2, 8.8), (1.7, 1.8, 2.2), mats["DarkScales"], col, rot_deg=(12, sign * -12, 0))
        create_block(f"Leg_Front_ShoulderPlate_{side}", (sign * 4.3, 1.4, 8.8), (0.42, 1.7, 2.0), mats["EmeraldPlate"], col, rot_deg=(12, sign * -12, 0))
        create_block(f"Leg_Front_ShoulderGem_{side}", (sign * 4.5, 1.4, 8.8), (0.24, 0.38, 0.38), mats["NeonCrystal"], col, rot_deg=(12, sign * -12, 0))

        # Knee Joint & Forward Armor Spur
        create_block(f"Leg_Front_Knee_{side}", (sign * 4.0, 2.5, 7.2), (1.5, 1.6, 1.5), mats["DarkScales"], col)
        create_spike(f"Leg_Front_KneeSpur_{side}", (sign * 4.0, 3.3, 7.2), 0.30, 0.90, mats["NeonCrystal"], col, rot_deg=(85, 0, 0))

        # Lower Shin (Reaching down to crag surface Z=4.9m)
        create_block(f"Leg_Front_Shin_{side}", (sign * 4.4, 3.4, 5.8), (1.5, 1.6, 1.6), mats["DarkScales"], col)

        # Front Paw Foot
        create_block(f"Foot_Front_{side}", (sign * 4.6, 4.3, 5.05), (1.9, 2.3, 0.75), mats["DarkScales"], col)

        # 4 Glowing Emerald Claws Digging into Stone
        for c_idx, ox in enumerate([-0.65, -0.22, 0.22, 0.65]):
            create_spike(f"Claw_Front_{side}_{c_idx+1}", (sign * 4.6 + ox, 5.4, 4.92), 0.20, 0.85, mats["NeonCrystal"], col, rot_deg=(90, 0, 0))

    # 3. REAR LEGS
    for side, sign in [("L", -1.0), ("R", 1.0)]:
        create_block(f"Leg_Rear_Upper_{side}", (sign * 3.0, -2.6, 8.2), (1.6, 1.8, 2.1), mats["DarkScales"], col)
        create_block(f"Leg_Rear_Shin_{side}", (sign * 3.4, -2.8, 6.3), (1.4, 1.5, 1.6), mats["DarkScales"], col)
        create_block(f"Foot_Rear_{side}", (sign * 3.6, -2.4, 5.05), (1.7, 1.9, 0.75), mats["DarkScales"], col)
        for c_idx, ox in enumerate([-0.50, 0.0, 0.50]):
            create_spike(f"Claw_Rear_{side}_{c_idx+1}", (sign * 3.6 + ox, -1.4, 4.92), 0.18, 0.75, mats["NeonCrystal"], col, rot_deg=(90, 0, 0))

    # 4. LONG DRAGON TAIL (Trailing down into the caldera)
    tail_segments = [
        ((0.0, -4.4, 8.4), (1.8, 1.9, 1.7)),
        ((0.0, -6.1, 7.6), (1.6, 1.8, 1.5)),
        ((0.2, -7.7, 6.7), (1.4, 1.6, 1.3)),
        ((0.5, -9.1, 5.7), (1.2, 1.4, 1.1)),
        ((0.9, -10.3, 4.7), (1.0, 1.3, 0.9)),
        ((1.4, -11.3, 3.8), (0.8, 1.1, 0.8)),
        ((1.9, -12.1, 3.0), (0.7, 1.0, 0.7)),
    ]
    for idx, (loc, sz) in enumerate(tail_segments):
        create_block(f"Tail_Segment_{idx+1}", loc, sz, mats["DarkScales"], col)
        # Tail spine
        create_spike(f"Tail_Spine_{idx+1}", (loc[0], loc[1], loc[2] + sz[2]*0.5 + 0.4), 0.24, 0.85, mats["NeonCrystal"], col, rot_deg=(-15, 0, 0))

    # 5. THREE ROARING DRAGON HEADS & WIDE TRIDENT NECKS
    # CENTER NECK & ROARING HEAD
    center_neck_blocks = [
        ((0.0, 1.6, 11.2), (2.0, 2.0, 1.8), (14, 0, 0)),
        ((0.0, 2.3, 12.8), (1.8, 1.9, 1.8), (18, 0, 0)),
        ((0.0, 3.1, 14.4), (1.7, 1.8, 1.8), (22, 0, 0)),
        ((0.0, 4.0, 16.0), (1.6, 1.7, 1.8), (26, 0, 0)),
        ((0.0, 5.0, 17.5), (1.5, 1.6, 1.8), (28, 0, 0)),
    ]
    for idx, (loc, sz, rot) in enumerate(center_neck_blocks):
        create_block(f"Neck_C_Seg_{idx+1}", loc, sz, mats["DarkScales"], col, rot_deg=rot)
        create_spike(f"Neck_C_Spine_{idx+1}", (loc[0], loc[1] - 0.9, loc[2] + 0.6), 0.32, 1.4, mats["NeonCrystal"], col, rot_deg=(rot[0] - 25, 0, 0))

    # Center Head (Enlarged, Roaring at the sky)
    ch_loc = (0.0, 6.2, 18.8)
    create_block("Head_C_Skull", ch_loc, (2.6, 2.4, 2.2), mats["DarkScales"], col, rot_deg=(28, 0, 0))
    create_block("Head_C_Snout", (0.0, 7.8, 19.6), (2.1, 1.8, 1.6), mats["DarkScales"], col, rot_deg=(26, 0, 0))
    # Wide open cavernous lower jaw
    create_block("Head_C_Jaw", (0.0, 7.2, 18.0), (1.9, 1.9, 0.7), mats["DarkScales"], col, rot_deg=(5, 0, 0))

    # Sharp Ivory Teeth
    teeth_c = [
        (-0.85, 8.4, 19.8, 0.12, 0.45, -1),
        (-0.30, 8.5, 19.9, 0.12, 0.45, -1),
        (0.30, 8.5, 19.9, 0.12, 0.45, -1),
        (0.85, 8.4, 19.8, 0.12, 0.45, -1),
        (-0.75, 7.9, 18.4, 0.12, 0.45, 1),
        (0.75, 7.9, 18.4, 0.12, 0.45, 1),
    ]
    for t_idx, (tx, ty, tz, tr, th, tdir) in enumerate(teeth_c):
        rot_x = 26 if tdir == -1 else -20
        create_spike(f"Tooth_C_{t_idx+1}", (tx, ty, tz), tr, th, mats["IvoryTeeth"], col, rot_deg=(rot_x, 0, 0))

    # Glowing Green Fire Breath inside Center Mouth
    create_block("Head_C_Fire_Core", (0.0, 7.1, 18.9), (1.2, 1.3, 0.9), mats["NeonCrystal"], col, rot_deg=(26, 0, 0))
    # Mouth Light
    mouth_light = bpy.data.lights.new(name="Light_Mouth_C", type='POINT')
    mouth_light.energy = 950.0
    mouth_light.color = (0.2, 1.0, 0.3)
    ml_obj = bpy.data.objects.new("Light_Mouth_C", mouth_light)
    ml_obj.location = (0.0, 7.5, 19.1)
    col.objects.link(ml_obj)

    # Eyes & Horns Center Head
    create_block("Head_C_Eye_L", (-1.35, 6.7, 19.5), (0.24, 0.45, 0.40), mats["NeonCrystal"], col, rot_deg=(28, 0, 0))
    create_block("Head_C_Eye_R", (1.35, 6.7, 19.5), (0.24, 0.45, 0.40), mats["NeonCrystal"], col, rot_deg=(28, 0, 0))
    # Segmented sweeping horns
    for side, sign in [("L", -1.0), ("R", 1.0)]:
        create_spike(f"Horn_C_{side}_Main", (sign * 1.1, 5.2, 20.6), 0.50, 3.4, mats["NeonCrystal"], col, rot_deg=(-22, sign * 18, 0))
        create_spike(f"Horn_C_{side}_Spur", (sign * 1.3, 5.6, 19.8), 0.30, 1.8, mats["NeonCrystal"], col, rot_deg=(-10, sign * 35, 0))

    # LEFT & RIGHT SPLAYED NECKS AND HEADS
    for side, sign, yaw in [("L", -1.0, 35), ("R", 1.0, -35)]:
        flank_neck = [
            ((sign * 1.5, 1.2, 10.8), (1.9, 1.8, 1.7), (12, sign * -16, -yaw * 0.4)),
            ((sign * 2.8, 1.9, 12.1), (1.8, 1.7, 1.7), (15, sign * -22, -yaw * 0.6)),
            ((sign * 4.2, 2.7, 13.5), (1.7, 1.7, 1.7), (18, sign * -26, -yaw * 0.8)),
            ((sign * 5.5, 3.6, 14.8), (1.6, 1.6, 1.7), (20, sign * -28, -yaw)),
            ((sign * 6.6, 4.6, 15.9), (1.5, 1.5, 1.6), (22, sign * -28, -yaw)),
        ]
        for idx, (loc, sz, rot) in enumerate(flank_neck):
            create_block(f"Neck_{side}_Seg_{idx+1}", loc, sz, mats["DarkScales"], col, rot_deg=rot)
            create_spike(f"Neck_{side}_Spine_{idx+1}", (loc[0], loc[1] - 0.7, loc[2] + 0.6), 0.30, 1.3, mats["NeonCrystal"], col, rot_deg=(rot[0] - 20, rot[1], rot[2]))

        # Flank Head
        fh_loc = (sign * 7.6, 5.6, 16.8)
        create_block(f"Head_{side}_Skull", fh_loc, (2.4, 2.2, 2.0), mats["DarkScales"], col, rot_deg=(20, sign * -25, -yaw))
        create_block(f"Head_{side}_Snout", (sign * 8.7, 6.7, 17.2), (1.9, 1.7, 1.5), mats["DarkScales"], col, rot_deg=(18, sign * -25, -yaw))
        create_block(f"Head_{side}_Jaw", (sign * 8.2, 6.2, 15.8), (1.8, 1.8, 0.6), mats["DarkScales"], col, rot_deg=(0, sign * -25, -yaw))

        # Flank Teeth
        create_spike(f"Tooth_{side}_1", (sign * 9.2, 7.2, 17.3), 0.12, 0.40, mats["IvoryTeeth"], col, rot_deg=(20, sign * -25, -yaw))
        create_spike(f"Tooth_{side}_2", (sign * 8.4, 7.3, 17.4), 0.12, 0.40, mats["IvoryTeeth"], col, rot_deg=(20, sign * -25, -yaw))
        create_spike(f"Tooth_{side}_3", (sign * 8.8, 6.7, 16.2), 0.12, 0.40, mats["IvoryTeeth"], col, rot_deg=(-15, sign * -25, -yaw))

        # Fire Core in Mouth
        create_block(f"Head_{side}_Fire_Core", (sign * 8.3, 6.3, 16.6), (1.1, 1.2, 0.8), mats["NeonCrystal"], col, rot_deg=(18, sign * -25, -yaw))
        
        # Mouth Light
        f_mouth_light = bpy.data.lights.new(name=f"Light_Mouth_{side}", type='POINT')
        f_mouth_light.energy = 750.0
        f_mouth_light.color = (0.2, 1.0, 0.3)
        fml_obj = bpy.data.objects.new(f"Light_Mouth_{side}", f_mouth_light)
        fml_obj.location = (sign * 8.5, 6.6, 16.8)
        col.objects.link(fml_obj)

        # Flank Eyes & Horns
        create_block(f"Head_{side}_Eye_Out", (sign * (7.6 + 1.25), 6.0, 17.3), (0.22, 0.40, 0.35), mats["NeonCrystal"], col, rot_deg=(20, sign * -25, -yaw))
        create_block(f"Head_{side}_Eye_In", (sign * (7.6 - 1.25), 6.0, 17.3), (0.22, 0.40, 0.35), mats["NeonCrystal"], col, rot_deg=(20, sign * -25, -yaw))
        create_spike(f"Horn_{side}_Main", (sign * 7.1, 4.6, 18.4), 0.46, 3.2, mats["NeonCrystal"], col, rot_deg=(-24, sign * 30, -yaw))
        create_spike(f"Horn_{side}_Spur", (sign * 7.3, 4.9, 17.7), 0.28, 1.6, mats["NeonCrystal"], col, rot_deg=(-12, sign * 45, -yaw))

    # 6. COLOSSAL HIGH-ARCHED WINGS (Spread wide across the open sky)
    for side, sign in [("L", -1.0), ("R", 1.0)]:
        # Primary Shoulder Spar
        create_block(f"Wing_{side}_Spar_1", (sign * 4.2, -0.6, 11.2), (4.5, 1.2, 1.2), mats["WingSpar"], col, rot_deg=(12, sign * -28, sign * 14))
        # Elbow Joint
        create_block(f"Wing_{side}_Elbow", (sign * 7.2, -1.2, 13.0), (1.8, 1.8, 1.8), mats["DarkScales"], col, rot_deg=(12, sign * -28, sign * 14))
        create_spike(f"Wing_{side}_Elbow_Spur", (sign * 7.4, -1.2, 14.2), 0.40, 1.6, mats["NeonCrystal"], col, rot_deg=(-35, sign * 20, 0))

        # Upper Outer Spar (Towering up to Z = 19.5m)
        create_block(f"Wing_{side}_Spar_2", (sign * 11.0, -1.8, 16.5), (7.5, 1.0, 1.0), mats["WingSpar"], col, rot_deg=(14, sign * -42, sign * 20))
        # Wing Tip Talon
        create_spike(f"Wing_{side}_Talon", (sign * 14.5, -2.4, 19.2), 0.35, 2.2, mats["NeonCrystal"], col, rot_deg=(-10, sign * 45, 0))

        # Layered Jagged Voxel Membrane Slabs
        membranes = [
            ((sign * 6.5, -3.2, 11.4), (5.5, 3.8, 0.22), (18, sign * -25, sign * 10)),
            ((sign * 10.5, -4.2, 13.8), (6.5, 4.5, 0.22), (20, sign * -35, sign * 15)),
            ((sign * 13.5, -4.8, 16.0), (5.0, 4.0, 0.22), (22, sign * -40, sign * 18)),
        ]
        for m_idx, (mloc, msz, mrot) in enumerate(membranes):
            create_block(f"Wing_{side}_Membrane_{m_idx+1}", mloc, msz, mats["WingMembrane"], col, rot_deg=mrot)
            # Emerald membrane rib accent
            create_block(f"Wing_{side}_Rib_{m_idx+1}", mloc, (msz[0], 0.45, 0.35), mats["EmeraldPlate"], col, rot_deg=mrot)

    print("Three-Headed Emerald Titan built successfully on spawn crag.")

# -------------------------------------------------------------------------
# Cinematic Camera & Dramatic Atmosphere
# -------------------------------------------------------------------------
def setup_camera_and_lighting(mats):
    col = bpy.data.collections.new("03_Camera_Lighting")
    bpy.context.scene.collection.children.link(col)

    # 1. Wide Cinematic Vista Camera with Track-To Constraint
    cam_target = bpy.data.objects.new("Cam_Target", None)
    cam_target.location = (0.0, 3.5, 7.0)
    col.objects.link(cam_target)

    cam_data = bpy.data.cameras.new("Hero_Camera")
    cam_data.lens = 20  # Ultra-wide angle to capture the full 110m arena, fangs, and open sky
    cam_data.clip_start = 0.5
    cam_data.clip_end = 500.0

    cam_obj = bpy.data.objects.new("Hero_Camera", cam_data)
    # Position: Elevated 3/4 front vantage point looking back at the dragon and caldera
    cam_obj.location = (26.0, 54.0, 17.5)
    col.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj

    # Track-To constraint pointing directly at the dragon and spawn caldera
    tt = cam_obj.constraints.new(type='TRACK_TO')
    tt.target = cam_target
    tt.track_axis = 'TRACK_NEGATIVE_Z'
    tt.up_axis = 'UP_Y'

    # 2. Square Minecraft Moon positioned behind dragon for dramatic silhouette
    moon_obj = create_block("Square_Moon", (-35.0, -85.0, 50.0), (16.0, 1.4, 16.0), mats["Moon"], col, rot_deg=(30, 25, 0))

    # 3. Main Moonlight Directional Key Light (Shining from behind/above dragon)
    sun_data = bpy.data.lights.new(name="Sun_Moonlight", type='SUN')
    sun_data.energy = 4.8
    sun_data.color = (0.80, 0.90, 1.0)
    sun_data.angle = math.radians(1.2)
    sun_obj = bpy.data.objects.new("Sun_Moonlight", sun_data)
    sun_obj.rotation_euler = (math.radians(-42.0), math.radians(-18.0), math.radians(25.0))
    col.objects.link(sun_obj)

    # 4. Fill Sky Light (Atmospheric Deep Emerald)
    fill_data = bpy.data.lights.new(name="Sky_Fill", type='SUN')
    fill_data.energy = 1.0
    fill_data.color = (0.08, 0.35, 0.16)
    fill_obj = bpy.data.objects.new("Sky_Fill", fill_data)
    fill_obj.rotation_euler = (math.radians(50.0), 0.0, math.radians(-45.0))
    col.objects.link(fill_obj)

    # 5. Floating Green Ember Particles Rising from the Fissures
    random.seed(42)
    for p_idx in range(60):
        px = random.uniform(-25.0, 25.0)
        py = random.uniform(-25.0, 25.0)
        pz = random.uniform(1.0, 18.0)
        psz = random.uniform(0.18, 0.45)
        create_block(f"Ember_{p_idx+1}", (px, py, pz), (psz, psz, psz), mats["NeonCrystal"], col, rot_deg=(random.uniform(0, 45), random.uniform(0, 45), random.uniform(0, 45)))

    # 6. World Background (Dark void)
    world = bpy.context.scene.world
    if not world:
        world = bpy.data.worlds.new("World_Void")
        bpy.context.scene.world = world
    world.use_nodes = True
    bg_node = world.node_tree.nodes.get("Background")
    if bg_node:
        bg_node.inputs["Color"].default_value = (0.003, 0.006, 0.004, 1.0)
        bg_node.inputs["Strength"].default_value = 0.4

    print("Camera and atmospheric lighting configured.")

# -------------------------------------------------------------------------
# Render Settings (Cycles GPU / AgX High Contrast)
# -------------------------------------------------------------------------
def setup_render_engine():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 48
    scene.cycles.preview_samples = 24
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = 'OPENIMAGEDENOISE'

    # 1920x1080 Cinematic Full HD
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.filepath = ARENA_RENDER
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'

    # Color Management (AgX High Contrast)
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - High Contrast'
    scene.view_settings.exposure = 0.15

# -------------------------------------------------------------------------
# Main Execution
# -------------------------------------------------------------------------
def main():
    print("=== STARTING DANGEROUS DRAGON SPAWN ARENA GENERATION ===")
    clear_all()
    mats = create_materials()
    build_dangerous_arena(mats)
    build_dragon_on_spawn_crag(mats)
    setup_camera_and_lighting(mats)
    setup_render_engine()

    # Save Blend File
    print(f"Saving .blend scene to: {ARENA_BLEND}")
    bpy.ops.wm.save_as_mainfile(filepath=ARENA_BLEND)

    # Render Showcase
    print(f"Rendering showcase image to: {ARENA_RENDER} ...")
    bpy.ops.render.render(write_still=True)
    print(f"Render completed successfully: {ARENA_RENDER}")

    # Export glTF / GLB for Game Engine
    print(f"Exporting glTF/GLB to: {ARENA_GLB}")
    try:
        bpy.ops.export_scene.gltf(
            filepath=ARENA_GLB,
            export_format='GLB',
            use_selection=False,
            export_apply=True,
            export_materials='EXPORT',
            export_yup=True
        )
        print("glTF export complete.")
    except Exception as e:
        print(f"glTF export note: {e}")
    print("=== DANGEROUS DRAGON SPAWN ARENA GENERATION COMPLETE ===")

if __name__ == "__main__":
    main()
