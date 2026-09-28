# Voxel Game — Running Architecture & Design Spec (`DESIGN.md`)

> All 7 Phases (`Phase 0` through `Phase 6`) are implemented and verified.

---

## Completed Roadmap Checklist

- [x] **Phase 0 — Setup & Orientation:** Vite + Three.js ES module project setup, `PerspectiveCamera`, `WebGLRenderer`, `THREE.Clock` 60 FPS loop, `README.md`, and `DESIGN.md`.
- [x] **Phase 1 — Static 3D World:** `THREE.InstancedMesh` rendering, Pointer Lock `WASD` + `Space`/`Shift` delta-time controls (`src/controls.js`), and directional sunlight + ambient sky bounce lighting (`src/lighting.js`).
- [x] **Phase 2 — Block Placement & Removal:** Single Source of Truth block `Map`, 3D DDA Voxel Traversal raycaster (`src/raycaster.js`), wireframe target highlight, Left-Click break, Right-Click adjacent face placement, player-overlap guard, and 9-slot Hotbar UI (`src/hotbar.js`).
- [x] **Phase 3 — Real Terrain (Procedural Generation & 16³ Chunks):** Deterministic seeded 2D/3D Simplex noise (`src/noise.js`), seamless world-coordinate `16×16×16` chunks (`src/chunk.js`), frame-budgeted chunk streaming (`MAX_CHUNKS_PER_FRAME = 2`), and `.dispose()` GPU cleanup (`src/world.js`).
- [x] **Phase 4 — Inventory, Crafting & Character:** `36`-slot stack inventory (`9` hotbar + `27` backpack, max stack `64`), `E`-key Inventory & `2×2` Crafting Modal, data-driven `CRAFTING_RECIPES` (`src/inventory.js`), and articulated blocky humanoid rig + `GLTFLoader` (`/assets/character.glb`) with `THREE.AnimationMixer` `.crossFadeTo()` (`src/character.js`).
- [x] **Phase 5 — Persistence & Save/Load (`IndexedDB`):** Seeded diff-based serialization (`serializeGameState` / `deserializeGameState`), `IndexedDB` storage engine (`src/storage.js`), periodic 25s autosave + `beforeunload` save, manual save (`[P]`), and confirmed New Game reset (`[N]`).
- [x] **Phase 6 — Polish & Feel:** Web Audio API sound effects (break, place, footsteps), dynamic Day/Night cycle (`[T]`), wandering passive blocky mobs, block-break particle bursts (`src/polish.js`), and 2D Greedy Rectangle Merging (`-84%` triangle reduction in `src/chunk.js`).
