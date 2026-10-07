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
import { climateSystem } from './climate/ClimateSystem.js';
import { FLUID_CONFIG } from './config/fluids.js';
import { LightningSystem } from './weather/Lightning.js';
import { DragonArenaSystem } from './DragonArenaSystem.js';
import { VillageSystem } from './world/VillageSystem.js';
import { StukaFlightSystem } from './StukaFlightSystem.js';
import { SkyLeviathan } from './SkyLeviathan.js';
import { ReelPostProcessingStack, AtmosphericSkyEnclosure } from './shaders/ReelShaderSystem.js';

// ============================================================================
// Voxel Realms v2.0 — Complete Upgrade Suite (Phases U0–U7)
// ============================================================================

// 1. SCENE — Luminous, wide-open silver-grey overcast sky from reference reel
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd2dce4);
scene.fog = new THREE.Fog(0xd2dce4, 280, 1100); // Crystal clear open visibility to 280m, atmospheric fade out to 1100m

// 2. CAMERA (Far plane 1400 for vast open mountain horizon and floating cloud decks)
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.05,
  1400
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
  let spawnX = 8;
  let spawnZ = 11;
  let surfaceY = world.getSurfaceHeight(spawnX, spawnZ);

  if (surfaceY <= SEA_LEVEL) {
    findLand: for (let r = 2; r <= 80; r += 2) {
      for (let dx = -r; dx <= r; dx += 2) {
        for (let dz = -r; dz <= r; dz += 2) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const tx = 8 + dx;
          const tz = 11 + dz;
          const b = world.noise ? world.noise.getBiomeAt(tx, tz) : null;
          const sy = world.getSurfaceHeight(tx, tz);
          if (b && b.id !== 'ocean' && sy >= SEA_LEVEL + 2) {
            spawnX = tx;
            spawnZ = tz;
            surfaceY = sy;
            break findLand;
          }
        }
      }
    }
  }

  camera.position.set(spawnX, surfaceY + 2.5, spawnZ);
  camera.lookAt(spawnX, surfaceY + 1.5, spawnZ - 4);
}

setDefaultSpawn();

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
const lightning = new LightningSystem(scene, world, mobs, sfx);
const dragonArena = new DragonArenaSystem(scene, camera, renderer);
const villageSystem = new VillageSystem(world, scene, mobs);
const stukaFlight = new StukaFlightSystem(scene, camera, renderer, world);
const skyLeviathan = new SkyLeviathan(scene, camera, renderer);
const reelPostStack = new ReelPostProcessingStack(renderer, scene, camera);
const skyEnclosure = new AtmosphericSkyEnclosure(scene);
window.stukaFlight = stukaFlight;
window.skyLeviathan = skyLeviathan;
window.reelPostStack = reelPostStack;
window.skyEnclosure = skyEnclosure;

// Generate complete Village v3 with Clan Flags and Ancient Caldera Portal next to player spawn
// (Registered into chunk diff index in ~10ms before chunk meshing so all chunks mesh once without freeze)
const vOriginX = Math.round(camera.position.x) + 12;
const vOriginZ = Math.round(camera.position.z) + 10;
villageSystem.generateVillage(vOriginX, vOriginZ);

// Now mesh spawn chunks (immediate center chunks now naturally include village blocks!)
world.updateChunks(camera.position, true);

// Spawn initial animal herds around player's resolved spawn coordinates
mobs.spawnInitialHerds(camera.position.x, camera.position.z);

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
const lavaOverlayEl = document.getElementById('lava-overlay');
const oxygenBarEl = document.getElementById('oxygen-bar');
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

