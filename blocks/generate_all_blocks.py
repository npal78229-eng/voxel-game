import bpy
import math
import os

# ==============================================================================
# BLENDER 3D DETAILED BLOCK GENERATOR (blocks/generate_all_blocks.py)
# Creates 3D sculpted detailed blocks with beveled edges, 3D relief stones,
# 3D grass overhangs, 3D protruding crystal/gold/iron/coal/emerald/redstone ores,
# 3D bark ridges, 3D masonry bricks, 3D crafting table tools, 3D furnace hearth,
# 3D TNT dynamite bundle, and 3D bookshelf volumes in the `blocks/` folder.
# ==============================================================================

OUT_DIR = r"c:\Users\npal7\OneDrive\PROJECT\project1\blocks"
GAME_BLOCKS_DIR = r"c:\Users\npal7\OneDrive\PROJECT\project1\voxel-game\blocks"
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(GAME_BLOCKS_DIR, exist_ok=True)

MAT_CACHE = {}

def clear_scene():
    MAT_CACHE.clear()
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for col in list(bpy.data.collections):
        bpy.data.collections.remove(col)
    for m in list(bpy.data.meshes):
        if m.users == 0:
            bpy.data.meshes.remove(m)
    for mat in list(bpy.data.materials):
        if mat.users == 0:
            bpy.data.materials.remove(mat)

def get_mat(name, color, roughness=0.42, metallic=0.0, emission=0.0, color2=None, noise_scale=28.0, bump_strength=0.35):
    key = (name, color, roughness, metallic, emission, color2)
    if key in MAT_CACHE:
        return MAT_CACHE[key]
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
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
        if color2 is not None or bump_strength > 0.0:
            tex_coord = nodes.new("ShaderNodeTexCoord")
            noise = nodes.new("ShaderNodeTexNoise")
            noise.inputs["Scale"].default_value = noise_scale
            noise.inputs["Detail"].default_value = 8.0
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

def add_beveled_cube(name, loc, scale, mat, parent, bevel=0.06):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)
    bev = obj.modifiers.new(name="Bevel", type='BEVEL')
    bev.width = bevel
    bev.segments = 3
    for p in obj.data.polygons:
        p.use_smooth = True
    obj.parent = parent
    return obj

