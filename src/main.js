import * as THREE from 'three';
import { VoxelWorld } from './world.js';
import { FirstPersonController } from './controls.js';
import { setupLighting } from './lighting.js';
import { raycastVoxelDDA, VoxelTargetHighlighter } from './raycaster.js';
import { InventorySystem } from './inventory.js';
import { HotbarAndInventoryUI } from './hotbar.js';
import { CharacterController } from './character.js';
import {
  saveGame,
  loadGame,
  deserializeGameState,
  clearSavedGame,
} from './storage.js';
import {
  SoundEffectsManager,
  DayNightCycle,
  PassiveMobManager,
  BlockBreakParticles,
} from './polish.js';
import { TERRAIN_CONFIG } from './noise.js';

// ============================================================================
// Complete Voxel Game (Phases 0–6: Terrain, Inventory, Character, Save & Polish)
// ============================================================================

// 1. SCENE
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.FogExp2(0x87ceeb, 0.012);

// 2. CAMERA
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  500
);

// 3. RENDERER
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// 4. LIGHTING & PHASE 6.2 DAY/NIGHT CYCLE
const lights = setupLighting(scene);
const dayNight = new DayNightCycle(scene, lights);

// 5. CHUNKED PROCEDURAL VOXEL WORLD (Phases 3 & 6.4 Greedy Meshing)
const world = new VoxelWorld(scene);

function setDefaultSpawn() {
  const spawnX = 8;
  const spawnZ = 11;
  const surfaceY = world.getSurfaceHeight(spawnX, spawnZ);
  const lookTargetY = world.getSurfaceHeight(spawnX, spawnZ - 3);
  camera.position.set(spawnX, surfaceY + 2.4, spawnZ);
  camera.lookAt(spawnX, lookTargetY + 0.3, spawnZ - 3);
}

setDefaultSpawn();
world.updateChunks(camera.position, true);

// 6. VOXEL RAYCASTER & WIREFRAME HIGHLIGHTER (Phase 2)
const highlighter = new VoxelTargetHighlighter(scene);
const lookDirection = new THREE.Vector3();
let currentHit = null;

// 7. PHASE 4B — RIGGED CHARACTER CONTROLLER (GLTFLoader + AnimationMixer)
const character = new CharacterController(scene, camera);

// 8. PHASE 6 — WEB AUDIO SFX, PASSIVE MOBS & BREAK PARTICLES
const sfx = new SoundEffectsManager();
const mobs = new PassiveMobManager(scene, world, 6);
const particles = new BlockBreakParticles(scene);

// 9. FIRST/THIRD-PERSON CONTROLS
const pointerPromptEl = document.getElementById('pointer-prompt');
const cameraModeEl = document.getElementById('camera-mode-value');

const controls = new FirstPersonController(
  camera,
  renderer.domElement,
  (isLocked) => {
    if (pointerPromptEl) {
      pointerPromptEl.classList.toggle(
        'visible',
        !isLocked && !inventory.isOpen
      );
    }
  },
  (isThirdPerson) => {
    character.setThirdPersonMode(isThirdPerson);
    if (cameraModeEl) {
      cameraModeEl.textContent = isThirdPerson ? '3rd-Person' : '1st-Person';
    }
  }
);
controls.syncFromCamera();

// 10. PHASE 4A — STACK INVENTORY & 2x2 CRAFTING SYSTEM
let ui = null;
const inventory = new InventorySystem(() => {
  if (ui) {
    ui.renderAll();
    const activeStack = ui.getSelectedStack();
    character.setHeldBlockType(activeStack ? activeStack.itemType : null);
  }
});

ui = new HotbarAndInventoryUI(inventory, renderer.domElement, (isModalOpen) => {
  controls.paused = isModalOpen;
  if (pointerPromptEl) {
    pointerPromptEl.classList.toggle(
      'visible',
      !controls.isLocked && !isModalOpen
    );
  }
});

