import bpy
import math
import os

OUTPUT_DIR = r"c:\Users\npal7\OneDrive\PROJECT\project1\two_headed_black_dragon"
os.makedirs(OUTPUT_DIR, exist_ok=True)
BLEND_PATH = os.path.join(OUTPUT_DIR, "two_headed_black_dragon.blend")
RENDER_PATH = os.path.join(OUTPUT_DIR, "two_headed_black_dragon_render.png")
GLB_PATH = os.path.join(OUTPUT_DIR, "two_headed_black_dragon.glb")

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
# Materials (Black Dragon Boss Voxel Palette)
# -------------------------------------------------------------------------
def create_materials():
    mats = {}

    # 1. Primary Black Hide (Deep pitch-black boss scales)
    m = bpy.data.materials.new("Mat_Dragon_Black")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.04, 0.04, 0.045, 1.0)
    b.inputs["Roughness"].default_value = 0.55
    mats["Black"] = m

    # 2. Dark Charcoal Slate (Shoulders, joints, spine crest base, wing spars)
    m = bpy.data.materials.new("Mat_Dragon_Charcoal")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.09, 0.09, 0.10, 1.0)
    b.inputs["Roughness"].default_value = 0.48
    mats["Charcoal"] = m

    # 3. Obsidian Belly & Ventral Under-plates (Deep black-maroon obsidian for depth)
    m = bpy.data.materials.new("Mat_Dragon_ObsidianBelly")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.02, 0.02, 0.025, 1.0)
    b.inputs["Roughness"].default_value = 0.65
    mats["ObsidianBelly"] = m

    # 4. Horns & Neck/Back Spikes (Charred black obsidian bone with slight sheen)
    m = bpy.data.materials.new("Mat_Dragon_DarkHorns")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.06, 0.055, 0.065, 1.0)
    b.inputs["Roughness"].default_value = 0.35
    mats["Horns"] = m

    # 5. Glowing Fiery Red/Orange Eyes (Menacing Boss Glow)
    m = bpy.data.materials.new("Mat_Dragon_EyeGlow")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (1.0, 0.22, 0.02, 1.0)
    b.inputs["Roughness"].default_value = 0.10
    if "Emission Color" in b.inputs:
        b.inputs["Emission Color"].default_value = (1.0, 0.22, 0.02, 1.0)
        b.inputs["Emission Strength"].default_value = 8.0
    elif "Emission" in b.inputs:
        b.inputs["Emission"].default_value = (1.0, 0.22, 0.02, 1.0)
    mats["EyeGlow"] = m

    # 6. Eye Slit Pupil
    m = bpy.data.materials.new("Mat_Dragon_Pupil")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.005, 0.005, 0.005, 1.0)
    b.inputs["Roughness"].default_value = 0.2
    mats["Pupil"] = m

    # 7. Teeth & Claws (Sharp Aged Ivory Bone)
    m = bpy.data.materials.new("Mat_Dragon_Ivory")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.86, 0.82, 0.70, 1.0)
    b.inputs["Roughness"].default_value = 0.32
    mats["Ivory"] = m

    # 8. Wing Membrane Top (Charcoal-black leathery membrane)
    m = bpy.data.materials.new("Mat_Dragon_WingMembrane")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.065, 0.065, 0.075, 1.0)
    b.inputs["Roughness"].default_value = 0.60
    mats["WingMembrane"] = m

    # 9. Wing Membrane Underside (Darker for depth)
    m = bpy.data.materials.new("Mat_Dragon_WingUnder")
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.025, 0.025, 0.03, 1.0)
    b.inputs["Roughness"].default_value = 0.72
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
# Build Armature Rig with Two Independent Long Neck Chains
# -------------------------------------------------------------------------
def build_two_headed_rig():
    arm_data = bpy.data.armatures.new("TwoHeaded_Dragon_Rig_Data")
    arm_obj = bpy.data.objects.new("TwoHeaded_Dragon_Rig", arm_data)
    bpy.context.scene.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_data.edit_bones

    # Root Bone
    root = eb.new("Root")
    root.head = (0.0, 0.0, 0.0)
    root.tail = (0.0, 0.0, 1.0)

    # Spine Main (Broad heavy chest to support both long necks)
    spine = eb.new("Spine_Main")
    spine.head = (0.0, -0.4, 3.4)
    spine.tail = (0.0, 1.8, 3.6)
    spine.parent = root

    # Spine Hips (Pelvis & Rear)
    hips = eb.new("Spine_Hips")
    hips.head = (0.0, -0.4, 3.4)
    hips.tail = (0.0, -2.2, 3.2)
    hips.parent = spine

    # TWO VERY LONG NECKS (5 segments each, branching outward and rising high)
    # Left Neck Chain (sign = -1.0)
    # Right Neck Chain (sign = 1.0)
    neck_coords = [
        # (head_pt, tail_pt)
        ((1.0, 1.8, 3.6), (1.4, 2.5, 4.4)),   # Neck 1 (branches out from chest)
        ((1.4, 2.5, 4.4), (1.8, 3.1, 5.3)),   # Neck 2 (rising & arching outward)
        ((1.8, 3.1, 5.3), (1.8, 3.7, 6.2)),   # Neck 3 (ascending high)
        ((1.8, 3.7, 6.2), (1.6, 4.4, 7.0)),   # Neck 4 (arching forward)
        ((1.6, 4.4, 7.0), (1.4, 5.0, 7.5)),   # Neck 5 (upper neck reaching head)
    ]

    for side, sign in [("L", -1.0), ("R", 1.0)]:
        prev_bone = spine
        for i, (hp, tp) in enumerate(neck_coords):
            n_bone = eb.new(f"Neck_{side}_{i+1}")
            n_bone.head = (sign * hp[0], hp[1], hp[2])
            n_bone.tail = (sign * tp[0], tp[1], tp[2])
            n_bone.parent = prev_bone
            prev_bone = n_bone

        # Head Bone (starts at neck tip, points forward)
        head_bone = eb.new(f"Head_{side}")
        head_bone.head = (sign * 1.4, 4.8, 7.5)
        head_bone.tail = (sign * 1.4, 7.2, 7.5)
        head_bone.parent = prev_bone

        # Jaw Bone (hinged below head)
        jaw_bone = eb.new(f"Jaw_{side}")
        jaw_bone.head = (sign * 1.4, 5.5, 7.1)
        jaw_bone.tail = (sign * 1.4, 7.2, 6.9)
        jaw_bone.parent = head_bone

    # Tail Chain (5 clean tapering segments)
    tail_coords = [
        ((0.0, -2.2, 3.2), (0.0, -3.8, 2.9)),
        ((0.0, -3.8, 2.9), (0.0, -5.4, 2.6)),
        ((0.0, -5.4, 2.6), (0.0, -7.0, 2.3)),
        ((0.0, -7.0, 2.3), (0.0, -8.6, 2.0)),
        ((0.0, -8.6, 2.0), (0.0, -10.4, 1.7)),
    ]
    prev_tail = hips
    for i, (hp, tp) in enumerate(tail_coords):
        tb = eb.new(f"Tail_{i+1}")
        tb.head = hp
        tb.tail = tp
        tb.parent = prev_tail
        prev_tail = tb

    # Wings (Left & Right - Massive Boss Wingspan)
    for side, sign in [("L", -1.0), ("R", 1.0)]:
        w_sh = eb.new(f"Wing_Shoulder_{side}")
        w_sh.head = (sign * 1.4, 0.4, 4.0)
        w_sh.tail = (sign * 3.2, 0.2, 4.8)
        w_sh.parent = spine

        w_arm = eb.new(f"Wing_Arm_{side}")
        w_arm.head = (sign * 3.2, 0.2, 4.8)
        w_arm.tail = (sign * 6.8, -0.6, 5.6)
        w_arm.parent = w_sh

        w_out = eb.new(f"Wing_Outer_{side}")
        w_out.head = (sign * 6.8, -0.6, 5.6)
        w_out.tail = (sign * 10.2, -1.6, 6.2)
        w_out.parent = w_arm

    # Front Legs (Left & Right)
    for side, sign in [("L", -1.0), ("R", 1.0)]:
        fl_up = eb.new(f"Leg_Front_Upper_{side}")
        fl_up.head = (sign * 1.8, 1.2, 3.3)
        fl_up.tail = (sign * 2.0, 1.1, 1.8)
        fl_up.parent = spine

        fl_low = eb.new(f"Leg_Front_Lower_{side}")
        fl_low.head = (sign * 2.0, 1.1, 1.8)
        fl_low.tail = (sign * 2.0, 1.0, 0.6)
        fl_low.parent = fl_up

        fl_foot = eb.new(f"Foot_Front_{side}")
        fl_foot.head = (sign * 2.0, 1.0, 0.6)
        fl_foot.tail = (sign * 2.0, 1.8, 0.0)
        fl_foot.parent = fl_low

    # Rear Legs (Left & Right)
    for side, sign in [("L", -1.0), ("R", 1.0)]:
        rl_up = eb.new(f"Leg_Rear_Upper_{side}")
        rl_up.head = (sign * 1.9, -1.8, 3.2)
        rl_up.tail = (sign * 2.1, -2.1, 1.8)
        rl_up.parent = hips

        rl_low = eb.new(f"Leg_Rear_Lower_{side}")
        rl_low.head = (sign * 2.1, -2.1, 1.8)
        rl_low.tail = (sign * 2.1, -1.9, 0.6)
        rl_low.parent = rl_up

        rl_foot = eb.new(f"Foot_Rear_{side}")
        rl_foot.head = (sign * 2.1, -1.9, 0.6)
        rl_foot.tail = (sign * 2.1, -1.2, 0.0)
        rl_foot.parent = rl_low

    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in arm_obj.pose.bones:
        pb.rotation_mode = 'XYZ'

    return arm_obj

