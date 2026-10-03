# Three-Headed Emerald Dragon Boss (Minecraft Voxel / Block Style)

![Three-Headed Emerald Dragon Boss Render](C:/Users/npal7/.gemini/antigravity/brain/2cf2ed79-6bc0-4197-a652-59006974ab7f/three_headed_emerald_dragon_render.png)

## Overview & Concept Redesign
Sculpted completely from high-detail Minecraft-inspired voxel geometry and procedural stone block materials, this **Three-Headed Emerald Dragon Boss** has been redesigned to closely match the reference artwork:
- **Trident-Splayed Necks**: The center neck towers straight up, while the left and right necks arch widely outward (`X = ±5.0`), eliminating any clustering and framing all three heads distinctly across the sky.
- **Enlarged Roaring Jaws**: All three heads have been scaled up 1.35x and tilted upward into a roar, with cavernous lower jaws dropped deep down, exposing sharp ivory fangs and blazing green plasma energy inside the throats.
- **Multi-Tiered Crystalline Horns**: Each head features sharp segmented swept-back horns made from glowing lime-emerald crystal blocks, plus temple and chin spurs.
- **Raised High Wings**: The wing spars arch steeply upward into the sky (`Z = 13.5`), spanning out to the top corners with layered jagged emerald membrane slabs.
- **Procedural Micro-Voxel Scales**: Implemented fine brick normal bump maps across the body, giving the dragon the look of thousands of individual cubic scale tiles.
- **Dramatic Ground Fissure Underlighting**: A 2800W upward green area light illuminates the dragon's chest, belly, and legs from below against dark obsidian towers and atmospheric green haze.

---

## 3D Asset Files

All assets are updated and synchronized in both directories:
- **Primary Dragon Folder**: [`c:\Users\npal7\OneDrive\PROJECT\project1\dragon_boss`](file:///c:/Users/npal7/OneDrive/PROJECT/project1/dragon_boss)
- **Standalone Folder**: [`c:\Users\npal7\OneDrive\PROJECT\project1\three_headed_emerald_dragon`](file:///c:/Users/npal7/OneDrive/PROJECT/project1/three_headed_emerald_dragon)
- **High-Res Cycles Render (2560×1440)**: [`three_headed_emerald_dragon_render.png`](file:///c:/Users/npal7/OneDrive/PROJECT/project1/dragon_boss/three_headed_emerald_dragon_render.png)
- **Master Blender Scene**: [`three_headed_emerald_dragon.blend`](file:///c:/Users/npal7/OneDrive/PROJECT/project1/dragon_boss/three_headed_emerald_dragon.blend)
- **Game-Ready glTF / GLB Export**: [`three_headed_emerald_dragon.glb`](file:///c:/Users/npal7/OneDrive/PROJECT/project1/dragon_boss/three_headed_emerald_dragon.glb)
- **Automated Generator Script**: [`generate_three_headed_emerald_dragon.py`](file:///c:/Users/npal7/OneDrive/PROJECT/project1/dragon_boss/generate_three_headed_emerald_dragon.py)

---

## Technical Specifications

| Parameter | Specification |
| :--- | :--- |
| **Geometry** | 100% Voxel / Cubic Block primitives with sharp facets |
| **Scale Detail** | Procedural Micro-Voxel Brick Bump & Tonal Color Modulation |
| **Heads & Jaws** | 3 independent roaring heads, 1.35x enlarged skulls, dropped lower jaws |
| **Teeth** | 30+ sharp ivory bone fangs lining upper and lower jaws |
| **Horns** | 6 primary multi-segment swept crystalline horns + 6 temple spurs |
| **Wings** | Raised high arched spars reaching `Z = 13.5`, layered emerald membranes |
| **Lighting** | 3x 750W internal mouth lights, 2800W green ground fissure light, moonlight sun lamp |
| **Environment** | Ruined obsidian towers, green fire braziers, square moon, floating cubic embers |
| **Render Engine** | Blender 5.2 Cycles GPU Compute (CUDA) with AgX High Contrast & OpenImageDenoise |