const initialStack = ui.getSelectedStack();
character.setHeldBlockType(initialStack ? initialStack.itemType : null);

// 11. PHASE 5 — INDEXEDDB PERSISTENCE (STARTUP RESTORE, AUTOSAVE, MANUAL SAVE & NEW GAME)
const saveStatusEl = document.getElementById('save-status-value');
const gameContext = { world, controls, inventory, ui, dayNight };

async function performSave(triggerLabel = 'Saved') {
  const res = await saveGame(gameContext);
  if (saveStatusEl && res.ok) {
    saveStatusEl.textContent = `${triggerLabel} (${res.diffCount} block diffs)`;
  }
}

async function performNewGame() {
  const confirmed = window.confirm(
    'Start a New Game? This will clear your saved world modifications and reset your inventory.'
  );
  if (!confirmed) return;

  await clearSavedGame();
  world.modifiedBlocks.clear();
  world.setSeed(TERRAIN_CONFIG.seed);
  setDefaultSpawn();
  controls.syncFromCamera();
  world.reloadAllChunks(controls.playerPosition);
  inventory.populateStarterKit();
  dayNight.timeOfDay = 0.23;

  if (saveStatusEl) {
    saveStatusEl.textContent = 'New World Generated (0 diffs)';
  }
}

// Check IndexedDB for existing save on startup (Task 5C)
loadGame().then((savedData) => {
  if (savedData) {
    const restored = deserializeGameState(savedData, gameContext);
    if (restored && saveStatusEl) {
      const count = Array.isArray(savedData.modifiedBlocks)
        ? savedData.modifiedBlocks.length
        : 0;
      saveStatusEl.textContent = `Restored (${count} block diffs)`;
    }
  }
});

// Periodic Autosave every 25 seconds + on page unload (Task 5B)
setInterval(() => {
  performSave('AutoSaved');
}, 25000);

window.addEventListener('beforeunload', () => {
  saveGame(gameContext);
});

// Wire HUD Toolbar Buttons & Hotkeys ('P' = Save, 'T' = Cycle Time, 'N' = New Game)
document.getElementById('btn-save-game')?.addEventListener('click', (e) => {
  e.stopPropagation();
  performSave('Manual Save');
});
document.getElementById('btn-advance-time')?.addEventListener('click', (e) => {
  e.stopPropagation();
  dayNight.advanceTime(0.12);
});
document.getElementById('btn-open-inv')?.addEventListener('click', (e) => {
  e.stopPropagation();
  ui.toggleInventoryModal();
});
document.getElementById('btn-new-game')?.addEventListener('click', (e) => {
  e.stopPropagation();
  performNewGame();
});

window.addEventListener('keydown', (event) => {
  if (inventory.isOpen) return;
  if (event.code === 'KeyP') {
    performSave('Manual Save');
  } else if (event.code === 'KeyT') {
    dayNight.advanceTime(0.12);
  } else if (event.code === 'KeyN') {
    performNewGame();
  }
});

// 12. BREAK (SFX + Particles + Collect) & PLACE (SFX + Consume from Hotbar)
window.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

renderer.domElement.addEventListener('mousedown', (event) => {
  if (!controls.isLocked || inventory.isOpen) return;

  character.triggerSwing();
  if (!currentHit) return;

  if (event.button === 0) {
    const brokenBlockType = currentHit.blockType;
    const { x, y, z } = currentHit;
    const removed = world.removeBlock(x, y, z);
    if (removed && brokenBlockType) {
      inventory.addItem(brokenBlockType, 1);
      sfx.playBreak();
      particles.spawnBurst(x, y, z, brokenBlockType);
    }
  } else if (event.button === 2) {
    const { x: adjX, y: adjY, z: adjZ } = currentHit.adjacent;
    if (!world.wouldOverlapPlayer(adjX, adjY, adjZ, controls.playerPosition)) {
      const activeStack = ui.getSelectedStack();
      if (activeStack && activeStack.count > 0) {
        const placedType = inventory.consumeHotbarSlot(ui.selectedIndex);
        if (placedType) {
          world.setBlock(adjX, adjY, adjZ, placedType);
          sfx.playPlace();
        }
      }
    }
  }
});