function renderOxygenBar() {
  if (!oxygenBarEl || !controls) return;
  const isSubmerged = controls.headSubmerged && controls.headSubmergedType === 'water';
  const shouldShow = isSubmerged || controls.oxygen < controls.maxOxygen - 0.05;
  oxygenBarEl.classList.toggle('hidden', !shouldShow);
  if (!shouldShow) return;

  const totalBubbles = FLUID_CONFIG.water.bubbleCount || 10;
  const activeBubbles = Math.max(
    0,
    Math.min(
      totalBubbles,
      Math.ceil((controls.oxygen / controls.maxOxygen) * totalBubbles)
    )
  );

  if (oxygenBarEl.children.length !== totalBubbles) {
    oxygenBarEl.innerHTML = '';
    for (let i = 0; i < totalBubbles; i++) {
      const b = document.createElement('div');
      b.className = 'oxygen-bubble';
      oxygenBarEl.appendChild(b);
    }
  }

  for (let i = 0; i < totalBubbles; i++) {
    const b = oxygenBarEl.children[i];
    b.classList.toggle('popped', i >= activeBubbles);
  }
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
  },
  (amount, source, opts) => {
    applyPlayerDamage(amount, source, opts);
  }
);
controls.syncFromCamera();
controls.paused = true; // Initially paused until user presses START GAME in launcher

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

  // F7 toggles Stuka Flight Dogfight Mode (Instagram Reel Mode)
  if (event.code === 'F7') {
    event.preventDefault();
    const vignetteEl = document.getElementById('reel-cinematic-vignette');
    if (stukaFlight.isActive) {
      stukaFlight.exitFlightMode(controls);
      if (vignetteEl) vignetteEl.style.display = 'none';
      showToast('Exited Stuka Flight Mode (On Foot)');
    } else {
      skyLeviathan.applyReelAtmosphere(scene, renderer);
      if (vignetteEl) vignetteEl.style.display = 'block';
      stukaFlight.enterFlightMode(controls.playerPosition, camera);
      if (!skyLeviathan.isActive) {
        const spawnPos = stukaFlight.position.clone().add(new THREE.Vector3(0, 35, 110));
        skyLeviathan.spawn(spawnPos);
      }
      showToast('✈️ Boarded Stuka Ju 87! [L-Click]: MG-17, [R-Click]: Bomb, [V]: Flares, [Space]: Boost', 5000);
    }
    return;
  }

  // F8 toggles Dragon Boss Dimension (Calamity Caldera)
  if (event.code === 'F8') {
    event.preventDefault();
    if (dragonArena.isActive) {
      dragonArena.exitArena(controls);
      showToast('Returned to Overworld from Calamity Caldera!');
    } else {
      dragonArena.enterArena(controls);
      showToast('⚡ ENTERED DRAGON CALDERA! Defeat the Three-Headed Titan! (Press F8 to Exit)');
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
    const sub = (parts[1] === 'set' ? parts[2] : (parts[2] || parts[1] || 'day')).toLowerCase();
    let targetT = 0.15;
    if (sub === 'noon') targetT = 0.25;
    else if (sub === 'dusk' || sub === 'sunset') targetT = 0.52;
    else if (sub === 'night') targetT = 0.65;
    else if (sub === 'midnight') targetT = 0.75;
    else if (sub === 'dawn' || sub === 'sunrise') targetT = 0.95;
    else if (sub === 'day') targetT = 0.15;
    else if (!isNaN(Number(sub))) targetT = ((Number(sub) % 1) + 1) % 1;

    dayNight.timeOfDay = targetT;
    if (dayNight.climate) dayNight.climate.timeOfDay = targetT;
    if (!dayNight.isNight()) {
      mobs.cleanupDaytimeSavedMonsters(controls.playerPosition, false);
    }
    showToast(`Time set to ${sub} (${(targetT * 100).toFixed(0)}%) | ${dayNight.getDebugReadout()}`, 4500);
  } else if (cmd === 'timespeed') {
    const speed = Number(parts[1]) || 1.0;
    if (dayNight.climate) dayNight.climate.timeScale = speed;
    dayNight.timeScale = speed;
    showToast(`Time speed set to ${speed}x (standard: 1.0x = 20-min day)`);
  } else if (cmd === 'mobdebug') {
    const arg = (parts[1] || '').toLowerCase();
    const state = arg === 'on' ? true : arg === 'off' ? false : !mobs.debugViewEnabled;
    mobs.toggleDebugView(state);
    showToast(`Mob Debug ${mobs.debugViewEnabled ? 'ENABLED [Panic telemetry visible]' : 'DISABLED'}`);
  } else if (cmd === 'spawntest') {
    const species = parts[1] || 'Pig';
    const n = Number(parts[2]) || 10;
    if (n > 100) {
      let sum = 0;
      const dist = { 1: 0, 2: 0, 3: 0, 4: 0 };
      for (let i = 0; i < n; i++) {
        const roll = Math.floor(Math.random() * 4) + 1;
        dist[roll]++;
        sum += roll;
      }
      console.table(dist);
      const nearby = mobs.countNearbySameSpecies(species, controls.playerPosition.x, controls.playerPosition.z, 32);
      showToast(`[SpawnTest ${n} rolls] Avg: ${(sum/n).toFixed(2)} | 1:${dist[1]} 2:${dist[2]} 3:${dist[3]} 4:${dist[4]} | Nearby: ${nearby}/4`, 6000);
    } else {
      const nearby = mobs.countNearbySameSpecies(species, controls.playerPosition.x, controls.playerPosition.z, 32);
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const tx = controls.playerPosition.x + forward.x * 5.0;
      const tz = controls.playerPosition.z + forward.z * 5.0;
      const list = mobs.spawnMobGroup(species, tx, tz, n, true);
      showToast(`[SpawnTest] Attempted ${n}x ${species}: spawned ${list.length} (nearby existing: ${nearby}, cap: 4)`, 5000);
    }
  } else if (cmd === 'lightning') {
    const targetArg = parts[1] ? parts[1].toLowerCase() : null;
    const res = lightning.triggerStrike(targetArg, controls.playerPosition, (dmg, src, opts) => applyPlayerDamage(dmg, src, opts));
    showToast(`[Lightning] Struck ${res.targetType} at ${res.distance.toFixed(1)}m (thunder delay: ${res.thunderDelay.toFixed(2)}s)`);
  } else if (cmd === 'lightningstats') {
    const n = Number(parts[1]) || 10000;
    const stats = lightning.simulateTargetRolls(n);
    console.table(stats);
    showToast(`[LightningStats ${n} rolls] Living: ${stats.living.pct}% (~17.6%) | Tree: ${stats.tree.pct}% (~35.3%) | Block: ${stats.block.pct}% (~47.1%)`, 6500);
  } else if (cmd === 'lightningdebug') {
    const arg = (parts[1] || '').toLowerCase();
    lightning.debugEnabled = arg === 'on' ? true : arg === 'off' ? false : !lightning.debugEnabled;
    showToast(`Lightning Debug ${lightning.debugEnabled ? 'ENABLED' : 'DISABLED'}`);
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
  } else if (cmd === 'stuka') {
    const vignetteEl = document.getElementById('reel-cinematic-vignette');
    if (stukaFlight.isActive) {
      stukaFlight.exitFlightMode(controls);
      if (vignetteEl) vignetteEl.style.display = 'none';
      showToast('Exited Stuka Flight Mode (On Foot)');
    } else {
      skyLeviathan.applyReelAtmosphere(scene, renderer);
      if (vignetteEl) vignetteEl.style.display = 'block';
      stukaFlight.enterFlightMode(controls.playerPosition, camera);
      if (!skyLeviathan.isActive) {
        const spawnPos = stukaFlight.position.clone().add(new THREE.Vector3(0, 35, 100));
        skyLeviathan.spawn(spawnPos);
      }
      showToast('✈️ Boarded Stuka Ju 87! [L-Click]: MG-17, [R-Click]: Bomb, [V]: Flares, [Space]: Boost', 5000);
    }
  } else if (cmd === 'leviathan') {
    skyLeviathan.applyReelAtmosphere(scene, renderer);
    const vignetteEl = document.getElementById('reel-cinematic-vignette');
    if (vignetteEl) vignetteEl.style.display = 'block';
    const spawnPos = (stukaFlight.isActive ? stukaFlight.position : controls.playerPosition).clone().add(new THREE.Vector3(0, 50, 80));
    skyLeviathan.spawn(spawnPos);
    showToast('🐉 Abyssal Sky Leviathan spawned! Engage with Stuka [F7] or bow!', 5000);
  } else if (cmd === 'dragon' || cmd === 'caldera' || cmd === 'boss') {
    if (dragonArena.isActive) {
      dragonArena.exitArena(controls);
      showToast('Returned to Overworld from Calamity Caldera!');
    } else {
      dragonArena.enterArena(controls);
      showToast('⚡ ENTERED DRAGON CALDERA! Defeat the Three-Headed Titan! (Press F8 to Exit)');
    }
  } else if (cmd === 'village') {
    if (dragonArena.isActive) {
      dragonArena.exitArena(controls);
    }
    controls.playerPosition.set(villageSystem.villageOrigin.x + 22, 28, villageSystem.villageOrigin.z + 22);
    showToast('Teleported to Village Town Square!');
  } else if (cmd === 'villager') {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const tx = controls.playerPosition.x + forward.x * 4.0;
    const tz = controls.playerPosition.z + forward.z * 4.0;
    const type = parts[1] === 'female' || parts[1] === 'f' ? 'VillagerFemale' : 'Villager';
    mobs.spawnMobAt(type, tx, tz);
    showToast(`Spawned ${type} at crosshair!`);
  } else if (cmd === 'weather') {
    let w = (parts[1] || 'clear').toLowerCase();
    if (w === 'storm') w = 'thunderstorm';
    dayNight.setWeather(w);
    showToast(`Weather set to ${dayNight.weather}`);
  } else if (cmd === 'gamemode') {
    const mode = (parts[1] || '').toLowerCase();
    controls.isFlyMode = mode === 'fly' || mode === 'creative' || !controls.isFlyMode;
    showToast(`Physics Mode: ${controls.isFlyMode ? 'Fly Mode' : 'Survival AABB'}`);
  } else if (cmd === 'give') {
    let item = (parts[1] || 'gem_ore').toLowerCase();
    if (item === 'water_source') item = 'water';
    if (item === 'lava_source') item = 'lava';
    const isSingle = item.startsWith('bucket');
    const count = Number(parts[2]) || (isSingle ? 1 : 16);
    inventory.addItem(item, count);
    showToast(`Added ${count}x ${item} to inventory`);
  } else if (cmd === 'fluidcheck') {
    let orphans = 0;
    if (world.fluidSimulator) {
      orphans = world.fluidSimulator.checkAndCleanOrphans();
      if (world.chunks) {
        for (const chunk of world.chunks.values()) {
          chunk.rebuildFluidMeshes();
        }
      }
    }
    showToast(`[FluidCheck] Scanned loaded chunks. Found & removed ${orphans} orphan fluid blocks.`, 5000);
  } else if (cmd === 'fluidstats') {
    const sim = world.fluidSimulator;
    const stats = {
      activeFluidBlocks: sim ? sim.fluids.size : 0,
      queuedUpdates: sim ? sim.queue.length : 0,
      lastTickUpdates: sim ? sim.activeUpdatesCount : 0,
      simTime: sim ? Number(sim.currentTime.toFixed(2)) : 0,
      pendingRemeshChunks: world.pendingRemeshChunks ? world.pendingRemeshChunks.size : 0,
    };
    console.table(stats);
    showToast(
      `[FluidStats] Active: ${stats.activeFluidBlocks} | Queued: ${stats.queuedUpdates} | LastTick: ${stats.lastTickUpdates} | RemeshChunks: ${stats.pendingRemeshChunks}`,
      5500
    );
  } else if (cmd === 'fluidtick') {
    const count = Math.max(1, Number(parts[1]) || 1);
    let totalProcessed = 0;
    if (world.fluidSimulator) {
      for (let i = 0; i < count; i++) {
        world.fluidSimulator.currentTime += 0.25;
        totalProcessed += world.fluidSimulator.tick(world.fluidSimulator.currentTime, 500);
      }
      if (world.pendingRemeshChunks) {
        for (const chunk of world.pendingRemeshChunks) {
          chunk.rebuildFluidMeshes();
        }
        world.pendingRemeshChunks.clear();
      }
    }
    showToast(`Stepped ${count} fluid tick(s) (${totalProcessed} updates processed)`);
  } else if (cmd === 'fluiddebug') {
    const state = (parts[1] || '').toLowerCase();
    world.fluidDebug = state === 'on' ? true : state === 'off' ? false : !world.fluidDebug;
    showToast(`Fluid Debug: ${world.fluidDebug ? 'ON' : 'OFF'}`);
  } else if (cmd === 'tp' && parts.length >= 4) {
    controls.playerPosition.set(
      Number(parts[1]) || 0,
      Number(parts[2]) || 28,
      Number(parts[3]) || 0
    );
    world.reloadAllChunks(controls.playerPosition);
    showToast(`Teleported to (${parts[1]}, ${parts[2]}, ${parts[3]})`);
  } else if (cmd === 'plantcheck') {
    let scanned = 0;
    let invalidCount = 0;
    const affectedChunks = new Set();
    const VALID_SOILS = new Set(['grass', 'dirt', 'forest_floor', 'maple_floor', 'needle_floor', 'moss', 'mossy_cobble']);

    for (const chunk of world.chunks.values()) {
      for (const [key, blockType] of chunk.blocks.entries()) {
        const def = BLOCK_BY_ID[blockType];
        if (def && def.isPlant) {
          scanned++;
          const [wx, wy, wz] = key.split(',').map(Number);
          const below = world.getBlock(wx, wy - 1, wz);
          const isMushroom = blockType.startsWith('mushroom');
          const isValidGround = below && (VALID_SOILS.has(below) || (isMushroom && below === 'stone'));
          const hasWater = chunk.blocks.get(key) === 'water' || world.getFluid(wx, wy, wz) !== null;

          if (!isValidGround || hasWater) {
            invalidCount++;
            chunk.blocks.delete(key);
            world.modifiedBlocks.set(key, null);
            affectedChunks.add(chunk);
          }
        }
      }
    }
    for (const ch of affectedChunks) {
      ch.rebuildMesh();
    }
    showToast(`[PlantCheck] Scanned ${scanned} plants. Found & removed ${invalidCount} invalid plants.`, 5000);
  } else if (cmd === 'spawnplants') {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize();
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const baseX = Math.floor(controls.playerPosition.x + forward.x * 4.0);
    const baseZ = Math.floor(controls.playerPosition.z + forward.z * 4.0);
    const baseY = Math.floor(controls.playerPosition.y);

    const plantList = [
      'fern',
      'tall_grass_plant',
      'mushroom_red',
      'mushroom_brown',
      'flower_bluebell',
      'flower_violet',
      'flower_anemone',
    ];

    for (let i = 0; i < plantList.length; i++) {
      const px = baseX + Math.round(right.x * (i - 3) * 1.5);
      const pz = baseZ + Math.round(right.z * (i - 3) * 1.5);
      world.setBlock(px, baseY - 1, pz, i >= 2 && i <= 3 ? 'dirt' : 'grass');
      world.setBlock(px, baseY, pz, plantList[i]);
    }
    showToast(`Spawned row of ${plantList.length} plants ahead! Inspect their upright orientation.`, 5000);
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
  } else if (cmd === 'forceattack') {
    const mobType = parts[1] || 'GrimWraith';
    const attackId = parts[2] || 'scythe_slash';
    const res = mobs.forceMobAttack(
      mobType,
      attackId,
      controls.playerPosition,
      world,
      statusEffects,
      sfx
    );
    if (res.success) {
      showToast(`Forced ${res.mobType} to execute '${res.attackId}'!`);
    } else {
      showToast(`Force attack failed: ${res.reason}`);
    }
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
  } else if (cmd === 'season') {
    const s = (parts[1] || 'spring').toLowerCase();
    const ok = climateSystem.setSeason(s);
    if (ok) {
      showToast(`Season set to ${s.toUpperCase()} (Day ${climateSystem.dayCount + 1})`);
    } else {
      showToast(`Invalid season '${s}' (valid: spring, summer, autumn, winter)`);
    }
  } else if (cmd === 'climate') {
    const px = Math.round(controls.playerPosition.x);
    const pz = Math.round(controls.playerPosition.z);
    const py = controls.playerPosition.y;
    const b = getBiome(px, pz, world.seed);
    const temp = climateSystem.temperatureAt(b, py);
    const precip = climateSystem.precipTypeAt(b, py);
    showToast(
      `[Climate] ${climateSystem.season.toUpperCase()} Day ${climateSystem.dayCount + 1} | Biome: ${b.name} | Temp: ${temp}°C | Weather: ${climateSystem.weather} | Precip: ${precip}`,
      6500
    );
  } else if (cmd === 'climatedebug') {
    const b = getBiome(Math.round(controls.playerPosition.x), Math.round(controls.playerPosition.z), world.seed);
    const temp = climateSystem.temperatureAt(b, controls.playerPosition.y);
    const precip = climateSystem.precipTypeAt(b, controls.playerPosition.y);
    console.table({
      season: climateSystem.season,
      dayCount: climateSystem.dayCount,
      seasonProgress: climateSystem.seasonProgress.toFixed(2),
      timeOfDay: climateSystem.timeOfDay.toFixed(3),
      weather: climateSystem.weather,
      targetWeather: climateSystem.targetWeather,
      precipIntensity: climateSystem.precipIntensity.toFixed(2),
      precipType: precip,
      localTempC: temp,
      cloudCover: climateSystem.cloudCover.toFixed(2),
      windStrength: climateSystem.windVector.strength.toFixed(2),
      timeScale: climateSystem.timeScale,
    });
    showToast(`Logged deep Climate telemetry to DevTools console (F12)`);
  } else if (cmd === 'timespeed') {
    const spd = Number(parts[1]) || 1.0;
    climateSystem.timeScale = spd;
    showToast(`Climate time speed multiplier set to ${spd}x`);
  } else if (cmd === 'spawnflock') {
    const count = Number(parts[1]) || 4;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const fx = controls.playerPosition.x + forward.x * 6.0;
    const fz = controls.playerPosition.z + forward.z * 6.0;
    const flock = mobs.spawnFlock(fx, fz, count);
    showToast(`Spawned flock of ${flock.length} flying birds ahead!`);
  } else if (cmd === 'birdstate') {
    const st = parts[1] || 'Fly';
    const res = mobs.forceNearestBirdState(st, controls.playerPosition);
    if (res.success) {
      showToast(`Forced nearest bird to state '${res.state}'!`);
    } else {
      showToast(`Bird state error: ${res.reason}`);
    }
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
  if (reelPostStack) {
    const qPreset = qualityIndex === 0 ? 'low' : (qualityIndex === 1 ? 'medium' : 'high');
    reelPostStack.setQuality(qPreset);
  }
  showToast(`Quality Preset: ${q}`);
});
document.getElementById('menu-btn-new')?.addEventListener('click', () => {
  togglePauseMenu(false);
  performNewGame();
});