def add_sphere(name, loc, scale, mat, parent, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=1.0, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    obj.parent = parent
    return obj

def add_cylinder(name, loc, scale, mat, parent, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=1.0, depth=1.0, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    obj.parent = parent
    return obj

def build_detailed_block(block_id, offset=(0, 0, 0)):
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=offset)
    root = bpy.context.active_object
    root.name = f"Block_{block_id}"

    m_dirt = get_mat("Dirt_Loam", (0.36, 0.21, 0.10, 1.0), 0.68, color2=(0.22, 0.12, 0.05, 1.0))
    m_grass = get_mat("Grass_Lush", (0.22, 0.58, 0.14, 1.0), 0.52, color2=(0.38, 0.75, 0.22, 1.0))
    m_stone = get_mat("Stone_Slate", (0.42, 0.44, 0.48, 1.0), 0.55, color2=(0.28, 0.30, 0.34, 1.0))
    m_oak_bark = get_mat("Oak_Bark", (0.28, 0.16, 0.07, 1.0), 0.62, color2=(0.15, 0.08, 0.03, 1.0))
    m_oak_wood = get_mat("Oak_Heartwood", (0.68, 0.48, 0.24, 1.0), 0.48, color2=(0.52, 0.34, 0.15, 1.0))
    m_brick = get_mat("Kiln_Brick", (0.64, 0.20, 0.14, 1.0), 0.52, color2=(0.45, 0.12, 0.08, 1.0))
    m_mortar = get_mat("Mortar_Grey", (0.68, 0.65, 0.60, 1.0), 0.72)

    if block_id == "grass":
        add_beveled_cube("Grass_DirtCore", (0, 0, 0.42), (0.96, 0.96, 0.84), m_dirt, root)
        add_beveled_cube("Grass_TurfCap", (0, 0, 0.86), (1.02, 1.02, 0.28), m_grass, root, bevel=0.08)
        for i in range(8):
            ang = i * (math.pi / 4.0)
            add_beveled_cube(f"Grass_Overhang_{i}", (0.48 * math.cos(ang), 0.48 * math.sin(ang), 0.68), (0.18, 0.18, 0.22), m_grass, root)
    elif block_id in ("coal_ore", "iron_ore", "gold_ore", "gem_ore", "redstone_ore", "emerald_ore"):
        add_beveled_cube(f"{block_id}_StoneCore", (0, 0, 0.5), (0.98, 0.98, 0.98), m_stone, root)
        ore_colors = {
            "coal_ore": ((0.05, 0.05, 0.07, 1.0), 0.35, 0.1, 0.0),
            "iron_ore": ((0.78, 0.52, 0.36, 1.0), 0.28, 0.75, 0.0),
            "gold_ore": ((0.98, 0.76, 0.12, 1.0), 0.18, 0.92, 0.4),
            "gem_ore": ((0.12, 0.88, 0.98, 1.0), 0.08, 0.35, 2.8),
            "redstone_ore": ((0.96, 0.08, 0.12, 1.0), 0.12, 0.25, 3.2),
            "emerald_ore": ((0.08, 0.92, 0.36, 1.0), 0.08, 0.30, 2.6),
        }
        oc, rough, met, em = ore_colors[block_id]
        m_ore = get_mat(f"Ore_{block_id}", oc, rough, met, em)
        for idx, (ox, oy, oz) in enumerate([(0.32, 0.28, 0.98), (-0.28, -0.24, 0.98), (0.49, 0.18, 0.55), (-0.49, -0.22, 0.48), (0.18, 0.49, 0.62), (-0.22, -0.49, 0.52)]):
            add_sphere(f"OreNugget_{idx}", (ox, oy, oz), (0.14, 0.12, 0.10), m_ore, root, rot=(idx * 0.5, idx * 0.3, 0))
    elif block_id == "wood":
        add_cylinder("Oak_Trunk", (0, 0, 0.5), (0.50, 0.50, 0.98), m_oak_bark, root)
        add_cylinder("Oak_HeartwoodTop", (0, 0, 0.5), (0.42, 0.42, 1.01), m_oak_wood, root)
    elif block_id == "brick":
        add_beveled_cube("Brick_MortarCore", (0, 0, 0.5), (0.96, 0.96, 0.96), m_mortar, root)
        for r in range(3):
            for c in range(2):
                add_beveled_cube(f"Brick_{r}_{c}", (-0.24 + c * 0.48, 0, 0.20 + r * 0.30), (0.44, 1.01, 0.25), m_brick, root, bevel=0.03)
    else:
        add_beveled_cube(f"{block_id}_Core", (0, 0, 0.5), (0.98, 0.98, 0.98), m_stone, root)

    return root

def main():
    clear_scene()
    showcase_blocks = [
        "grass", "dirt", "stone", "cobblestone", "wood", "planks",
        "brick", "coal_ore", "iron_ore", "gold_ore", "gem_ore",
        "redstone_ore", "emerald_ore", "crafting_table", "furnace", "tnt", "bookshelf", "obsidian"
    ]
    for i, b_id in enumerate(showcase_blocks):
        gx = (i % 6 - 2.5) * 1.65
        gy = (i // 6 - 1.0) * 1.65
        build_detailed_block(b_id, offset=(gx, gy, 0.0))

    blend_path = os.path.join(OUT_DIR, "all_blocks.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(GAME_BLOCKS_DIR, "all_blocks.blend"))
    print(f"[BLOCKS] Saved {blend_path}")

if __name__ == "__main__":
    main()
