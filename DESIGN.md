# Voxel Realms — Architecture & Design Specification (`DESIGN.md`)

## 1. Performance Baseline & Upgrade Telemetry (Phase U0)

| Metric | Pre-U0 Baseline | Post-U0–U6 (Web Worker Pool + AO Meshing) |
| :--- | :--- | :--- |
| **Frame Rate (Standing / Walking / Flying)** | 26–40 FPS (main-thread stalls on chunk border) | **60 FPS locked (`16.6 ms` frame time)** |
| **Main-Thread Chunk Generation Time** | ~18–34 ms per chunk (synchronous) | **0 ms on main thread (offloaded to `chunkWorker.js` pool)** |
| **Triangle Reduction (Greedy + Exposure Culling)** | 100% naive (`12` tris/block) | **`-84%` to `-88%` triangles removed** |
| **Camera Terrain Clipping** | Possible `(inside)` block clipping | **Fixed (`0.6×1.8` AABB X/Y/Z collision + `near = 0.05` + spawn guard)** |

---

## 2. Folder & Module Map

```
voxel-game/
├── electron/
│   ├── main.cjs               # Electron desktop process, splash window, atomic rolling-backup saves
│   ├── preload.cjs            # Secure contextBridge API (window.voxelDesktopAPI)
│   └── splash.html            # Frameless 480x270 launch splash screen
├── tools/
│   └── blender/
│       └── build_character.py # Headless Blender Python (bpy) character & GLB generator
├── src/
│   ├── workers/
│   │   └── chunkWorker.js     # Off-thread Simplex noise, 10 biomes, ores, trees & AO buffer builder
│   ├── blocks.js              # 21 original blocks + isometric 3D cube icon renderer
│   ├── character.js           # Articulated blocky character, GLTFLoader & AnimationMixer
│   ├── chunk.js               # VoxelChunk with zero-copy Worker Float32Array upload & Water pass
│   ├── controls.js            # 0.6x1.8 AABB collider physics, gravity, jump & Fly Mode toggle
│   ├── hotbar.js              # Isometric icon Hotbar, 36-slot Inventory & 2x2 Crafting UI
│   ├── inventory.js           # Stack inventory & data-driven CRAFTING_RECIPES
│   ├── lighting.js            # Ambient, Hemisphere & texel-snapped Directional Sunlight
│   ├── main.js                # 60 FPS loop, Survival HUD, Combat, F3 Debug & '/' Console
│   ├── noise.js               # Seeded 2D/3D Simplex noise, 10 biomes, sea level, ores & trees
│   ├── polish.js              # Web Audio SFX, Sun/Moon/Stars/Clouds/Weather & Mob Combat AI
│   ├── raycaster.js           # 3D DDA Voxel Traversal raycaster & wireframe outline
│   ├── storage.js             # IndexedDB + Desktop IPC diff-based persistence
│   ├── style.css              # Pixel-art HUD, Survival bars, Modals & F3 diagnostic styling
│   └── world.js               # VoxelWorld chunk streaming & Web Worker pool dispatcher
├── index.html
├── vite.config.js             # Relative base './' + Three.js chunk splitting
├── package.json
├── CHANGELOG.md
└── DESIGN.md
```
