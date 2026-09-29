import * as THREE from 'three';
import { VoxelWorld, sharedShaderUniforms } from './world.js';
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
import { TERRAIN_CONFIG, SEA_LEVEL, getBiome, BIOME_TABLE } from './noise.js';

// ============================================================================
// Voxel Realms v2.0 — Complete Upgrade Suite (Phases U0–U7)
// ============================================================================

// 1. SCENE
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7cc8f8);
scene.fog = new THREE.FogExp2(0x7cc8f8, 0.011);

// 2. CAMERA (Phase U0.3: near plane = 0.05 to prevent camera terrain near-clipping)
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.05,
  550
);

// 3. RENDERER (Phase U0.3b: powerPreference 'high-performance', pixelRatio <= 2, SRGB)
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: true, // Enables F2 PNG Screenshot export
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// 4. LIGHTING & PHASE U2.3 SKY / WEATHER SYSTEM
const lights = setupLighting(scene);
const dayNight = new DayNightCycle(scene, lights);

// 5. CHUNKED WORLD WITH WEB WORKER POOL (Phases U0.2, U2, U3)
const world = new VoxelWorld(scene);

function setDefaultSpawn() {
  const spawnX = 8;
  const spawnZ = 11;
  const surfaceY = Math.max(SEA_LEVEL + 1, world.getSurfaceHeight(spawnX, spawnZ));
  camera.position.set(spawnX, surfaceY + 2.5, spawnZ);
  camera.lookAt(spawnX, surfaceY + 1.5, spawnZ - 4);
}

setDefaultSpawn();
world.updateChunks(camera.position, true);

// 6. DDA VOXEL RAYCASTER & WIREFRAME HIGHLIGHTER
const highlighter = new VoxelTargetHighlighter(scene);
const lookDirection = new THREE.Vector3();
let currentHit = null;

// 7. PHASE U4 — RIGGED CHARACTER CONTROLLER
const character = new CharacterController(scene, camera);

import { PLAYER_COMBAT_CONFIG } from './config/mobs.js';
import { SAVE_WORLD_VERSION } from './config/ores.js';
import { PlayerStatusEffects } from './statusEffects.js';

// 8. PHASE U5 & U6 — WEB AUDIO SFX, 16-MOB ROSTER & BREAK PARTICLES
const sfx = new SoundEffectsManager();
const particles = new BlockBreakParticles(scene);
const mobs = new PassiveMobManager(scene, world, sfx, particles);

// 9. PLAYER HEALTH (10 Hearts = 20 HP) & HUNGER (10 Pips = 20) (Phase U5.6 & Task F1)
const playerStats = {
  hp: 20,
  maxHp: 20,
  hunger: 20,
  maxHunger: 20,
  invulnerableTimer: 0,
  slowTimer: 0,
};

const heartsBarEl = document.getElementById('hearts-bar');
const hungerBarEl = document.getElementById('hunger-bar');
const hurtFlashEl = document.getElementById('hurt-flash-overlay');
const underwaterEl = document.getElementById('underwater-overlay');
const toastEl = document.getElementById('toast-banner');

let toastTimeout = null;
function showToast(message, durationMs = 2800) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toastEl.classList.add('hidden');
  }, durationMs);
}

function renderSurvivalBars() {
  if (heartsBarEl) {
    heartsBarEl.innerHTML = '';
    for (let i = 0; i < 10; i++) {
      const pip = document.createElement('div');
      pip.className = `heart-pip ${playerStats.hp >= (i + 1) * 2 ? '' : 'empty'}`;
      heartsBarEl.appendChild(pip);
    }
  }
  if (hungerBarEl) {
    hungerBarEl.innerHTML = '';
    for (let i = 0; i < 10; i++) {
      const pip = document.createElement('div');
      pip.className = `hunger-pip ${playerStats.hunger >= (i + 1) * 2 ? '' : 'empty'}`;
      hungerBarEl.appendChild(pip);
    }
  }
}
renderSurvivalBars();

// Night Mob Combat System: Player Status Effects Manager (poison, bleed, stagger, fear, weakness, drain)
const statusEffects = new PlayerStatusEffects(playerStats, sfx, renderSurvivalBars);