// ============================================================================
// STANDALONE DESKTOP GAME LAUNCHER CONTROLLER (v2.0)
// Manages starting game screen, mode selection, hardware options, and launch
// ============================================================================
const launcherScreenEl = document.getElementById('game-launcher-screen');
const launcherStartBtn = document.getElementById('launcher-start-btn');
const launcherSelectedModeLabel = document.getElementById('launcher-selected-mode-label');

let selectedGameMode = 'survival';
let isGameActive = false;

// 1. Launcher Tab Switching
const launcherTabs = [
  { btn: document.getElementById('launcher-tab-btn-play'), panel: document.getElementById('panel-play') },
  { btn: document.getElementById('launcher-tab-btn-settings'), panel: document.getElementById('panel-settings') },
  { btn: document.getElementById('launcher-tab-btn-controls'), panel: document.getElementById('panel-controls') },
  { btn: document.getElementById('launcher-tab-btn-news'), panel: document.getElementById('panel-news') },
];

launcherTabs.forEach(({ btn, panel }) => {
  btn?.addEventListener('click', () => {
    launcherTabs.forEach(t => {
      t.btn?.classList.remove('active');
      t.panel?.classList.remove('active');
    });
    btn.classList.add('active');
    panel?.classList.add('active');
  });
});

function quitDesktopGame() {
  fetch('/api/quit').catch(() => {});
  setTimeout(() => window.close(), 150);
}

