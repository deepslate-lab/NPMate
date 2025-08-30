//src/main/index.js

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { 
  startServer, 
  stopServer, 
  isProcessRunning, 
  getRunningProcesses,
  getServerLogs,
  clearServerLogs 
} = require('../controller/serverController');
const { readRegistry, updateServer, writeRegistry } = require('../registry/serverRegistry');
const { readSettings, updateSetting, setWindowsStartup } = require('../registry/settings');

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../renderer/preload.js')
    }
  });

  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  
  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }
}

// IPC Handlers for settings
ipcMain.handle('get-settings', async () => {
  try {
    return readSettings();
  } catch (error) {
    console.error('Error reading settings:', error);
    return {};
  }
});

ipcMain.handle('update-setting', async (event, key, value) => {
  try {
    if (key === 'runOnStartup') {
      // Handle Windows startup setting
      const success = await setWindowsStartup(value);
      if (success) {
        updateSetting(key, value);
        return { success: true };
      } else {
        return { success: false, error: 'Failed to update Windows startup setting' };
      }
    } else {
      const success = updateSetting(key, value);
      return { success };
    }
  } catch (error) {
    console.error('Error updating setting:', error);
    return { success: false, error: error.message };
  }
});

// IPC Handlers for server operations
ipcMain.handle('read-registry', async () => {
  try {
    return readRegistry();
  } catch (error) {
    console.error('Error reading registry:', error);
    return [];
  }
});

ipcMain.handle('write-registry', async (event, data) => {
  try {
    return writeRegistry(data);
  } catch (error) {
    console.error('Error writing registry:', error);
    return false;
  }
});

ipcMain.handle('update-server', async (event, id, updates) => {
  try {
    return updateServer(id, updates);
  } catch (error) {
    console.error('Error updating server:', error);
    return false;
  }
});

ipcMain.handle('start-server', async (event, server) => {
  try {
    startServer(server);
    return true;
  } catch (error) {
    console.error('Error starting server:', error);
    return false;
  }
});

ipcMain.handle('stop-server', async (event, server) => {
  try {
    return stopServer(server);
  } catch (error) {
    console.error('Error stopping server:', error);
    return false;
  }
});

ipcMain.handle('is-process-running', async (event, pid) => {
  try {
    return isProcessRunning(pid);
  } catch (error) {
    console.error('Error checking process:', error);
    return false;
  }
});

ipcMain.handle('get-server-logs', async (event, serverId) => {
  try {
    return getServerLogs(serverId);
  } catch (error) {
    console.error('Error getting server logs:', error);
    return [];
  }
});

ipcMain.handle('clear-server-logs', async (event, serverId) => {
  try {
    clearServerLogs(serverId);
    return true;
  } catch (error) {
    console.error('Error clearing server logs:', error);
    return false;
  }
});

// File operation handlers
ipcMain.handle('check-file-exists', async (event, filepath) => {
  try {
    return fs.existsSync(filepath);
  } catch (error) {
    console.error('Error checking file existence:', error);
    return false;
  }
});

ipcMain.handle('read-file', async (event, filepath, encoding = 'utf8') => {
  try {
    return fs.readFileSync(filepath, encoding);
  } catch (error) {
    console.error('Error reading file:', error);
    throw new Error(`Failed to read file: ${error.message}`);
  }
});

ipcMain.handle('write-file', async (event, filepath, data) => {
  try {
    fs.writeFileSync(filepath, data);
    return true;
  } catch (error) {
    console.error('Error writing file:', error);
    throw new Error(`Failed to write file: ${error.message}`);
  }
});

ipcMain.handle('join-path', async (event, ...paths) => {
  try {
    return path.join(...paths);
  } catch (error) {
    console.error('Error joining paths:', error);
    throw new Error(`Failed to join paths: ${error.message}`);
  }
});

// Handle settings menu
ipcMain.on('open-settings', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.webContents.send('open-settings');
  }
});

// Clean up all running servers before quitting
app.on('before-quit', async (event) => {
  const running = getRunningProcesses();
  if (running.length > 0) {
    console.log(`NPMate is shutting down. Stopping ${running.length} running server(s)...`);
    
    // Update registry to mark all as stopped
    const servers = readRegistry();
    servers.forEach(server => {
      if (server.status === 'running') {
        updateServer(server.id, { status: 'stopped', pid: null });
      }
    });
    
    // Kill all processes
    const killPromises = running.map(proc => {
      return new Promise((resolve) => {
        try {
          proc.kill('SIGINT');
          console.log(`Sent SIGINT to process PID ${proc.pid}`);
          
          // Force kill after 3 seconds
          setTimeout(() => {
            try {
              if (!proc.killed) {
                proc.kill('SIGKILL');
                console.log(`Force killed process PID ${proc.pid}`);
              }
            } catch (err) {
              console.error(`Error force killing process ${proc.pid}:`, err.message);
            }
            resolve();
          }, 3000);
          
        } catch (err) {
          console.error(`Failed to kill process ${proc.pid}:`, err.message);
          resolve();
        }
      });
    });
    
    // Wait for all processes to be handled
    await Promise.all(killPromises);
  }
});

app.on('window-all-closed', () => {
  // On macOS, keep the app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create a window when the dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(createWindow);