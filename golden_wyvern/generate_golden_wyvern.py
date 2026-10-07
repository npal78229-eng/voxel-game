import bpy
import math
import os

OUTPUT_DIR = r"c:\Users\npal7\OneDrive\PROJECT\project1\golden_wyvern"
os.makedirs(OUTPUT_DIR, exist_ok=True)
BLEND_PATH = os.path.join(OUTPUT_DIR, "golden_wyvern.blend")
GLB_PATH = os.path.join(OUTPUT_DIR, "golden_wyvern.glb")
RENDER_PATH = os.path.join(OUTPUT_DIR, "golden_wyvern_render.png")

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
    for block in list(bpy.data.armatures):
        bpy.data.armatures.remove(block)
    for block in list(bpy.data.materials):
        bpy.data.materials.remove(block)
    for block in list(bpy.data.cameras):
        bpy.data.cameras.remove(block)
    for block in list(bpy.data.lights):
        bpy.data.lights.remove(block)

# -------------------------------------------------------------------------
# Materials Creation (Golden Sunset Wyvern Palette)
# -------------------------------------------------------------------------
def create_materials():
    mats = {}

    # 1. Main Obsidian / Charcoal Scales (Dark silhouette from reel)
    m = bpy.data.materials.new("Mat_Wyvern_Obsidian")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.07, 0.08, 0.10, 1.0)
    b.inputs["Roughness"].default_value = 0.52
    b.inputs["Metallic"].default_value = 0.25
    mats["Obsidian"] = m

    # 2. Bronze / Sunset Gold Edge Accent (Catching golden hour rim light)
    m = bpy.data.materials.new("Mat_Wyvern_BronzeAccent")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.75, 0.48, 0.15, 1.0)
    b.inputs["Roughness"].default_value = 0.38
    b.inputs["Metallic"].default_value = 0.45
    mats["BronzeAccent"] = m

    # 3. Underbelly Dorsal Plates (Warm dark chestnut)
    m = bpy.data.materials.new("Mat_Wyvern_Underbelly")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.16, 0.12, 0.10, 1.0)
    b.inputs["Roughness"].default_value = 0.60
    mats["Underbelly"] = m

    # 4. Horns & Spinal Spikes (Aged dark bone with bronze tips)
    m = bpy.data.materials.new("Mat_Wyvern_Horns")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.04, 0.04, 0.05, 1.0)
    b.inputs["Roughness"].default_value = 0.35
    mats["Horns"] = m

    # 5. Glowing Amber/Fiery Eyes
    m = bpy.data.materials.new("Mat_Wyvern_EyeGlow")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (1.0, 0.55, 0.05, 1.0)
    b.inputs["Roughness"].default_value = 0.1
    if "Emission Color" in b.inputs:
        b.inputs["Emission Color"].default_value = (1.0, 0.55, 0.05, 1.0)
        b.inputs["Emission Strength"].default_value = 6.5
    elif "Emission" in b.inputs:
        b.inputs["Emission"].default_value = (1.0, 0.55, 0.05, 1.0)
    mats["EyeGlow"] = m

    # 6. Wing Membrane (Translucent dark leathery membrane with warm subsurface)
    m = bpy.data.materials.new("Mat_Wyvern_WingMembrane")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.12, 0.09, 0.08, 1.0)
    b.inputs["Roughness"].default_value = 0.65
    mats["WingMembrane"] = m

    # 7. Saddle & Harness (Worn leather with brass buckles)
    m = bpy.data.materials.new("Mat_Wyvern_Saddle")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.35, 0.18, 0.08, 1.0)
    b.inputs["Roughness"].default_value = 0.45
    mats["Saddle"] = m

    m = bpy.data.materials.new("Mat_Wyvern_Brass")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.85, 0.65, 0.20, 1.0)
    b.inputs["Roughness"].default_value = 0.25
    b.inputs["Metallic"].default_value = 0.85
    mats["Brass"] = m

    return mats

def create_block(name, loc, size, mat, parent=None, rot_deg=(0,0,0)):
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
    if parent:
        obj.parent = parent
    return obj