window.addEventListener('keydown', () => {
  const stack = ui.getSelectedStack();
  character.setHeldBlockType(stack ? stack.itemType : null);
});
window.addEventListener(
  'wheel',
  () => {
    const stack = ui.getSelectedStack();
    character.setHeldBlockType(stack ? stack.itemType : null);
  },
  { passive: true }
);

// 13. WINDOW RESIZE HANDLER
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// 14. TELEMETRY & 60 FPS RENDER LOOP
const fpsEl = document.getElementById('fps-value');
const chunksEl = document.getElementById('chunks-value');
const greedyEl = document.getElementById('greedy-value');
const timeEl = document.getElementById('time-value');
const animStateEl = document.getElementById('anim-state-value');
const posEl = document.getElementById('pos-value');
const targetEl = document.getElementById('target-value');

const clock = new THREE.Clock();
let frameCount = 0;
let fpsAccumulator = 0;

function animate() {
  requestAnimationFrame(animate);

  const deltaTime = clock.getDelta();

  // 1. Update player controls & footstep SFX
  controls.update(deltaTime);
  const isMoving = controls.isMovingHorizontally();
  sfx.updateFootsteps(deltaTime, isMoving);

  // 2. Update rigged character & AnimationMixer ('Idle' <-> 'Walk' crossfade)
  character.update(
    deltaTime,
    controls.playerPosition,
    controls.euler.y,
    isMoving
  );

  // 3. Update Day/Night cycle, passive wandering mobs & break particles
  dayNight.update(deltaTime, controls.playerPosition);
  mobs.update(deltaTime, controls.playerPosition);
  particles.update(deltaTime);

  // 4. Stream procedural 16x16x16 chunks
  world.updateChunks(controls.playerPosition, false);

  // 5. Perform DDA voxel raycast
  camera.getWorldDirection(lookDirection);
  currentHit = raycastVoxelDDA(world, controls.playerPosition, lookDirection);
  highlighter.update(currentHit);

  // 6. Render scene
  renderer.render(scene, camera);

  // 7. Update HUD telemetry
  frameCount++;
  fpsAccumulator += deltaTime;
  if (fpsAccumulator >= 0.15) {
    const currentFps = Math.round(frameCount / fpsAccumulator);
    const stats = world.getStats();
    const { chunkX, chunkZ } = world.worldToChunkCoords(
      controls.playerPosition.x,
      controls.playerPosition.z
    );

    if (fpsEl) fpsEl.textContent = String(currentFps);
    if (chunksEl) {
      chunksEl.textContent =
        stats.queuedChunks > 0
          ? `${stats.loadedChunks} (+${stats.queuedChunks}q)`
          : String(stats.loadedChunks);
    }
    if (greedyEl) {
      greedyEl.textContent = `-${stats.reductionPct}% tris`;
    }
    if (timeEl) {
      timeEl.textContent = dayNight.getLabel();
    }
    if (animStateEl) {
      animStateEl.textContent = character.activeActionName;
    }
    if (posEl) {
      const { x, y, z } = controls.playerPosition;
      posEl.textContent = `${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)} [Chunk ${chunkX}, ${chunkZ}]`;
    }
    if (targetEl) {
      if (currentHit) {
        targetEl.textContent = `(${currentHit.x}, ${currentHit.y}, ${currentHit.z}) [${currentHit.blockType}] (${currentHit.faceName})`;
      } else {
        targetEl.textContent = 'None (out of 6m reach)';
      }
    }
    frameCount = 0;
    fpsAccumulator = 0;
  }
}

animate();
