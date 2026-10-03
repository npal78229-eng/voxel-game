import bpy
import math
import os

OUTPUT_DIR = r"c:\Users\npal7\OneDrive\PROJECT\project1\MOB"
os.makedirs(OUTPUT_DIR, exist_ok=True)
BLEND_PATH = os.path.join(OUTPUT_DIR, "red_dragon_boss.blend")
RENDER_PATH = os.path.join(OUTPUT_DIR, "red_dragon_boss_render.png")

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
# Materials Creation (Minecraft Voxel Palette)
# -------------------------------------------------------------------------
def create_materials():
    mats = {}

    # 1. Main Crimson Red (Primary dark red / crimson boss body)
    m = bpy.data.materials.new("Mat_Dragon_Crimson")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.58, 0.05, 0.07, 1.0)
    b.inputs["Roughness"].default_value = 0.55
    mats["Crimson"] = m

    # 2. Deep Maroon / Dark Red (Accents, joints, shoulders)
    m = bpy.data.materials.new("Mat_Dragon_DeepRed")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.34, 0.02, 0.038, 1.0)
    b.inputs["Roughness"].default_value = 0.50
    mats["DeepRed"] = m

    # 3. Underbelly & Neck Under-Plates (Dark obsidian-maroon plates for depth)
    m = bpy.data.materials.new("Mat_Dragon_Underbelly")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.13, 0.025, 0.035, 1.0)
    b.inputs["Roughness"].default_value = 0.65
    mats["Underbelly"] = m

    # 4. Horns & Back Spikes (Charred obsidian bone)
    m = bpy.data.materials.new("Mat_Dragon_Horns")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.07, 0.055, 0.06, 1.0)
    b.inputs["Roughness"].default_value = 0.38
    mats["Horns"] = m

    # 5. Glowing Yellow/Orange Eyes (Menacing Boss Eye Glow)
    m = bpy.data.materials.new("Mat_Dragon_EyeGlow")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (1.0, 0.68, 0.02, 1.0)
    b.inputs["Roughness"].default_value = 0.1
    if "Emission Color" in b.inputs:
        b.inputs["Emission Color"].default_value = (1.0, 0.68, 0.02, 1.0)
        b.inputs["Emission Strength"].default_value = 7.0
    elif "Emission" in b.inputs:
        b.inputs["Emission"].default_value = (1.0, 0.68, 0.02, 1.0)
    mats["EyeGlow"] = m

    # 6. Eye Slit Pupil
    m = bpy.data.materials.new("Mat_Dragon_Pupil")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.015, 0.005, 0.01, 1.0)
    b.inputs["Roughness"].default_value = 0.2
    mats["Pupil"] = m

    # 7. Teeth & Claws (Sharp Aged Ivory Bone)
    m = bpy.data.materials.new("Mat_Dragon_Ivory")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.88, 0.84, 0.72, 1.0)
    b.inputs["Roughness"].default_value = 0.32
    mats["Ivory"] = m

    # 8. Wing Membrane Top
    m = bpy.data.materials.new("Mat_Dragon_WingMembrane")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.48, 0.04, 0.06, 1.0)
    b.inputs["Roughness"].default_value = 0.60
    mats["WingMembrane"] = m

    # 9. Wing Membrane Underside (Darker for depth underneath)
    m = bpy.data.materials.new("Mat_Dragon_WingUnder")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.20, 0.018, 0.028, 1.0)
    b.inputs["Roughness"].default_value = 0.70
    mats["WingUnder"] = m

    return mats

# -------------------------------------------------------------------------
# Helper Mesh Builders (Strictly Flat-Shaded Minecraft Geometry)
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

def bind_to_bone(obj, arm_obj, bone_name):
    obj.select_set(True)
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode='POSE')
    arm_obj.data.bones.active = arm_obj.data.bones[bone_name]
    bpy.ops.object.parent_set(type='BONE')
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.select_set(False)
    arm_obj.select_set(False)

# -------------------------------------------------------------------------
# Build Armature Rig
# -------------------------------------------------------------------------
def build_dragon_rig():
    arm_data = bpy.data.armatures.new("Dragon_Rig_Data")
    arm_obj = bpy.data.objects.new("Dragon_Rig", arm_data)
    bpy.context.scene.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_data.edit_bones

    # Root Bone
    root = eb.new("Root")
    root.head = (0.0, 0.0, 0.0)
    root.tail = (0.0, 0.0, 1.0)

    # Spine Main (Torso & Chest)
    spine = eb.new("Spine_Main")
    spine.head = (0.0, -0.2, 3.2)
    spine.tail = (0.0, 1.4, 3.4)
    spine.parent = root

    # Spine Hips (Pelvis & Rear)
    hips = eb.new("Spine_Hips")
    hips.head = (0.0, -0.2, 3.2)
    hips.tail = (0.0, -1.8, 3.0)
    hips.parent = spine

    # Neck Chains (3 sturdy segments)
    neck1 = eb.new("Neck_1")
    neck1.head = (0.0, 1.4, 3.4)
    neck1.tail = (0.0, 2.3, 3.8)
    neck1.parent = spine

    neck2 = eb.new("Neck_2")
    neck2.head = (0.0, 2.3, 3.8)
    neck2.tail = (0.0, 3.1, 4.3)
    neck2.parent = neck1

    neck3 = eb.new("Neck_3")
    neck3.head = (0.0, 3.1, 4.3)
    neck3.tail = (0.0, 3.8, 4.8)
    neck3.parent = neck2

    # Head & Jaw - Head bone head placed at (0, 3.0, 4.8) so all horns, skull and snout are strictly ahead of the pivot
    head = eb.new("Head")
    head.head = (0.0, 3.0, 4.8)
    head.tail = (0.0, 5.8, 4.8)
    head.parent = neck3

    jaw = eb.new("Jaw")
    jaw.head = (0.0, 4.1, 4.4)
    jaw.tail = (0.0, 5.8, 4.2)
    jaw.parent = head

    # Tail Chain (4 clean tapering segments)
    t1 = eb.new("Tail_1")
    t1.head = (0.0, -1.8, 3.0)
    t1.tail = (0.0, -3.4, 2.8)
    t1.parent = hips

    t2 = eb.new("Tail_2")
    t2.head = (0.0, -3.4, 2.8)
    t2.tail = (0.0, -5.0, 2.5)
    t2.parent = t1

    t3 = eb.new("Tail_3")
    t3.head = (0.0, -5.0, 2.5)
    t3.tail = (0.0, -6.6, 2.2)
    t3.parent = t2

    t4 = eb.new("Tail_4")
    t4.head = (0.0, -6.6, 2.2)
    t4.tail = (0.0, -8.6, 1.9)
    t4.parent = t3

    # Wings (Left & Right)
    for side, sign in [("L", -1.0), ("R", 1.0)]:
        w_sh = eb.new(f"Wing_Shoulder_{side}")
        w_sh.head = (sign * 1.0, 0.4, 3.8)
        w_sh.tail = (sign * 2.6, 0.2, 4.5)
        w_sh.parent = spine

        w_arm = eb.new(f"Wing_Arm_{side}")
        w_arm.head = (sign * 2.6, 0.2, 4.5)
        w_arm.tail = (sign * 5.8, -0.4, 5.2)
        w_arm.parent = w_sh

        w_out = eb.new(f"Wing_Outer_{side}")
        w_out.head = (sign * 5.8, -0.4, 5.2)
        w_out.tail = (sign * 8.8, -1.2, 5.6)
        w_out.parent = w_arm

    # Front Legs (Left & Right)
    for side, sign in [("L", -1.0), ("R", 1.0)]:
        fl_up = eb.new(f"Leg_Front_Upper_{side}")
        fl_up.head = (sign * 1.4, 0.8, 3.1)
        fl_up.tail = (sign * 1.6, 0.7, 1.7)
        fl_up.parent = spine

        fl_low = eb.new(f"Leg_Front_Lower_{side}")
        fl_low.head = (sign * 1.6, 0.7, 1.7)
        fl_low.tail = (sign * 1.6, 0.6, 0.5)
        fl_low.parent = fl_up

        fl_foot = eb.new(f"Foot_Front_{side}")
        fl_foot.head = (sign * 1.6, 0.6, 0.5)
        fl_foot.tail = (sign * 1.6, 1.2, 0.0)
        fl_foot.parent = fl_low

    # Rear Legs (Left & Right)
    for side, sign in [("L", -1.0), ("R", 1.0)]:
        rl_up = eb.new(f"Leg_Rear_Upper_{side}")
        rl_up.head = (sign * 1.5, -1.6, 3.0)
        rl_up.tail = (sign * 1.7, -1.9, 1.7)
        rl_up.parent = hips

        rl_low = eb.new(f"Leg_Rear_Lower_{side}")
        rl_low.head = (sign * 1.7, -1.9, 1.7)
        rl_low.tail = (sign * 1.7, -1.7, 0.5)
        rl_low.parent = rl_up

        rl_foot = eb.new(f"Foot_Rear_{side}")
        rl_foot.head = (sign * 1.7, -1.7, 0.5)
        rl_foot.tail = (sign * 1.7, -1.1, 0.0)
        rl_foot.parent = rl_low

    bpy.ops.object.mode_set(mode='OBJECT')
    
    for pb in arm_obj.pose.bones:
        pb.rotation_mode = 'XYZ'
        
    return arm_obj