function applyPlayerDamage(amount, source = 'Hazard', options = {}) {
  // Task F1: Enforce player invulnerability window so one attack = at most 1 damage event
  if (playerStats.invulnerableTimer > 0 && source !== 'Fall Damage' && !options.ignoreInvulnerability) {
    return false;
  }
  playerStats.invulnerableTimer = PLAYER_COMBAT_CONFIG.invulnerabilitySeconds;
  if (options.applySlowEffect) {
    playerStats.slowTimer = 2.0;
  }
  if (options.drainStamina) {
    playerStats.hunger = 0;
  }

  playerStats.hp = Math.max(0, playerStats.hp - amount);
  sfx.playPlayerHurt();
  renderSurvivalBars();

  if (hurtFlashEl) {
    hurtFlashEl.classList.remove('hidden');
    setTimeout(() => hurtFlashEl.classList.add('hidden'), 220);
  }

  if (playerStats.hp <= 0) {
    showToast(`Defeated by ${source}! Respawning at surface...`);
    playerStats.hp = playerStats.maxHp;
    playerStats.hunger = playerStats.maxHunger;
    statusEffects.clearAllEffects();
    setDefaultSpawn();
    controls.syncFromCamera();
    renderSurvivalBars();
  }
  return true;
}

// 10. PLAYER AABB CONTROLS (Phase U0.3)
const cameraModeEl = document.getElementById('camera-mode-value');
const pauseModalEl = document.getElementById('pause-menu-modal');

const controls = new FirstPersonController(
  camera,
  renderer.domElement,
  world,
  () => {},
  (isThirdPerson, modeLabel) => {
    character.setThirdPersonMode(isThirdPerson);
    if (cameraModeEl) {
      cameraModeEl.textContent = modeLabel;
    }
    showToast(`Camera: ${modeLabel}`);
  },
  (fallDmg) => {
    applyPlayerDamage(fallDmg, 'Fall Damage');
  }
);
controls.syncFromCamera();

// 11. STACK INVENTORY & CRAFTING
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
});

const initialStack = ui.getSelectedStack();
character.setHeldBlockType(initialStack ? initialStack.itemType : null);

// 12. SAVE / LOAD (Phase U1.5 Desktop IPC + Phase 5 IndexedDB Fallback + Task F4 Version Check)
const saveStatusEl = document.getElementById('save-status-value');
const gameContext = { world, controls, inventory, ui, dayNight, mobs };

async function performSave(triggerLabel = 'Saved') {
  const res = await saveGame(gameContext);
  if (window.voxelDesktopAPI && window.voxelDesktopAPI.saveWorld) {
    await window.voxelDesktopAPI.saveWorld({
      worldId: 'default',
      meta: {
        id: 'default',
        name: 'Primary World',
        seed: world.seed,
        lastPlayed: Date.now(),
        saveVersion: SAVE_WORLD_VERSION,
      },
      worldData: res,
    });
  }
  if (saveStatusEl && res.ok) {
    saveStatusEl.textContent = `${triggerLabel} (${res.diffCount} diffs)`;
  }
  if (triggerLabel === 'Manual Save') {
    showToast(`World Saved (${res.diffCount} modified blocks)`);
  }
}

async function performNewGame() {
  const seedStr = window.prompt(
    'Enter a numerical Seed for your New World (or leave default):',
    String(Math.floor(100000 + Math.random() * 899999))
  );
  if (seedStr === null) return;

  const newSeed = Number(seedStr) || TERRAIN_CONFIG.seed;
  await clearSavedGame();
  world.modifiedBlocks.clear();
  world.setSeed(newSeed);
  setDefaultSpawn();
  controls.syncFromCamera();
  world.reloadAllChunks(controls.playerPosition);
  inventory.populateStarterKit();
  playerStats.hp = 20;
  playerStats.hunger = 20;
  renderSurvivalBars();
  showToast(`Generated New World (Seed: ${newSeed})`);
}

loadGame().then((savedData) => {
  if (savedData) {
    const result = deserializeGameState(savedData, gameContext);
    if (result && result.olderVersion) {
      showToast(
        'This world was made with an older version (Generating fresh v3 terrain)',
        5000
      );
      clearSavedGame();
    } else if (result && result.ok) {
      controls.ensureNotInsideBlocks();
    }
  }
});

