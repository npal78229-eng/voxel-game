const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// ============================================================================
// Phase U1 — Electron Desktop Main Process (electron/main.cjs)
// ============================================================================

const gotSingleLock = app.requestSingleInstanceLock();
if (!gotSingleLock) {
  app.quit();
}

let splashWindow = null;
let mainWindow = null;

function getWindowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState() {
  try {
    const raw = fs.readFileSync(getWindowStatePath(), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { width: 1280, height: 720, isFullScreen: false };
  }
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const bounds = win.getBounds();
    const data = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isFullScreen: win.isFullScreen(),
    };
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(data, null, 2));
  } catch {
    // Ignore write errors
  }
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 270,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    backgroundColor: '#090d16',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
}

function createMainWindow() {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width || 1280,
    height: state.height || 720,
    minWidth: 960,
    minHeight: 540,
    show: false,
    backgroundColor: '#090d16',
    title: 'Voxel Realms — Desktop Edition',
    autoHideMenuBar: true,
    fullscreen: Boolean(state.isFullScreen),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Load dev server if running in dev mode, otherwise load built dist/index.html
  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
  const distIndex = path.join(__dirname, '..', 'dist', 'index.html');

  if (!app.isPackaged && process.env.USE_DIST !== '1') {
    mainWindow.loadURL(devUrl).catch(() => {
      if (fs.existsSync(distIndex)) {
        mainWindow.loadFile(distIndex);
      }
    });
  } else {
    mainWindow.loadFile(distIndex);
  }

  mainWindow.once('ready-to-show', () => {
    // Wait up to 1.2s for renderer 'game:ready' IPC, or reveal automatically
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
      }
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
        mainWindow.show();
      }
    }, 1100);
  });

  // F11 and Alt+Enter fullscreen shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (
      input.type === 'keyDown' &&
      (input.key === 'F11' || (input.alt && input.key === 'Enter'))
    ) {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    }
  });

  mainWindow.on('close', () => {
    saveWindowState(mainWindow);
  });
}

// IPC: Renderer signals spawn chunks are meshed and game is ready
ipcMain.on('game:ready', () => {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
});

// IPC: Atomic File-Based World Saves with 3 Rolling Backups (Phase U1.5)
function getSavesDir() {
  const dir = path.join(app.getPath('userData'), 'saves');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

ipcMain.handle('saves:list', async () => {
  const root = getSavesDir();
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const worlds = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metaPath = path.join(root, entry.name, 'meta.json');
    if (fs.existsSync(metaPath)) {
      try {
        worlds.push(JSON.parse(fs.readFileSync(metaPath, 'utf-8')));
      } catch {
        // Ignore corrupted meta
      }
    }
  }
  return worlds.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
});

ipcMain.handle('saves:write', async (_event, { worldId, meta, worldData }) => {
  const safeId = String(worldId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  const worldDir = path.join(getSavesDir(), safeId);
  fs.mkdirSync(worldDir, { recursive: true });

  const worldFile = path.join(worldDir, 'world.json');
  const tempFile = path.join(worldDir, 'world.tmp.json');
  const metaFile = path.join(worldDir, 'meta.json');

  // Rotate 3 rolling backups (bak3 <- bak2 <- bak1 <- world.json)
  for (let i = 3; i >= 1; i--) {
    const prev =
      i === 1 ? worldFile : path.join(worldDir, `world.bak${i - 1}.json`);
    const next = path.join(worldDir, `world.bak${i}.json`);
    if (fs.existsSync(prev)) {
      try {
        fs.copyFileSync(prev, next);
      } catch {
        // Ignore
      }
    }
  }

  // Atomic write via temp file then rename
  fs.writeFileSync(tempFile, JSON.stringify(worldData));
  fs.renameSync(tempFile, worldFile);
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
  return { ok: true, path: worldFile };
});

ipcMain.handle('saves:read', async (_event, worldId) => {
  const safeId = String(worldId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  const worldDir = path.join(getSavesDir(), safeId);
  const candidates = [
    path.join(worldDir, 'world.json'),
    path.join(worldDir, 'world.bak1.json'),
    path.join(worldDir, 'world.bak2.json'),
    path.join(worldDir, 'world.bak3.json'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
      } catch {
        // Try next backup on corruption
      }
    }
  }
  return null;
});

ipcMain.handle('saves:delete', async (_event, worldId) => {
  const safeId = String(worldId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  const worldDir = path.join(getSavesDir(), safeId);
  if (fs.existsSync(worldDir)) {
    fs.rmSync(worldDir, { recursive: true, force: true });
  }
  return { ok: true };
});

ipcMain.handle('app:screenshot', async (_event, dataUrl) => {
  try {
    const base64 = String(dataUrl).replace(/^data:image\/png;base64,/, '');
    const dir = path.join(app.getPath('pictures'), 'VoxelRealms');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `screenshot-${Date.now()}.png`);
    fs.writeFileSync(file, Buffer.from(base64, 'base64'));
    return { ok: true, file };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.on('app:quit', () => {
  app.quit();
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  createSplashWindow();
  createMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