# -------------------------------------------------------------------------
# Build Geometry Objects
# -------------------------------------------------------------------------
def build_dragon_geometry(arm_obj, mats):
    c_head = bpy.data.collections.new("01_Head_And_Neck")
    c_body = bpy.data.collections.new("02_Body_And_Spikes")
    c_wings = bpy.data.collections.new("03_Wings")
    c_legs = bpy.data.collections.new("04_Legs_And_Claws")
    c_tail = bpy.data.collections.new("05_Tail")
    
    bpy.context.scene.collection.children.link(c_head)
    bpy.context.scene.collection.children.link(c_body)
    bpy.context.scene.collection.children.link(c_wings)
    bpy.context.scene.collection.children.link(c_legs)
    bpy.context.scene.collection.children.link(c_tail)

    # 1. BODY & UNDERBELLY
    body_main = create_block("Dragon_Body_Main", (0.0, 0.5, 3.3), (2.3, 2.6, 1.9), mats["Crimson"], c_body)
    bind_to_bone(body_main, arm_obj, "Spine_Main")

    belly_main = create_block("Dragon_Body_Underbelly", (0.0, 0.5, 2.3), (1.8, 2.7, 0.3), mats["Underbelly"], c_body)
    bind_to_bone(belly_main, arm_obj, "Spine_Main")

    hips_main = create_block("Dragon_Body_Hips", (0.0, -1.0, 3.1), (2.1, 1.8, 1.7), mats["Crimson"], c_body)
    bind_to_bone(hips_main, arm_obj, "Spine_Hips")

    belly_hips = create_block("Dragon_Hips_Underbelly", (0.0, -1.0, 2.2), (1.6, 1.9, 0.25), mats["Underbelly"], c_body)
    bind_to_bone(belly_hips, arm_obj, "Spine_Hips")

    # 2. DORSAL SPIKES ALONG BACK (Continuous sharp spines from neck to mid-back)
    b_spk1 = create_spike("Dragon_Spike_Back_1", (0.0, 1.4, 4.6), 0.36, 1.0, mats["Horns"], c_body, rot_deg=(8, 0, 0))
    bind_to_bone(b_spk1, arm_obj, "Spine_Main")

    b_spk2 = create_spike("Dragon_Spike_Back_2", (0.0, 0.6, 4.75), 0.42, 1.25, mats["Horns"], c_body, rot_deg=(3, 0, 0))
    bind_to_bone(b_spk2, arm_obj, "Spine_Main")

    b_spk3 = create_spike("Dragon_Spike_Back_3", (0.0, -0.2, 4.65), 0.38, 1.1, mats["Horns"], c_body, rot_deg=(-4, 0, 0))
    bind_to_bone(b_spk3, arm_obj, "Spine_Main")

    b_spk4 = create_spike("Dragon_Spike_Back_4", (0.0, -1.0, 4.35), 0.34, 0.95, mats["Horns"], c_body, rot_deg=(-10, 0, 0))
    bind_to_bone(b_spk4, arm_obj, "Spine_Hips")

    # 3. NECK SEGMENTS AND NECK SPIKES
    neck1 = create_block("Dragon_Neck_1", (0.0, 1.85, 3.6), (1.5, 1.2, 1.35), mats["Crimson"], c_head)
    bind_to_bone(neck1, arm_obj, "Neck_1")
    neck1_under = create_block("Dragon_Neck_Under_1", (0.0, 1.85, 2.88), (1.15, 1.22, 0.22), mats["Underbelly"], c_head)
    bind_to_bone(neck1_under, arm_obj, "Neck_1")
    n_spk1 = create_spike("Dragon_Spike_Neck_1", (0.0, 1.85, 4.65), 0.32, 0.85, mats["Horns"], c_head, rot_deg=(12, 0, 0))
    bind_to_bone(n_spk1, arm_obj, "Neck_1")

    neck2 = create_block("Dragon_Neck_2", (0.0, 2.7, 4.05), (1.35, 1.15, 1.25), mats["Crimson"], c_head)
    bind_to_bone(neck2, arm_obj, "Neck_2")
    neck2_under = create_block("Dragon_Neck_Under_2", (0.0, 2.7, 3.38), (1.05, 1.17, 0.20), mats["Underbelly"], c_head)
    bind_to_bone(neck2_under, arm_obj, "Neck_2")
    n_spk2 = create_spike("Dragon_Spike_Neck_2", (0.0, 2.7, 5.0), 0.34, 0.90, mats["Horns"], c_head, rot_deg=(18, 0, 0))
    bind_to_bone(n_spk2, arm_obj, "Neck_2")

    neck3 = create_block("Dragon_Neck_3", (0.0, 3.45, 4.55), (1.2, 1.1, 1.15), mats["Crimson"], c_head)
    bind_to_bone(neck3, arm_obj, "Neck_3")
    neck3_under = create_block("Dragon_Neck_Under_3", (0.0, 3.45, 3.92), (0.95, 1.12, 0.18), mats["Underbelly"], c_head)
    bind_to_bone(neck3_under, arm_obj, "Neck_3")
    n_spk3 = create_spike("Dragon_Spike_Neck_3", (0.0, 3.45, 5.4), 0.32, 0.85, mats["Horns"], c_head, rot_deg=(24, 0, 0))
    bind_to_bone(n_spk3, arm_obj, "Neck_3")

    # 4. HEAD (Large aggressive skull, stepped snout, glowing eyes, horns)
    head_skull = create_block("Dragon_Head_Skull", (0.0, 4.4, 5.25), (1.65, 1.45, 1.2), mats["Crimson"], c_head)
    bind_to_bone(head_skull, arm_obj, "Head")

    head_snout = create_block("Dragon_Head_Snout", (0.0, 5.35, 4.95), (1.3, 1.6, 0.85), mats["Crimson"], c_head)
    bind_to_bone(head_snout, arm_obj, "Head")

    # Brow ridges for aggressive boss glare
    brow_l = create_block("Dragon_Brow_L", (-0.72, 4.60, 5.62), (0.36, 1.05, 0.28), mats["DeepRed"], c_head, rot_deg=(5, 10, 0))
    bind_to_bone(brow_l, arm_obj, "Head")
    brow_r = create_block("Dragon_Brow_R", (0.72, 4.60, 5.62), (0.36, 1.05, 0.28), mats["DeepRed"], c_head, rot_deg=(5, -10, 0))
    bind_to_bone(brow_r, arm_obj, "Head")

    nostril_l = create_block("Dragon_Nostril_L", (-0.32, 6.12, 5.2), (0.2, 0.15, 0.2), mats["Underbelly"], c_head)
    bind_to_bone(nostril_l, arm_obj, "Head")
    nostril_r = create_block("Dragon_Nostril_R", (0.32, 6.12, 5.2), (0.2, 0.15, 0.2), mats["Underbelly"], c_head)
    bind_to_bone(nostril_r, arm_obj, "Head")

    # Glowing Yellow/Orange Eyes with Slit Pupil
    eye_l = create_block("Dragon_Eye_L", (-0.81, 4.52, 5.35), (0.12, 0.46, 0.28), mats["EyeGlow"], c_head)
    bind_to_bone(eye_l, arm_obj, "Head")
    pupil_l = create_block("Dragon_Eye_Pupil_L", (-0.84, 4.52, 5.35), (0.08, 0.14, 0.26), mats["Pupil"], c_head)
    bind_to_bone(pupil_l, arm_obj, "Head")

    eye_r = create_block("Dragon_Eye_R", (0.81, 4.52, 5.35), (0.12, 0.46, 0.28), mats["EyeGlow"], c_head)
    bind_to_bone(eye_r, arm_obj, "Head")
    pupil_r = create_block("Dragon_Eye_Pupil_R", (0.84, 4.52, 5.35), (0.08, 0.14, 0.26), mats["Pupil"], c_head)
    bind_to_bone(pupil_r, arm_obj, "Head")

    # TWO LARGE HORNS (Connected swept-back horns)
    for side, sign in [("L", -1.0), ("R", 1.0)]:
        # Horn Base (emerging from rear top of skull)
        h_base = create_block(f"Dragon_Horn_Base_{side}", (sign * 0.62, 4.0, 5.9), (0.42, 0.50, 0.55), mats["Horns"], c_head, rot_deg=(30, sign * 14, sign * 8))
        bind_to_bone(h_base, arm_obj, "Head")

        # Horn Mid
        h_mid = create_block(f"Dragon_Horn_Mid_{side}", (sign * 0.74, 3.55, 6.45), (0.36, 0.46, 0.62), mats["Horns"], c_head, rot_deg=(44, sign * 18, sign * 10))
        bind_to_bone(h_mid, arm_obj, "Head")

        # Horn Tip
        h_tip = create_block(f"Dragon_Horn_Tip_{side}", (sign * 0.86, 3.05, 7.0), (0.28, 0.40, 0.70), mats["Horns"], c_head, rot_deg=(55, sign * 22, sign * 12))
        bind_to_bone(h_tip, arm_obj, "Head")

        # Horn Sharp Spike End
        h_end = create_spike(f"Dragon_Horn_Spike_{side}", (sign * 0.96, 2.6, 7.45), 0.18, 0.55, mats["Horns"], c_head, rot_deg=(55, sign * 22, sign * 12))
        bind_to_bone(h_end, arm_obj, "Head")

    # Upper Teeth (Sharp ivory fangs)
    for side, sign in [("L", -1.0), ("R", 1.0)]:
        t_front = create_spike(f"Dragon_Fang_Upper_Front_{side}", (sign * 0.52, 5.9, 4.45), 0.14, 0.40, mats["Ivory"], c_head, rot_deg=(180, 0, 0))
        bind_to_bone(t_front, arm_obj, "Head")
        t_mid = create_spike(f"Dragon_Fang_Upper_Mid_{side}", (sign * 0.58, 5.35, 4.48), 0.12, 0.32, mats["Ivory"], c_head, rot_deg=(180, 0, 0))
        bind_to_bone(t_mid, arm_obj, "Head")
        t_rear = create_spike(f"Dragon_Fang_Upper_Rear_{side}", (sign * 0.62, 4.8, 4.52), 0.11, 0.28, mats["Ivory"], c_head, rot_deg=(180, 0, 0))
        bind_to_bone(t_rear, arm_obj, "Head")

    # 5. JAW & LOWER TEETH
    jaw_main = create_block("Dragon_Jaw_Main", (0.0, 4.95, 4.35), (1.2, 1.7, 0.42), mats["Crimson"], c_head)
    bind_to_bone(jaw_main, arm_obj, "Jaw")

    jaw_under = create_block("Dragon_Jaw_Under", (0.0, 4.95, 4.08), (1.0, 1.72, 0.18), mats["Underbelly"], c_head)
    bind_to_bone(jaw_under, arm_obj, "Jaw")

    chin_spur = create_spike("Dragon_Chin_Spur", (0.0, 5.65, 3.88), 0.18, 0.45, mats["Horns"], c_head, rot_deg=(170, 0, 0))
    bind_to_bone(chin_spur, arm_obj, "Jaw")

    for side, sign in [("L", -1.0), ("R", 1.0)]:
        t_low1 = create_spike(f"Dragon_Fang_Lower_Front_{side}", (sign * 0.48, 5.75, 4.65), 0.13, 0.36, mats["Ivory"], c_head)
        bind_to_bone(t_low1, arm_obj, "Jaw")
        t_low2 = create_spike(f"Dragon_Fang_Lower_Mid_{side}", (sign * 0.52, 5.2, 4.62), 0.11, 0.30, mats["Ivory"], c_head)
        bind_to_bone(t_low2, arm_obj, "Jaw")
        t_low3 = create_spike(f"Dragon_Fang_Lower_Rear_{side}", (sign * 0.55, 4.65, 4.58), 0.10, 0.26, mats["Ivory"], c_head)
        bind_to_bone(t_low3, arm_obj, "Jaw")

    # 6. TAIL (Simple, long, clearly dragon-like, uncluttered)
    tail1 = create_block("Dragon_Tail_1", (0.0, -2.6, 2.9), (1.4, 1.6, 1.3), mats["Crimson"], c_tail)
    bind_to_bone(tail1, arm_obj, "Tail_1")
    tail1_u = create_block("Dragon_Tail_Under_1", (0.0, -2.6, 2.2), (1.1, 1.62, 0.18), mats["Underbelly"], c_tail)
    bind_to_bone(tail1_u, arm_obj, "Tail_1")

    tail2 = create_block("Dragon_Tail_2", (0.0, -4.2, 2.65), (1.1, 1.6, 1.05), mats["Crimson"], c_tail)
    bind_to_bone(tail2, arm_obj, "Tail_2")
    tail2_u = create_block("Dragon_Tail_Under_2", (0.0, -4.2, 2.08), (0.85, 1.62, 0.16), mats["Underbelly"], c_tail)
    bind_to_bone(tail2_u, arm_obj, "Tail_2")

    tail3 = create_block("Dragon_Tail_3", (0.0, -5.8, 2.35), (0.8, 1.6, 0.8), mats["Crimson"], c_tail)
    bind_to_bone(tail3, arm_obj, "Tail_3")
    tail3_u = create_block("Dragon_Tail_Under_3", (0.0, -5.8, 1.9), (0.6, 1.62, 0.14), mats["Underbelly"], c_tail)
    bind_to_bone(tail3_u, arm_obj, "Tail_3")

    tail4 = create_block("Dragon_Tail_4", (0.0, -7.5, 2.05), (0.55, 1.8, 0.55), mats["Crimson"], c_tail)
    bind_to_bone(tail4, arm_obj, "Tail_4")

    # Classic Dragon Tail Spade / Fin at tip
    tail_blade_h = create_block("Dragon_Tail_Blade_H", (0.0, -8.5, 2.05), (1.6, 1.0, 0.12), mats["DeepRed"], c_tail)
    bind_to_bone(tail_blade_h, arm_obj, "Tail_4")
    tail_blade_v = create_block("Dragon_Tail_Blade_V", (0.0, -8.5, 2.05), (0.12, 1.0, 1.15), mats["Horns"], c_tail)
    bind_to_bone(tail_blade_v, arm_obj, "Tail_4")

    # 7. FOUR LARGE LEGS WITH STRONG CLAWS
    # Front Legs
    for side, sign in [("L", -1.0), ("R", 1.0)]:
        f_up = create_block(f"Dragon_Leg_Front_Upper_{side}", (sign * 1.5, 0.75, 2.4), (0.85, 0.95, 1.4), mats["DeepRed"], c_legs)
        bind_to_bone(f_up, arm_obj, f"Leg_Front_Upper_{side}")

        f_low = create_block(f"Dragon_Leg_Front_Lower_{side}", (sign * 1.6, 0.65, 1.1), (0.75, 0.8, 1.3), mats["Crimson"], c_legs)
        bind_to_bone(f_low, arm_obj, f"Leg_Front_Lower_{side}")

        f_foot = create_block(f"Dragon_Foot_Front_{side}", (sign * 1.6, 0.85, 0.26), (1.05, 1.25, 0.45), mats["Crimson"], c_legs)
        bind_to_bone(f_foot, arm_obj, f"Foot_Front_{side}")

        # Claws
        for c_idx, offset_x in enumerate([-0.3, 0.0, 0.3]):
            claw = create_spike(f"Dragon_Claw_Front_{side}_{c_idx+1}", (sign * 1.6 + offset_x, 1.55, 0.16), 0.12, 0.42, mats["Ivory"], c_legs, rot_deg=(90, 0, 0))
            bind_to_bone(claw, arm_obj, f"Foot_Front_{side}")

    # Rear Legs
    for side, sign in [("L", -1.0), ("R", 1.0)]:
        r_thigh = create_block(f"Dragon_Leg_Rear_Upper_{side}", (sign * 1.6, -1.75, 2.35), (1.05, 1.25, 1.5), mats["DeepRed"], c_legs)
        bind_to_bone(r_thigh, arm_obj, f"Leg_Rear_Upper_{side}")

        r_shin = create_block(f"Dragon_Leg_Rear_Lower_{side}", (sign * 1.7, -1.8, 1.1), (0.85, 0.95, 1.35), mats["Crimson"], c_legs)
        bind_to_bone(r_shin, arm_obj, f"Leg_Rear_Lower_{side}")

        r_foot = create_block(f"Dragon_Foot_Rear_{side}", (sign * 1.7, -1.4, 0.26), (1.15, 1.35, 0.48), mats["Crimson"], c_legs)
        bind_to_bone(r_foot, arm_obj, f"Foot_Rear_{side}")

        # Claws
        for c_idx, offset_x in enumerate([-0.32, 0.0, 0.32]):
            claw = create_spike(f"Dragon_Claw_Rear_{side}_{c_idx+1}", (sign * 1.7 + offset_x, -0.65, 0.16), 0.13, 0.45, mats["Ivory"], c_legs, rot_deg=(90, 0, 0))
            bind_to_bone(claw, arm_obj, f"Foot_Rear_{side}")

    # 8. LARGE WINGS (Minecraft blocky strut & membrane architecture)
    for side, sign in [("L", -1.0), ("R", 1.0)]:
        w_sh = create_block(f"Dragon_Wing_Joint_{side}", (sign * 1.8, 0.3, 4.15), (0.75, 0.75, 0.75), mats["DeepRed"], c_wings)
        bind_to_bone(w_sh, arm_obj, f"Wing_Shoulder_{side}")

        # Main inner spar (bone leading edge)
        w_spar_in = create_block(f"Dragon_Wing_Spar_Inner_{side}", (sign * 4.2, 0.0, 4.85), (3.4, 0.55, 0.55), mats["DeepRed"], c_wings, rot_deg=(0, sign * -12, sign * 8))
        bind_to_bone(w_spar_in, arm_obj, f"Wing_Arm_{side}")

        # Inner membrane panel (angled downward 42 degrees so broadside is visible in 3D)
        w_mem_in = create_block(f"Dragon_Wing_Membrane_In_{side}", (sign * 4.1, -1.05, 4.0), (3.2, 2.2, 0.12), mats["WingMembrane"], c_wings, rot_deg=(-42, sign * -10, sign * 8))
        bind_to_bone(w_mem_in, arm_obj, f"Wing_Arm_{side}")

        w_mem_in_u = create_block(f"Dragon_Wing_Under_In_{side}", (sign * 4.1, -1.05, 3.92), (3.1, 2.15, 0.06), mats["WingUnder"], c_wings, rot_deg=(-42, sign * -10, sign * 8))
        bind_to_bone(w_mem_in_u, arm_obj, f"Wing_Arm_{side}")

        # Main outer spar
        w_spar_out = create_block(f"Dragon_Wing_Spar_Outer_{side}", (sign * 7.4, -0.8, 5.4), (3.3, 0.45, 0.45), mats["DeepRed"], c_wings, rot_deg=(0, sign * -8, sign * 14))
        bind_to_bone(w_spar_out, arm_obj, f"Wing_Outer_{side}")

        # Outer membrane panel (angled downward 40 degrees)
        w_mem_out = create_block(f"Dragon_Wing_Membrane_Out_{side}", (sign * 7.3, -1.95, 4.5), (3.1, 2.3, 0.10), mats["WingMembrane"], c_wings, rot_deg=(-40, sign * -8, sign * 14))
        bind_to_bone(w_mem_out, arm_obj, f"Wing_Outer_{side}")

        w_mem_out_u = create_block(f"Dragon_Wing_Under_Out_{side}", (sign * 7.3, -1.95, 4.42), (3.0, 2.25, 0.06), mats["WingUnder"], c_wings, rot_deg=(-40, sign * -8, sign * 14))
        bind_to_bone(w_mem_out_u, arm_obj, f"Wing_Outer_{side}")

        # Wing Finger Struts / Ribs extending back and down along the membrane
        w_finger1 = create_block(f"Dragon_Wing_Finger_1_{side}", (sign * 5.8, -1.95, 4.3), (0.32, 2.4, 0.32), mats["Horns"], c_wings, rot_deg=(-42, sign * -10, sign * 5))
        bind_to_bone(w_finger1, arm_obj, f"Wing_Arm_{side}")

        w_finger2 = create_block(f"Dragon_Wing_Finger_2_{side}", (sign * 8.8, -2.2, 4.6), (0.26, 2.2, 0.26), mats["Horns"], c_wings, rot_deg=(-40, sign * -8, sign * 15))
        bind_to_bone(w_finger2, arm_obj, f"Wing_Outer_{side}")

    print("All geometry created and parented.")

