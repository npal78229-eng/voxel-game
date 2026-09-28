# Changelog — Voxel Realms

All notable changes and upgrade milestones (`Phases 0–6` + `Upgrade Phases U0–U7`) are documented in this file.

---

## [v2.0.0] — 2026-09-28 (Upgrade Suite: Phases U0–U7)

### Phase U0 — Stabilize & Performance Foundation
- **F3 Debug Overlay (`U0.1`):** Hidden by default (`#debug-overlay`), toggled via **`F3`**. Displays `FPS`, `Frame Time (ms)`, `Draw Calls`, `Greedy AO Mesh Reduction`, `Loaded Chunks`, `Worker Queue`, `Biome`, and `Physics Mode`.
- **Web Worker Meshing Pool (`U0.2`, `src/workers/chunkWorker.js`):** Moved procedural Simplex terrain, cave carving, 6-neighbor exposure culling, and per-voxel Ambient Occlusion baking off the main thread into a pool of ES Module Web Workers (`navigator.hardwareConcurrency - 1`, clamped `1..6`) returning zero-copy transferable `Float32Array` buffers.
- **Player AABB Collider Physics (`U0.3`, `src/controls.js`):** Implemented `0.6 × 1.8` player AABB collider (`eyeHeight = 1.62`), gravity, jumping (`Space`), axis-separated collision resolution (`X`, then `Z`, then `Y`), spawn safety elevation check, camera `near = 0.05`, and double-tap `Space` / `F` key **Fly Mode** toggle.
- **Renderer Hardening (`U0.3b`):** Configured `powerPreference: "high-performance"`, `SRGBColorSpace`, `pixelRatio <= 2`, and automatic chunk GPU buffer `.dispose()`.

### Phase U1 — Desktop Application (Electron)
- **Electron Desktop Shell (`electron/main.cjs`, `electron/preload.cjs`, `electron/splash.html`):** Added single-instance lock, frameless `480×270` splash screen, `window-state.json` persistence, `F11` & `Alt+Enter` fullscreen toggle, `vite.config.js` with `base: './'`, and atomic rolling-backup file saves (`world.json` + `.bak1..3.json`).

### Phase U2 — Graphics Upgrade
- **Procedural Pixel Texture & Half-Texel UV Inset (`U2.1`):** Original procedural pixel-art tiles with half-texel UV inset (`eps = 0.003`) to eliminate tile edge bleeding.
- **Ambient Occlusion (`U2.2`):** Baked 4-neighbor top corner occlusion (`0..3`) and cave depth darkening into chunk instance colors inside `chunkWorker.js`.
- **Celestial Sky, Clouds & Weather (`U2.3`, `src/polish.js`):** Added visible orbiting Sun & Moon discs, 280-star night starfield, 18 drifting 3D clouds, and toggleable Rain/Snow particle weather.
- **Separate Water & Transparency Pass (`U2.5`):** Dedicated `waterMesh` `InstancedMesh` pass with `depthWrite: false` and underwater sapphire screen tint.

### Phase U3 — World Depth (Biomes, Ores, Caves, Trees & Water)
- **10 Seeded Biomes (`src/noise.js`):** `Verdant Meadows`, `Timberland Woods`, `Silver Birch Grove`, `Boreal Pine Taiga`, `Frostbound Tundra`, `Golden Dunes`, `Sunscorched Savanna`, `Craggy Alpine Peaks`, `Misty Fenland`, and `Sapphire Sea / Sunlit Shore`.
- **Sea Level, Ores & Trees:** Sea level at `y = 18` filled with water/ice, depth-stratified ore veins (`Carbon Seam`, `Ferric Vein`, `Auric Vein`, `Azure Crystal`), deep glowing `Molten Magma` at `y = 1..2`, unbreakable `Basalt Core` (`y = 0`), and cross-chunk deterministic trees.

### Phase U4 — Rigged Character & Blender Pipeline
- **Headless Blender Builder (`tools/blender/build_character.py`) & `CharacterController` (`src/character.js`):** Underscore-only bone hierarchy, `GLTFLoader` + procedural rig, `AnimationMixer` `.crossFadeTo()`, and `V`-key `1st-Person` / `3rd-Person Back` / `3rd-Person Front` camera modes.

### Phase U5 — Original Mob Roster & Combat
- **Passive & Hostile Mobs (`src/polish.js`):** Added `Snorter`, `Moo-Beast`, `Woolback`, `Cluck` (passive, flee when hit) and `Shambler`, `Crawler`, `Bloater` (hostile at night/close range).
- **Survival Health, Hunger & Melee Combat:** Added 10 Hearts (`20 HP`), 10 Stamina pips, fall damage, Left-Click ray-vs-mob AABB melee combat with critical hits, knockback, red hurt flash, and loot drops.

### Phase U6 — Finished Game Interface
- **Isometric 3D Block Icons (`src/blocks.js`, `src/hotbar.js`):** Offscreen canvas renders every block as a 3D isometric cube for the Hotbar, Backpack, and Recipe Book.
- **In-Game `/` Command Console & Pause Menu:** Added `/time`, `/weather`, `/gamemode`, `/give`, `/tp`, `/spawn`, `/heal`, `F2` PNG screenshot export, and `M` Game Menu.