document.getElementById('launcher-tab-btn-exit')?.addEventListener('click', quitDesktopGame);
document.getElementById('menu-btn-quit')?.addEventListener('click', quitDesktopGame);

// 2. Mode Card Selection
const modeCards = document.querySelectorAll('.mode-card');
modeCards.forEach((card) => {
  card.addEventListener('click', () => {
    modeCards.forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    selectedGameMode = card.dataset.mode || 'survival';

    const h3El = card.querySelector('h3');
    if (launcherSelectedModeLabel && h3El) {
      launcherSelectedModeLabel.textContent = h3El.textContent;
    }
  });
});

// 3. Hardware & Quality Settings
document.getElementById('launcher-opt-quality')?.addEventListener('change', (e) => {
  const val = e.target.value;
  if (val === 'low') qualityIndex = 0;
  else if (val === 'medium') qualityIndex = 1;
  else if (val === 'high') qualityIndex = 2;
  else if (val === 'ultra') qualityIndex = 3;

  renderer.shadowMap.enabled = qualityIndex >= 1;
  renderer.setPixelRatio(qualityIndex === 0 ? 1 : Math.min(window.devicePixelRatio, qualityIndex >= 2 ? 1.5 : 1));
  if (reelPostStack) {
    const qPreset = qualityIndex === 0 ? 'low' : (qualityIndex === 1 ? 'medium' : 'high');
    reelPostStack.setQuality(qPreset);
  }
  const qBtn = document.getElementById('menu-btn-quality');
  if (qBtn) qBtn.textContent = `Graphics Quality: ${qualityNames[qualityIndex]}`;
});

