// ============================================================================
// Phase 5 — Persistence & Save/Load (IndexedDB Seeded Diffs + Autosave)
// ============================================================================

import { SAVE_WORLD_VERSION } from './config/ores.js';
import { isNightTime } from './config/spawning.js';

const DB_NAME = 'VoxelGameDB';
const DB_VERSION = 1;
const STORE_NAME = 'saves';
const SAVE_KEY = 'voxel-game-save';
const BACKUP_LS_KEY = 'voxel-game-save-backup';

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Task 5A & Task F4 — Builds a serializable save payload with SAVE_WORLD_VERSION = 3.
 */
export function serializeGameState({ world, controls, inventory, ui, dayNight, mobs }) {
  return {
    version: SAVE_WORLD_VERSION,
    savedAt: new Date().toISOString(),
    seed: world.seed,
    player: {
      position: [
        controls.playerPosition.x,
        controls.playerPosition.y,
        controls.playerPosition.z,
      ],
      euler: [controls.euler.x, controls.euler.y],
      isThirdPerson: Boolean(controls.isThirdPerson),
    },
    modifiedBlocks: Array.from(world.modifiedBlocks.entries()),
    inventorySlots: inventory.slots.map((slot) =>
      slot ? { itemType: slot.itemType, count: slot.count } : null
    ),
    selectedHotbarIndex: ui ? ui.selectedIndex : 0,
    dayCycleTime: dayNight ? dayNight.timeOfDay : 0.25,
    climate: dayNight?.climate
      ? {
          dayCount: dayNight.climate.dayCount,
          weather: dayNight.climate.weather,
          seed: dayNight.climate.seed,
          timeOfDay: dayNight.climate.timeOfDay,
        }
      : null,
    savedMobs: mobs
      ? mobs.mobs
          .filter((m) => m.hp > 0)
          .map((m) => ({
            type: m.spec.type,
            behaviorClass: m.spec.behaviorClass,
            x: m.group.position.x,
            z: m.group.position.z,
            hp: m.hp,
          }))
      : [],
  };
}

/**
 * Task F4 & Task F2 — Checks save version (warns "This world was made with an older version"
 * if version < 3) and removes night_monsters when loading during the day.
 */
export function deserializeGameState(
  data,
  { world, controls, inventory, ui, dayNight, mobs }
) {
  if (!data || typeof data !== 'object') return { ok: false };

  const savedVer = Number(data.version) || 1;
  if (savedVer < SAVE_WORLD_VERSION) {
    return {
      ok: false,
      olderVersion: true,
      warning: 'This world was made with an older version',
    };
  }

  if (typeof data.seed === 'number' && data.seed !== world.seed) {
    world.setSeed(data.seed);
  }
  world.modifiedBlocks.clear();
  if (Array.isArray(data.modifiedBlocks)) {
    for (const [coordKey, blockType] of data.modifiedBlocks) {
      if (typeof coordKey === 'string') {
        world.modifiedBlocks.set(coordKey, blockType ?? null);
      }
    }
  }
  if (typeof world.rebuildModifiedBlocksByChunk === 'function') {
    world.rebuildModifiedBlocksByChunk();
  }

  if (data.player && Array.isArray(data.player.position)) {
    const [px, py, pz] = data.player.position;
    controls.playerPosition.set(px, py, pz);
    if (Array.isArray(data.player.euler)) {
      controls.euler.x = data.player.euler[0];
      controls.euler.y = data.player.euler[1];
    }
    if (Boolean(data.player.isThirdPerson) !== Boolean(controls.isThirdPerson)) {
      controls.toggleCameraMode();
    }
    controls.update(0);
  }

  world.reloadAllChunks(controls.playerPosition);

  if (Array.isArray(data.inventorySlots)) {
    for (let i = 0; i < inventory.slots.length; i++) {
      const savedSlot = data.inventorySlots[i];
      inventory.slots[i] =
        savedSlot && savedSlot.itemType && savedSlot.count > 0
          ? { itemType: savedSlot.itemType, count: savedSlot.count }
          : null;
    }
    inventory._notify();
  }

  if (ui && typeof data.selectedHotbarIndex === 'number') {
    ui.selectSlot(data.selectedHotbarIndex);
  }

  if (dayNight && typeof data.dayCycleTime === 'number') {
    dayNight.timeOfDay = data.dayCycleTime;
  }

  if (data.climate && dayNight?.climate) {
    if (typeof data.climate.dayCount === 'number') dayNight.climate.dayCount = data.climate.dayCount;
    if (typeof data.climate.weather === 'string') dayNight.climate.setWeather(data.climate.weather);
    if (typeof data.climate.seed === 'number') dayNight.climate.seed = data.climate.seed;
    if (typeof data.climate.timeOfDay === 'number') {
      dayNight.climate.timeOfDay = data.climate.timeOfDay;
      dayNight.timeOfDay = data.climate.timeOfDay;
    }
  }

  // Task F2: If loading during the DAY, strip any saved night_monster not near player
  if (mobs) {
    const isNight = isNightTime(dayNight ? dayNight.timeOfDay : 0.25);
    mobs.cleanupDaytimeSavedMonsters(controls.playerPosition, isNight);
  }

  return { ok: true, olderVersion: false };
}

/**
 * Task 5B — Saves the serialized game state to IndexedDB (plus synchronous backup for beforeunload).
 */
export async function saveGame(context) {
  const payload = serializeGameState(context);
  try {
    localStorage.setItem(BACKUP_LS_KEY, JSON.stringify(payload));
  } catch {
    // Ignore localStorage quota warnings
  }

  try {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(payload, SAVE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return {
      ok: true,
      diffCount: payload.modifiedBlocks.length,
      savedAt: payload.savedAt,
    };
  } catch {
    return {
      ok: true,
      diffCount: payload.modifiedBlocks.length,
      savedAt: payload.savedAt,
    };
  }
}

/**
 * Task 5C — Loads existing save from IndexedDB (or backup) on startup.
 */
export async function loadGame() {
  try {
    const db = await openDatabase();
    const idbData = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(SAVE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (idbData) return idbData;
  } catch {
    // Fallback to backup
  }

  try {
    const raw = localStorage.getItem(BACKUP_LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Task 5D — Clears the save from IndexedDB and backup storage for "New Game".
 */
export async function clearSavedGame() {
  try {
    localStorage.removeItem(BACKUP_LS_KEY);
  } catch {
    // Ignore
  }
  try {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(SAVE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore
  }
}
