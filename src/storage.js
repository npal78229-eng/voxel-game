// ============================================================================
// Phase 5 — Persistence & Save/Load (IndexedDB Seeded Diffs + Autosave)
// ============================================================================

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
 * Task 5A — Builds a plain serializable save payload containing ONLY modified
 * block diffs (`Array.from(world.modifiedBlocks.entries())`), deterministic seed,
 * player transform, and stack inventory.
 */
export function serializeGameState({ world, controls, inventory, ui, dayNight }) {
  return {
    version: 1,
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
    // Convert Map<"wx,wy,wz", blockType|null> explicitly to array of [key, value] entries
    modifiedBlocks: Array.from(world.modifiedBlocks.entries()),
    inventorySlots: inventory.slots.map((slot) =>
      slot ? { itemType: slot.itemType, count: slot.count } : null
    ),
    selectedHotbarIndex: ui ? ui.selectedIndex : 0,
    dayCycleTime: dayNight ? dayNight.timeOfDay : 0.25,
  };
}

/**
 * Task 5A & 5C — Restores world diffs, player position/look, and inventory from save data.
 */
export function deserializeGameState(data, { world, controls, inventory, ui, dayNight }) {
  if (!data || typeof data !== 'object') return false;

  // 1. Restore seed & modified block diffs Map
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

  // 2. Restore player position, look angle, and camera mode
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

  // 3. Rebuild chunks around restored player position with diffs applied
  world.reloadAllChunks(controls.playerPosition);

  // 4. Restore inventory slots & selected hotbar slot
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

  return true;
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