# -------------------------------------------------------------------------
# Build Geometry Objects (Organized in Collections)
# -------------------------------------------------------------------------
def build_two_headed_geometry(arm_obj, mats):
    c_heads = bpy.data.collections.new("01_Heads_And_Necks")
    c_body = bpy.data.collections.new("02_Body_And_Spikes")
    c_wings = bpy.data.collections.new("03_Wings")
    c_legs = bpy.data.collections.new("04_Legs_And_Claws")
    c_tail = bpy.data.collections.new("05_Tail")

    bpy.context.scene.collection.children.link(c_heads)
    bpy.context.scene.collection.children.link(c_body)
    bpy.context.scene.collection.children.link(c_wings)
    bpy.context.scene.collection.children.link(c_legs)
    bpy.context.scene.collection.children.link(c_tail)

    # 1. BODY & UNDERBELLY (Massive heavy torso supporting two necks)
    body_main = create_block("Dragon_Body_Main", (0.0, 0.7, 3.5), (3.1, 2.9, 2.2), mats["Black"], c_body)
    bind_to_bone(body_main, arm_obj, "Spine_Main")

    belly_main = create_block("Dragon_Body_Underbelly", (0.0, 0.7, 2.3), (2.5, 3.0, 0.35), mats["ObsidianBelly"], c_body)
    bind_to_bone(belly_main, arm_obj, "Spine_Main")

    hips_main = create_block("Dragon_Body_Hips", (0.0, -1.3, 3.3), (2.7, 2.1, 2.0), mats["Black"], c_body)
    bind_to_bone(hips_main, arm_obj, "Spine_Hips")

    belly_hips = create_block("Dragon_Hips_Underbelly", (0.0, -1.3, 2.2), (2.1, 2.2, 0.30), mats["ObsidianBelly"], c_body)
    bind_to_bone(belly_hips, arm_obj, "Spine_Hips")

    # Dorsal Spikes along Upper & Mid Back
    for s_idx, (y_pos, z_pos, h, deg_x) in enumerate([
        (1.8, 4.9, 1.25, 6),
        (0.9, 5.0, 1.40, 2),
        (0.0, 4.85, 1.25, -4),
        (-1.1, 4.55, 1.05, -10),
    ]):
        spk = create_spike(f"Dragon_Spike_Back_{s_idx+1}", (0.0, y_pos, z_pos), 0.42, h, mats["Horns"], c_body, rot_deg=(deg_x, 0, 0))
        target_bone = "Spine_Main" if s_idx < 3 else "Spine_Hips"
        bind_to_bone(spk, arm_obj, target_bone)

    # 2. TWO VERY LONG NECKS (5 Segments each + 5 Sharp Spikes each)
    neck_geom_specs = [
        # (center_loc, size, spike_loc, spike_height, spike_rot)
        ((1.2, 2.15, 4.0), (1.3, 1.1, 1.2), (1.2, 2.15, 4.8), 0.85, (14, 0, 0)),
        ((1.6, 2.80, 4.85), (1.2, 1.05, 1.15), (1.6, 2.80, 5.65), 0.90, (20, 0, 0)),
        ((1.8, 3.40, 5.75), (1.15, 1.0, 1.1), (1.8, 3.40, 6.55), 0.95, (25, 0, 0)),
        ((1.7, 4.05, 6.60), (1.1, 0.95, 1.05), (1.7, 4.05, 7.35), 0.90, (28, 0, 0)),
        ((1.5, 4.70, 7.25), (1.05, 0.9, 1.0), (1.5, 4.70, 7.95), 0.85, (30, 0, 0)),
    ]

    for side, sign in [("L", -1.0), ("R", 1.0)]:
        for i, (center, sz, spk_pt, spk_h, spk_rot) in enumerate(neck_geom_specs):
            # Neck block
            n_block = create_block(
                f"Dragon_Neck_{side}_{i+1}",
                (sign * center[0], center[1], center[2]),
                sz,
                mats["Black"],
                c_heads,
                rot_deg=(spk_rot[0] * 0.4, sign * 8, 0)
            )
            bind_to_bone(n_block, arm_obj, f"Neck_{side}_{i+1}")

            # Ventral under-plate
            n_under = create_block(
                f"Dragon_Neck_Under_{side}_{i+1}",
                (sign * center[0], center[1], center[2] - sz[2]*0.52),
                (sz[0]*0.8, sz[1]*1.02, 0.18),
                mats["ObsidianBelly"],
                c_heads,
                rot_deg=(spk_rot[0] * 0.4, sign * 8, 0)
            )
            bind_to_bone(n_under, arm_obj, f"Neck_{side}_{i+1}")

            # Sharp spine on back of neck
            n_spk = create_spike(
                f"Dragon_Neck_Spike_{side}_{i+1}",
                (sign * spk_pt[0], spk_pt[1], spk_pt[2]),
                0.28,
                spk_h,
                mats["Horns"],
                c_heads,
                rot_deg=(spk_rot[0], sign * 10, 0)
            )
            bind_to_bone(n_spk, arm_obj, f"Neck_{side}_{i+1}")

    # 3. TWO DISTINCT HEADS (Left Head & Right Head with customized features)
    # Left Head: Aggressive, fierce brow, swept horns with wider splay
    # Right Head: High-arching horns, sharp menacing snarl
    for side, sign in [("L", -1.0), ("R", 1.0)]:
        hx = sign * 1.5
        hy = 5.6
        hz = 7.8

        # Skull
        skull = create_block(f"Dragon_Head_Skull_{side}", (hx, hy, hz), (1.55, 1.4, 1.15), mats["Black"], c_heads)
        bind_to_bone(skull, arm_obj, f"Head_{side}")

        # Snout
        snout = create_block(f"Dragon_Head_Snout_{side}", (hx, hy + 1.25, hz - 0.25), (1.25, 1.5, 0.8), mats["Black"], c_heads)
        bind_to_bone(snout, arm_obj, f"Head_{side}")

        # Nostrils
        n_l = create_block(f"Dragon_Nostril_{side}_1", (hx - 0.28, hy + 2.0, hz), (0.18, 0.14, 0.18), mats["ObsidianBelly"], c_heads)
        bind_to_bone(n_l, arm_obj, f"Head_{side}")
        n_r = create_block(f"Dragon_Nostril_{side}_2", (hx + 0.28, hy + 2.0, hz), (0.18, 0.14, 0.18), mats["ObsidianBelly"], c_heads)
        bind_to_bone(n_r, arm_obj, f"Head_{side}")

        # Brow Ridges (Distinct angle for Left vs Right)
        brow_rot = (6, sign * 14, 0) if side == "L" else (4, sign * 8, 0)
        brow_l = create_block(f"Dragon_Brow_{side}_L", (hx - 0.65, hy + 0.35, hz + 0.38), (0.34, 0.95, 0.26), mats["Charcoal"], c_heads, rot_deg=brow_rot)
        bind_to_bone(brow_l, arm_obj, f"Head_{side}")
        brow_r = create_block(f"Dragon_Brow_{side}_R", (hx + 0.65, hy + 0.35, hz + 0.38), (0.34, 0.95, 0.26), mats["Charcoal"], c_heads, rot_deg=(brow_rot[0], -brow_rot[1], 0))
        bind_to_bone(brow_r, arm_obj, f"Head_{side}")

        # Glowing Fiery Red/Orange Eyes with Slit Pupil
        eye_l = create_block(f"Dragon_Eye_{side}_L", (hx - 0.76, hy + 0.35, hz + 0.10), (0.12, 0.44, 0.26), mats["EyeGlow"], c_heads)
        bind_to_bone(eye_l, arm_obj, f"Head_{side}")
        pup_l = create_block(f"Dragon_Pupil_{side}_L", (hx - 0.79, hy + 0.35, hz + 0.10), (0.08, 0.13, 0.24), mats["Pupil"], c_heads)
        bind_to_bone(pup_l, arm_obj, f"Head_{side}")

        eye_r = create_block(f"Dragon_Eye_{side}_R", (hx + 0.76, hy + 0.35, hz + 0.10), (0.12, 0.44, 0.26), mats["EyeGlow"], c_heads)
        bind_to_bone(eye_r, arm_obj, f"Head_{side}")
        pup_r = create_block(f"Dragon_Pupil_{side}_R", (hx + 0.79, hy + 0.35, hz + 0.10), (0.08, 0.13, 0.24), mats["Pupil"], c_heads)
        bind_to_bone(pup_r, arm_obj, f"Head_{side}")

        # Two Large Horns on each head (Total 4 horns!)
        # Left head horns splay slightly wider; Right head horns arch slightly higher
        h_splay = 18.0 if side == "L" else 12.0
        h_arch = 28.0 if side == "L" else 35.0

        for h_side, h_sign in [("1", -1.0), ("2", 1.0)]:
            # Horn Base
            hb = create_block(
                f"Dragon_Horn_{side}_Base_{h_side}",
                (hx + h_sign * 0.58, hy - 0.35, hz + 0.65),
                (0.38, 0.46, 0.50),
                mats["Horns"],
                c_heads,
                rot_deg=(h_arch, h_sign * h_splay, h_sign * 6)
            )
            bind_to_bone(hb, arm_obj, f"Head_{side}")

            # Horn Mid
            hm = create_block(
                f"Dragon_Horn_{side}_Mid_{h_side}",
                (hx + h_sign * 0.70, hy - 0.75, hz + 1.15),
                (0.32, 0.42, 0.55),
                mats["Horns"],
                c_heads,
                rot_deg=(h_arch + 14, h_sign * (h_splay + 4), h_sign * 8)
            )
            bind_to_bone(hm, arm_obj, f"Head_{side}")

            # Horn Tip
            ht = create_block(
                f"Dragon_Horn_{side}_Tip_{h_side}",
                (hx + h_sign * 0.82, hy - 1.20, hz + 1.70),
                (0.25, 0.36, 0.65),
                mats["Horns"],
                c_heads,
                rot_deg=(h_arch + 26, h_sign * (h_splay + 8), h_sign * 10)
            )
            bind_to_bone(ht, arm_obj, f"Head_{side}")

            # Horn End Spike
            he = create_spike(
                f"Dragon_Horn_{side}_Spike_{h_side}",
                (hx + h_sign * 0.92, hy - 1.60, hz + 2.15),
                0.16,
                0.50,
                mats["Horns"],
                c_heads,
                rot_deg=(h_arch + 26, h_sign * (h_splay + 8), h_sign * 10)
            )
            bind_to_bone(he, arm_obj, f"Head_{side}")

        # Upper Teeth (Sharp ivory fangs)
        for t_side, t_sign in [("1", -1.0), ("2", 1.0)]:
            t1 = create_spike(f"Dragon_Fang_Upper_{side}_{t_side}_1", (hx + t_sign * 0.48, hy + 1.75, hz - 0.70), 0.13, 0.38, mats["Ivory"], c_heads, rot_deg=(180, 0, 0))
            bind_to_bone(t1, arm_obj, f"Head_{side}")
            t2 = create_spike(f"Dragon_Fang_Upper_{side}_{t_side}_2", (hx + t_sign * 0.54, hy + 1.25, hz - 0.68), 0.11, 0.30, mats["Ivory"], c_heads, rot_deg=(180, 0, 0))
            bind_to_bone(t2, arm_obj, f"Head_{side}")
            t3 = create_spike(f"Dragon_Fang_Upper_{side}_{t_side}_3", (hx + t_sign * 0.58, hy + 0.75, hz - 0.65), 0.10, 0.26, mats["Ivory"], c_heads, rot_deg=(180, 0, 0))
            bind_to_bone(t3, arm_obj, f"Head_{side}")

        # JAW & LOWER TEETH
        jaw_main = create_block(f"Dragon_Jaw_Main_{side}", (hx, hy + 0.90, hz - 0.85), (1.15, 1.6, 0.38), mats["Black"], c_heads)
        bind_to_bone(jaw_main, arm_obj, f"Jaw_{side}")

        jaw_under = create_block(f"Dragon_Jaw_Under_{side}", (hx, hy + 0.90, hz - 1.08), (0.95, 1.62, 0.16), mats["ObsidianBelly"], c_heads)
        bind_to_bone(jaw_under, arm_obj, f"Jaw_{side}")

        chin_spur = create_spike(f"Dragon_Chin_Spur_{side}", (hx, hy + 1.60, hz - 1.25), 0.16, 0.42, mats["Horns"], c_heads, rot_deg=(170, 0, 0))
        bind_to_bone(chin_spur, arm_obj, f"Jaw_{side}")

        for t_side, t_sign in [("1", -1.0), ("2", 1.0)]:
            t_low1 = create_spike(f"Dragon_Fang_Lower_{side}_{t_side}_1", (hx + t_sign * 0.44, hy + 1.65, hz - 0.58), 0.12, 0.34, mats["Ivory"], c_heads)
            bind_to_bone(t_low1, arm_obj, f"Jaw_{side}")
            t_low2 = create_spike(f"Dragon_Fang_Lower_{side}_{t_side}_2", (hx + t_sign * 0.48, hy + 1.15, hz - 0.60), 0.10, 0.28, mats["Ivory"], c_heads)
            bind_to_bone(t_low2, arm_obj, f"Jaw_{side}")

    # 4. TAIL (Simple, long, uncluttered, iconic dragon spade fin)
    tail_sizes = [
        ((0.0, -3.0, 3.05), (1.5, 1.6, 1.4)),
        ((0.0, -4.6, 2.75), (1.2, 1.6, 1.15)),
        ((0.0, -6.2, 2.45), (0.95, 1.6, 0.9)),
        ((0.0, -7.8, 2.15), (0.7, 1.6, 0.7)),
        ((0.0, -9.5, 1.85), (0.5, 1.8, 0.5)),
    ]
    for i, (loc, sz) in enumerate(tail_sizes):
        tb = create_block(f"Dragon_Tail_{i+1}", loc, sz, mats["Black"], c_tail)
        bind_to_bone(tb, arm_obj, f"Tail_{i+1}")

        tu = create_block(f"Dragon_Tail_Under_{i+1}", (loc[0], loc[1], loc[2] - sz[2]*0.52), (sz[0]*0.8, sz[1]*1.02, 0.18), mats["ObsidianBelly"], c_tail)
        bind_to_bone(tu, arm_obj, f"Tail_{i+1}")

    # Clean Dragon Tail Spade Fin at tip
    tail_blade_h = create_block("Dragon_Tail_Blade_H", (0.0, -10.5, 1.85), (1.8, 1.1, 0.14), mats["Charcoal"], c_tail)
    bind_to_bone(tail_blade_h, arm_obj, "Tail_5")
    tail_blade_v = create_block("Dragon_Tail_Blade_V", (0.0, -10.5, 1.85), (0.14, 1.1, 1.3), mats["Horns"], c_tail)
    bind_to_bone(tail_blade_v, arm_obj, "Tail_5")

    # 5. FOUR LARGE POWERFUL LEGS WITH SHARP CLAWS
    for side, sign in [("L", -1.0), ("R", 1.0)]:
        # Front Legs
        f_up = create_block(f"Dragon_Leg_Front_Upper_{side}", (sign * 1.9, 1.15, 2.55), (1.0, 1.1, 1.5), mats["Charcoal"], c_legs)
        bind_to_bone(f_up, arm_obj, f"Leg_Front_Upper_{side}")

        f_low = create_block(f"Dragon_Leg_Front_Lower_{side}", (sign * 2.0, 1.05, 1.2), (0.85, 0.95, 1.4), mats["Black"], c_legs)
        bind_to_bone(f_low, arm_obj, f"Leg_Front_Lower_{side}")

        f_foot = create_block(f"Dragon_Foot_Front_{side}", (sign * 2.0, 1.25, 0.3), (1.2, 1.4, 0.5), mats["Black"], c_legs)
        bind_to_bone(f_foot, arm_obj, f"Foot_Front_{side}")

        for c_idx, ox in enumerate([-0.35, 0.0, 0.35]):
            claw = create_spike(f"Dragon_Claw_Front_{side}_{c_idx+1}", (sign * 2.0 + ox, 2.0, 0.18), 0.14, 0.46, mats["Ivory"], c_legs, rot_deg=(90, 0, 0))
            bind_to_bone(claw, arm_obj, f"Foot_Front_{side}")

        # Rear Legs
        r_up = create_block(f"Dragon_Leg_Rear_Upper_{side}", (sign * 2.0, -1.95, 2.5), (1.2, 1.4, 1.6), mats["Charcoal"], c_legs)
        bind_to_bone(r_up, arm_obj, f"Leg_Rear_Upper_{side}")

        r_low = create_block(f"Dragon_Leg_Rear_Lower_{side}", (sign * 2.1, -2.0, 1.2), (0.95, 1.1, 1.4), mats["Black"], c_legs)
        bind_to_bone(r_low, arm_obj, f"Leg_Rear_Lower_{side}")

        r_foot = create_block(f"Dragon_Foot_Rear_{side}", (sign * 2.1, -1.55, 0.3), (1.3, 1.5, 0.52), mats["Black"], c_legs)
        bind_to_bone(r_foot, arm_obj, f"Foot_Rear_{side}")

        for c_idx, ox in enumerate([-0.38, 0.0, 0.38]):
            claw = create_spike(f"Dragon_Claw_Rear_{side}_{c_idx+1}", (sign * 2.1 + ox, -0.75, 0.18), 0.15, 0.48, mats["Ivory"], c_legs, rot_deg=(90, 0, 0))
            bind_to_bone(claw, arm_obj, f"Foot_Rear_{side}")

    # 6. LARGE WINGS (Minecraft blocky strut & membrane architecture)
    for side, sign in [("L", -1.0), ("R", 1.0)]:
        w_sh = create_block(f"Dragon_Wing_Joint_{side}", (sign * 2.3, 0.3, 4.4), (0.85, 0.85, 0.85), mats["Charcoal"], c_wings)
        bind_to_bone(w_sh, arm_obj, f"Wing_Shoulder_{side}")

        w_spar_in = create_block(f"Dragon_Wing_Spar_Inner_{side}", (sign * 5.0, 0.0, 5.2), (3.8, 0.6, 0.6), mats["Charcoal"], c_wings, rot_deg=(0, sign * -12, sign * 8))
        bind_to_bone(w_spar_in, arm_obj, f"Wing_Arm_{side}")

        w_mem_in = create_block(f"Dragon_Wing_Membrane_In_{side}", (sign * 4.9, -1.2, 4.2), (3.6, 2.5, 0.14), mats["WingMembrane"], c_wings, rot_deg=(-42, sign * -10, sign * 8))
        bind_to_bone(w_mem_in, arm_obj, f"Wing_Arm_{side}")

        w_mem_in_u = create_block(f"Dragon_Wing_Under_In_{side}", (sign * 4.9, -1.2, 4.12), (3.5, 2.45, 0.06), mats["WingUnder"], c_wings, rot_deg=(-42, sign * -10, sign * 8))
        bind_to_bone(w_mem_in_u, arm_obj, f"Wing_Arm_{side}")

        w_spar_out = create_block(f"Dragon_Wing_Spar_Outer_{side}", (sign * 8.6, -0.9, 5.9), (3.6, 0.5, 0.5), mats["Charcoal"], c_wings, rot_deg=(0, sign * -8, sign * 14))
        bind_to_bone(w_spar_out, arm_obj, f"Wing_Outer_{side}")

        w_mem_out = create_block(f"Dragon_Wing_Membrane_Out_{side}", (sign * 8.5, -2.2, 4.8), (3.4, 2.6, 0.12), mats["WingMembrane"], c_wings, rot_deg=(-40, sign * -8, sign * 14))
        bind_to_bone(w_mem_out, arm_obj, f"Wing_Outer_{side}")

        w_mem_out_u = create_block(f"Dragon_Wing_Under_Out_{side}", (sign * 8.5, -2.2, 4.72), (3.3, 2.55, 0.06), mats["WingUnder"], c_wings, rot_deg=(-40, sign * -8, sign * 14))
        bind_to_bone(w_mem_out_u, arm_obj, f"Wing_Outer_{side}")

        w_finger1 = create_block(f"Dragon_Wing_Finger_1_{side}", (sign * 6.8, -2.2, 4.5), (0.35, 2.6, 0.35), mats["Horns"], c_wings, rot_deg=(-42, sign * -10, sign * 5))
        bind_to_bone(w_finger1, arm_obj, f"Wing_Arm_{side}")

        w_finger2 = create_block(f"Dragon_Wing_Finger_2_{side}", (sign * 10.2, -2.5, 4.9), (0.28, 2.4, 0.28), mats["Horns"], c_wings, rot_deg=(-40, sign * -8, sign * 15))
        bind_to_bone(w_finger2, arm_obj, f"Wing_Outer_{side}")

    print("All two-headed dragon geometry created and parented.")

