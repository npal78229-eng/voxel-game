# One-Headed Red Dragon Boss — 3D Model & Animation Documentation

![Red Dragon Boss Showcase](/red_dragon_boss_render.png)

## Overview

A complete **one-headed red dragon boss 3D model** crafted specifically in **Blender 5.2** adhering to authentic Minecraft-inspired blocky/voxel aesthetics. The model features clean geometric modularity, flat shading, rigid bone parenting, custom shaders, and **11 boss animations**.

* **Blend File Location**: [red_dragon_boss.blend](file:///c:/Users/npal7/OneDrive/PROJECT/project1/MOB/red_dragon_boss.blend)
* **High-Res Render**: [red_dragon_boss_render.png](file:///c:/Users/npal7/OneDrive/PROJECT/project1/MOB/red_dragon_boss_render.png)
* **Python Generator Script**: [generate_red_dragon.py](file:///c:/Users/npal7/OneDrive/PROJECT/project1/MOB/generate_red_dragon.py)

---

## Dragon Architecture & Anatomy

### 1. Head & Facial Features
* **Exactly ONE Head**: Massive, intimidating skull block (`Dragon_Head_Skull`) with an extended snout block (`Dragon_Head_Snout`), dark nostrils, and angled brow ridges (`Dragon_Brow_L/R`) providing an aggressive predatory glare.
* **Two Large Horns**: Multi-segmented stepped horns (`Dragon_Horn_Base`, `Mid`, `Tip`, `Spike`) curving backwards and upwards from the rear temples of the skull in charred obsidian bone.
* **Glowing Eyes**: Emissive fiery yellow/orange eye blocks (`Mat_Dragon_EyeGlow`, emission strength 7.0) with dark vertical slit pupils (`Dragon_Eye_Pupil_L/R`).
* **Mouth & Teeth**: Independent hinging lower jaw (`Dragon_Jaw_Main`, `Dragon_Jaw_Under`) with a chin spur (`Dragon_Chin_Spur`). Upper jaw features 6 sharp ivory corner fangs; lower jaw features 6 interlocking upward fangs.

### 2. Neck & Continuous Dorsal Spikes
* **Thick Neck**: 3 robust blocky neck segments (`Dragon_Neck_1`, `2`, `3`) with dark obsidian ventral plates (`Dragon_Neck_Under_1`, `2`, `3`) underneath.
* **Continuous Dorsal Spikes**: 7 sharp 4-sided Minecraft pyramid spikes (`Dragon_Spike_Neck_1..3` and `Dragon_Spike_Back_1..4`) continuing uninterrupted from behind the skull, down the neck, and across the spine to the pelvis.

### 3. Torso & Underbelly
* **Body**: Heavy crimson chest box (`Dragon_Body_Main`) and pelvic block (`Dragon_Body_Hips`).
* **Depth & Contrast**: Ventral armor plates (`Dragon_Body_Underbelly`, `Dragon_Hips_Underbelly`) in dark charcoal-red obsidian to create depth beneath the body.

### 4. Wings (Blocky Minecraft Structure)
* **Minecraft Wing Architecture**:
  * Heavy shoulder joint hinges (`Dragon_Wing_Joint_L/R`)
  * Leading spar beams (`Dragon_Wing_Spar_Inner_L/R` & `Dragon_Wing_Spar_Outer_L/R`)
  * Angled leathery membrane panels (`Dragon_Wing_Membrane_In/Out_L/R`) with darker underside depth panels (`Dragon_Wing_Under_In/Out_L/R`)
  * Trailing finger struts / ribs (`Dragon_Wing_Finger_1/2_L/R`) creating notched Minecraft wing silhouettes.

### 5. Four Legs & Claws
* **Front Legs**: Muscular shoulder blocks, forearm blocks, broad paw blocks, and 3 sharp ivory claws per foot.
* **Rear Legs**: Heavy hindquarter thighs, backward-canted shins, wide rear foot blocks, and 3 sharp claws per foot.

### 6. Tail
* **Uncluttered & Iconic**: 4 clean, long tapering segments (`Dragon_Tail_1..4`) with dark ventral plates, free of excessive spikes as requested.
* **Tail Fin**: Aerodynamic dual-plane dragon tail spade fin at the tip (`Dragon_Tail_Blade_H` and `Dragon_Tail_Blade_V`).

---

## Material Palette

| Material Name | Base Color | Roughness | Emission | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `Mat_Dragon_Crimson` | `(0.58, 0.05, 0.07)` | 0.55 | — | Primary crimson dragon hide |
| `Mat_Dragon_DeepRed` | `(0.34, 0.02, 0.038)` | 0.50 | — | Joints, shoulders, brow, wing spars |
| `Mat_Dragon_Underbelly` | `(0.13, 0.025, 0.035)` | 0.65 | — | Ventral plates (belly, neck, tail underside) |
| `Mat_Dragon_Horns` | `(0.07, 0.055, 0.06)` | 0.38 | — | Charred obsidian horns & back spikes |
| `Mat_Dragon_EyeGlow` | `(1.0, 0.68, 0.02)` | 0.10 | 7.0 | Glowing boss eyes |
| `Mat_Dragon_Pupil` | `(0.015, 0.005, 0.01)` | 0.20 | — | Dark vertical slit pupils |
| `Mat_Dragon_Ivory` | `(0.88, 0.84, 0.72)` | 0.32 | — | Sharp teeth, fangs, and leg claws |
| `Mat_Dragon_WingMembrane` | `(0.48, 0.04, 0.06)` | 0.60 | — | Upper wing membrane surface |
| `Mat_Dragon_WingUnder` | `(0.20, 0.018, 0.028)` | 0.70 | — | Under-wing shadow membrane |
| `Mat_Arena_Stone` | `(0.07, 0.07, 0.08)` | 0.85 | — | Showcase arena floor platform |

---

## Boss Animations (All 11 Implemented)

All 11 animations are stored as distinct actions in Blender (`bpy.data.actions`) with `use_fake_user = True` so they can be switched in the Dope Sheet / Action Editor, NLA Editor, or exported directly to game engines:

| # | Action Name | Frames | Description |
| :-: | :--- | :-: | :--- |
| **1** | `01_Idle_Breathing` | 1–40 | Subtle chest expansion, rhythmic neck bobbing, jaw slightly parted, graceful S-curve tail sway, and wing flexion. |
| **2** | `02_Walking` | 1–33 | Heavy 4-beat quadruped walk cycle with alternating diagonal leg strides, spine shift, and counter-balancing tail rhythm. |
| **3** | `03_Running` | 1–21 | Aggressive low-prowl boss charge; spine pitched forward, head thrust low, wings swept back, rapid heavy footfalls. |
| **4** | `04_Wing_Flapping` | 1–25 | Deep, powerful aerial flap cycle: upward wing anticipation stroke followed by a massive downward power snap. |
| **5** | `05_Flying` | 1–49 | Majestic cruising & soaring loop with tucked legs, subtle steering flaps, and trailing aerodynamic tail sway. |
| **6** | `06_Landing` | 1–50 | Descent glide, wide air-brake wing flare to decelerate, deep legs-absorbed impact touchdown crouch, and rise to ready stance. |
| **7** | `07_Roaring` | 1–58 | Crouch windup, towering rear-up onto hind legs, wings flared to full intimidation wingspan, and gaping 42° roar. |
| **8** | `08_Fire_Breath` | 1–48 | Inhale coil back, explosive forward neck strike, wide jaw gape, and sustained sweeping cone of fire from side to side. |
| **9** | `09_Claw_Attack` | 1–38 | Weight shift to rear/left, right claw raised menacingly, followed by a vicious diagonal swipe cleaving through the front arc. |
| **10** | `10_Ground_Slam` | 1–48 | Massive boss leap/rear-up with wings raised high, crashing both front paws and chest into the ground in a devastating shockwave. |
| **11** | `11_Tail_Movement` | 1–42 | Defensive/offensive tail attack: coils tail tight to one flank, then whips 180° across the rear arc to clear players behind. |

---

## Outliner Organization

```
Scene Collection
 ├── 00_Lighting_And_Stage
 │    ├── Boss_Arena_Platform
 │    ├── Boss_Camera
 │    ├── Camera_Boss_Target
 │    ├── Key_Light (Sun)
 │    ├── Rim_Light (Sun)
 │    └── Fill_Light (Point)
 ├── 01_Head_And_Neck
 │    ├── Dragon_Head_Skull, Dragon_Head_Snout, Dragon_Brow_L/R
 │    ├── Dragon_Eye_L/R, Dragon_Eye_Pupil_L/R
 │    ├── Dragon_Horn_Base_L/R, Mid, Tip, Spike
 │    ├── Dragon_Jaw_Main, Dragon_Jaw_Under, Dragon_Chin_Spur
 │    ├── Dragon_Fang_Upper_* / Lower_*
 │    ├── Dragon_Neck_1, 2, 3 & Under-Plates
 │    └── Dragon_Spike_Neck_1, 2, 3
 ├── 02_Body_And_Spikes
 │    ├── Dragon_Body_Main, Dragon_Body_Hips
 │    ├── Dragon_Body_Underbelly, Dragon_Hips_Underbelly
 │    └── Dragon_Spike_Back_1, 2, 3, 4
 ├── 03_Wings
 │    ├── Dragon_Wing_Joint_L/R
 │    ├── Dragon_Wing_Spar_Inner_L/R, Outer_L/R
 │    ├── Dragon_Wing_Membrane_In_L/R, Out_L/R (Top & Under)
 │    └── Dragon_Wing_Finger_1_L/R, 2_L/R
 ├── 04_Legs_And_Claws
 │    ├── Dragon_Leg_Front_Upper_L/R, Lower_L/R, Foot_L/R, Claws_L/R
 │    └── Dragon_Leg_Rear_Upper_L/R, Lower_L/R, Foot_L/R, Claws_L/R
 ├── 05_Tail
 │    ├── Dragon_Tail_1, 2, 3, 4 & Under-Plates
 │    └── Dragon_Tail_Blade_H, Dragon_Tail_Blade_V
 └── Dragon_Rig (Armature with 28 Pose Bones)
```

---

## Game Engine Export (glTF / FBX)

To export the dragon boss with all 11 animations into Unity, Unreal Engine, Godot, or Three.js:

### glTF 2.0 Export (Recommended for web & modern engines)
In Blender:
1. Go to **File → Export → glTF 2.0 (.glb / .gltf)**
2. In the Export settings:
   * **Include**: Selected Objects (or Visible Objects)
   * **Transform**: `+Y Up`
   * **Animation**: Check `Animation`, check `Group by NLA Track` or `Actions`
   * **Materials**: Export Principled BSDF materials

Or via Blender CLI:
```powershell
& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b "c:\Users\npal7\OneDrive\PROJECT\project1\MOB\red_dragon_boss.blend" --python-expr "import bpy; bpy.ops.export_scene.gltf(filepath='c:/Users/npal7/OneDrive/PROJECT/project1/MOB/red_dragon_boss.glb', export_format='GLB', export_animations=True)"
```
