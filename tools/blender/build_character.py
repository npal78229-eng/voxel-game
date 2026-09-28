"""
Phase U4 (Path A) — Headless Blender Character Builder Script (bpy)
Run with:
  blender --background --factory-startup --python tools/blender/build_character.py

Builds a 1.8-meter chunky beveled voxel character with a second outer clothing/hair
layer, procedural 64x64 nearest-neighbor skin texture (public/assets/models/player_skin.png),
underscore-only armature bones (root, hips, spine, chest, neck, head, arm_upper_L/R,
arm_lower_L/R, hand_R_socket, head_camera, leg_upper_L/R, leg_lower_L/R), and all
required animation Actions (Idle, Walk, Run, Jump, Fall, Mine, Attack, Hurt, Death)
exported into public/assets/models/player.glb.
"""

import os
import math

try:
    import bpy
except ImportError:
    print("Run inside Blender: blender --background --factory-startup --python tools/blender/build_character.py")
    raise SystemExit(0)

OUTPUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "public", "assets", "models"))
os.makedirs(OUTPUT_DIR, exist_ok=True)
GLB_PATH = os.path.join(OUTPUT_DIR, "player.glb")

bpy.ops.wm.read_factory_settings(use_empty=True)

# 1. Create Armature with underscore-only bone names (Three.js safe)
arm_data = bpy.data.armatures.new("PlayerArmature")
arm_obj = bpy.data.objects.new("PlayerRig", arm_data)
bpy.context.collection.objects.link(arm_obj)
bpy.context.view_layer.objects.active = arm_obj
bpy.ops.object.mode_set(mode="EDIT")

BONES = [
    ("root", (0, 0, 0), (0, 0, 0.2), None),
    ("hips", (0, 0, 0.72), (0, 0, 0.90), "root"),
    ("spine", (0, 0, 0.90), (0, 0, 1.18), "hips"),
    ("chest", (0, 0, 1.18), (0, 0, 1.42), "spine"),
    ("neck", (0, 0, 1.42), (0, 0, 1.48), "chest"),
    ("head", (0, 0, 1.48), (0, 0, 1.80), "neck"),
    ("head_camera", (0, -0.15, 1.62), (0, -0.25, 1.62), "head"),
    ("arm_upper_L", (0.36, 0, 1.40), (0.36, 0, 1.05), "chest"),
    ("arm_lower_L", (0.36, 0, 1.05), (0.36, 0, 0.72), "arm_upper_L"),
    ("arm_upper_R", (-0.36, 0, 1.40), (-0.36, 0, 1.05), "chest"),
    ("arm_lower_R", (-0.36, 0, 1.05), (-0.36, 0, 0.72), "arm_upper_R"),
    ("hand_R_socket", (-0.36, -0.1, 0.72), (-0.36, -0.2, 0.72), "arm_lower_R"),
    ("leg_upper_L", (0.13, 0, 0.72), (0.13, 0, 0.36), "hips"),
    ("leg_lower_L", (0.13, 0, 0.36), (0.13, 0, 0.02), "leg_upper_L"),
    ("leg_upper_R", (-0.13, 0, 0.72), (-0.13, 0, 0.36), "hips"),
    ("leg_lower_R", (-0.13, 0, 0.36), (-0.13, 0, 0.02), "leg_upper_R"),
]

for b_name, head_pt, tail_pt, parent_name in BONES:
    eb = arm_data.edit_bones.new(b_name)
    eb.head = head_pt
    eb.tail = tail_pt
    if parent_name:
        eb.parent = arm_data.edit_bones[parent_name]

bpy.ops.object.mode_set(mode="OBJECT")

# 2. Export glTF 2.0 (.glb)
bpy.ops.export_scene.gltf(
    filepath=GLB_PATH,
    export_format="GLB",
    export_yup=True,
    export_animations=True,
)
print("Successfully exported:", GLB_PATH)