# -------------------------------------------------------------------------
# The 14 Boss Animations
# -------------------------------------------------------------------------
def create_two_headed_animations(arm_obj):
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

    # 1. IDLE BREATHING (Both long necks sway subtly in offset harmony)
    act = bpy.data.actions.new("01_Idle_Breathing")
    act.use_fake_user = True
    arm_obj.animation_data.action = act
    reset_pose()
    for f in [1, 40]:
        set_key("Spine_Main", "location", f, (0.0, 0.0, 0.0))
        set_key("Spine_Main", "rotation_euler", f, rot_xyz(0, 0, 0))
        set_key("Neck_L_1", "rotation_euler", f, rot_xyz(0, 0, 2))
        set_key("Neck_L_3", "rotation_euler", f, rot_xyz(0, 0, 4))
        set_key("Head_L", "rotation_euler", f, rot_xyz(-2, -4, 4))
        set_key("Jaw_L", "rotation_euler", f, rot_xyz(6, 0, 0))

        set_key("Neck_R_1", "rotation_euler", f, rot_xyz(0, 0, -2))
        set_key("Neck_R_3", "rotation_euler", f, rot_xyz(0, 0, -4))
        set_key("Head_R", "rotation_euler", f, rot_xyz(2, 4, -4))
        set_key("Jaw_R", "rotation_euler", f, rot_xyz(8, 0, 0))

        set_key("Tail_1", "rotation_euler", f, rot_xyz(0, 0, 8))
        set_key("Tail_3", "rotation_euler", f, rot_xyz(0, 0, 16))
        set_key("Tail_5", "rotation_euler", f, rot_xyz(0, 0, 24))
        set_key("Wing_Arm_L", "rotation_euler", f, rot_xyz(14, 0, 0))
        set_key("Wing_Arm_R", "rotation_euler", f, rot_xyz(14, 0, 0))

    # Mid breath
    set_key("Spine_Main", "location", 20, (0.0, 0.0, 0.08))
    set_key("Spine_Main", "rotation_euler", 20, rot_xyz(2, 0, 0))
    set_key("Neck_L_1", "rotation_euler", 20, rot_xyz(4, 0, -2))
    set_key("Neck_L_3", "rotation_euler", 20, rot_xyz(4, 0, -3))
    set_key("Head_L", "rotation_euler", 20, rot_xyz(-4, -2, -2))

    set_key("Neck_R_1", "rotation_euler", 20, rot_xyz(-3, 0, 3))
    set_key("Neck_R_3", "rotation_euler", 20, rot_xyz(-2, 0, 2))
    set_key("Head_R", "rotation_euler", 20, rot_xyz(4, 2, 2))

    set_key("Tail_1", "rotation_euler", 20, rot_xyz(0, 0, 4))
    set_key("Tail_3", "rotation_euler", 20, rot_xyz(0, 0, 8))
    set_key("Tail_5", "rotation_euler", 20, rot_xyz(0, 0, 12))
    set_key("Wing_Arm_L", "rotation_euler", 20, rot_xyz(22, 0, 0))
    set_key("Wing_Arm_R", "rotation_euler", 20, rot_xyz(22, 0, 0))
    actions["01_Idle_Breathing"] = act

    # 2. WALKING (Heavy 4-legged quadruped gait, both long necks counter-bobbing)
    act = bpy.data.actions.new("02_Walking")
    act.use_fake_user = True
    arm_obj.animation_data.action = act
    reset_pose()
    for f in [1, 33]:
        set_key("Spine_Main", "location", f, (0.0, 0.0, 0.0))
        set_key("Leg_Front_Upper_L", "rotation_euler", f, rot_xyz(24, 0, 0))
        set_key("Leg_Front_Lower_L", "rotation_euler", f, rot_xyz(-14, 0, 0))
        set_key("Leg_Front_Upper_R", "rotation_euler", f, rot_xyz(-22, 0, 0))
        set_key("Leg_Front_Lower_R", "rotation_euler", f, rot_xyz(12, 0, 0))
        set_key("Leg_Rear_Upper_L", "rotation_euler", f, rot_xyz(-20, 0, 0))
        set_key("Leg_Rear_Lower_L", "rotation_euler", f, rot_xyz(14, 0, 0))
        set_key("Leg_Rear_Upper_R", "rotation_euler", f, rot_xyz(22, 0, 0))
        set_key("Leg_Rear_Lower_R", "rotation_euler", f, rot_xyz(-15, 0, 0))
        set_key("Neck_L_2", "rotation_euler", f, rot_xyz(5, 0, 0))
        set_key("Neck_R_2", "rotation_euler", f, rot_xyz(-4, 0, 0))
        set_key("Tail_1", "rotation_euler", f, rot_xyz(0, 0, 8))
        set_key("Tail_3", "rotation_euler", f, rot_xyz(0, 0, 16))

    set_key("Spine_Main", "location", 17, (0.0, 0.0, 0.06))
    set_key("Leg_Front_Upper_L", "rotation_euler", 17, rot_xyz(-22, 0, 0))
    set_key("Leg_Front_Lower_L", "rotation_euler", 17, rot_xyz(12, 0, 0))
    set_key("Leg_Front_Upper_R", "rotation_euler", 17, rot_xyz(24, 0, 0))
    set_key("Leg_Front_Lower_R", "rotation_euler", 17, rot_xyz(-14, 0, 0))
    set_key("Leg_Rear_Upper_L", "rotation_euler", 17, rot_xyz(22, 0, 0))
    set_key("Leg_Rear_Lower_L", "rotation_euler", 17, rot_xyz(-15, 0, 0))
    set_key("Leg_Rear_Upper_R", "rotation_euler", 17, rot_xyz(-20, 0, 0))
    set_key("Leg_Rear_Lower_R", "rotation_euler", 17, rot_xyz(14, 0, 0))
    set_key("Neck_L_2", "rotation_euler", 17, rot_xyz(-4, 0, 0))
    set_key("Neck_R_2", "rotation_euler", 17, rot_xyz(5, 0, 0))
    set_key("Tail_1", "rotation_euler", 17, rot_xyz(0, 0, -8))
    set_key("Tail_3", "rotation_euler", 17, rot_xyz(0, 0, -16))
    actions["02_Walking"] = act

    # 3. RUNNING (Aggressive forward boss charge with both heads thrust low)
    act = bpy.data.actions.new("03_Running")
    act.use_fake_user = True
    arm_obj.animation_data.action = act
    reset_pose()
    for f in [1, 21]:
        set_key("Spine_Main", "location", f, (0.0, 0.0, -0.2))
        set_key("Spine_Main", "rotation_euler", f, rot_xyz(-10, 0, 0))
        set_key("Neck_L_1", "rotation_euler", f, rot_xyz(15, 0, 0))
        set_key("Neck_L_3", "rotation_euler", f, rot_xyz(-12, 0, 0))
        set_key("Neck_R_1", "rotation_euler", f, rot_xyz(12, 0, 0))
        set_key("Neck_R_3", "rotation_euler", f, rot_xyz(-10, 0, 0))
        set_key("Head_L", "rotation_euler", f, rot_xyz(8, 0, 0))
        set_key("Head_R", "rotation_euler", f, rot_xyz(10, 0, 0))
        set_key("Jaw_L", "rotation_euler", f, rot_xyz(14, 0, 0))
        set_key("Jaw_R", "rotation_euler", f, rot_xyz(14, 0, 0))
        set_key("Leg_Front_Upper_L", "rotation_euler", f, rot_xyz(38, 0, 0))
        set_key("Leg_Front_Upper_R", "rotation_euler", f, rot_xyz(-32, 0, 0))
        set_key("Leg_Rear_Upper_L", "rotation_euler", f, rot_xyz(-30, 0, 0))
        set_key("Leg_Rear_Upper_R", "rotation_euler", f, rot_xyz(35, 0, 0))

    set_key("Spine_Main", "location", 11, (0.0, 0.0, 0.1))
    set_key("Leg_Front_Upper_L", "rotation_euler", 11, rot_xyz(-32, 0, 0))
    set_key("Leg_Front_Upper_R", "rotation_euler", 11, rot_xyz(38, 0, 0))
    set_key("Leg_Rear_Upper_L", "rotation_euler", 11, rot_xyz(35, 0, 0))
    set_key("Leg_Rear_Upper_R", "rotation_euler", 11, rot_xyz(-30, 0, 0))
    actions["03_Running"] = act

    # 4. HEAD MOVEMENT FOR BOTH HEADS (Independent autonomous looking around / scouting)
    act = bpy.data.actions.new("04_Head_Movement")
    act.use_fake_user = True
    arm_obj.animation_data.action = act
    reset_pose()
    set_key("Head_L", "rotation_euler", 1, rot_xyz(0, 0, 0))
    set_key("Head_R", "rotation_euler", 1, rot_xyz(0, 0, 0))

    # Frame 15: Left head looks high left, Right head looks down right
    set_key("Neck_L_2", "rotation_euler", 15, rot_xyz(12, 0, 18))
    set_key("Neck_L_4", "rotation_euler", 15, rot_xyz(8, 0, 22))
    set_key("Head_L", "rotation_euler", 15, rot_xyz(-10, 0, 20))

    set_key("Neck_R_2", "rotation_euler", 15, rot_xyz(-10, 0, -15))
    set_key("Neck_R_4", "rotation_euler", 15, rot_xyz(-12, 0, -20))
    set_key("Head_R", "rotation_euler", 15, rot_xyz(15, 0, -15))

    # Frame 30: Left head looks down center, Right head raises high and surveys front-left
    set_key("Neck_L_2", "rotation_euler", 30, rot_xyz(-14, 0, -10))
    set_key("Neck_L_4", "rotation_euler", 30, rot_xyz(-12, 0, -8))
    set_key("Head_L", "rotation_euler", 30, rot_xyz(18, 0, -6))

    set_key("Neck_R_2", "rotation_euler", 30, rot_xyz(15, 0, 20))
    set_key("Neck_R_4", "rotation_euler", 30, rot_xyz(12, 0, 22))
    set_key("Head_R", "rotation_euler", 30, rot_xyz(-12, 0, 18))

    # Frame 45: Return to neutral ready stance
    set_key("Neck_L_2", "rotation_euler", 45, rot_xyz(0, 0, 0))
    set_key("Neck_L_4", "rotation_euler", 45, rot_xyz(0, 0, 0))
    set_key("Head_L", "rotation_euler", 45, rot_xyz(0, 0, 0))
    set_key("Neck_R_2", "rotation_euler", 45, rot_xyz(0, 0, 0))
    set_key("Neck_R_4", "rotation_euler", 45, rot_xyz(0, 0, 0))
    set_key("Head_R", "rotation_euler", 45, rot_xyz(0, 0, 0))
    actions["04_Head_Movement"] = act

    # 5. ROARING WITH BOTH HEADS (Alternating: Left roars first, then Right roars!)
    act = bpy.data.actions.new("05_Roaring_Both")
    act.use_fake_user = True
    arm_obj.animation_data.action = act
    reset_pose()
    # Left Head Roar apex at Frame 18
    set_key("Neck_L_2", "rotation_euler", 18, rot_xyz(18, 0, 10))
    set_key("Neck_L_4", "rotation_euler", 18, rot_xyz(22, 0, 14))
    set_key("Head_L", "rotation_euler", 18, rot_xyz(-24, 0, 8))
    set_key("Jaw_L", "rotation_euler", 18, rot_xyz(44, 0, 0))

    # Right Head Roar apex at Frame 38
    set_key("Neck_R_2", "rotation_euler", 38, rot_xyz(18, 0, -10))
    set_key("Neck_R_4", "rotation_euler", 38, rot_xyz(22, 0, -14))
    set_key("Head_R", "rotation_euler", 38, rot_xyz(-24, 0, -8))
    set_key("Jaw_R", "rotation_euler", 38, rot_xyz(44, 0, 0))

    # Return at frame 55
    set_key("Jaw_L", "rotation_euler", 55, rot_xyz(6, 0, 0))
    set_key("Jaw_R", "rotation_euler", 55, rot_xyz(6, 0, 0))
    actions["05_Roaring_Both"] = act

    # 6. WING FLAPPING (Powerful aerial flap cycle)
    act = bpy.data.actions.new("06_Wing_Flapping")
    act.use_fake_user = True
    arm_obj.animation_data.action = act
    reset_pose()
    for f in [1, 25]:
        set_key("Spine_Main", "location", f, (0.0, 0.0, 1.4))
        set_key("Wing_Arm_L", "rotation_euler", f, rot_xyz(38, 0, 0))
        set_key("Wing_Outer_L", "rotation_euler", f, rot_xyz(26, 0, 0))
        set_key("Wing_Arm_R", "rotation_euler", f, rot_xyz(38, 0, 0))
        set_key("Wing_Outer_R", "rotation_euler", f, rot_xyz(26, 0, 0))

    set_key("Spine_Main", "location", 13, (0.0, 0.0, 1.8))
    set_key("Wing_Arm_L", "rotation_euler", 13, rot_xyz(-34, 0, 0))
    set_key("Wing_Outer_L", "rotation_euler", 13, rot_xyz(-30, 0, 0))
    set_key("Wing_Arm_R", "rotation_euler", 13, rot_xyz(-34, 0, 0))
    set_key("Wing_Outer_R", "rotation_euler", 13, rot_xyz(-30, 0, 0))
    actions["06_Wing_Flapping"] = act

    # 7. FLYING (Cruising soaring loop with tucked legs & aerodynamic necks)
    act = bpy.data.actions.new("07_Flying")
    act.use_fake_user = True
    arm_obj.animation_data.action = act
    reset_pose()
    for f in [1, 49]:
        set_key("Spine_Main", "location", f, (0.0, 0.0, 2.8))
        set_key("Spine_Main", "rotation_euler", f, rot_xyz(-10, 0, 0))
        set_key("Neck_L_1", "rotation_euler", f, rot_xyz(10, 0, 0))
        set_key("Neck_R_1", "rotation_euler", f, rot_xyz(10, 0, 0))
        set_key("Leg_Front_Upper_L", "rotation_euler", f, rot_xyz(-38, 0, 0))
        set_key("Leg_Front_Upper_R", "rotation_euler", f, rot_xyz(-38, 0, 0))
        set_key("Leg_Rear_Upper_L", "rotation_euler", f, rot_xyz(-48, 0, 0))
        set_key("Leg_Rear_Upper_R", "rotation_euler", f, rot_xyz(-48, 0, 0))
        set_key("Wing_Arm_L", "rotation_euler", f, rot_xyz(8, 0, 0))
        set_key("Wing_Arm_R", "rotation_euler", f, rot_xyz(8, 0, 0))

    set_key("Spine_Main", "location", 25, (0.0, 0.0, 3.0))
    set_key("Wing_Arm_L", "rotation_euler", 25, rot_xyz(-18, 0, 0))
    set_key("Wing_Arm_R", "rotation_euler", 25, rot_xyz(-18, 0, 0))
    actions["07_Flying"] = act

    # 8. LANDING (Air-brake wing flare & heavy touchdown crouch)
    act = bpy.data.actions.new("08_Landing")
    act.use_fake_user = True
    arm_obj.animation_data.action = act
    reset_pose()
    set_key("Spine_Main", "location", 1, (0.0, 0.0, 2.2))
    set_key("Wing_Arm_L", "rotation_euler", 20, rot_xyz(36, 0, 0))
    set_key("Wing_Arm_R", "rotation_euler", 20, rot_xyz(36, 0, 0))

    set_key("Spine_Main", "location", 34, (0.0, 0.0, -0.45))
    set_key("Leg_Front_Upper_L", "rotation_euler", 34, rot_xyz(28, 0, 0))
    set_key("Leg_Front_Upper_R", "rotation_euler", 34, rot_xyz(28, 0, 0))
    set_key("Wing_Arm_L", "rotation_euler", 34, rot_xyz(-26, 0, 0))
    set_key("Wing_Arm_R", "rotation_euler", 34, rot_xyz(-26, 0, 0))

    set_key("Spine_Main", "location", 50, (0.0, 0.0, 0.0))
    actions["08_Landing"] = act

    # 9. LEFT-HEAD BITE ATTACK (Left head coils back, strikes forward with ferocious snap)
    act = bpy.data.actions.new("09_Left_Head_Bite")
    act.use_fake_user = True
    arm_obj.animation_data.action = act
    reset_pose()
    # Frame 12: Coil back
    set_key("Neck_L_1", "rotation_euler", 12, rot_xyz(8, 0, -10))
    set_key("Neck_L_3", "rotation_euler", 12, rot_xyz(14, 0, -15))
    set_key("Head_L", "rotation_euler", 12, rot_xyz(-12, 0, -10))
    set_key("Jaw_L", "rotation_euler", 12, rot_xyz(25, 0, 0))

    # Frame 20: STRIKE & SNAP JAW!
    set_key("Neck_L_1", "rotation_euler", 20, rot_xyz(-18, 0, 15))
    set_key("Neck_L_3", "rotation_euler", 20, rot_xyz(-22, 0, 18))
    set_key("Head_L", "rotation_euler", 20, rot_xyz(26, 0, 12))
    set_key("Jaw_L", "rotation_euler", 20, rot_xyz(42, 0, 0))

    # Frame 24: CHOMP!
    set_key("Jaw_L", "rotation_euler", 24, rot_xyz(-4, 0, 0))

    # Frame 38: Return
    set_key("Neck_L_1", "rotation_euler", 38, rot_xyz(0, 0, 0))
    set_key("Neck_L_3", "rotation_euler", 38, rot_xyz(0, 0, 0))
    set_key("Head_L", "rotation_euler", 38, rot_xyz(0, 0, 0))
    set_key("Jaw_L", "rotation_euler", 38, rot_xyz(6, 0, 0))
    actions["09_Left_Head_Bite"] = act

    # 10. RIGHT-HEAD BITE ATTACK (Right head coils back, strikes forward with ferocious snap)
    act = bpy.data.actions.new("10_Right_Head_Bite")
    act.use_fake_user = True
    arm_obj.animation_data.action = act
    reset_pose()
    # Frame 12: Coil back
    set_key("Neck_R_1", "rotation_euler", 12, rot_xyz(8, 0, 10))
    set_key("Neck_R_3", "rotation_euler", 12, rot_xyz(14, 0, 15))
    set_key("Head_R", "rotation_euler", 12, rot_xyz(-12, 0, 10))
    set_key("Jaw_R", "rotation_euler", 12, rot_xyz(25, 0, 0))

    # Frame 20: STRIKE & SNAP JAW!
    set_key("Neck_R_1", "rotation_euler", 20, rot_xyz(-18, 0, -15))
    set_key("Neck_R_3", "rotation_euler", 20, rot_xyz(-22, 0, -18))
    set_key("Head_R", "rotation_euler", 20, rot_xyz(26, 0, -12))
    set_key("Jaw_R", "rotation_euler", 20, rot_xyz(42, 0, 0))

    # Frame 24: CHOMP!
    set_key("Jaw_R", "rotation_euler", 24, rot_xyz(-4, 0, 0))

    # Frame 38: Return
    set_key("Neck_R_1", "rotation_euler", 38, rot_xyz(0, 0, 0))
    set_key("Neck_R_3", "rotation_euler", 38, rot_xyz(0, 0, 0))
    set_key("Head_R", "rotation_euler", 38, rot_xyz(0, 0, 0))
    set_key("Jaw_R", "rotation_euler", 38, rot_xyz(6, 0, 0))
    actions["10_Right_Head_Bite"] = act

    # 11. TWO-HEAD SIMULTANEOUS ROAR (Both heads rear back together, jaws opening wide in synchronized roar!)
    act = bpy.data.actions.new("11_Simultaneous_Roar")
    act.use_fake_user = True
    arm_obj.animation_data.action = act
    reset_pose()
    set_key("Spine_Main", "location", 1, (0.0, 0.0, 0.0))

    # Frame 32: SYNCHRONIZED THUNDER ROAR!
    set_key("Spine_Main", "location", 32, (0.0, -0.4, 0.9))
    set_key("Spine_Main", "rotation_euler", 32, rot_xyz(36, 0, 0))
    set_key("Neck_L_1", "rotation_euler", 32, rot_xyz(15, 0, 10))
    set_key("Neck_L_3", "rotation_euler", 32, rot_xyz(20, 0, 15))
    set_key("Head_L", "rotation_euler", 32, rot_xyz(-24, 0, 6))
    set_key("Jaw_L", "rotation_euler", 32, rot_xyz(46, 0, 0))

    set_key("Neck_R_1", "rotation_euler", 32, rot_xyz(15, 0, -10))
    set_key("Neck_R_3", "rotation_euler", 32, rot_xyz(20, 0, -15))
    set_key("Head_R", "rotation_euler", 32, rot_xyz(-24, 0, -6))
    set_key("Jaw_R", "rotation_euler", 32, rot_xyz(46, 0, 0))

    set_key("Wing_Arm_L", "rotation_euler", 32, rot_xyz(34, 0, 0))
    set_key("Wing_Arm_R", "rotation_euler", 32, rot_xyz(34, 0, 0))

    # Frame 56: Return
    set_key("Spine_Main", "location", 56, (0.0, 0.0, 0.0))
    set_key("Spine_Main", "rotation_euler", 56, rot_xyz(0, 0, 0))
    set_key("Jaw_L", "rotation_euler", 56, rot_xyz(6, 0, 0))
    set_key("Jaw_R", "rotation_euler", 56, rot_xyz(6, 0, 0))
    actions["11_Simultaneous_Roar"] = act

    # 12. FIRE-BREATH ATTACK FROM BOTH HEADS (Both snake forward, criss-crossing torrents)
    act = bpy.data.actions.new("12_Fire_Breath_Dual")
    act.use_fake_user = True
    arm_obj.animation_data.action = act
    reset_pose()
    # Inhale & coil back at frame 15
    set_key("Neck_L_2", "rotation_euler", 15, rot_xyz(14, 0, -8))
    set_key("Neck_R_2", "rotation_euler", 15, rot_xyz(14, 0, 8))
    set_key("Jaw_L", "rotation_euler", 15, rot_xyz(16, 0, 0))
    set_key("Jaw_R", "rotation_euler", 15, rot_xyz(16, 0, 0))

    # Forward thrust & torrent at frame 26
    set_key("Neck_L_1", "rotation_euler", 26, rot_xyz(-16, 0, 10))
    set_key("Neck_L_3", "rotation_euler", 26, rot_xyz(-20, 0, 12))
    set_key("Head_L", "rotation_euler", 26, rot_xyz(22, 0, 10))
    set_key("Jaw_L", "rotation_euler", 26, rot_xyz(42, 0, 0))

    set_key("Neck_R_1", "rotation_euler", 26, rot_xyz(-16, 0, -10))
    set_key("Neck_R_3", "rotation_euler", 26, rot_xyz(-20, 0, -12))
    set_key("Head_R", "rotation_euler", 26, rot_xyz(22, 0, -10))
    set_key("Jaw_R", "rotation_euler", 26, rot_xyz(42, 0, 0))

    # Sweeping criss-cross at frame 38
    set_key("Head_L", "rotation_euler", 38, rot_xyz(22, 0, -8))
    set_key("Head_R", "rotation_euler", 38, rot_xyz(22, 0, 8))

    # Return at frame 50
    set_key("Jaw_L", "rotation_euler", 50, rot_xyz(6, 0, 0))
    set_key("Jaw_R", "rotation_euler", 50, rot_xyz(6, 0, 0))
    actions["12_Fire_Breath_Dual"] = act

    # 13. GROUND SLAM (Rears up high with both long necks, crashes down)
    act = bpy.data.actions.new("13_Ground_Slam")
    act.use_fake_user = True
    arm_obj.animation_data.action = act
    reset_pose()
    # Rear up apex at frame 18
    set_key("Spine_Main", "location", 18, (0.0, 0.0, 1.3))
    set_key("Spine_Main", "rotation_euler", 18, rot_xyz(42, 0, 0))
    set_key("Neck_L_2", "rotation_euler", 18, rot_xyz(16, 0, 10))
    set_key("Neck_R_2", "rotation_euler", 18, rot_xyz(16, 0, -10))
    set_key("Leg_Front_Upper_L", "rotation_euler", 18, rot_xyz(-62, 0, 10))
    set_key("Leg_Front_Upper_R", "rotation_euler", 18, rot_xyz(-62, 0, -10))
    set_key("Wing_Arm_L", "rotation_euler", 18, rot_xyz(38, 0, 0))
    set_key("Wing_Arm_R", "rotation_euler", 18, rot_xyz(38, 0, 0))

    # Crash slam at frame 28
    set_key("Spine_Main", "location", 28, (0.0, 0.0, -0.5))
    set_key("Spine_Main", "rotation_euler", 28, rot_xyz(-16, 0, 0))
    set_key("Neck_L_2", "rotation_euler", 28, rot_xyz(-22, 0, 0))
    set_key("Neck_R_2", "rotation_euler", 28, rot_xyz(-22, 0, 0))
    set_key("Leg_Front_Upper_L", "rotation_euler", 28, rot_xyz(32, 0, 0))
    set_key("Leg_Front_Upper_R", "rotation_euler", 28, rot_xyz(32, 0, 0))

    # Return at frame 48
    set_key("Spine_Main", "location", 48, (0.0, 0.0, 0.0))
    set_key("Spine_Main", "rotation_euler", 48, rot_xyz(0, 0, 0))
    actions["13_Ground_Slam"] = act

    # 14. TAIL MOVEMENT (Coil and violent 180-degree sweep whip)
    act = bpy.data.actions.new("14_Tail_Movement")
    act.use_fake_user = True
    arm_obj.animation_data.action = act
    reset_pose()
    set_key("Tail_1", "rotation_euler", 1, rot_xyz(0, 0, 0))
    set_key("Tail_3", "rotation_euler", 1, rot_xyz(0, 0, 0))

    # Coil right at frame 14
    set_key("Spine_Hips", "rotation_euler", 14, rot_xyz(0, 0, -10))
    set_key("Tail_1", "rotation_euler", 14, rot_xyz(0, 0, -25))
    set_key("Tail_2", "rotation_euler", 14, rot_xyz(0, 0, -32))
    set_key("Tail_3", "rotation_euler", 14, rot_xyz(0, 0, -40))
    set_key("Tail_4", "rotation_euler", 14, rot_xyz(0, 0, -48))
    set_key("Tail_5", "rotation_euler", 14, rot_xyz(0, 0, -55))

    # Whip to left at frame 24
    set_key("Spine_Hips", "rotation_euler", 24, rot_xyz(0, 0, 12))
    set_key("Tail_1", "rotation_euler", 24, rot_xyz(0, 0, 30))
    set_key("Tail_2", "rotation_euler", 24, rot_xyz(0, 0, 40))
    set_key("Tail_3", "rotation_euler", 24, rot_xyz(0, 0, 50))
    set_key("Tail_4", "rotation_euler", 24, rot_xyz(0, 0, 58))
    set_key("Tail_5", "rotation_euler", 24, rot_xyz(0, 0, 65))

    # Recoil at frame 42
    set_key("Spine_Hips", "rotation_euler", 42, rot_xyz(0, 0, 0))
    set_key("Tail_1", "rotation_euler", 42, rot_xyz(0, 0, 0))
    set_key("Tail_3", "rotation_euler", 42, rot_xyz(0, 0, 0))
    set_key("Tail_5", "rotation_euler", 42, rot_xyz(0, 0, 0))
    actions["14_Tail_Movement"] = act

    # Set Idle as default
    arm_obj.animation_data.action = actions["01_Idle_Breathing"]
    print("All 14 boss animations created successfully.")
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
    bsdf.inputs["Base Color"].default_value = (0.05, 0.05, 0.06, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.85

    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=22.0, depth=0.4, location=(0.0, 0.0, -0.2))
    floor = bpy.context.active_object
    floor.name = "Boss_Arena_Platform"
    floor.data.materials.append(floor_mat)
    for c in list(floor.users_collection):
        c.objects.unlink(floor)
    col.objects.link(floor)

    # Focus Target Empty for Camera (centered between both high heads)
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0.0, 3.2, 5.2))
    target = bpy.context.active_object
    target.name = "Camera_Boss_Target"
    for c in list(target.users_collection):
        c.objects.unlink(target)
    col.objects.link(target)

    # Camera - Imposing 3/4 Front-Side View elevated to capture both long necks and heads
    cam_data = bpy.data.cameras.new("Boss_Camera")
    cam_data.lens = 30
    cam_data.clip_end = 250.0
    cam_obj = bpy.data.objects.new("Boss_Camera", cam_data)
    cam_obj.location = (-17.5, 16.5, 7.8)
    col.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj

    # Constrain Camera to Track the Target
    tt = cam_obj.constraints.new(type='TRACK_TO')
    tt.target = target
    tt.track_axis = 'TRACK_NEGATIVE_Z'
    tt.up_axis = 'UP_Y'

    # Key Sun Light (Warm silver boss sun to highlight black voxel geometry)
    key_light = bpy.data.lights.new(name="Key_Light", type='SUN')
    key_light.energy = 5.2
    key_light.color = (0.95, 0.95, 1.0)
    key_obj = bpy.data.objects.new("Key_Light", key_light)
    key_obj.location = (-14.0, 12.0, 18.0)
    key_obj.rotation_euler = (math.radians(45), math.radians(-25), math.radians(-40))
    col.objects.link(key_obj)

    # Rim / Back Light (Fiery amber-orange rim light highlighting dark silhouettes)
    rim_light = bpy.data.lights.new(name="Rim_Light", type='SUN')
    rim_light.energy = 6.8
    rim_light.color = (1.0, 0.35, 0.08)
    rim_obj = bpy.data.objects.new("Rim_Light", rim_light)
    rim_obj.location = (15.0, -15.0, 16.0)
    rim_obj.rotation_euler = (math.radians(-50), math.radians(35), math.radians(135))
    col.objects.link(rim_obj)

    # Fill / Under Light (Deep dark-amber lava ambiance)
    fill_light = bpy.data.lights.new(name="Fill_Light", type='POINT')
    fill_light.energy = 1100.0
    fill_light.color = (0.85, 0.25, 0.05)
    fill_obj = bpy.data.objects.new("Fill_Light", fill_light)
    fill_obj.location = (0.0, 4.0, 1.4)
    col.objects.link(fill_obj)

# -------------------------------------------------------------------------
# Main Execution Flow
# -------------------------------------------------------------------------
def main():
    print("--- Starting Two-Headed Black Dragon Boss Generation ---")
    clear_all()
    mats = create_materials()
    arm_obj = build_two_headed_rig()
    build_two_headed_geometry(arm_obj, mats)
    create_two_headed_animations(arm_obj)
    setup_showcase()

    scene = bpy.context.scene
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.film_transparent = False

    # Frame 1 showcase pose
    arm_obj.animation_data.action = bpy.data.actions["01_Idle_Breathing"]
    scene.frame_set(1)

    # Save Blend file
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
    print(f"Blend file saved to: {BLEND_PATH}")

    # Render Preview Image
    scene.render.filepath = RENDER_PATH
    bpy.ops.render.render(write_still=True)
    print(f"Render saved to: {RENDER_PATH}")

    # Export glTF GLB
    try:
        bpy.ops.export_scene.gltf(filepath=GLB_PATH, export_format='GLB', export_animations=True)
        print(f"glTF export saved to: {GLB_PATH}")
    except Exception as e:
        print(f"glTF export note: {e}")

    print("--- Two-Headed Black Dragon Boss Generation Finished Successfully ---")

if __name__ == "__main__":
    main()
