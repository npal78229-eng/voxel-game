# Two-Headed Black Dragon Boss — 3D Model & Animation Documentation

![Two-Headed Black Dragon Boss Showcase](/two_headed_black_dragon_render.png)

## Overview

A complete **two-headed black dragon boss 3D model** created directly in **Blender 5.2** adhering to authentic Minecraft-inspired blocky/voxel aesthetics. The model features **exactly two heads** supported by **two very long, independently articulated necks**, sharp spines along both necks and upper spine, a heavy black body with dark obsidian underbelly plates, massive blocky wings, a simple dragon tail, and **14 custom boss animations**.

* **Blend File Location**: [two_headed_black_dragon.blend](file:///c:/Users/npal7/OneDrive/PROJECT/project1/two_headed_black_dragon/two_headed_black_dragon.blend)
* **Game-Ready glTF (GLB)**: [two_headed_black_dragon.glb](file:///c:/Users/npal7/OneDrive/PROJECT/project1/two_headed_black_dragon/two_headed_black_dragon.glb)
* **High-Res Showcase Render**: [two_headed_black_dragon_render.png](file:///c:/Users/npal7/OneDrive/PROJECT/project1/two_headed_black_dragon/two_headed_black_dragon_render.png)
* **Python Generator Script**: [generate_two_headed_black_dragon.py](file:///c:/Users/npal7/OneDrive/PROJECT/project1/two_headed_black_dragon/generate_two_headed_black_dragon.py)
* **Directory**: `c:\Users\npal7\OneDrive\PROJECT\project1\two_headed_black_dragon` (saved directly near `blocks`)

---

## Dragon Architecture & Anatomy

### 1. Two Heads & Two Very Long Necks
* **Exactly TWO Heads**:
  * **Left Head**: Aggressive snarl expression with wider splayed horn arches and a ferocious downward-canted brow ridge.
  * **Right Head**: Distinct upward-arching horn angle, menacing predatory gaze, and custom jaw posture.
  * **Glowing Eyes**: Emissive fiery red/orange eyes (`Mat_Dragon_EyeGlow`, emission strength 8.0) with dark slit pupils (`Dragon_Pupil_*`).
  * **Teeth & Jaws**: Both heads have independently hinged lower jaws (`Dragon_Jaw_Main_L/R`), chin spurs (`Dragon_Chin_Spur_L/R`), and upper & lower sharp ivory fangs.
  * **Horns**: Two large horns per head (total of **4 large horns** across the dragon), built with stepped voxel segments and sharp obsidian bone tips.
* **Very Long Necks**:
  * 5 massive blocky neck segments per neck, rising high above the chest.
  * Branch cleanly outward from the heavy chest so both necks maintain independent clearance and never merge.
  * **Sharp Spikes Along Both Necks**: Each segment of both necks bears a sharp 4-sided Minecraft pyramid spike (`Dragon_Neck_Spike_L_1..5` and `Dragon_Neck_Spike_R_1..5`) running continuously down each neck.

### 2. Massive Torso & Back Spikes
* **Heavy Chest & Hips**: Wide, massive black body (`Dragon_Body_Main`, `Dragon_Body_Hips`) engineered to believably support the leverage of two long necks and massive wings.
* **Underbelly Armor Plates**: Deep obsidian-black ventral plates (`Dragon_Body_Underbelly`, `Dragon_Hips_Underbelly`) for depth and contrast underneath.
* **Dorsal Spine Spikes**: 4 large 4-sided sharp pyramid spikes running down the upper and mid spine between the shoulders and hips.

### 3. Wings & Legs
* **Wings**: Blocky Minecraft architecture with thick shoulder joints, leading spar beams, angled leathery membrane panels (`Mat_Dragon_WingMembrane`), trailing ribs/struts, and darker underwing panels (`Mat_Dragon_WingUnder`).
* **Four Powerful Legs**: Muscular charcoal upper thighs/shoulders, black lower shins/forearms, and wide paw blocks with 3 sharp ivory claws per foot.

### 4. Simple Dragon Tail
* **Uncluttered Silhouette**: 5 long, clean tapering segments with dark ventral plates, free of excessive spikes as strictly requested.
* **Tail Fin**: Aerodynamic dragon tail spade fin at the tip (`Dragon_Tail_Blade_H` and `Dragon_Tail_Blade_V`).

---

## Material Palette

| Material Name | Base Color | Roughness | Emission | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `Mat_Dragon_Black` | `(0.04, 0.04, 0.045)` | 0.55 | — | Primary deep pitch-black boss scales |
| `Mat_Dragon_Charcoal` | `(0.09, 0.09, 0.10)` | 0.48 | — | Shoulders, joints, wing spars, brow |
| `Mat_Dragon_ObsidianBelly` | `(0.02, 0.02, 0.025)` | 0.65 | — | Dark obsidian ventral plates (belly, necks, tail) |
| `Mat_Dragon_DarkHorns` | `(0.06, 0.055, 0.065)` | 0.35 | — | Obsidian horns and neck/back spikes |
| `Mat_Dragon_EyeGlow` | `(1.0, 0.22, 0.02)` | 0.10 | 8.0 | Glowing fiery red/orange boss eyes |
| `Mat_Dragon_Pupil` | `(0.005, 0.005, 0.005)` | 0.20 | — | Dark vertical slit pupils |
| `Mat_Dragon_Ivory` | `(0.86, 0.82, 0.70)` | 0.32 | — | Sharp ivory teeth, fangs, and claws |
| `Mat_Dragon_WingMembrane` | `(0.065, 0.065, 0.075)` | 0.60 | — | Upper wing membrane surface |
| `Mat_Dragon_WingUnder` | `(0.025, 0.025, 0.03)` | 0.72 | — | Under-wing shadow membrane |
| `Mat_Arena_Stone` | `(0.05, 0.05, 0.06)` | 0.85 | — | Showcase arena floor platform |

---

## Boss Animations (All 14 Implemented)

All 14 actions are saved as distinct actions in `bpy.data.actions` with `use_fake_user = True`:

| # | Action Name | Frames | Description |
| :-: | :--- | :-: | :--- |
| **1** | `01_Idle_Breathing` | 1–40 | Rhythmic breathing; both long necks sway in subtle offset harmony, jaws parted, tail sways, wings flex. |
| **2** | `02_Walking` | 1–33 | Heavy 4-beat quadruped walk cycle; both long necks counter-bob with distinct rhythmic stride compensation. |
| **3** | `03_Running` | 1–21 | Low forward boss charge; spine pitched forward, both heads thrust low and forward aggressively with open jaws. |
| **4** | `04_Head_Movement` | 1–45 | Autonomous multi-headed scouting; Left head surveys high-left while Right head tracks low-right, then vice-versa. |
| **5** | `05_Roaring_Both` | 18–55 | Alternating intimidation roar: Left head rears and roars, followed immediately by Right head's deafening roar. |
| **6** | `06_Wing_Flapping` | 1–25 | Deep aerial upstroke anticipation followed by a massive downward flap snap. |
| **7** | `07_Flying` | 1–49 | Cruising loop with legs tucked back, aerodynamic neck adjustments, and trailing rudder tail sway. |
| **8** | `08_Landing` | 1–50 | Descent glide, wide air-brake wing flare to decelerate, deep touchdown crouch absorbing shock, and rise to ready stance. |
| **9** | `09_Left_Head_Bite` | 12–38 | Left head coils back, lunges forward with an explosive diagonal snap bite while Right head watches and braces. |
| **10** | `10_Right_Head_Bite` | 12–38 | Right head coils back, lunges forward with a vicious snapping bite while Left head guards the left flank. |
| **11** | `11_Simultaneous_Roar`| 1–56 | Both heads rear back together, jaws opening wide (46°), unleashing a synchronized thunder roar! |
| **12** | `12_Fire_Breath_Dual` | 15–50 | Inhale coil, both heads thrust forward with jaws wide open, unleashing criss-crossing streams of flame. |
| **13** | `13_Ground_Slam` | 18–48 | Rears up high with both long necks raised and wings spread, slamming both front paws and chest into the floor. |
| **14** | `14_Tail_Movement` | 1–42 | Tight flank coil followed by an explosive 180° sweep whip to clear opponents behind. |

---

## Outliner Hierarchy

```
Scene Collection
 ├── 00_Lighting_And_Stage
 │    ├── Boss_Arena_Platform
 │    ├── Boss_Camera
 │    ├── Camera_Boss_Target
 │    ├── Key_Light (Sun)
 │    ├── Rim_Light (Sun)
 │    └── Fill_Light (Point)
 ├── 01_Heads_And_Necks
 │    ├── Left Head & Neck:
 │    │    ├── Dragon_Neck_L_1..5 & Under-Plates
 │    │    ├── Dragon_Neck_Spike_L_1..5 (5 sharp spikes)
 │    │    ├── Dragon_Head_Skull_L, Snout, Brow, Nostrils
 │    │    ├── Dragon_Eye_L_L/R, Dragon_Pupil_L_L/R
 │    │    ├── Dragon_Horn_L_Base_1/2, Mid, Tip, Spike (2 horns)
 │    │    ├── Dragon_Jaw_Main_L, Under, Chin Spur
 │    │    └── Dragon_Fang_Upper_L_* / Lower_L_*
 │    └── Right Head & Neck:
 │         ├── Dragon_Neck_R_1..5 & Under-Plates
 │         ├── Dragon_Neck_Spike_R_1..5 (5 sharp spikes)
 │         ├── Dragon_Head_Skull_R, Snout, Brow, Nostrils
 │         ├── Dragon_Eye_R_L/R, Dragon_Pupil_R_L/R
 │         ├── Dragon_Horn_R_Base_1/2, Mid, Tip, Spike (2 horns)
 │         ├── Dragon_Jaw_Main_R, Under, Chin Spur
 │         └── Dragon_Fang_Upper_R_* / Lower_R_*
 ├── 02_Body_And_Spikes
 │    ├── Dragon_Body_Main, Dragon_Body_Hips
 │    ├── Dragon_Body_Underbelly, Dragon_Hips_Underbelly
 │    └── Dragon_Spike_Back_1..4 (4 dorsal back spikes)
 ├── 03_Wings
 │    ├── Dragon_Wing_Joint_L/R
 │    ├── Dragon_Wing_Spar_Inner_L/R, Outer_L/R
 │    ├── Dragon_Wing_Membrane_In_L/R, Out_L/R (Top & Under)
 │    └── Dragon_Wing_Finger_1_L/R, 2_L/R
 ├── 04_Legs_And_Claws
 │    ├── Dragon_Leg_Front_Upper_L/R, Lower_L/R, Foot_L/R, Claws
 │    └── Dragon_Leg_Rear_Upper_L/R, Lower_L/R, Foot_L/R, Claws
 ├── 05_Tail
 │    ├── Dragon_Tail_1..5 & Under-Plates
 │    └── Dragon_Tail_Blade_H, Dragon_Tail_Blade_V
 └── TwoHeaded_Dragon_Rig (Armature with 35 Pose Bones)
```
