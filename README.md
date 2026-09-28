# Minecraft-Style Voxel Game (Three.js + Vite)

A complete 3D browser-based voxel-building game built across **Phases 0–6** with **Three.js** (`v0.170.0`) and **Vite** (`v6.4.3`).

---

## 🎮 Controls & Keybindings

| Input / Key | Action |
| :--- | :--- |
| **Click 3D View** | Engage Mouse Look (**Pointer Lock API**) |
| **`W` `A` `S` `D`** | Move Horizontally (Frame-Rate Independent Delta-Time) |
| **`Space` / `Shift`** | Fly Up / Down |
| **Left-Click** | Break Targeted Block (Web Audio SFX + Particle Burst + Add to Inventory) |
| **Right-Click** | Place Selected Block on Adjacent Hit Face (Consumes 1 from Hotbar) |
| **`1` – `9` / Scroll** | Select Active Hotbar Slot |
| **`E`** | Toggle Full **36-Slot Inventory & 2×2 Crafting Modal** + Recipe Book |
| **`V`** | Toggle **1st-Person Viewmodel Arm** $\leftrightarrow$ **3rd-Person Blocky Rigged Character** |
| **`P`** | Manual Save to **`IndexedDB`** (also autosaves every 25s & on tab unload) |
| **`T`** | Advance **Day/Night Cycle** (`Noon` $\rightarrow$ `Sunset` $\rightarrow$ `Night` $\rightarrow$ `Sunrise`) |
| **`N`** | Start a **New Game** (Clears `IndexedDB` save & regenerates fresh world) |
| **`Esc`** | Close Inventory or Release Mouse Pointer Lock |

---

## 🚀 Running Locally

1. **Clone the repository and install dependencies:**
   ```bash
   git clone https://github.com/npal78229-eng/voxel-game.git
   cd voxel-game
   npm install
   ```

2. **Start the Vite development server:**
   ```bash
   npm run dev
   ```

3. **Open in your browser:**
   Navigate to `http://localhost:5173`.

---

## 🏗️ Complete 7-Phase Architecture (`src/`)

- **[`src/main.js`](./src/main.js):** Main 60 FPS render loop (`THREE.Clock`), scene bootstrap, event orchestration, and HUD telemetry.
- **[`src/world.js`](./src/world.js) & [`src/chunk.js`](./src/chunk.js):** `16×16×16` chunked world engine (`VoxelWorld` & `VoxelChunk`) with frame-budgeted streaming (`MAX_CHUNKS_PER_FRAME = 2`), GPU buffer `.dispose()`, 6-neighbor interior face culling, and **2D Greedy Rectangle Merging** (`~84%` triangle reduction).
- **[`src/noise.js`](./src/noise.js):** Deterministic seeded 2D Fractal Brownian Motion (`fbm2D`) terrain generator + 3D Simplex (`noise3D`) cave carving (`seed = 133742`).
- **[`src/raycaster.js`](./src/raycaster.js):** Fast 3D Digital Differential Analyzer (**DDA**) voxel traversal raycaster (`6.0` block reach) + wireframe target highlighter.
- **[`src/inventory.js`](./src/inventory.js) & [`src/hotbar.js`](./src/hotbar.js):** `36`-slot stack-based inventory (`9` hotbar + `27` backpack, max stack `64`), data-driven `CRAFTING_RECIPES` table, interactive `2×2` crafting grid, and quick-craft Recipe Book.
- **[`src/character.js`](./src/character.js):** Articulated ~2-block-tall blocky humanoid rig + `GLTFLoader` (`/assets/character.glb`) with `THREE.AnimationMixer` (`"Idle"` $\leftrightarrow$ `"Walk"` `.crossFadeTo()`) and `V`-key 1st/3rd-person toggle.
- **[`src/storage.js`](./src/storage.js):** Diff-based `IndexedDB` world persistence (`serializeGameState` / `deserializeGameState`), storing only modified block diffs (`world.modifiedBlocks`) + player state + inventory.
- **[`src/polish.js`](./src/polish.js):** Web Audio API procedural SFX synthesizer (Break, Place, Footsteps), dynamic Day/Night cycle, wandering passive blocky mobs, and block-break particle bursts.