setInterval(() => performSave('AutoSaved'), 25000);
window.addEventListener('beforeunload', () => saveGame(gameContext));

// 13. LOADING SCREEN COMPLETION & ELECTRON SPLASH IPC (Phase U1.3)
const loadingScreenEl = document.getElementById('loading-screen');
const loadingBarEl = document.getElementById('loading-bar-fill');
const loadingStageEl = document.getElementById('loading-stage-text');
let isLoadingComplete = false;

function updateLoadingProgress() {
  if (isLoadingComplete) return;
  const stats = world.getStats();
  const pct = Math.min(100, Math.round((stats.loadedChunks / 9) * 100));
  if (loadingBarEl) loadingBarEl.style.width = `${pct}%`;
  if (loadingStageEl) {
    loadingStageEl.textContent = `Meshing spawn chunks (${stats.loadedChunks}/9 ready)...`;
  }
  if (stats.loadedChunks >= 4) {
    isLoadingComplete = true;
    controls.ensureNotInsideBlocks();
    if (loadingScreenEl) {
      loadingScreenEl.style.opacity = '0';
      setTimeout(() => loadingScreenEl.classList.add('hidden'), 350);
    }
    if (window.voxelDesktopAPI && window.voxelDesktopAPI.notifyReady) {
      window.voxelDesktopAPI.notifyReady();
    }
  }
}

// 14. F3 DEBUG OVERLAY, F2 SCREENSHOT, ESC PAUSE MENU & '/' COMMAND CONSOLE
const debugOverlayEl = document.getElementById('debug-overlay');
const commandConsoleEl = document.getElementById('command-console');
const commandInputEl = document.getElementById('command-input');

function togglePauseMenu(forceState) {
  if (!pauseModalEl) return;
  const isOpen = !pauseModalEl.classList.contains('hidden');
  const next = typeof forceState === 'boolean' ? forceState : !isOpen;
  pauseModalEl.classList.toggle('hidden', !next);
  controls.paused = next;
  if (next && document.pointerLockElement) {
    document.exitPointerLock();
  }
}

window.addEventListener('keydown', (event) => {
  // Handle '/' Command Console input
  if (commandConsoleEl && !commandConsoleEl.classList.contains('hidden')) {
    if (event.code === 'Escape') {
      commandConsoleEl.classList.add('hidden');
      controls.paused = false;
      renderer.domElement.requestPointerLock();
    } else if (event.code === 'Enter') {
      const rawCmd = (commandInputEl.value || '').trim();
      executeConsoleCommand(rawCmd);
      commandInputEl.value = '';
      commandConsoleEl.classList.add('hidden');
      controls.paused = false;
      renderer.domElement.requestPointerLock();
    }
    return;
  }

  // F3 toggles Developer Debug Overlay (Phase U0.1 & U6.2)
  if (event.code === 'F3') {
    event.preventDefault();
    debugOverlayEl?.classList.toggle('hidden');
    return;
  }

  // F4 toggles Task F1/F3 Combat Range & Hitbox Debug Visualizer
  if (event.code === 'F4') {
    event.preventDefault();
    const active = mobs.toggleDebugView();
    showToast(
      `F4 Combat Debug: ${active ? 'ON (Hitboxes + Range Rings + Green/Red LOS)' : 'OFF'}`
    );
    return;
  }

  // F6 toggles Task F4 Cave & Ore X-Ray Visualizer
  if (event.code === 'F6') {
    event.preventDefault();
    const xray = world.toggleCaveXRay(controls.playerPosition);
    showToast(
      `F6 Cave & Ore X-Ray: ${xray ? 'ON (Stone see-through, Ores & Caves visible)' : 'OFF'}`
    );
    return;
  }

  // F2 saves Screenshot (Phase U6.2)
  if (event.code === 'F2') {
    event.preventDefault();
    const dataUrl = renderer.domElement.toDataURL('image/png');
    if (window.voxelDesktopAPI && window.voxelDesktopAPI.saveScreenshot) {
      window.voxelDesktopAPI.saveScreenshot(dataUrl).then(() => {
        showToast('Screenshot saved to Pictures/VoxelRealms');
      });
    } else {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `voxel-realms-${Date.now()}.png`;
      a.click();
      showToast('Screenshot downloaded!');
    }
    return;
  }

  // '/' opens Command Console (Phase U6.6)
  if (event.key === '/' && !inventory.isOpen) {
    event.preventDefault();
    commandConsoleEl?.classList.remove('hidden');
    controls.paused = true;
    if (document.pointerLockElement) document.exitPointerLock();
    setTimeout(() => commandInputEl?.focus(), 20);
    return;
  }

  // 'M' or Pause Menu button opens Game Menu
  if (event.code === 'KeyM' && !inventory.isOpen) {
    togglePauseMenu();
    return;
  }

  if (inventory.isOpen || controls.paused) return;

  if (event.code === 'KeyP') performSave('Manual Save');
  if (event.code === 'KeyT') {
    dayNight.advanceTime(0.12);
    showToast(dayNight.getDebugReadout());
  }
  if (event.code === 'KeyB') {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const sx = controls.position.x + forward.x * 3.4;
    const sz = controls.position.z + forward.z * 3.4;
    const spawnedSpec = mobs.spawnMob(sx, sz);
    sfx.playPlace();
    showToast(`Spawned ${spawnedSpec.label || spawnedSpec.type}!`);
  }
});

