const { contextBridge, ipcRenderer } = require('electron');

// ============================================================================
// Phase U1.1 — Secure Preload Context Bridge (electron/preload.cjs)
// ============================================================================

contextBridge.exposeInMainWorld('voxelDesktopAPI', {
  isDesktopApp: true,
  notifyReady: () => ipcRenderer.send('game:ready'),
  listWorlds: () => ipcRenderer.invoke('saves:list'),
  saveWorld: (payload) => ipcRenderer.invoke('saves:write', payload),
  loadWorld: (worldId) => ipcRenderer.invoke('saves:read', worldId),
  deleteWorld: (worldId) => ipcRenderer.invoke('saves:delete', worldId),
  saveScreenshot: (dataUrl) => ipcRenderer.invoke('app:screenshot', dataUrl),
  quitApp: () => ipcRenderer.send('app:quit'),
});
