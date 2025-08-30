// renderer/preload.js

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSetting: (key, value) => ipcRenderer.invoke('update-setting', key, value),
  
  // Server operations
  readRegistry: () => ipcRenderer.invoke('read-registry'),
  writeRegistry: (data) => ipcRenderer.invoke('write-registry', data),
  updateServer: (id, updates) => ipcRenderer.invoke('update-server', id, updates),
  startServer: (server) => ipcRenderer.invoke('start-server', server),
  stopServer: (server) => ipcRenderer.invoke('stop-server', server),
  isProcessRunning: (pid) => ipcRenderer.invoke('is-process-running', pid),
  getServerLogs: (serverId) => ipcRenderer.invoke('get-server-logs', serverId),
  clearServerLogs: (serverId) => ipcRenderer.invoke('clear-server-logs', serverId),
  
  // File operations - these need to go through IPC
  checkFileExists: (filepath) => ipcRenderer.invoke('check-file-exists', filepath),
  readFile: (filepath, encoding = 'utf8') => ipcRenderer.invoke('read-file', filepath, encoding),
  writeFile: (filepath, data) => ipcRenderer.invoke('write-file', filepath, data),
  joinPath: (...paths) => ipcRenderer.invoke('join-path', ...paths),
  
  // IPC listeners
  onOpenSettings: (callback) => ipcRenderer.on('open-settings', callback),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});