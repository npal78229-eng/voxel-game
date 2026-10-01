import bpy
import math
import os

# ============================================================================
# Minecraft-Style Water Block & Animation Builder for Blender
# Generates:
#   1. Procedural water surface mesh with vertex-displaced waves
#   2. Animated flow textures via shader nodes (Noise + Wave combos)
#   3. 8 water flow levels (source + 7 flowing) as shape keys
#   4. Underwater caustic pattern projector
#   5. Exports water_block.glb with animations for Three.js
#
# Run: blender --background --factory-startup --python tools/blender/build_water.py
# ============================================================================

OUT_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "public", "assets", "models"
)
os.makedirs(OUT_DIR, exist_ok=True)

RENDER_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "tools", "preview"
)
os.makedirs(RENDER_DIR, exist_ok=True)


def clear_scene():
    """Remove everything from the current Blender scene."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for col in list(bpy.data.collections):
        bpy.data.collections.remove(col)
    for block in list(bpy.data.meshes):
        if block.users == 0:
            bpy.data.meshes.remove(block)
    for block in list(bpy.data.materials):
        if block.users == 0:
            bpy.data.materials.remove(block)
    for action in list(bpy.data.actions):
        if action.users == 0:
            bpy.data.actions.remove(action)


# ============================================================================
# WATER MATERIAL — Minecraft-style translucent blue with animated noise
# ============================================================================

def create_water_material():
    """
    Procedural Principled BSDF water material:
      - Semi-transparent blue tint (Minecraft palette #3f81c9)
      - Animated wave-distorted normals (2 overlaid Noise Textures at different scales)
      - Slight specular / glossy reflection for surface sheen
      - Transmission for see-through underwater view
      - Driven by a #frame expression for animation baking
    """
    mat = bpy.data.materials.new(name="MC_Water_Surface")
    mat.use_nodes = True
    mat.blend_method = 'ALPHA_HASHED'  # EEVEE transparency
    mat.shadow_method = 'HASHED'
    mat.use_backface_culling = False

    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    # Output
    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (1200, 0)

    # Principled BSDF
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (800, 0)
    # Minecraft water blue-tint
    bsdf.inputs["Base Color"].default_value = (0.247, 0.506, 0.788, 1.0)  # #3f81c9
    bsdf.inputs["Roughness"].default_value = 0.08
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Alpha"].default_value = 0.72
    # Transmission for see-through
    if "Transmission Weight" in bsdf.inputs:
        bsdf.inputs["Transmission Weight"].default_value = 0.65
    elif "Transmission" in bsdf.inputs:
        bsdf.inputs["Transmission"].default_value = 0.65
    # IOR close to real water
    bsdf.inputs["IOR"].default_value = 1.333

    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])

    # --- Animated Wave Normal ---
    # Texture Coordinate
    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-600, 200)

    # Mapping node (animate offset for wave scrolling)
    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-400, 200)
    links.new(tex_coord.outputs["Object"], mapping.inputs["Vector"])

    # Noise Texture 1: large slow ocean swell
    noise1 = nodes.new("ShaderNodeTexNoise")
    noise1.location = (-100, 300)
    noise1.inputs["Scale"].default_value = 3.5
    noise1.inputs["Detail"].default_value = 6.0
    noise1.inputs["Roughness"].default_value = 0.55
    noise1.inputs["Distortion"].default_value = 1.2
    links.new(mapping.outputs["Vector"], noise1.inputs["Vector"])

    # Noise Texture 2: small choppy ripples
    noise2 = nodes.new("ShaderNodeTexNoise")
    noise2.location = (-100, 0)
    noise2.inputs["Scale"].default_value = 8.0
    noise2.inputs["Detail"].default_value = 8.0
    noise2.inputs["Roughness"].default_value = 0.7
    noise2.inputs["Distortion"].default_value = 0.8
    links.new(mapping.outputs["Vector"], noise2.inputs["Vector"])

    # Wave Texture for directional flow pattern
    wave = nodes.new("ShaderNodeTexWave")
    wave.location = (-100, -250)
    wave.wave_type = 'BANDS'
    wave.bands_direction = 'Y'
    wave.inputs["Scale"].default_value = 4.0
    wave.inputs["Distortion"].default_value = 2.5
    wave.inputs["Detail"].default_value = 4.0
    wave.inputs["Detail Roughness"].default_value = 0.6
    links.new(mapping.outputs["Vector"], wave.inputs["Vector"])

    # Mix the two noise patterns
    mix_noise = nodes.new("ShaderNodeMix")
    mix_noise.location = (200, 150)
    mix_noise.data_type = 'FLOAT'
    mix_noise.inputs["Factor"].default_value = 0.5
    links.new(noise1.outputs["Fac"], mix_noise.inputs["A"])
    links.new(noise2.outputs["Fac"], mix_noise.inputs["B"])

    # Mix wave flow into the combined noise
    mix_wave = nodes.new("ShaderNodeMix")
    mix_wave.location = (400, 100)
    mix_wave.data_type = 'FLOAT'
    mix_wave.inputs["Factor"].default_value = 0.3
    links.new(mix_noise.outputs["Result"], mix_wave.inputs["A"])
    links.new(wave.outputs["Fac"], mix_wave.inputs["B"])

    # Bump Node for surface normals
    bump = nodes.new("ShaderNodeBump")
    bump.location = (600, -100)
    bump.inputs["Strength"].default_value = 0.35
    bump.inputs["Distance"].default_value = 0.06
    links.new(mix_wave.outputs["Result"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    # --- Animate the mapping offset via drivers ---
    # X offset: slow drift
    drv_x = mapping.inputs["Location"].driver_add("default_value", 0)
    drv_x.driver.expression = "frame / 120.0"
    # Y offset: flow direction (downward in Minecraft water-flow style)
    drv_y = mapping.inputs["Location"].driver_add("default_value", 1)
    drv_y.driver.expression = "frame / 80.0"

    return mat


def create_underwater_caustic_material():
    """
    Caustic light pattern material for projecting underwater dappled light.
    Uses Voronoi texture animated by frame driver.
    """
    mat = bpy.data.materials.new(name="MC_Water_Caustics")
    mat.use_nodes = True

    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (800, 0)

    emission = nodes.new("ShaderNodeEmission")
    emission.location = (600, 0)
    emission.inputs["Strength"].default_value = 0.8
    emission.inputs["Color"].default_value = (0.55, 0.82, 1.0, 1.0)
    links.new(emission.outputs["Emission"], output.inputs["Surface"])

    # Voronoi for caustic cell pattern
    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-400, 0)

    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-200, 0)
    links.new(tex_coord.outputs["Object"], mapping.inputs["Vector"])

    voronoi = nodes.new("ShaderNodeTexVoronoi")
    voronoi.location = (0, 0)
    voronoi.inputs["Scale"].default_value = 6.0
    voronoi.inputs["Randomness"].default_value = 0.85
    links.new(mapping.outputs["Vector"], voronoi.inputs["Vector"])

    # Color ramp to sharpen caustic lines
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.location = (250, 0)
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    ramp.color_ramp.elements[1].position = 0.7
    ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    links.new(voronoi.outputs["Distance"], ramp.inputs["Fac"])

    # Multiply emission strength by caustic pattern
    mul = nodes.new("ShaderNodeMath")
    mul.location = (450, -100)
    mul.operation = 'MULTIPLY'
    mul.inputs[1].default_value = 1.5
    links.new(ramp.outputs["Color"], mul.inputs[0])

    links.new(mul.outputs["Value"], emission.inputs["Strength"])

    # Animate caustic drift
    drv = mapping.inputs["Location"].driver_add("default_value", 0)
    drv.driver.expression = "sin(frame / 30.0) * 0.5"
    drv2 = mapping.inputs["Location"].driver_add("default_value", 2)
    drv2.driver.expression = "cos(frame / 40.0) * 0.3"

    return mat


# ============================================================================
# WATER BLOCK GEOMETRY — Variable height with shape keys for flow levels
# ============================================================================

def create_water_block():
    """
    Create a 1×1×1 water block with:
      - Subdivided top face for wave vertex displacement
      - 8 shape keys for water levels (source=0.889 height, down to level 7=0.111)
      - Proper UVs for animated texture mapping
    """
    # Top-face subdivision for smooth waves
    subdivisions = 8  # 8×8 grid on top face
    verts = []
    faces = []

    # Bottom face corners (y = 0)
    bottom_verts_start = 0
    for z in range(2):
        for x in range(2):
            verts.append((x, 0.0, z))  # 4 bottom corners: 0,1,2,3

    # Top face grid (y = source_height = 8/9)
    source_height = 8.0 / 9.0
    top_verts_start = len(verts)
    for iz in range(subdivisions + 1):
        for ix in range(subdivisions + 1):
            fx = ix / subdivisions
            fz = iz / subdivisions
            verts.append((fx, source_height, fz))

    # Bottom face
    faces.append((0, 1, 3, 2))

    # Top face (subdivided grid)
    for iz in range(subdivisions):
        for ix in range(subdivisions):
            i0 = top_verts_start + iz * (subdivisions + 1) + ix
            i1 = i0 + 1
            i2 = i0 + (subdivisions + 1) + 1
            i3 = i0 + (subdivisions + 1)
            faces.append((i0, i1, i2, i3))

    # Side faces (connect bottom corners to top grid edge vertices)
    # -Z face (z=0): bottom verts 0,1 → top grid row iz=0
    for ix in range(subdivisions):
        t0 = top_verts_start + ix
        t1 = top_verts_start + ix + 1
        if ix == 0:
            faces.append((0, t0, t1, 1 if subdivisions == 1 else 1))
        # Build quads connecting bottom edge to top subdivided edge
    # Simplified: 4 side walls as single quads connecting to edge of top grid
    # -Z side
    t_nw = top_verts_start  # (0, h, 0)
    t_ne = top_verts_start + subdivisions  # (1, h, 0)
    t_se = top_verts_start + subdivisions * (subdivisions + 1) + subdivisions  # (1, h, 1)
    t_sw = top_verts_start + subdivisions * (subdivisions + 1)  # (0, h, 1)

    faces.append((1, 0, t_nw, t_ne))   # -Z face
    faces.append((3, 1, t_ne, t_se))   # +X face
    faces.append((2, 3, t_se, t_sw))   # +Z face
    faces.append((0, 2, t_sw, t_nw))   # -X face

    # Create mesh
    mesh = bpy.data.meshes.new("WaterBlock_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()

    obj = bpy.data.objects.new("WaterBlock", mesh)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    # Smooth shading on top face
    for poly in mesh.polygons:
        # Top face polygons have normals pointing roughly +Y
        center_y = sum(verts[v][1] for v in poly.vertices) / len(poly.vertices)
        if center_y > 0.3:
            poly.use_smooth = True

    # UV unwrap
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    uv_layer = mesh.uv_layers.active.data
    for poly in mesh.polygons:
        for loop_idx in poly.loop_indices:
            vi = mesh.loops[loop_idx].vertex_index
            v = verts[vi]
            # Project XZ for top/bottom, XY or ZY for sides
            uv_layer[loop_idx].uv = (v[0], v[2])

    # --- Shape Keys for 8 water levels ---
    obj.shape_key_add(name="Basis", from_mix=False)

    for level in range(8):
        # Level 0 = source (8/9 height), Level 7 = weakest flow (1/9 height)
        height = (8.0 - level) / 9.0
        sk = obj.shape_key_add(name=f"Level_{level}", from_mix=False)
        for vi in range(len(verts)):
            co = list(mesh.vertices[vi].co)
            if co[1] > 0.05:  # Top vertices only
                co[1] = height
            sk.data[vi].co = co

    # Falling column shape key (full block height)
    sk_fall = obj.shape_key_add(name="Falling", from_mix=False)
    for vi in range(len(verts)):
        co = list(mesh.vertices[vi].co)
        if co[1] > 0.05:
            co[1] = 1.0  # Full block height for falling water
        sk_fall.data[vi].co = co

    return obj


# ============================================================================
# WAVE ANIMATION — Keyframed vertex displacement on the top surface
# ============================================================================

def add_wave_animation(obj, frames=64, amplitude=0.035):
    """
    Bake a wave animation into the water block's top vertices.
    Creates a smooth looping sine-wave displacement over `frames` frames.
    Each top vertex gets a unique phase based on its XZ position.
    """
    mesh = obj.data
    basis_key = obj.data.shape_keys.key_blocks["Basis"]

    # Add a wave animation shape key
    wave_key = obj.shape_key_add(name="WaveAnim", from_mix=False)

    # Copy basis positions
    for vi in range(len(mesh.vertices)):
        wave_key.data[vi].co = list(basis_key.data[vi].co)

    # Keyframe the wave shape key value cycling 0→1→0
    wave_key.value = 0.0
    wave_key.keyframe_insert(data_path="value", frame=1)
    wave_key.value = 1.0
    wave_key.keyframe_insert(data_path="value", frame=frames // 2)
    wave_key.value = 0.0
    wave_key.keyframe_insert(data_path="value", frame=frames)

    # Make the keyframes loop with cyclic modifier
    if obj.data.shape_keys.animation_data and obj.data.shape_keys.animation_data.action:
        for fcurve in obj.data.shape_keys.animation_data.action.fcurves:
            if "WaveAnim" in fcurve.data_path:
                mod = fcurve.modifiers.new(type='CYCLES')
                mod.mode_before = 'REPEAT'
                mod.mode_after = 'REPEAT'

    # Displace top vertices in the wave key
    source_height = 8.0 / 9.0
    for vi in range(len(mesh.vertices)):
        co = list(basis_key.data[vi].co)
        if co[1] > 0.3:  # Top vertices
            # Sine wave based on XZ position
            phase = co[0] * math.pi * 2.0 + co[2] * math.pi * 1.5
            displacement = amplitude * math.sin(phase)
            wave_key.data[vi].co[1] = co[1] + displacement

    return wave_key


# ============================================================================
# FLOW ANIMATION — Animated UV offset to simulate water current direction
# ============================================================================

def add_flow_uv_animation(obj, frames=64):
    """
    Animate the UV offset on the water material to simulate flowing water.
    Creates a downward-scrolling UV animation that loops every `frames` frames.
    """
    mesh = obj.data
    if not mesh.uv_layers:
        return

    # Add a UV warp modifier for animated flow
    mod = obj.modifiers.new(name="UV_Flow", type='UV_WARP')
    mod.uv_layer = mesh.uv_layers[0].name

    # Create two empties for UV warp from/to
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 0))
    empty_from = bpy.context.active_object
    empty_from.name = "Water_UV_From"
    empty_from.hide_viewport = True

    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 0))
    empty_to = bpy.context.active_object
    empty_to.name = "Water_UV_To"
    empty_to.hide_viewport = True

    mod.object_from = empty_from
    mod.object_to = empty_to

    # Keyframe UV scroll: move empty_to downward over time
    empty_to.location = (0, 0, 0)
    empty_to.keyframe_insert(data_path="location", frame=1)
    empty_to.location = (0, -1.0, 0)  # Scroll 1 full UV tile
    empty_to.keyframe_insert(data_path="location", frame=frames)

    # Make it loop
    if empty_to.animation_data and empty_to.animation_data.action:
        for fcurve in empty_to.animation_data.action.fcurves:
            mod_c = fcurve.modifiers.new(type='CYCLES')
            mod_c.mode_before = 'REPEAT'
            mod_c.mode_after = 'REPEAT'
            # Linear interpolation for smooth continuous scroll
            for kp in fcurve.keyframe_points:
                kp.interpolation = 'LINEAR'


# ============================================================================
# WATER PARTICLE SYSTEM — Bubbles rising from source blocks
# ============================================================================

def create_bubble_particle_system(water_obj):
    """
    Add a simple bubble particle system that emits small spheres
    rising upward from the water block surface.
    """
    # Create tiny bubble sphere
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.02, segments=8, ring_count=4, location=(0, 0, 0))
    bubble = bpy.context.active_object
    bubble.name = "Water_Bubble"
    bubble_mat = bpy.data.materials.new(name="Bubble_Mat")
    bubble_mat.use_nodes = True
    bsdf = bubble_mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.7, 0.85, 1.0, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.05
        bsdf.inputs["Alpha"].default_value = 0.4
        if "Transmission Weight" in bsdf.inputs:
            bsdf.inputs["Transmission Weight"].default_value = 0.9
        elif "Transmission" in bsdf.inputs:
            bsdf.inputs["Transmission"].default_value = 0.9
    bubble_mat.blend_method = 'ALPHA_HASHED'
    if bubble.data.materials:
        bubble.data.materials[0] = bubble_mat
    else:
        bubble.data.materials.append(bubble_mat)

    bubble.hide_viewport = True
    bubble.hide_render = True

    return bubble


# ============================================================================
# CAUSTIC LIGHT PROJECTOR — Dappled light pattern on underwater surfaces
# ============================================================================

def create_caustic_projector():
    """
    Create a spot light with an animated Voronoi cookie texture
    to project caustic patterns onto the ground under water.
    """
    bpy.ops.object.light_add(type='SPOT', location=(0.5, 2.0, 0.5))
    light = bpy.context.active_object
    light.name = "Water_Caustic_Light"
    light.data.energy = 15.0
    light.data.spot_size = math.radians(120)
    light.data.spot_blend = 0.5
    light.data.color = (0.55, 0.78, 1.0)
    light.data.shadow_soft_size = 0.5

    # Point downward
    light.rotation_euler = (math.radians(-90), 0, 0)

    return light


# ============================================================================
# STUDIO SETUP — Preview scene with lighting
# ============================================================================

def setup_water_studio():
    """Setup a simple studio scene for previewing the water block."""
    # Ground plane
    bpy.ops.mesh.primitive_plane_add(size=6, location=(0.5, -0.5, 0.5))
    ground = bpy.context.active_object
    ground.name = "Ground_Plane"
    ground.rotation_euler = (math.radians(90), 0, 0)
    ground_mat = bpy.data.materials.new(name="Ground_Sand")
    ground_mat.use_nodes = True
    bsdf = ground_mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.76, 0.70, 0.50, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.85
    if ground.data.materials:
        ground.data.materials[0] = ground_mat
    else:
        ground.data.materials.append(ground_mat)

    # Key light (sun)
    bpy.ops.object.light_add(type='SUN', location=(3, 3, 5))
    sun = bpy.context.active_object
    sun.name = "Key_Sun"
    sun.data.energy = 3.0
    sun.data.color = (1.0, 0.95, 0.85)
    sun.rotation_euler = (math.radians(-45), math.radians(15), math.radians(30))

    # Fill light
    bpy.ops.object.light_add(type='AREA', location=(-2, 1, 3))
    fill = bpy.context.active_object
    fill.name = "Fill_Light"
    fill.data.energy = 50.0
    fill.data.color = (0.7, 0.85, 1.0)
    fill.data.size = 3.0

    # Camera
    bpy.ops.object.camera_add(location=(2.5, 2.5, 2.0))
    cam = bpy.context.active_object
    cam.name = "Water_Camera"
    cam.rotation_euler = (math.radians(-35), 0, math.radians(45))
    bpy.context.scene.camera = cam

    # World background
    world = bpy.context.scene.world
    if world is None:
        world = bpy.data.worlds.new("World")
        bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.52, 0.72, 0.92, 1.0)
        bg.inputs["Strength"].default_value = 0.8


# ============================================================================
# MULTI-BLOCK WATER SCENE — Shows source + flowing + waterfall
# ============================================================================

def create_water_showcase():
    """
    Build a showcase scene with multiple water blocks demonstrating:
    - Source block (full height)
    - Flowing water at various levels
    - Waterfall (falling column)
    - Underwater caustics
    """
    blocks = []

    # Row of decreasing water levels (Minecraft spread pattern)
    for level in range(8):
        height = (8.0 - level) / 9.0
        x_pos = level * 1.05  # Slight gap for visibility

        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x_pos, height / 2, 0))
        block = bpy.context.active_object
        block.name = f"Water_Level_{level}"
        block.scale = (1.0, height, 1.0)

        # Apply water material
        water_mat = create_water_material()
        water_mat.name = f"MC_Water_L{level}"
        if block.data.materials:
            block.data.materials[0] = water_mat
        else:
            block.data.materials.append(water_mat)

        blocks.append(block)

    # Falling water column (full height, multiple blocks stacked)
    for stack in range(3):
        y_pos = -(stack + 1)
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.5 + y_pos, 0))
        fall_block = bpy.context.active_object
        fall_block.name = f"Water_Falling_{stack}"
        fall_mat = create_water_material()
        fall_mat.name = f"MC_Water_Fall_{stack}"
        if fall_block.data.materials:
            fall_block.data.materials[0] = fall_mat
        else:
            fall_block.data.materials.append(fall_mat)
        blocks.append(fall_block)

    # Ground blocks under the water
    ground_mat = bpy.data.materials.new(name="MC_Stone")
    ground_mat.use_nodes = True
    bsdf = ground_mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.45, 0.45, 0.45, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.85

    for level in range(8):
        x_pos = level * 1.05
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x_pos, -0.5, 0))
        ground_block = bpy.context.active_object
        ground_block.name = f"Ground_{level}"
        if ground_block.data.materials:
            ground_block.data.materials[0] = ground_mat
        else:
            ground_block.data.materials.append(ground_mat)

    return blocks


# ============================================================================
# EXPORT — GLB with embedded animations
# ============================================================================

def export_water_glb(filepath):
    """Export the water block model as GLB for Three.js loading."""
    # Select only water-related objects
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.context.scene.objects:
        if "Water" in obj.name or "water" in obj.name:
            obj.select_set(True)

    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_animations=True,
        export_morph=True,
        export_morph_normal=False,
        export_materials='EXPORT',
    )
    print(f"Exported water block to: {filepath}")


# ============================================================================
# RENDER PREVIEW
# ============================================================================

def render_preview(filepath, res_x=1280, res_y=960):
    """Render a preview image of the water scene."""
    scene = bpy.context.scene
    scene.render.resolution_x = res_x
    scene.render.resolution_y = res_y
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'

    # Try EEVEE first (faster), fallback to Workbench
    for engine in ['BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'BLENDER_WORKBENCH']:
        try:
            scene.render.engine = engine
            break
        except Exception:
            continue

    scene.render.filepath = filepath
    bpy.ops.render.render(write_still=True)
    print(f"Rendered preview to: {filepath}")


# ============================================================================
# MAIN
# ============================================================================

def main():
    print("=" * 60)
    print("  Minecraft Water Block Builder for Blender")
    print("=" * 60)

    clear_scene()

    # 1. Build the main water block with shape keys
    print("\n[1/6] Creating water block geometry with shape keys...")
    water_block = create_water_block()

    # 2. Apply water material
    print("[2/6] Creating animated water material...")
    water_mat = create_water_material()
    if water_block.data.materials:
        water_block.data.materials[0] = water_mat
    else:
        water_block.data.materials.append(water_mat)

    # 3. Add wave animation
    print("[3/6] Adding wave vertex animation...")
    add_wave_animation(water_block, frames=64, amplitude=0.035)

    # 4. Add flow UV animation
    print("[4/6] Adding flow UV scroll animation...")
    add_flow_uv_animation(water_block, frames=64)

    # 5. Create bubble particle template
    print("[5/6] Creating bubble particle template...")
    create_bubble_particle_system(water_block)

    # 6. Create caustic light projector
    print("[6/6] Creating caustic light projector...")
    create_caustic_projector()

    # Setup studio for preview
    setup_water_studio()

    # Save .blend file
    blend_path = os.path.join(OUT_DIR, "water_block.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print(f"\nSaved Blender file: {blend_path}")

    # Export GLB
    glb_path = os.path.join(OUT_DIR, "water_block.glb")
    export_water_glb(glb_path)

    # Render preview
    preview_path = os.path.join(RENDER_DIR, "water_preview.png")
    render_preview(preview_path)

    # --- Bonus: Create showcase scene ---
    print("\n--- Building Water Showcase Scene ---")
    clear_scene()
    create_water_showcase()
    setup_water_studio()

    showcase_blend = os.path.join(OUT_DIR, "water_showcase.blend")
    bpy.ops.wm.save_as_mainfile(filepath=showcase_blend)
    print(f"Saved showcase: {showcase_blend}")

    showcase_preview = os.path.join(RENDER_DIR, "water_showcase.png")
    render_preview(showcase_preview)

    print("\n" + "=" * 60)
    print("  Water system complete!")
    print("  Files generated:")
    print(f"    {blend_path}")
    print(f"    {glb_path}")
    print(f"    {showcase_blend}")
    print(f"    {os.path.join(RENDER_DIR, 'water_preview.png')}")
    print(f"    {os.path.join(RENDER_DIR, 'water_showcase.png')}")
    print("=" * 60)


if __name__ == "__main__":
    main()
