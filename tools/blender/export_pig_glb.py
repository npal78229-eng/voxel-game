"""
Headless Blender Exporter for the User's pig.blend -> public/assets/models/pig.glb
Run with:
  "C:\\Program Files\\WindowsApps\\BlenderFoundation.Blender_5.2.2.0_x64__ppwjx1n5r4v9t\\Blender\\blender.exe" --background "c:\\Users\\npal7\\OneDrive\\PROJECT\\project1\\pig.blend" --python tools/blender/export_pig_glb.py
"""

import os
import math
import bpy

OUT_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "public", "assets", "models")
)
os.makedirs(OUT_DIR, exist_ok=True)
OUT_GLB = os.path.join(OUT_DIR, "pig.glb")

# 1. Remove studio props (Pasture_Pedestal, Lights, Camera, Camera_Focus) so only the pig exports
REMOVE_NAMES = [
    "Pasture_Pedestal",
    "Key_Sun_Light",
    "Fill_Light",
    "Rim_Light",
    "Pig_Camera",
    "Camera_Focus",
]
for name in REMOVE_NAMES:
    obj = bpy.data.objects.get(name)
    if obj:
        bpy.data.objects.remove(obj, do_unlink=True)

# 2. Convert Pig_Curly_Tail (3D Curve) to a real Mesh so glTF 2.0 exports the curly tail
tail_obj = bpy.data.objects.get("Pig_Curly_Tail")
if tail_obj and tail_obj.type == "CURVE":
    bpy.ops.object.select_all(action="DESELECT")
    tail_obj.select_set(True)
    bpy.context.view_layer.objects.active = tail_obj
    bpy.ops.object.convert(target="MESH")

# 3. Parent each Hoof to its corresponding Leg so swinging Pig_Leg_* swings the hoof too
LEG_PAIRS = [
    ("Pig_Leg_Front_L", "Pig_Hoof_Front_L"),
    ("Pig_Leg_Front_R", "Pig_Hoof_Front_R"),
    ("Pig_Leg_Back_L", "Pig_Hoof_Back_L"),
    ("Pig_Leg_Back_R", "Pig_Hoof_Back_R"),
]
for leg_name, hoof_name in LEG_PAIRS:
    leg = bpy.data.objects.get(leg_name)
    hoof = bpy.data.objects.get(hoof_name)
    if leg and hoof:
        # Keep world transform while parenting hoof to leg
        mat_world = hoof.matrix_world.copy()
        hoof.parent = leg
        hoof.matrix_parent_inverse = leg.matrix_world.inverted()
        hoof.matrix_world = mat_world

# 4. Reduce Subsurf levels to 1 for real-time 60 FPS WebGL performance while keeping smooth curves
for obj in bpy.data.objects:
    if obj.type == "MESH":
        for mod in obj.modifiers:
            if mod.type == "SUBSURF":
                mod.levels = 1
                mod.render_levels = 1

# 5. Orient Pig_Root so +X snout in Blender faces -Z in Three.js Y-up, and scale to voxel world size
root = bpy.data.objects.get("Pig_Root")
if root:
    root.rotation_euler = (0.0, 0.0, math.pi / 2.0)
    root.scale = (0.45, 0.45, 0.45)

bpy.context.view_layer.update()

# 6. Export to public/assets/models/pig.glb
bpy.ops.export_scene.gltf(
    filepath=OUT_GLB,
    export_format="GLB",
    export_apply=True,
    export_yup=True,
)
print("SUCCESSFULLY EXPORTED BLENDER PIG GLB:", OUT_GLB)