# -------------------------------------------------------------------------
# Build the Golden Sunset Soaring Wyvern Mount
# -------------------------------------------------------------------------
def build_golden_wyvern(mats):
    root = bpy.data.objects.new("Golden_Wyvern_Mount", None)
    bpy.context.scene.collection.objects.link(root)

    # 1. Torso & Abdomen
    torso = create_block("Torso_Main", (0, 0, 0), (1.4, 2.6, 1.2), mats["Obsidian"], parent=root)
    create_block("Torso_Belly", (0, 0.1, -0.45), (1.1, 2.4, 0.4), mats["Underbelly"], parent=torso)
    create_block("Torso_Spine_Plates", (0, 0, 0.65), (0.4, 2.3, 0.35), mats["BronzeAccent"], parent=torso)

    # Spine Spikes
    for y_off in [-0.8, -0.3, 0.2, 0.7]:
        create_block(f"Spine_Spike_{y_off}", (0, y_off, 0.95), (0.15, 0.3, 0.5), mats["Horns"], parent=torso, rot_deg=(-15, 0, 0))

    # 2. Rider Saddle & Harness (Matching the saddle icon in the bottom-left HUD)
    saddle = create_block("Rider_Saddle", (0, 0.2, 0.72), (0.9, 0.9, 0.25), mats["Saddle"], parent=torso)
    create_block("Saddle_Cantle", (0, -0.22, 0.92), (0.8, 0.2, 0.35), mats["Saddle"], parent=saddle)
    create_block("Saddle_Pommel", (0, 0.55, 0.90), (0.6, 0.18, 0.30), mats["Saddle"], parent=saddle)
    create_block("Saddle_Girth_Strap", (0, 0.2, 0.0), (1.45, 0.25, 1.25), mats["Saddle"], parent=torso)
    create_block("Buckle_L", (-0.73, 0.2, 0.1), (0.1, 0.15, 0.2), mats["Brass"], parent=torso)
    create_block("Buckle_R", (0.73, 0.2, 0.1), (0.1, 0.15, 0.2), mats["Brass"], parent=torso)

    # 3. Neck & Horned Draconic Head
    neck1 = create_block("Neck_Base", (0, 1.6, 0.3), (1.0, 1.2, 0.9), mats["Obsidian"], parent=torso, rot_deg=(20, 0, 0))
    neck2 = create_block("Neck_Mid", (0, 2.4, 0.75), (0.8, 1.1, 0.8), mats["Obsidian"], parent=neck1, rot_deg=(15, 0, 0))
    head = create_block("Wyvern_Head", (0, 3.2, 1.2), (0.9, 1.4, 0.75), mats["Obsidian"], parent=neck2)
    create_block("Snout", (0, 4.1, 1.05), (0.65, 1.0, 0.55), mats["Obsidian"], parent=head)
    create_block("Lower_Jaw", (0, 3.9, 0.72), (0.6, 0.9, 0.28), mats["Underbelly"], parent=head)

    # Glowing Amber Eyes
    create_block("Eye_L", (-0.48, 3.45, 1.3), (0.12, 0.3, 0.2), mats["EyeGlow"], parent=head)
    create_block("Eye_R", (0.48, 3.45, 1.3), (0.12, 0.3, 0.2), mats["EyeGlow"], parent=head)

    # Majestic Crown Horns (Pointing back & outward)
    create_block("Horn_Main_L", (-0.45, 2.7, 1.6), (0.2, 1.1, 0.2), mats["Horns"], parent=head, rot_deg=(-35, -20, 0))
    create_block("Horn_Main_R", (0.45, 2.7, 1.6), (0.2, 1.1, 0.2), mats["Horns"], parent=head, rot_deg=(-35, 20, 0))
    create_block("Horn_Sub_L", (-0.35, 2.8, 1.35), (0.14, 0.6, 0.14), mats["Horns"], parent=head, rot_deg=(-25, -35, 0))
    create_block("Horn_Sub_R", (0.35, 2.8, 1.35), (0.14, 0.6, 0.14), mats["Horns"], parent=head, rot_deg=(-25, 35, 0))

    # 4. Sinuous Articulated Tail with Rudders
    tail1 = create_block("Tail_1", (0, -1.6, -0.1), (0.9, 1.3, 0.8), mats["Obsidian"], parent=torso, rot_deg=(-8, 0, 0))
    tail2 = create_block("Tail_2", (0, -2.7, -0.3), (0.75, 1.4, 0.65), mats["Obsidian"], parent=tail1, rot_deg=(-6, 0, 0))
    tail3 = create_block("Tail_3", (0, -3.9, -0.45), (0.55, 1.5, 0.5), mats["Obsidian"], parent=tail2, rot_deg=(-4, 0, 0))
    tail4 = create_block("Tail_Tip", (0, -5.1, -0.55), (0.35, 1.4, 0.35), mats["Obsidian"], parent=tail3)

    # Tail Fin / Stabilizer (Horizontal and vertical flukes for flight rudder)
    create_block("Tail_Fin_H", (0, -5.5, -0.55), (1.6, 0.9, 0.08), mats["BronzeAccent"], parent=tail4)
    create_block("Tail_Fin_V", (0, -5.4, -0.3), (0.08, 0.8, 0.8), mats["BronzeAccent"], parent=tail4)

    # 5. Articulated Soaring Wings (Left & Right)
    for side, s_mult, s_name in [(-1, -1, "L"), (1, 1, "R")]:
        shoulder = bpy.data.objects.new(f"Wing_Root_{s_name}", None)
        shoulder.location = (s_mult * 0.7, 0.4, 0.3)
        shoulder.parent = torso
        bpy.context.scene.collection.objects.link(shoulder)

        # Upper Wing Bone (Humerus)
        humerus = create_block(f"Wing_Humerus_{s_name}", (s_mult * 1.5, 0.2, 0.2), (2.0, 0.45, 0.4), mats["Obsidian"], parent=shoulder, rot_deg=(0, s_mult * -12, s_mult * 15))
        
        # Wing Elbow / Joint
        elbow = bpy.data.objects.new(f"Wing_Elbow_{s_name}", None)
        elbow.location = (s_mult * 2.5, 0.3, 0.3)
        elbow.parent = shoulder
        bpy.context.scene.collection.objects.link(elbow)

        # Forearm Bone (Radius)
        radius = create_block(f"Wing_Radius_{s_name}", (s_mult * 3.8, 0.1, 0.1), (2.8, 0.35, 0.35), mats["Obsidian"], parent=elbow, rot_deg=(0, s_mult * 8, s_mult * -10))

        # Sharp Wing Claws at Carpal Joint
        create_block(f"Wing_ThumbClaw_{s_name}", (s_mult * 2.6, 0.8, 0.3), (0.2, 0.5, 0.2), mats["Horns"], parent=elbow, rot_deg=(-20, 0, s_mult * 30))

        # Elongated Wing Fingers (Skeletal structure)
        f1 = create_block(f"Wing_Finger_1_{s_name}", (s_mult * 4.8, -0.5, -0.1), (2.2, 0.18, 0.18), mats["BronzeAccent"], parent=radius, rot_deg=(-10, s_mult * 15, s_mult * -25))
        f2 = create_block(f"Wing_Finger_2_{s_name}", (s_mult * 4.2, -1.2, -0.3), (2.0, 0.16, 0.16), mats["BronzeAccent"], parent=radius, rot_deg=(-20, s_mult * 20, s_mult * -35))
        f3 = create_block(f"Wing_Finger_3_{s_name}", (s_mult * 3.4, -1.8, -0.4), (1.8, 0.14, 0.14), mats["BronzeAccent"], parent=radius, rot_deg=(-30, s_mult * 25, s_mult * -45))

        # Broad Aerodynamic Wing Membranes (Main lifting surface)
        m1 = create_block(f"Membrane_Inner_{s_name}", (s_mult * 2.0, -0.6, 0.0), (2.4, 1.8, 0.06), mats["WingMembrane"], parent=shoulder, rot_deg=(-8, s_mult * -5, s_mult * 10))
        m2 = create_block(f"Membrane_Outer_{s_name}", (s_mult * 4.2, -0.9, -0.2), (2.6, 2.2, 0.06), mats["WingMembrane"], parent=radius, rot_deg=(-12, s_mult * 8, s_mult * -15))

    # 6. Rear Talon Legs (Folded back during soaring flight)
    for side, s_mult, s_name in [(-1, -1, "L"), (1, 1, "R")]:
        thigh = create_block(f"Leg_Thigh_{s_name}", (s_mult * 0.7, -0.8, -0.3), (0.45, 0.8, 0.45), mats["Obsidian"], parent=torso, rot_deg=(35, 0, s_mult * 10))
        shin = create_block(f"Leg_Shin_{s_name}", (s_mult * 0.8, -1.4, -0.6), (0.35, 0.9, 0.35), mats["Obsidian"], parent=thigh, rot_deg=(-45, 0, 0))
        foot = create_block(f"Leg_Foot_{s_name}", (s_mult * 0.8, -1.8, -0.8), (0.4, 0.5, 0.25), mats["Horns"], parent=shin)
        # Talons
        for c in [-0.15, 0, 0.15]:
            create_block(f"Talon_{s_name}_{c}", (s_mult * 0.8 + c, -2.1, -0.9), (0.1, 0.35, 0.12), mats["BronzeAccent"], parent=foot, rot_deg=(-25, 0, 0))

    return root