function executeConsoleCommand(cmdStr) {
  if (!cmdStr) return;
  const parts = cmdStr.replace(/^\//, '').split(/\s+/);
  const cmd = (parts[0] || '').toLowerCase();

  if (cmd === 'time') {
    const sub = (parts[2] || parts[1] || 'day').toLowerCase();
    dayNight.timeOfDay =
      sub === 'night' ? 0.72 : sub === 'sunset' ? 0.52 : 0.25;
    if (!dayNight.isNight()) {
      mobs.cleanupDaytimeSavedMonsters(controls.playerPosition, false);
    }
    showToast(`Time set to ${sub} | ${dayNight.getDebugReadout()}`, 4200);
  } else if (cmd === 'testrange') {
    // Task F1: Spawn one melee mob 3 blocks from player and enable F4 debug ring
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const sx = controls.playerPosition.x + forward.x * 3.0;
    const sz = controls.playerPosition.z + forward.z * 3.0;
    const spawned = mobs.spawnMobAt('Shambler', sx, sz);
    if (!mobs.debugViewEnabled) {
      mobs.toggleDebugView();
    }
    showToast(
      `Spawned ${spawned} 3.0m away with F4 Debug Ring ON! Walk in/out of ring to test windup & miss.`,
      5000
    );
  } else if (cmd === 'spawnstats') {
    // Task F2: Print counts per type/class and reasons why last 10 spawn attempts succeeded/failed
    const report = mobs.getSpawnStatsReport(dayNight.timeOfDay);
    console.table(report.countsByType);
    console.table(report.lastAttempts);
    const c = report.countsByClass;
    const recentReason = report.lastAttempts[0]?.reason || 'none';
    showToast(
      `[SpawnStats] ${report.clockReadout} | Passive:${c.passive} Pred:${c.wild_predator} Night:${c.night_monster} | Last: ${recentReason}`,
      6000
    );
  } else if (cmd === 'orestats') {
    // Task F4: Print how many blocks of each ore exist in loaded chunks & avg per chunk
    const oreReport = world.getOreStats();
    console.table(oreReport);
    const c = oreReport.counts;
    const a = oreReport.avgPerChunk;
    showToast(
      `[OreStats (${oreReport.loadedChunks} chunks)] Coal:${c.coal_ore}(${a.coal_ore}/c) Iron:${c.iron_ore}(${a.iron_ore}/c) Gold:${c.gold_ore}(${a.gold_ore}/c) Gem:${c.gem_ore}(${a.gem_ore}/c)`,
      6500
    );
  } else if (cmd === 'weather') {
    const w = (parts[1] || 'clear').toLowerCase();
    dayNight.setWeather(w);
    showToast(`Weather set to ${dayNight.weather}`);
  } else if (cmd === 'gamemode') {
    const mode = (parts[1] || '').toLowerCase();
    controls.isFlyMode = mode === 'fly' || mode === 'creative' || !controls.isFlyMode;
    showToast(`Physics Mode: ${controls.isFlyMode ? 'Fly Mode' : 'Survival AABB'}`);
  } else if (cmd === 'give') {
    const item = parts[1] || 'gem_ore';
    const count = Number(parts[2]) || 16;
    inventory.addItem(item, count);
    showToast(`Added ${count}x ${item} to inventory`);
  } else if (cmd === 'tp' && parts.length >= 4) {
    controls.playerPosition.set(
      Number(parts[1]) || 0,
      Number(parts[2]) || 28,
      Number(parts[3]) || 0
    );
    world.reloadAllChunks(controls.playerPosition);
    showToast(`Teleported to (${parts[1]}, ${parts[2]}, ${parts[3]})`);
  } else if (cmd === 'gallery') {
    // Task F6: Build 36-Block Gallery Showcase Grid in front of the player
    const info = world.buildBlockGallery(
      controls.playerPosition.x,
      controls.playerPosition.z
    );
    showToast(
      `Built ${info.count}-Block Seamless Gallery Grid ahead! Inspect in daylight or '/time set night'.`,
      5500
    );
  } else if (cmd === 'spawn') {
    const mobName = parts[1] || 'Pig';
    const countArg = Number(parts[2]) || 0;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const tx = currentHit ? currentHit.x : controls.playerPosition.x + forward.x * 4.5;
    const tz = currentHit ? currentHit.z : controls.playerPosition.z + forward.z * 4.5;
    if (countArg >= 2) {
      const list = mobs.spawnMobGroup(mobName, tx, tz, countArg);
      showToast(`Spawned herd of ${list.length}x ${mobName} at (${tx.toFixed(1)}, ${tz.toFixed(1)})`);
    } else {
      const spawned = mobs.spawnMobAt(mobName, tx, tz);
      showToast(`Spawned ${spawned} at (${tx.toFixed(1)}, ${tz.toFixed(1)})`);
    }
  } else if (cmd === 'heal') {
    playerStats.hp = 20;
    playerStats.hunger = 20;
    statusEffects.clearAllEffects();
    renderSurvivalBars();
    showToast('Restored full Health, Stamina & cleared all Status Effects');
  } else if (cmd === 'effect') {
    const effectId = (parts[1] || 'poison').toLowerCase();
    const duration = parts[2] !== undefined ? Number(parts[2]) : undefined;
    const applied = statusEffects.applyEffect(effectId, duration);
    showToast(
      applied
        ? `Applied status effect '${effectId}'${duration ? ` (${duration}s)` : ''}`
        : `Effect '${effectId}' blocked (immune or invalid id)`
    );
  } else if (cmd === 'clearfx') {
    statusEffects.clearAllEffects();
    showToast('Cleared all active player status effects');
  } else if (cmd === 'mobai') {
    const state = (parts[1] || '').toLowerCase();
    mobs.aiEnabled = state === 'off' ? false : state === 'on' ? true : !mobs.aiEnabled;
    showToast(`Mob AI: ${mobs.aiEnabled ? 'ON' : 'OFF (Frozen for inspection)'}`);
  } else if (cmd === 'mobdebug') {
    const state = (parts[1] || '').toLowerCase();
    const wantOn = state === 'on' ? true : state === 'off' ? false : !mobs.debugViewEnabled;
    if (mobs.debugViewEnabled !== wantOn) {
      mobs.toggleDebugView();
    }
    showToast(
      `Mob Combat Debug: ${mobs.debugViewEnabled ? 'ON (Attack Range Rings + State Labels + Cooldowns)' : 'OFF'}`
    );
  } else if (cmd === 'killmobs') {
    const killedCount = mobs.killAllHostileMobs();
    showToast(`Killed ${killedCount} hostile & summoned mobs!`);
  } else if (cmd === 'biome') {
    const px = Math.round(controls.playerPosition.x);
    const pz = Math.round(controls.playerPosition.z);
    const b = getBiome(px, pz, world.seed);
    const surfY = world.getSurfaceHeight(px, pz);
    showToast(
      `[Biome @ (${px}, ${pz})] ${b.name} (${b.id}) | Surface: ${b.surface} | Sub: ${b.sub} | Floor: ${b.underwaterFloor} | Y=${surfY}`,
      6000
    );
  } else if (cmd === 'biomemap') {
    toggleBiomeMapOverlay();
  }
}

// Part A4: Top-down 2D Biome Map Overlay (/biomemap)
let biomeMapOverlayEl = null;
function toggleBiomeMapOverlay() {
  if (!biomeMapOverlayEl) {
    biomeMapOverlayEl = document.createElement('div');
    biomeMapOverlayEl.id = 'biome-map-overlay';
    Object.assign(biomeMapOverlayEl.style, {
      position: 'fixed',
      top: '70px',
      right: '18px',
      padding: '10px',
      background: 'rgba(15, 23, 42, 0.92)',
      border: '2px solid #38bdf8',
      borderRadius: '10px',
      color: '#f8fafc',
      fontFamily: 'monospace',
      fontSize: '11px',
      zIndex: '40',
      display: 'none',
    });
    const title = document.createElement('div');
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '6px';
    title.textContent = '🗺️ BIOME REGION MAP (480×480m)';
    biomeMapOverlayEl.appendChild(title);

    const canvas = document.createElement('canvas');
    canvas.id = 'biome-map-canvas';
    canvas.width = 160;
    canvas.height = 160;
    canvas.style.border = '1px solid #475569';
    canvas.style.display = 'block';
    biomeMapOverlayEl.appendChild(canvas);

    const legend = document.createElement('div');
    legend.style.marginTop = '6px';
    legend.style.display = 'grid';
    legend.style.gridTemplateColumns = '1fr 1fr';
    legend.style.gap = '2px 8px';
    for (const b of Object.values(BIOME_TABLE)) {
      const item = document.createElement('div');
      item.innerHTML = `<span style="display:inline-block;width:9px;height:9px;background:${b.mapColor};margin-right:4px;border:1px solid #000"></span>${b.name.split(' ').pop()}`;
      legend.appendChild(item);
    }
    biomeMapOverlayEl.appendChild(legend);
    document.body.appendChild(biomeMapOverlayEl);
  }

  const isVisible = biomeMapOverlayEl.style.display === 'block';
  if (isVisible) {
    biomeMapOverlayEl.style.display = 'none';
    showToast('Biome Map: OFF');
    return;
  }

  biomeMapOverlayEl.style.display = 'block';
  renderBiomeMapCanvas();
  showToast('Biome Map: ON (Showing 480×480m region around player)');
}

function renderBiomeMapCanvas() {
  if (!biomeMapOverlayEl || biomeMapOverlayEl.style.display !== 'block') return;
  const canvas = document.getElementById('biome-map-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const px = Math.round(controls.playerPosition.x);
  const pz = Math.round(controls.playerPosition.z);
  const step = 3; // 160 * 3 = 480 blocks across
  const half = (canvas.width * step) / 2;

  for (let cy = 0; cy < canvas.height; cy += 2) {
    for (let cx = 0; cx < canvas.width; cx += 2) {
      const wx = px - half + cx * step;
      const wz = pz - half + cy * step;
      const b = getBiome(wx, wz, world.seed);
      ctx.fillStyle = b.mapColor || '#4ade80';
      ctx.fillRect(cx, cy, 2, 2);
    }
  }
  // Player crosshair marker in center
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(canvas.width / 2 - 2, canvas.height / 2 - 2, 5, 5);
  ctx.strokeStyle = '#ffffff';
  ctx.strokeRect(canvas.width / 2 - 3, canvas.height / 2 - 3, 7, 7);
}

// Wire Pause Menu Buttons
document.getElementById('menu-btn-resume')?.addEventListener('click', () => {
  togglePauseMenu(false);
  renderer.domElement.requestPointerLock();
});
document.getElementById('menu-btn-save')?.addEventListener('click', () => {
  performSave('Manual Save');
  togglePauseMenu(false);
});
document.getElementById('menu-btn-time')?.addEventListener('click', () => {
  dayNight.advanceTime(0.15);
  showToast(`Time: ${dayNight.getLabel()}`);
});
document.getElementById('menu-btn-weather')?.addEventListener('click', () => {
  const order = ['clear', 'rain', 'snow'];
  const next = order[(order.indexOf(dayNight.weather) + 1) % order.length];
  dayNight.setWeather(next);
  showToast(`Weather: ${next}`);
});
document.getElementById('menu-btn-fly')?.addEventListener('click', () => {
  controls.isFlyMode = !controls.isFlyMode;
  showToast(`Mode: ${controls.isFlyMode ? 'Fly Mode' : 'Survival Walk'}`);
});
let qualityIndex = 2;
const qualityNames = ['Low', 'Medium', 'High', 'Ultra'];
document.getElementById('menu-btn-quality')?.addEventListener('click', (e) => {
  qualityIndex = (qualityIndex + 1) % qualityNames.length;
  const q = qualityNames[qualityIndex];
  e.target.textContent = `Graphics Quality: ${q}`;
  renderer.shadowMap.enabled = qualityIndex >= 1;
  renderer.setPixelRatio(
    qualityIndex === 0 ? 1 : Math.min(window.devicePixelRatio, 2)
  );
  showToast(`Quality Preset: ${q}`);
});
document.getElementById('menu-btn-new')?.addEventListener('click', () => {
  togglePauseMenu(false);
  performNewGame();
});

// 15. COMBAT & BLOCK INTERACTION (Left-Click Attack/Break, Right-Click Place)
window.addEventListener('contextmenu', (event) => event.preventDefault());

renderer.domElement.addEventListener('mousedown', (event) => {
  if (!controls.isLocked || inventory.isOpen || controls.paused) return;

  if (event.button === 0 && !statusEffects.canPlayerAttack()) {
    showToast('Staggered! Cannot attack.', 800);
    return;
  }

  character.triggerSwing();
  camera.getWorldDirection(lookDirection);

  if (event.button === 0) {
    // 1. First test combat ray against nearby mobs (Phase U5.6 + Weakness scaling)
    const isCrit = !controls.onGround && controls.velocityY < -1.5;
    const baseDmg = isCrit ? 6 : 4;
    const finalDmg = Math.max(1, Math.round(baseDmg * statusEffects.getMeleeDamageMultiplier()));
    const hitMob = mobs.tryAttackMob(
      controls.playerPosition,
      lookDirection,
      finalDmg
    );
    if (hitMob) {
      sfx.playAttackHit();
      if (hitMob.killed) {
        inventory.addItem(hitMob.drop, 2);
        particles.spawnBurst(
          hitMob.position.x,
          hitMob.position.y,
          hitMob.position.z,
          hitMob.drop
        );
        showToast(`Defeated ${hitMob.type}! (+2 ${hitMob.drop})`);
      }
      return;
    }

    // 2. Otherwise mine targeted block
    if (!currentHit) return;
    const brokenBlockType = currentHit.blockType;
    const { x, y, z } = currentHit;
    const removed = world.removeBlock(x, y, z);
    if (removed && brokenBlockType) {
      inventory.addItem(brokenBlockType, 1);
      sfx.playBreak();
      particles.spawnBurst(x, y, z, brokenBlockType);
    }
  } else if (event.button === 2) {
    if (!currentHit) return;
    const { x: adjX, y: adjY, z: adjZ } = currentHit.adjacent;
    if (!world.wouldOverlapPlayer(adjX, adjY, adjZ, controls.playerPosition)) {
      const activeStack = ui.getSelectedStack();
      if (activeStack && activeStack.count > 0) {
        const placedType = inventory.consumeHotbarSlot(ui.selectedIndex);
        if (placedType) {
          world.setBlock(adjX, adjY, adjZ, placedType);
          // Part B3.4: If a block is placed overlapping a mob's box, push the mob out immediately
          mobs.pushMobsOutOfBlock(adjX, adjY, adjZ);
          sfx.playPlace();
        }
      }
    }
  }
});

// 16. WINDOW RESIZE HANDLER
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// 17. MAIN 60 FPS RENDER LOOP & TELEMETRY
const fpsEl = document.getElementById('fps-value');
const drawCallsEl = document.getElementById('drawcalls-value');
const chunksEl = document.getElementById('chunks-value');
const greedyEl = document.getElementById('greedy-value');
const timeEl = document.getElementById('time-value');
const biomeEl = document.getElementById('biome-value');
const biomePillEl = document.getElementById('biome-pill');
const posEl = document.getElementById('pos-value');
const targetEl = document.getElementById('target-value');

const clock = new THREE.Clock();
let frameCount = 0;
let fpsAccumulator = 0;

function animate() {
  requestAnimationFrame(animate);

  const deltaTime = clock.getDelta();

  updateLoadingProgress();

  // Update Night Mob status effects (poison, bleed, stagger, fear, weakness, drain)
  statusEffects.update(deltaTime);
  controls.externalSpeedMultiplier =
    statusEffects.getMovementSpeedMultiplier() *
    (playerStats.slowTimer > 0 ? 0.55 : 1.0);
  controls.allowSprint = statusEffects.canPlayerSprint();
  controls.cameraShakeOffset = statusEffects.cameraShakeOffset;

  // 1. Update player physics & controls
  controls.update(deltaTime);
  const isMoving = controls.isMovingHorizontally();
  sfx.updateFootsteps(deltaTime, isMoving && controls.onGround);

  // Check underwater camera state (Phase U2.5)
  const headBlock = world.getBlock(
    controls.playerPosition.x,
    controls.playerPosition.y,
    controls.playerPosition.z
  );
  if (underwaterEl) {
    underwaterEl.classList.toggle('hidden', headBlock !== 'water');
  }

  // 2. Update rigged character & AnimationMixer
  character.update(
    deltaTime,
    controls.playerPosition,
    controls.euler.y,
    isMoving
  );

  if (playerStats.invulnerableTimer > 0) {
    playerStats.invulnerableTimer = Math.max(
      0,
      playerStats.invulnerableTimer - deltaTime
    );
  }
  if (playerStats.slowTimer > 0) {
    playerStats.slowTimer = Math.max(0, playerStats.slowTimer - deltaTime);
  }

  // 3. Update Sky, Animated Fluids, Mobs & Particles
  sharedShaderUniforms.uTime.value += deltaTime;
  camera.getWorldDirection(lookDirection);
  dayNight.update(deltaTime, controls.playerPosition);
  mobs.update(
    deltaTime,
    controls.playerPosition,
    dayNight.isNight(),
    (dmg, mobType, opts) => applyPlayerDamage(dmg, mobType, opts),
    controls.lastVelocity,
    lookDirection,
    statusEffects,
    Boolean(inventory.isOpen || controls.paused),
    dayNight.timeOfDay,
    playerStats.hp
  );
  particles.update(deltaTime);

  // 4. Stream chunks via Web Worker Pool
  world.updateChunks(controls.playerPosition, false);

  // 5. DDA Raycast
  currentHit = raycastVoxelDDA(world, controls.playerPosition, lookDirection);
  highlighter.update(currentHit);

  // 6. Render Scene
  renderer.render(scene, camera);

  // 7. Update Telemetry
  frameCount++;
  fpsAccumulator += deltaTime;
  if (fpsAccumulator >= 0.2) {
    const currentFps = Math.round(frameCount / fpsAccumulator);
    const frameMs = ((fpsAccumulator / frameCount) * 1000).toFixed(1);
    const stats = world.getStats();
    const { x, y, z } = controls.playerPosition;
    const biomeName = world.getBiomeNameAt(x, z);

    if (biomePillEl) biomePillEl.textContent = `Biome: ${biomeName}`;
    renderBiomeMapCanvas();
    if (fpsEl) fpsEl.textContent = `${currentFps} (${frameMs}ms)`;
    if (drawCallsEl) {
      drawCallsEl.textContent = String(renderer.info.render.calls);
    }
    if (chunksEl) {
      chunksEl.textContent = `${stats.loadedChunks} (${stats.queuedChunks}q / ${stats.workerCount}w)`;
    }
    if (greedyEl) greedyEl.textContent = `-${stats.reductionPct}% tris`;
    if (timeEl) timeEl.textContent = dayNight.getLabel();
    if (biomeEl) biomeEl.textContent = biomeName;
    if (posEl) {
      const mode = controls.isFlyMode ? 'Fly' : 'AABB Walk';
      posEl.textContent = `${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)} [${mode}]`;
    }
    if (targetEl) {
      targetEl.textContent = currentHit
        ? `(${currentHit.x}, ${currentHit.y}, ${currentHit.z}) [${currentHit.blockType}]`
        : 'None';
    }
    frameCount = 0;
    fpsAccumulator = 0;
  }
}

animate();
