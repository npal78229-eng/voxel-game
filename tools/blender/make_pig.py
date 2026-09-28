import bpy
import math
import os

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.meshes:
        if block.users == 0:
            bpy.data.meshes.remove(block)
    for block in bpy.data.materials:
        if block.users == 0:
            bpy.data.materials.remove(block)

def make_material(name, color, roughness=0.4, metallic=0.0, emission_strength=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    mat.diffuse_color = color
    mat.roughness = roughness
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if emission_strength > 0 and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = color
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat

def smooth_and_subsurf(obj, levels=2):
    for poly in obj.data.polygons:
        poly.use_smooth = True
    if levels > 0:
        mod = obj.modifiers.new(name="Subsurf", type='SUBSURF')
        mod.levels = levels
        mod.render_levels = levels

def assign_mat(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)

def create_pig():
    clear_scene()

    # Rich linear RGB colors tuned for Blender AgX/Filmic tone mapping
    mat_skin = make_material("Pig_Pink_Skin", (0.95, 0.28, 0.40, 1.0), roughness=0.38)
    mat_snout = make_material("Pig_Snout_Pink", (0.88, 0.15, 0.28, 1.0), roughness=0.34)
    mat_blush = make_material("Pig_Cheek_Blush", (0.96, 0.08, 0.20, 1.0), roughness=0.42)
    mat_nostril = make_material("Pig_Nostril_Dark", (0.08, 0.015, 0.025, 1.0), roughness=0.55)
    mat_eye = make_material("Pig_Eye_Black", (0.01, 0.01, 0.01, 1.0), roughness=0.04)
    mat_shine = make_material("Pig_Eye_Shine", (1.0, 1.0, 1.0, 1.0), roughness=0.0, emission_strength=1.8)
    mat_hoof = make_material("Pig_Hoof_Brown", (0.14, 0.07, 0.06, 1.0), roughness=0.45)
    mat_ground = make_material("Pasture_Base", (0.18, 0.48, 0.16, 1.0), roughness=0.82)

    # Root Empty so the entire pig can be moved/rotated/scaled together
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 0))
    root = bpy.context.active_object
    root.name = "Pig_Root"

    def attach(obj):
        obj.parent = root

    # 1. Plump Body
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=1.0, location=(0.0, 0.0, 1.12))
    body = bpy.context.active_object
    body.name = "Pig_Body"
    body.scale = (1.32, 0.98, 0.92)
    assign_mat(body, mat_skin)
    smooth_and_subsurf(body, 2)
    attach(body)

    # 2. Head
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=1.0, location=(1.18, 0.0, 1.42))
    head = bpy.context.active_object
    head.name = "Pig_Head"
    head.scale = (0.78, 0.76, 0.74)
    assign_mat(head, mat_skin)
    smooth_and_subsurf(head, 2)
    attach(head)

    # 3. Iconic Snout (Smooth beveled disk)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=1.0, depth=1.0, location=(1.88, 0.0, 1.33), rotation=(0.0, math.pi / 2.0, 0.0))
    snout = bpy.context.active_object
    snout.name = "Pig_Snout"
    snout.scale = (0.31, 0.40, 0.24)
    assign_mat(snout, mat_snout)
    bevel = snout.modifiers.new(name="Bevel", type='BEVEL')
    bevel.width = 0.16
    bevel.segments = 6
    smooth_and_subsurf(snout, 2)
    attach(snout)

    # 4. Nostrils (Left & Right)
    for side, y_sign in [("L", 1.0), ("R", -1.0)]:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=1.0, location=(2.02, y_sign * 0.14, 1.34))
        nostril = bpy.context.active_object
        nostril.name = f"Pig_Nostril_{side}"
        nostril.scale = (0.045, 0.072, 0.11)
        assign_mat(nostril, mat_nostril)
        smooth_and_subsurf(nostril, 1)
        attach(nostril)

    # 5. Expressive Eyes + Embedded Cornea Catchlights + Rosy Cheeks
    for side, y_sign in [("L", 1.0), ("R", -1.0)]:
        ex, ey, ez = 1.74, y_sign * 0.35, 1.62
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.115, location=(ex, ey, ez))
        eye = bpy.context.active_object
        eye.name = f"Pig_Eye_{side}"
        assign_mat(eye, mat_eye)
        smooth_and_subsurf(eye, 1)
        attach(eye)

        # Embedded main catchlight
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=12, radius=0.030, location=(ex + 0.082, ey - y_sign * 0.025, ez + 0.038))
        shine = bpy.context.active_object
        shine.name = f"Pig_Eye_Shine_{side}"
        assign_mat(shine, mat_shine)
        smooth_and_subsurf(shine, 1)
        attach(shine)

        # Rosy Cheek Blush
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=1.0, location=(1.66, y_sign * 0.52, 1.28))
        cheek = bpy.context.active_object
        cheek.name = f"Pig_Cheek_{side}"
        cheek.scale = (0.14, 0.12, 0.09)
        cheek.rotation_euler = (0.0, 0.0, y_sign * 0.35)
        assign_mat(cheek, mat_blush)
        smooth_and_subsurf(cheek, 1)
        attach(cheek)

    # 6. Smooth Sculpted Pig Ears (Using UV Spheres so there are no cone-pole ribs)
    for side, y_sign in [("L", 1.0), ("R", -1.0)]:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1.0, location=(1.18, y_sign * 0.48, 2.02))
        ear = bpy.context.active_object
        ear.name = f"Pig_Ear_{side}"
        ear.scale = (0.16, 0.26, 0.34)
        ear.rotation_euler = (y_sign * 0.48, 0.38, y_sign * 0.30)
        assign_mat(ear, mat_skin)
        smooth_and_subsurf(ear, 2)
        attach(ear)

        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=1.0, location=(1.23, y_sign * 0.49, 2.00))
        inner_ear = bpy.context.active_object
        inner_ear.name = f"Pig_Inner_Ear_{side}"
        inner_ear.scale = (0.09, 0.18, 0.24)
        inner_ear.rotation_euler = (y_sign * 0.48, 0.38, y_sign * 0.30)
        assign_mat(inner_ear, mat_snout)
        smooth_and_subsurf(inner_ear, 2)
        attach(inner_ear)

    # 7. Four Smooth Legs & Rounded Cloven Hooves (No n-gon ribbing!)
    leg_positions = [
        ("Front_L",  0.65,  0.50),
        ("Front_R",  0.65, -0.50),
        ("Back_L",  -0.68,  0.50),
        ("Back_R",  -0.68, -0.50),
    ]
    for name, lx, ly in leg_positions:
        # Smooth capsule-like leg
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1.0, location=(lx, ly, 0.48))
        leg = bpy.context.active_object
        leg.name = f"Pig_Leg_{name}"
        leg.scale = (0.24, 0.24, 0.42)
        assign_mat(leg, mat_skin)
        smooth_and_subsurf(leg, 2)
        attach(leg)

        # Smooth beveled hoof
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.22, depth=0.20, location=(lx + 0.02, ly, 0.10))
        hoof = bpy.context.active_object
        hoof.name = f"Pig_Hoof_{name}"
        b_hoof = hoof.modifiers.new(name="Bevel", type='BEVEL')
        b_hoof.width = 0.05
        b_hoof.segments = 4
        assign_mat(hoof, mat_hoof)
        smooth_and_subsurf(hoof, 1)
        attach(hoof)

    # 8. Signature Curly Pig Tail (3D Helix Curve with Bevel)
    curve_data = bpy.data.curves.new("Pig_Tail_Curve", type='CURVE')
    curve_data.dimensions = '3D'
    curve_data.resolution_u = 20
    curve_data.bevel_depth = 0.068
    curve_data.bevel_resolution = 8
    curve_data.use_fill_caps = True

    spline = curve_data.splines.new('POLY')
    num_pts = 50
    spline.points.add(num_pts - 1)
    for i in range(num_pts):
        t = i / (num_pts - 1)
        angle = t * 4.4 * math.pi
        r = 0.18 * (1.0 - 0.30 * t) * math.sin(min(t * 3.5, 1.0) * math.pi / 2.0)
        px = -1.22 - t * 0.52
        py = r * math.cos(angle)
        pz = 1.35 + t * 0.32 + r * math.sin(angle)
        spline.points[i].co = (px, py, pz, 1.0)

    tail_obj = bpy.data.objects.new("Pig_Curly_Tail", curve_data)
    bpy.context.collection.objects.link(tail_obj)
    assign_mat(tail_obj, mat_snout)
    attach(tail_obj)

    # 9. Cozy Green Pasture Pedestal
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=3.2, depth=0.16, location=(0.20, 0.0, -0.08))
    ground = bpy.context.active_object
    ground.name = "Pasture_Pedestal"
    bevel_g = ground.modifiers.new(name="Bevel", type='BEVEL')
    bevel_g.width = 0.05
    bevel_g.segments = 4
    assign_mat(ground, mat_ground)
    smooth_and_subsurf(ground, 1)

    # 10. Three-Point Studio Lighting & Tracked Camera
    bpy.ops.object.light_add(type='SUN', location=(4.0, -4.0, 6.0))
    sun = bpy.context.active_object
    sun.name = "Key_Sun_Light"
    sun.data.energy = 4.0
    sun.data.color = (1.0, 0.97, 0.92)
    sun.rotation_euler = (math.radians(45), math.radians(15), math.radians(38))

    bpy.ops.object.light_add(type='AREA', location=(3.5, 3.8, 3.0))
    fill = bpy.context.active_object
    fill.name = "Fill_Light"
    fill.data.energy = 140.0
    fill.data.size = 3.5
    fill.data.color = (0.90, 0.95, 1.0)
    fill.rotation_euler = (math.radians(60), 0.0, math.radians(-130))

    bpy.ops.object.light_add(type='AREA', location=(-3.5, -1.8, 3.5))
    rim = bpy.context.active_object
    rim.name = "Rim_Light"
    rim.data.energy = 180.0
    rim.data.size = 2.5
    rim.data.color = (1.0, 0.88, 0.94)
    rim.rotation_euler = (math.radians(55), 0.0, math.radians(110))

    # Camera target empty at center of pig
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0.38, 0.0, 1.18))
    cam_target = bpy.context.active_object
    cam_target.name = "Camera_Focus"
    attach(cam_target)

    bpy.ops.object.camera_add(location=(5.4, -4.6, 2.85))
    cam = bpy.context.active_object
    cam.name = "Pig_Camera"
    cam.data.lens = 48
    track = cam.constraints.new(type='TRACK_TO')
    track.target = cam_target
    track.track_axis = 'TRACK_NEGATIVE_Z'
    track.up_axis = 'UP_Y'
    bpy.context.scene.camera = cam

    # World background sky color
    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.35, 0.58, 0.85, 1.0)
        bg.inputs[1].default_value = 0.65

    # Configure 3D Viewports in all screens to show Material Preview & frame the pig nicely
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                for space in area.spaces:
                    if space.type == 'VIEW_3D':
                        space.shading.type = 'MATERIAL'
                        space.shading.color_type = 'MATERIAL'
                        if space.region_3d:
                            space.region_3d.view_location = (0.38, 0.0, 1.18)
                            space.region_3d.view_distance = 6.8

if __name__ == "__main__":
    create_pig()

    out_dir = r"c:\Users\npal7\OneDrive\PROJECT\project1"
    blend_path = os.path.join(out_dir, "pig.blend")
    render_path = os.path.join(out_dir, "pig_render.png")

    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print(f"Saved blend file to: {blend_path}")

    scene = bpy.context.scene
    engines = [item.identifier for item in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    if 'BLENDER_EEVEE_NEXT' in engines:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    elif 'BLENDER_EEVEE' in engines:
        scene.render.engine = 'BLENDER_EEVEE'
    else:
        scene.render.engine = 'CYCLES'

    scene.render.resolution_x = 1280
    scene.render.resolution_y = 960
    scene.render.filepath = render_path
    bpy.ops.render.render(write_still=True)
    print(f"Rendered preview to: {render_path}")