# -------------------------------------------------------------------------
# The 11 Boss Animations
# -------------------------------------------------------------------------
def create_boss_animations(arm_obj):
    actions = {}

    def set_key(pb_name, channel, frame, val):
        pb = arm_obj.pose.bones[pb_name]
        setattr(pb, channel, val)
        pb.keyframe_insert(data_path=channel, frame=frame)

    def rot_xyz(deg_x=0.0, deg_y=0.0, deg_z=0.0):
        return (math.radians(deg_x), math.radians(deg_y), math.radians(deg_z))

    def reset_pose():
        for pb in arm_obj.pose.bones:
            pb.location = (0.0, 0.0, 0.0)
            pb.rotation_euler = (0.0, 0.0, 0.0)
            pb.scale = (1.0, 1.0, 1.0)

    if not arm_obj.animation_data:
        arm_obj.animation_data_create()

    # 1. IDLE BREATHING (Cyclic gentle breathing and tail sway)
    act = bpy.data.actions.new("01_Idle_Breathing")
    act.use_fake_user = True
    arm_obj.animation_data.action = act
    reset_pose()
    for f in [1, 40]:
        set_key("Spine_Main", "location", f, (0.0, 0.0, 0.0))
        set_key("Spine_Main", "rotation_euler", f, rot_xyz(0, 0, 0))
        set_key("Neck_1", "rotation_euler", f, rot_xyz(0, 0, 0))
        set_key("Neck_2", "rotation_euler", f, rot_xyz(0, 0, 0))
        set_key("Head", "rotation_euler", f, rot_xyz(0, 0, 0))
        set_key("Jaw", "rotation_euler", f, rot_xyz(6, 0, 0))
        set_key("Tail_1", "rotation_euler", f, rot_xyz(0, 0, 10))
        set_key("Tail_2", "rotation_euler", f, rot_xyz(0, 0, 18))
        set_key("Tail_3", "rotation_euler", f, rot_xyz(0, 0, 24))
        set_key("Tail_4", "rotation_euler", f, rot_xyz(0, 0, 28))
        set_key("Wing_Arm_L", "rotation_euler", f, rot_xyz(16, 0, 0))
        set_key("Wing_Arm_R", "rotation_euler", f, rot_xyz(16, 0, 0))

    set_key("Spine_Main", "location", 20, (0.0, 0.0, 0.06))
    set_key("Spine_Main", "rotation_euler", 20, rot_xyz(2, 0, 0))
    set_key("Neck_1", "rotation_euler", 20, rot_xyz(3, 0, 0))
    set_key("Neck_2", "rotation_euler", 20, rot_xyz(3, 0, 0))
    set_key("Head", "rotation_euler", 20, rot_xyz(-2, 0, 0))
    set_key("Jaw", "rotation_euler", 20, rot_xyz(10, 0, 0))
    set_key("Tail_1", "rotation_euler", 20, rot_xyz(0, 0, 6))
    set_key("Tail_2", "rotation_euler", 20, rot_xyz(0, 0, 10))
    set_key("Tail_3", "rotation_euler", 20, rot_xyz(0, 0, 14))
    set_key("Tail_4", "rotation_euler", 20, rot_xyz(0, 0, 18))
    set_key("Wing_Arm_L", "rotation_euler", 20, rot_xyz(24, 0, 0))
    set_key("Wing_Arm_R", "rotation_euler", 20, rot_xyz(24, 0, 0))
    actions["Idle_Breathing"] = act

    # 2. WALKING (Heavy 4-legged quadruped gait)
    act = bpy.data.actions.new("02_Walking")
    act.use_fake_user = True
    arm_obj.animation_data.action = act
    reset_pose()
    for f in [1, 33]:
        set_key("Spine_Main", "location", f, (0.0, 0.0, 0.0))
        set_key("Leg_Front_Upper_L", "rotation_euler", f, rot_xyz(22, 0, 0))
        set_key("Leg_Front_Lower_L", "rotation_euler", f, rot_xyz(-12, 0, 0))
        set_key("Leg_Front_Upper_R", "rotation_euler", f, rot_xyz(-20, 0, 0))
        set_key("Leg_Front_Lower_R", "rotation_euler", f, rot_xyz(10, 0, 0))
        set_key("Leg_Rear_Upper_L", "rotation_euler", f, rot_xyz(-18, 0, 0))
        set_key("Leg_Rear_Lower_L", "rotation_euler", f, rot_xyz(12, 0, 0))
        set_key("Leg_Rear_Upper_R", "rotation_euler", f, rot_xyz(20, 0, 0))
        set_key("Leg_Rear_Lower_R", "rotation_euler", f, rot_xyz(-14, 0, 0))
        set_key("Tail_1", "rotation_euler", f, rot_xyz(0, 0, 8))
        set_key("Tail_2", "rotation_euler", f, rot_xyz(0, 0, 14))

    set_key("Spine_Main", "location", 17, (0.0, 0.0, 0.05))
    set_key("Leg_Front_Upper_L", "rotation_euler", 17, rot_xyz(-20, 0, 0))
    set_key("Leg_Front_Lower_L", "rotation_euler", 17, rot_xyz(10, 0, 0))
    set_key("Leg_Front_Upper_R", "rotation_euler", 17, rot_xyz(22, 0, 0))
    set_key("Leg_Front_Lower_R", "rotation_euler", 17, rot_xyz(-12, 0, 0))
    set_key("Leg_Rear_Upper_L", "rotation_euler", 17, rot_xyz(20, 0, 0))
    set_key("Leg_Rear_Lower_L", "rotation_euler", 17, rot_xyz(-14, 0, 0))
    set_key("Leg_Rear_Upper_R", "rotation_euler", 17, rot_xyz(-18, 0, 0))
    set_key("Leg_Rear_Lower_R", "rotation_euler", 17, rot_xyz(12, 0, 0))
    set_key("Tail_1", "rotation_euler", 17, rot_xyz(0, 0, -8))
    set_key("Tail_2", "rotation_euler", 17, rot_xyz(0, 0, -14))
    actions["Walking"] = act

    # 3. RUNNING (Aggressive forward boss charge)
    act = bpy.data.actions.new("03_Running")
    act.use_fake_user = True
    arm_obj.animation_data.action = act
    reset_pose()
    for f in [1, 21]:
        set_key("Spine_Main", "location", f, (0.0, 0.0, -0.15))
        set_key("Spine_Main", "rotation_euler", f, rot_xyz(-8, 0, 0))
        set_key("Head", "rotation_euler", f, rot_xyz(6, 0, 0))
        set_key("Jaw", "rotation_euler", f, rot_xyz(12, 0, 0))
        set_key("Leg_Front_Upper_L", "rotation_euler", f, rot_xyz(35, 0, 0))
        set_key("Leg_Front_Upper_R", "rotation_euler", f, rot_xyz(-30, 0, 0))
        set_key("Leg_Rear_Upper_L", "rotation_euler", f, rot_xyz(-28, 0, 0))
        set_key("Leg_Rear_Upper_R", "rotation_euler", f, rot_xyz(32, 0, 0))

    set_key("Spine_Main", "location", 11, (0.0, 0.0, 0.08))
    set_key("Spine_Main", "rotation_euler", 11, rot_xyz(-4, 0, 0))
    set_key("Leg_Front_Upper_L", "rotation_euler", 11, rot_xyz(-30, 0, 0))
    set_key("Leg_Front_Upper_R", "rotation_euler", 11, rot_xyz(35, 0, 0))
    set_key("Leg_Rear_Upper_L", "rotation_euler", 11, rot_xyz(32, 0, 0))
    set_key("Leg_Rear_Upper_R", "rotation_euler", 11, rot_xyz(-28, 0, 0))
    actions["Running"] = act

    # 4. WING FLAPPING (Powerful airborne flap cycle)
    act = bpy.data.actions.new("04_Wing_Flapping")
    act.use_fake_user = True
    arm_obj.animation_data.action = act
    reset_pose()
    for f in [1, 25]:
        set_key("Spine_Main", "location", f, (0.0, 0.0, 1.2))
        set_key("Wing_Arm_L", "rotation_euler", f, rot_xyz(38, 0, 0))
        set_key("Wing_Outer_L", "rotation_euler", f, rot_xyz(25, 0, 0))
        set_key("Wing_Arm_R", "rotation_euler", f, rot_xyz(38, 0, 0))
        set_key("Wing_Outer_R", "rotation_euler", f, rot_xyz(25, 0, 0))
        set_key("Leg_Front_Upper_L", "rotation_euler", f, rot_xyz(-18, 0, 0))
        set_key("Leg_Front_Upper_R", "rotation_euler", f, rot_xyz(-18, 0, 0))
        set_key("Leg_Rear_Upper_L", "rotation_euler", f, rot_xyz(-24, 0, 0))
        set_key("Leg_Rear_Upper_R", "rotation_euler", f, rot_xyz(-24, 0, 0))

    set_key("Spine_Main", "location", 13, (0.0, 0.0, 1.6))
    set_key("Wing_Arm_L", "rotation_euler", 13, rot_xyz(-32, 0, 0))
    set_key("Wing_Outer_L", "rotation_euler", 13, rot_xyz(-28, 0, 0))
    set_key("Wing_Arm_R", "rotation_euler", 13, rot_xyz(-32, 0, 0))
    set_key("Wing_Outer_R", "rotation_euler", 13, rot_xyz(-28, 0, 0))
    actions["Wing_Flapping"] = act

    # 5. FLYING (Majestic soaring & cruising loop)
    act = bpy.data.actions.new("05_Flying")
    act.use_fake_user = True
    arm_obj.animation_data.action = act
    reset_pose()
    for f in [1, 49]:
        set_key("Spine_Main", "location", f, (0.0, 0.0, 2.5))
        set_key("Spine_Main", "rotation_euler", f, rot_xyz(-10, 0, 0))
        set_key("Head", "rotation_euler", f, rot_xyz(12, 0, 0))
        set_key("Wing_Arm_L", "rotation_euler", f, rot_xyz(10, 0, 0))
        set_key("Wing_Outer_L", "rotation_euler", f, rot_xyz(8, 0, 0))
        set_key("Wing_Arm_R", "rotation_euler", f, rot_xyz(10, 0, 0))
        set_key("Wing_Outer_R", "rotation_euler", f, rot_xyz(8, 0, 0))
        set_key("Leg_Front_Upper_L", "rotation_euler", f, rot_xyz(-35, 0, 0))
        set_key("Leg_Front_Upper_R", "rotation_euler", f, rot_xyz(-35, 0, 0))
        set_key("Leg_Rear_Upper_L", "rotation_euler", f, rot_xyz(-45, 0, 0))
        set_key("Leg_Rear_Upper_R", "rotation_euler", f, rot_xyz(-45, 0, 0))
        set_key("Tail_1", "rotation_euler", f, rot_xyz(-4, 0, -6))
        set_key("Tail_2", "rotation_euler", f, rot_xyz(-6, 0, -10))

    set_key("Spine_Main", "location", 25, (0.0, 0.0, 2.7))
    set_key("Wing_Arm_L", "rotation_euler", 25, rot_xyz(-18, 0, 0))
    set_key("Wing_Outer_L", "rotation_euler", 25, rot_xyz(-14, 0, 0))
    set_key("Wing_Arm_R", "rotation_euler", 25, rot_xyz(-18, 0, 0))
    set_key("Wing_Outer_R", "rotation_euler", 25, rot_xyz(-14, 0, 0))
    set_key("Tail_1", "rotation_euler", 25, rot_xyz(-4, 0, 6))
    set_key("Tail_2", "rotation_euler", 25, rot_xyz(-6, 0, 10))
    actions["Flying"] = act

    # 6. LANDING (Flaring wings brake, heavy crouch touchdown)
    act = bpy.data.actions.new("06_Landing")
    act.use_fake_user = True
    arm_obj.animation_data.action = act
    reset_pose()
    set_key("Spine_Main", "location", 1, (0.0, 0.0, 2.0))
    set_key("Spine_Main", "rotation_euler", 1, rot_xyz(10, 0, 0))
    set_key("Wing_Arm_L", "rotation_euler", 1, rot_xyz(20, 0, 0))
    set_key("Wing_Arm_R", "rotation_euler", 1, rot_xyz(20, 0, 0))

    # Air-brake flare
    set_key("Spine_Main", "location", 20, (0.0, 0.0, 1.0))
    set_key("Spine_Main", "rotation_euler", 20, rot_xyz(22, 0, 0))
    set_key("Wing_Arm_L", "rotation_euler", 20, rot_xyz(35, 0, 0))
    set_key("Wing_Arm_R", "rotation_euler", 20, rot_xyz(35, 0, 0))

    # Touchdown impact
    set_key("Spine_Main", "location", 34, (0.0, 0.0, -0.4))
    set_key("Spine_Main", "rotation_euler", 34, rot_xyz(-6, 0, 0))
    set_key("Head", "rotation_euler", 34, rot_xyz(-14, 0, 0))
    set_key("Wing_Arm_L", "rotation_euler", 34, rot_xyz(-25, 0, 0))
    set_key("Wing_Arm_R", "rotation_euler", 34, rot_xyz(-25, 0, 0))
    set_key("Leg_Front_Upper_L", "rotation_euler", 34, rot_xyz(25, 0, 0))
    set_key("Leg_Front_Upper_R", "rotation_euler", 34, rot_xyz(25, 0, 0))

    # Stable recovery
    set_key("Spine_Main", "location", 50, (0.0, 0.0, 0.0))
    set_key("Spine_Main", "rotation_euler", 50, rot_xyz(0, 0, 0))
    set_key("Head", "rotation_euler", 50, rot_xyz(0, 0, 0))
    set_key("Wing_Arm_L", "rotation_euler", 50, rot_xyz(6, 0, 0))
    set_key("Wing_Arm_R", "rotation_euler", 50, rot_xyz(6, 0, 0))
    actions["Landing"] = act

    # 7. ROARING (Rears up high, head held high, jaw gaping wide)
    act = bpy.data.actions.new("07_Roaring")
    act.use_fake_user = True
    arm_obj.animation_data.action = act
    reset_pose()
    set_key("Spine_Main", "location", 1, (0.0, 0.0, 0.0))
    set_key("Spine_Main", "rotation_euler", 1, rot_xyz(0, 0, 0))

    # Crouch preparation
    set_key("Spine_Main", "location", 18, (0.0, 0.0, -0.2))
    set_key("Spine_Main", "rotation_euler", 18, rot_xyz(-5, 0, 0))
    set_key("Head", "rotation_euler", 18, rot_xyz(-10, 0, 0))

    # EPIC REAR UP & ROAR!
    set_key("Spine_Main", "location", 35, (0.0, -0.4, 0.9))
    set_key("Spine_Main", "rotation_euler", 35, rot_xyz(36, 0, 0))
    set_key("Neck_1", "rotation_euler", 35, rot_xyz(12, 0, 0))
    set_key("Neck_2", "rotation_euler", 35, rot_xyz(14, 0, 0))
    set_key("Neck_3", "rotation_euler", 35, rot_xyz(10, 0, 0))
    set_key("Head", "rotation_euler", 35, rot_xyz(-18, 0, 0))
    set_key("Jaw", "rotation_euler", 35, rot_xyz(42, 0, 0))
    set_key("Wing_Arm_L", "rotation_euler", 35, rot_xyz(32, 0, 0))
    set_key("Wing_Outer_L", "rotation_euler", 35, rot_xyz(20, 0, 0))
    set_key("Wing_Arm_R", "rotation_euler", 35, rot_xyz(32, 0, 0))
    set_key("Wing_Outer_R", "rotation_euler", 35, rot_xyz(20, 0, 0))
    set_key("Leg_Front_Upper_L", "rotation_euler", 35, rot_xyz(-35, 0, 15))
    set_key("Leg_Front_Upper_R", "rotation_euler", 35, rot_xyz(-35, 0, -15))

    # Settle back down
    set_key("Spine_Main", "location", 58, (0.0, 0.0, 0.0))
    set_key("Spine_Main", "rotation_euler", 58, rot_xyz(0, 0, 0))
    set_key("Jaw", "rotation_euler", 58, rot_xyz(6, 0, 0))
    set_key("Wing_Arm_L", "rotation_euler", 58, rot_xyz(6, 0, 0))
    set_key("Wing_Arm_R", "rotation_euler", 58, rot_xyz(6, 0, 0))
    set_key("Leg_Front_Upper_L", "rotation_euler", 58, rot_xyz(0, 0, 0))
    set_key("Leg_Front_Upper_R", "rotation_euler", 58, rot_xyz(0, 0, 0))
    actions["Roaring"] = act

    # 8. FIRE-BREATH ATTACK (Coil back, thrust forward, jaw open sweep)
    act = bpy.data.actions.new("08_Fire_Breath")
    act.use_fake_user = True
    arm_obj.animation_data.action = act
    reset_pose()
    set_key("Spine_Main", "location", 1, (0.0, 0.0, 0.0))
    set_key("Head", "rotation_euler", 1, rot_xyz(0, 0, 0))

    # Inhale & coil back
    set_key("Spine_Main", "location", 15, (0.0, -0.2, 0.15))
    set_key("Spine_Main", "rotation_euler", 15, rot_xyz(6, 0, 0))
    set_key("Neck_1", "rotation_euler", 15, rot_xyz(8, 0, 0))
    set_key("Neck_2", "rotation_euler", 15, rot_xyz(12, 0, 0))
    set_key("Head", "rotation_euler", 15, rot_xyz(-14, 0, 0))
    set_key("Jaw", "rotation_euler", 15, rot_xyz(15, 0, 0))

    # Forward thrust & torrent of flame
    set_key("Spine_Main", "location", 24, (0.0, 0.35, -0.1))
    set_key("Spine_Main", "rotation_euler", 24, rot_xyz(-8, 0, -8))
    set_key("Neck_1", "rotation_euler", 24, rot_xyz(-12, 0, -10))
    set_key("Neck_2", "rotation_euler", 24, rot_xyz(-14, 0, -10))
    set_key("Head", "rotation_euler", 24, rot_xyz(18, 0, -12))
    set_key("Jaw", "rotation_euler", 24, rot_xyz(40, 0, 0))

    # Sweeping torrent
    set_key("Spine_Main", "location", 36, (0.0, 0.35, -0.1))
    set_key("Spine_Main", "rotation_euler", 36, rot_xyz(-8, 0, 8))
    set_key("Neck_1", "rotation_euler", 36, rot_xyz(-12, 0, 10))
    set_key("Neck_2", "rotation_euler", 36, rot_xyz(-14, 0, 10))
    set_key("Head", "rotation_euler", 36, rot_xyz(18, 0, 12))
    set_key("Jaw", "rotation_euler", 36, rot_xyz(40, 0, 0))

    # Recovery
    set_key("Spine_Main", "location", 48, (0.0, 0.0, 0.0))
    set_key("Spine_Main", "rotation_euler", 48, rot_xyz(0, 0, 0))
    set_key("Head", "rotation_euler", 48, rot_xyz(0, 0, 0))
    set_key("Jaw", "rotation_euler", 48, rot_xyz(6, 0, 0))
    actions["Fire_Breath"] = act

    # 9. CLAW ATTACK (Raise right claw high, diagonal slash)
    act = bpy.data.actions.new("09_Claw_Attack")
    act.use_fake_user = True
    arm_obj.animation_data.action = act
    reset_pose()
    set_key("Spine_Main", "location", 1, (0.0, 0.0, 0.0))

    # Windup
    set_key("Spine_Main", "location", 14, (0.0, 0.0, 0.2))
    set_key("Spine_Main", "rotation_euler", 14, rot_xyz(12, 10, -15))
    set_key("Leg_Front_Upper_R", "rotation_euler", 14, rot_xyz(-55, 20, -25))
    set_key("Leg_Front_Lower_R", "rotation_euler", 14, rot_xyz(45, 0, 0))
    set_key("Foot_Front_R", "rotation_euler", 14, rot_xyz(-30, 0, 0))

    # Slash!
    set_key("Spine_Main", "location", 22, (0.0, 0.15, -0.15))
    set_key("Spine_Main", "rotation_euler", 22, rot_xyz(-10, -12, 18))
    set_key("Leg_Front_Upper_R", "rotation_euler", 22, rot_xyz(45, -20, 30))
    set_key("Leg_Front_Lower_R", "rotation_euler", 22, rot_xyz(-25, 0, 0))
    set_key("Foot_Front_R", "rotation_euler", 22, rot_xyz(35, 0, 0))

    # Return
    set_key("Spine_Main", "location", 38, (0.0, 0.0, 0.0))
    set_key("Spine_Main", "rotation_euler", 38, rot_xyz(0, 0, 0))
    set_key("Leg_Front_Upper_R", "rotation_euler", 38, rot_xyz(0, 0, 0))
    set_key("Leg_Front_Lower_R", "rotation_euler", 38, rot_xyz(0, 0, 0))
    set_key("Foot_Front_R", "rotation_euler", 38, rot_xyz(0, 0, 0))
    actions["Claw_Attack"] = act

    # 10. GROUND SLAM (Rears up high, slams front paws down)
    act = bpy.data.actions.new("10_Ground_Slam")
    act.use_fake_user = True
    arm_obj.animation_data.action = act
    reset_pose()
    set_key("Spine_Main", "location", 1, (0.0, 0.0, 0.0))

    # Rear up apex
    set_key("Spine_Main", "location", 18, (0.0, 0.0, 1.2))
    set_key("Spine_Main", "rotation_euler", 18, rot_xyz(40, 0, 0))
    set_key("Leg_Front_Upper_L", "rotation_euler", 18, rot_xyz(-60, 0, 10))
    set_key("Leg_Front_Upper_R", "rotation_euler", 18, rot_xyz(-60, 0, -10))
    set_key("Wing_Arm_L", "rotation_euler", 18, rot_xyz(35, 0, 0))
    set_key("Wing_Arm_R", "rotation_euler", 18, rot_xyz(35, 0, 0))

    # Crash impact!
    set_key("Spine_Main", "location", 28, (0.0, 0.0, -0.45))
    set_key("Spine_Main", "rotation_euler", 28, rot_xyz(-15, 0, 0))
    set_key("Leg_Front_Upper_L", "rotation_euler", 28, rot_xyz(30, 0, 0))
    set_key("Leg_Front_Upper_R", "rotation_euler", 28, rot_xyz(30, 0, 0))
    set_key("Wing_Arm_L", "rotation_euler", 28, rot_xyz(-25, 0, 0))
    set_key("Wing_Arm_R", "rotation_euler", 28, rot_xyz(-25, 0, 0))
    set_key("Head", "rotation_euler", 28, rot_xyz(-20, 0, 0))

    # Recover
    set_key("Spine_Main", "location", 48, (0.0, 0.0, 0.0))
    set_key("Spine_Main", "rotation_euler", 48, rot_xyz(0, 0, 0))
    set_key("Leg_Front_Upper_L", "rotation_euler", 48, rot_xyz(0, 0, 0))
    set_key("Leg_Front_Upper_R", "rotation_euler", 48, rot_xyz(0, 0, 0))
    set_key("Wing_Arm_L", "rotation_euler", 48, rot_xyz(6, 0, 0))
    set_key("Wing_Arm_R", "rotation_euler", 48, rot_xyz(6, 0, 0))
    actions["Ground_Slam"] = act

    # 11. TAIL MOVEMENT (Coil and violent 180-degree tail whip)
    act = bpy.data.actions.new("11_Tail_Movement")
    act.use_fake_user = True
    arm_obj.animation_data.action = act
    reset_pose()
    set_key("Tail_1", "rotation_euler", 1, rot_xyz(0, 0, 0))
    set_key("Tail_2", "rotation_euler", 1, rot_xyz(0, 0, 0))

    # Coil right
    set_key("Spine_Hips", "rotation_euler", 14, rot_xyz(0, 0, -8))
    set_key("Tail_1", "rotation_euler", 14, rot_xyz(0, 0, -28))
    set_key("Tail_2", "rotation_euler", 14, rot_xyz(0, 0, -35))
    set_key("Tail_3", "rotation_euler", 14, rot_xyz(0, 0, -42))
    set_key("Tail_4", "rotation_euler", 14, rot_xyz(0, 0, -45))

    # Whip to left!
    set_key("Spine_Hips", "rotation_euler", 24, rot_xyz(0, 0, 10))
    set_key("Tail_1", "rotation_euler", 24, rot_xyz(0, 0, 32))
    set_key("Tail_2", "rotation_euler", 24, rot_xyz(0, 0, 42))
    set_key("Tail_3", "rotation_euler", 24, rot_xyz(0, 0, 50))
    set_key("Tail_4", "rotation_euler", 24, rot_xyz(0, 0, 55))

    # Recoil
    set_key("Spine_Hips", "rotation_euler", 42, rot_xyz(0, 0, 0))
    set_key("Tail_1", "rotation_euler", 42, rot_xyz(0, 0, 0))
    set_key("Tail_2", "rotation_euler", 42, rot_xyz(0, 0, 0))
    set_key("Tail_3", "rotation_euler", 42, rot_xyz(0, 0, 0))
    set_key("Tail_4", "rotation_euler", 42, rot_xyz(0, 0, 0))
    actions["Tail_Movement"] = act

    # Set Idle as default
    arm_obj.animation_data.action = actions["Idle_Breathing"]
    print("All 11 boss animations created successfully.")
    return actions