const volumeSliderEl = document.getElementById('launcher-opt-volume');
const volumeValLabel = document.getElementById('launcher-vol-label');
volumeSliderEl?.addEventListener('input', (e) => {
  if (volumeValLabel) volumeValLabel.textContent = `${e.target.value}%`;
});

document.getElementById('btn-toggle-fullscreen')?.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
});

// 4. Return to Launcher from Pause Menu
function returnToLauncherScreen() {
  isGameActive = false;
  controls.paused = true;
  if (stukaFlight && stukaFlight.isActive) {
    stukaFlight.exitFlightMode(controls);
  }
  const vignetteEl = document.getElementById('reel-cinematic-vignette');
  if (vignetteEl) vignetteEl.style.display = 'none';
  if (document.pointerLockElement) {
    document.exitPointerLock();
  }
  togglePauseMenu(false);
  launcherScreenEl?.classList.remove('hidden-launcher');
}

document.getElementById('menu-btn-launcher')?.addEventListener('click', () => {
  returnToLauncherScreen();
});

// 5. START GAME Launch Sequence
launcherStartBtn?.addEventListener('click', () => {
  launchGameEngineFromLauncher();
});

function launchGameEngineFromLauncher() {
  isGameActive = true;
  controls.paused = false;

  // Sound chime
  sfx?.playPlace();

  // Hide launcher overlay with smooth transition
  launcherScreenEl?.classList.add('hidden-launcher');

  // Apply chosen expedition mode
  const vignetteEl = document.getElementById('reel-cinematic-vignette');
  if (selectedGameMode === 'sky_dogfight') {
    skyLeviathan.applyReelAtmosphere(scene, renderer);
    if (vignetteEl) vignetteEl.style.display = 'block';
    stukaFlight.enterFlightMode(controls.playerPosition, camera);
    const spawnPos = stukaFlight.position.clone().add(new THREE.Vector3(0, 35, 120));
    skyLeviathan.spawn(spawnPos);
    showToast('✈️ STUKA DOGFIGHT: Engage the Abyssal Sky Leviathan! [L-Click]: MG-17, [R-Click]: Bomb, [V]: Flares', 6000);
  } else if (selectedGameMode === 'boss_arena') {
    if (vignetteEl) vignetteEl.style.display = 'none';
    dragonArena?.enterArena(controls);
    showToast('⚡ Jumped into Calamity Caldera from Launcher! Defeat the Abyssal Void Titan!', 4500);
  } else if (selectedGameMode === 'creative') {
    if (vignetteEl) vignetteEl.style.display = 'none';
    controls.isFlyMode = true;
    showToast('🕊️ Creative Flight Mode Enabled (Infinite Flight & Build)', 3500);
  } else {
    if (vignetteEl) vignetteEl.style.display = 'none';
    controls.isFlyMode = false;
    showToast('🌲 Welcome to Voxel Realms! Settlement Village is ahead.', 3500);
  }

  // Request pointer lock for direct 3D gameplay
  setTimeout(() => {
    renderer.domElement.requestPointerLock();
  }, 250);
}

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

    // Boss fight hit detection against the Three-Headed Emerald Titan
    if (dragonArena && dragonArena.isActive && dragonArena.dragon) {
      const dPos = dragonArena.dragon.position;
      const toDragon = dPos.clone().sub(controls.playerPosition);
      const dist = toDragon.length();
      const lookDot = lookDirection.dot(toDragon.clone().normalize());
      if (dist < 22.0 && lookDot > 0.40) {
        dragonArena.damageBoss(finalDmg * 5);
        sfx.playAttackHit();
        particles.spawnBurst(dPos.x, dPos.y + 1, dPos.z, 'emerald_ore', 14);
        showToast(`💥 Hit Three-Headed Titan! Boss HP: ${dragonArena.bossHP}/${dragonArena.bossMaxHP}`, 1800);
        return;
      }
    }

    // Boss fight hit detection against the Sky Leviathan (Void Wyrm)
    if (skyLeviathan && skyLeviathan.isActive) {
      const rayPos = controls.playerPosition.clone();
      const lookRay = lookDirection.clone();
      const hit = skyLeviathan.checkHit(rayPos.clone().add(lookRay.clone().multiplyScalar(35)), 12.0);
      if (hit) {
        skyLeviathan.takeDamage(finalDmg * 5, hit);
        sfx.playAttackHit();
        showToast(`💥 Hit Sky Leviathan! HP: ${Math.round(skyLeviathan.hp)}/${skyLeviathan.maxHp}`, 1600);
        return;
      }
    }

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

    // 2. Otherwise mine targeted block (Mining ignores fluids: never mine water or lava!)
    if (!currentHit || currentHit.isFluid || currentHit.blockType === 'water' || currentHit.blockType === 'lava') return;
    const brokenBlockType = currentHit.blockType;
    const { x, y, z } = currentHit;
    const removed = world.removeBlock(x, y, z);
    if (removed && brokenBlockType) {
      inventory.addItem(brokenBlockType, 1);
      sfx.playBreak();
      particles.spawnBurst(x, y, z, brokenBlockType);
    }
  } else if (event.button === 2) {
    const activeStack = ui.getSelectedStack();
    const heldItem = activeStack ? activeStack.itemType : null;

    // Bucket Pickup (Empty Bucket right-clicked on fluid source)
    if (heldItem === 'bucket_empty') {
      const fluidHit = raycastVoxelDDA(world, controls.playerPosition, lookDirection, 6.0, { ignoreFluids: false, targetFluids: true });
      if (fluidHit && fluidHit.isFluid) {
        const fluid = world.getFluid(fluidHit.x, fluidHit.y, fluidHit.z);
        if (fluid && fluid.level === 0) {
          world.removeFluid(fluidHit.x, fluidHit.y, fluidHit.z);
          const chunk = world.getChunkAtWorld(fluidHit.x, fluidHit.z);
          if (chunk) {
            const key = world.coordKey(fluidHit.x, fluidHit.y, fluidHit.z);
            if (chunk.blocks.get(key) === fluid.type) {
              world.modifiedBlocks.set(key, null);
              chunk.blocks.delete(key);
              chunk.rebuildMesh();
            }
          }
          if (world.fluidSimulator) {
            world.fluidSimulator.removeSource(fluidHit.x, fluidHit.y, fluidHit.z);
          }
          const filledBucket = fluid.type === 'lava' ? 'bucket_lava' : 'bucket_water';
          inventory.consumeHotbarSlot(ui.selectedIndex);
          inventory.slots[ui.selectedIndex] = { itemType: filledBucket, count: 1 };
          inventory._notify();
          sfx.playPlace();
          showToast(`Scooped ${fluid.type} source!`);
          return;
        }
      }
      return;
    }

    // Bucket Placement (Water/Lava Bucket right-clicked on ground or face)
    if (heldItem === 'bucket_water' || heldItem === 'bucket_lava') {
      const fluidType = heldItem === 'bucket_lava' ? 'lava' : 'water';
      if (currentHit) {
        const { x: adjX, y: adjY, z: adjZ } = currentHit.adjacent;
        if (!world.wouldOverlapPlayer(adjX, adjY, adjZ, controls.playerPosition)) {
          if (world.fluidSimulator) {
            world.fluidSimulator.addSource(adjX, adjY, adjZ, fluidType);
          }
          inventory.consumeHotbarSlot(ui.selectedIndex);
          inventory.slots[ui.selectedIndex] = { itemType: 'bucket_empty', count: 1 };
          inventory._notify();
          sfx.playPlace();
          showToast(`Placed ${fluidType} source!`);
          return;
        }
      }
      return;
    }

    // Solid Block Placement (Replaces fluid if placed inside fluid cell)
    if (!currentHit) return;
    const { x: adjX, y: adjY, z: adjZ } = currentHit.adjacent;
    if (!world.wouldOverlapPlayer(adjX, adjY, adjZ, controls.playerPosition)) {
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
  if (reelPostStack) {
    reelPostStack.onWindowResize();
  }
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

  // Job 2: Fluid Camera Screen Overlays & Oxygen Bar
  const isUnderwater = controls.headSubmerged && controls.headSubmergedType === 'water';
  const isInLava = controls.headSubmerged && controls.headSubmergedType === 'lava';

  if (underwaterEl) underwaterEl.classList.toggle('hidden', !isUnderwater);
  if (lavaOverlayEl) lavaOverlayEl.classList.toggle('hidden', !isInLava);

  renderOxygenBar();

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

  // Check Ancient Caldera Portal entrance
  if (villageSystem && !dragonArena.isActive) {
    villageSystem.update(deltaTime);
    if (villageSystem.checkPortalCollision(controls.playerPosition)) {
      dragonArena.enterArena(controls);
      showToast('⚡ ENTERED DRAGON CALDERA! Defeat the Three-Headed Titan! (Press F8 to Exit)');
    }
  }

  // If in Dragon Boss Dimension: dedicate 100% frame budget to Boss Fight (Zero Overworld Overhead)
  if (dragonArena && dragonArena.isActive) {
    if (dragonArena.returnPortalPos && controls.playerPosition.distanceTo(dragonArena.returnPortalPos) < 2.5) {
      dragonArena.exitArena(controls);
      showToast('Returned to Overworld from Calamity Caldera!');
    }
    dragonArena.update(deltaTime, controls.playerPosition);
    reelPostStack.render(deltaTime);
    return;
  }

  // Stuka Flight & Sky Leviathan Combat System (100% Dedicated 60 FPS Flight Dynamics)
  if (stukaFlight && stukaFlight.isActive) {
    // Keep player coordinates synchronized with aircraft position to drive chunk streaming
    controls.playerPosition.copy(stukaFlight.position);
    world.updateChunks(stukaFlight.position, false, stukaFlight.getForwardVector());

    // Update Sunlight and Volumetric Clouds to follow aircraft position
    lights.updateSunFollow(stukaFlight.position);
    skyEnclosure.update(deltaTime, stukaFlight.position);
    world.updateFluids(deltaTime);
    sharedShaderUniforms.uTime.value += deltaTime;

    stukaFlight.update(deltaTime, skyLeviathan, (dmg, part) => {
      sfx.playAttackHit();
      const critText = part === 'head' ? 'CRITICAL HEADSHOT!' : 'HIT!';
      showToast(`💥 ${critText} -${Math.round(dmg)} HP on Leviathan!`, 750);
    });
    skyLeviathan.update(deltaTime, stukaFlight.position, stukaFlight);
    reelPostStack.render(deltaTime);
    return;
  }

  // Update Sky Leviathan if roaming the sky while player is on foot
  if (skyLeviathan && skyLeviathan.isActive) {
    skyLeviathan.update(deltaTime, controls.playerPosition, null);
  }

  // 3. Update Sky, Sunlight, Clouds, Animated Fluids, Mobs & Particles
  lights.updateSunFollow(controls.playerPosition);
  skyEnclosure.update(deltaTime, controls.playerPosition);
  world.updateFluids(deltaTime);
  sharedShaderUniforms.uTime.value += deltaTime;
  camera.getWorldDirection(lookDirection);
  const currentBiome = typeof world.getBiomeAt === 'function'
    ? world.getBiomeAt(controls.playerPosition.x, controls.playerPosition.z)
    : null;
  dayNight.update(deltaTime, controls.playerPosition, currentBiome);
  lightning.update(deltaTime, controls.playerPosition, dayNight.weather, (dmg, src, opts) => applyPlayerDamage(dmg, src, opts));

  // Job 2: Submerged camera fog color & density override
  if (scene.fog) {
    if (isUnderwater) {
      scene.fog.color.set(FLUID_CONFIG.water.underwaterFogColor);
      if (scene.fog.isFogExp2) {
        scene.fog.density = 0.065;
      } else {
        scene.fog.near = 1.0;
        scene.fog.far = 28.0;
      }
    } else if (isInLava) {
      scene.fog.color.set(FLUID_CONFIG.lava.inLavaFogColor);
      if (scene.fog.isFogExp2) {
        scene.fog.density = 0.40;
      } else {
        scene.fog.near = 0.5;
        scene.fog.far = 8.0;
      }
    }
  }
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

  // 6. Render Scene via Reel Post-Processing Stack (HDR Bloom, Color Grading, Vignette, Film Grain)
  reelPostStack.render(deltaTime);

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