# -------------------------------------------------------------------------
# Set up Golden Sunset Environment, Camera, and Lighting
# -------------------------------------------------------------------------
def setup_sunset_scene():
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE_NEXT' if hasattr(bpy.types, 'RenderSettings') and 'BLENDER_EEVEE_NEXT' in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items else 'BLENDER_EEVEE'
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080

    # Camera positioned behind the dragon mount matching third-person reel perspective
    cam_data = bpy.data.cameras.new("Sunset_Chase_Camera")
    cam_data.lens = 38
    cam_obj = bpy.data.objects.new("Sunset_Chase_Camera", cam_data)
    cam_obj.location = (0, -7.5, 3.2)
    cam_obj.rotation_euler = (math.radians(72), 0, 0)
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    # 1. Intense Golden Sunset Key Sun (Low on horizon in front of dragon)
    sun_data = bpy.data.lights.new(name="Sun_Key_Sunset", type='SUN')
    sun_data.energy = 6.5
    sun_data.color = (1.0, 0.65, 0.22) # Radiant amber-gold sunset
    sun_obj = bpy.data.objects.new("Sun_Key_Sunset", sun_data)
    sun_obj.rotation_euler = (math.radians(160), math.radians(20), math.radians(-35))
    scene.collection.objects.link(sun_obj)

    # 2. Warm Sky Fill Light (Golden ambient scattering)
    fill_data = bpy.data.lights.new(name="Sky_Fill_Gold", type='SUN')
    fill_data.energy = 2.2
    fill_data.color = (0.95, 0.50, 0.15)
    fill_obj = bpy.data.objects.new("Sky_Fill_Gold", fill_data)
    fill_obj.rotation_euler = (math.radians(45), 0, 0)
    scene.collection.objects.link(fill_obj)

    # 3. Horizon God Ray Rim Light
    rim_data = bpy.data.lights.new(name="Rim_Light", type='POINT')
    rim_data.energy = 1200
    rim_data.color = (1.0, 0.82, 0.35)
    rim_obj = bpy.data.objects.new("Rim_Light", rim_data)
    rim_obj.location = (0, 6.0, 1.5)
    scene.collection.objects.link(rim_obj)

    # World background warm golden atmosphere
    world = bpy.data.worlds.new("Sunset_World")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.55, 0.32, 0.12, 1.0)
        bg.inputs["Strength"].default_value = 1.0
    scene.world = world

# -------------------------------------------------------------------------
# Execution Main
# -------------------------------------------------------------------------
def main():
    clear_all()
    mats = create_materials()
    wyvern = build_golden_wyvern(mats)
    setup_sunset_scene()

    # Save Blend file
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
    print(f"[Blender] Saved Golden Wyvern blend file to {BLEND_PATH}")

    # Export GLB (Standard WebGL/Three.js 3D asset)
    try:
        bpy.ops.export_scene.gltf(
            filepath=GLB_PATH,
            export_format='GLB',
            use_selection=False,
            export_apply=True
        )
        print(f"[Blender] Exported GLB model to {GLB_PATH}")
    except Exception as e:
        print(f"[Blender] GLB export notice: {e}")

    # Render Preview Image
    bpy.context.scene.render.filepath = RENDER_PATH
    try:
        bpy.ops.render.render(write_still=True)
        print(f"[Blender] Rendered showcase image to {RENDER_PATH}")
    except Exception as e:
        print(f"[Blender] Render notice: {e}")

if __name__ == "__main__":
    main()