# -------------------------------------------------------------------------
# Studio Lighting, Camera & Stage Showcase
# -------------------------------------------------------------------------
def setup_showcase():
    col = bpy.data.collections.new("00_Lighting_And_Stage")
    bpy.context.scene.collection.children.link(col)

    # Minecraft Arena Floor Platform
    floor_mat = bpy.data.materials.new("Mat_Arena_Stone")
    bsdf = floor_mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.07, 0.07, 0.08, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.85

    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=20.0, depth=0.4, location=(0.0, 0.0, -0.2))
    floor = bpy.context.active_object
    floor.name = "Boss_Arena_Platform"
    floor.data.materials.append(floor_mat)
    for c in list(floor.users_collection):
        c.objects.unlink(floor)
    col.objects.link(floor)

    # Focus Target Empty for Camera
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0.0, 1.8, 3.2))
    target = bpy.context.active_object
    target.name = "Camera_Boss_Target"
    for c in list(target.users_collection):
        c.objects.unlink(target)
    col.objects.link(target)

    # Camera - Imposing 3/4 Front-Side View
    cam_data = bpy.data.cameras.new("Boss_Camera")
    cam_data.lens = 32
    cam_data.clip_end = 250.0
    cam_obj = bpy.data.objects.new("Boss_Camera", cam_data)
    cam_obj.location = (-15.5, 14.5, 6.2)
    col.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj

    # Constrain Camera to Track the Target
    tt = cam_obj.constraints.new(type='TRACK_TO')
    tt.target = target
    tt.track_axis = 'TRACK_NEGATIVE_Z'
    tt.up_axis = 'UP_Y'

    # Key Sun Light (Warm dramatic boss sunlight)
    key_light = bpy.data.lights.new(name="Key_Light", type='SUN')
    key_light.energy = 4.8
    key_light.color = (1.0, 0.94, 0.88)
    key_obj = bpy.data.objects.new("Key_Light", key_light)
    key_obj.location = (-12.0, 10.0, 16.0)
    key_obj.rotation_euler = (math.radians(45), math.radians(-25), math.radians(-40))
    col.objects.link(key_obj)

    # Rim / Back Light (Fiery orange-red rim light)
    rim_light = bpy.data.lights.new(name="Rim_Light", type='SUN')
    rim_light.energy = 6.2
    rim_light.color = (1.0, 0.40, 0.12)
    rim_obj = bpy.data.objects.new("Rim_Light", rim_light)
    rim_obj.location = (14.0, -14.0, 15.0)
    rim_obj.rotation_euler = (math.radians(-50), math.radians(35), math.radians(135))
    col.objects.link(rim_obj)

    # Fill / Under Light (Crimson ambiance)
    fill_light = bpy.data.lights.new(name="Fill_Light", type='POINT')
    fill_light.energy = 950.0
    fill_light.color = (0.75, 0.12, 0.18)
    fill_obj = bpy.data.objects.new("Fill_Light", fill_light)
    fill_obj.location = (0.0, 3.5, 1.2)
    col.objects.link(fill_obj)

# -------------------------------------------------------------------------
# Main Execution Flow
# -------------------------------------------------------------------------
def main():
    print("--- Starting Red Dragon Boss Generation ---")
    clear_all()
    mats = create_materials()
    arm_obj = build_dragon_rig()
    build_dragon_geometry(arm_obj, mats)
    create_boss_animations(arm_obj)
    setup_showcase()

    scene = bpy.context.scene
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.film_transparent = False

    # Choose a heroic, intimidating pose for the preview render
    arm_obj.animation_data.action = bpy.data.actions["01_Idle_Breathing"]
    scene.frame_set(1)

    # Save Blend file
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
    print(f"Blend file saved to: {BLEND_PATH}")

    # Render Preview Image
    scene.render.filepath = RENDER_PATH
    bpy.ops.render.render(write_still=True)
    print(f"Render saved to: {RENDER_PATH}")

    print("--- Red Dragon Boss Generation Finished Successfully ---")

if __name__ == "__main__":
    main()
