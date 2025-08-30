//src/main/index.js

const { app, BrowserWindow, ipcMain, dialog, Tray, Menu } = require('electron');
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

let mainWindow;
let tray;
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../renderer/preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  
  // Handle window close event
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      showCloseDialog();
    }
  });
  
  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

function showCloseDialog() {
  const runningServers = getRunningProcesses();
  const serverCount = runningServers.length;
  
  let message = 'What would you like to do?';
  if (serverCount > 0) {
    message = `You have ${serverCount} server(s) running. What would you like to do?`;
  }

  const response = dialog.showMessageBoxSync(mainWindow, {
    type: 'question',
    title: 'NPMate',
    message: message,
    detail: serverCount > 0 ? 'Minimizing to tray will keep servers running in the background.' : '',
    buttons: ['Minimize to Tray', 'Exit App', 'Cancel'],
    defaultId: 0,
    cancelId: 2
  });

  if (response === 0) {
    // Minimize to tray
    mainWindow.hide();
    if (!tray) {
      createTray();
    }
    showTrayNotification();
  } else if (response === 1) {
    // Exit app
    isQuitting = true;
    app.quit();
  }
  // If Cancel (response === 2), do nothing
}

function createTray() {
  // Use the existing icon from assets folder
  const iconPath = path.join(__dirname, '../../assets/icon.ico');
  
  tray = new Tray(iconPath);
  
  updateTrayMenu();
  
  tray.setToolTip('NPMate - Node.js Server Manager');
  
  // Double-click to show window
  tray.on('double-click', () => {
    showMainWindow();
  });

  // Single click to show context menu (Windows behavior)
  tray.on('click', () => {
    updateTrayMenu();
  });
}

function updateTrayMenu() {
  if (!tray) return;
  
  const servers = readRegistry();
  const runningServers = servers.filter(s => s.status === 'running');
  
  let menuTemplate = [
    {
      label: 'Show NPMate',
      click: () => showMainWindow()
    },
    { type: 'separator' }
  ];
  
  if (runningServers.length > 0) {
    menuTemplate.push({
      label: `Running Servers (${runningServers.length})`,
      enabled: false
    });
    
    runningServers.forEach(server => {
      menuTemplate.push({
        label: `  ${server.name}`,
        enabled: false,
        icon: path.join(__dirname, '../../assets/icon.ico'),
        type: 'normal'
      });
    });
    
    menuTemplate.push({ type: 'separator' });
  } else {
    menuTemplate.push({
      label: 'No running servers',
      enabled: false
    });
    menuTemplate.push({ type: 'separator' });
  }
  
  menuTemplate.push(
    {
      label: 'Refresh Status',
      click: () => updateTrayMenu()
    },
    { type: 'separator' },
    {
      label: 'Exit NPMate',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  );
  
  const contextMenu = Menu.buildFromTemplate(menuTemplate);
  tray.setContextMenu(contextMenu);
}

function showMainWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
  }
}

function showTrayNotification() {
  if (tray) {
    tray.displayBalloon({
      iconType: 'info',
      title: 'NPMate',
      content: 'NPMate is now running in the background. Double-click the tray icon to open.'
    });
  }
}

// Auto-start servers function
async function startAutoStartServers() {
  try {
    console.log('Checking for auto-start servers...');
    const servers = readRegistry();
    const autoStartServers = servers.filter(server => server.autoStart === true);
    
    if (autoStartServers.length === 0) {
      console.log('No auto-start servers found.');
      return;
    }
    
    console.log(`Found ${autoStartServers.length} auto-start server(s):`, autoStartServers.map(s => s.name));
    
    // Start each auto-start server with a small delay between them
    for (let i = 0; i < autoStartServers.length; i++) {
      const server = autoStartServers[i];
      try {
        console.log(`Starting auto-start server: ${server.name}`);
        startServer(server);
        
        // Add delay between starts to avoid overwhelming the system
        if (i < autoStartServers.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(`Failed to start auto-start server "${server.name}":`, error);
      }
    }
    
    console.log('Auto-start sequence completed.');
  } catch (error) {
    console.error('Error in startAutoStartServers:', error);
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
    const result = updateServer(id, updates);
    // Update tray menu when server status changes
    if (tray) {
      setTimeout(() => updateTrayMenu(), 100);
    }
    return result;
  } catch (error) {
    console.error('Error updating server:', error);
    return false;
  }
});

ipcMain.handle('start-server', async (event, server) => {
  try {
    startServer(server);
    // Update tray menu after starting server
    if (tray) {
      setTimeout(() => updateTrayMenu(), 1000);
    }
    return true;
  } catch (error) {
    console.error('Error starting server:', error);
    return false;
  }
});

ipcMain.handle('stop-server', async (event, server) => {
  try {
    const result = stopServer(server);
    // Update tray menu after stopping server
    if (tray) {
      setTimeout(() => updateTrayMenu(), 1000);
    }
    return result;
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
  if (!isQuitting) return;
  
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
  // Don't quit when all windows are closed if we have tray
  if (process.platform !== 'darwin' && !tray) {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create a window when the dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else if (mainWindow) {
    showMainWindow();
  }
});

// Handle second instance (prevent multiple instances)
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      showMainWindow();
    }
  });
}

// Modified app.whenReady() to include auto-start functionality
app.whenReady().then(() => {
  createWindow();
  
  // Check if app was started with --startup flag (from Windows startup)
  const isStartupLaunch = process.argv.includes('--startup');
  
  if (isStartupLaunch) {
    console.log('NPMate started via Windows startup');
  }
  
  // Check for auto-start servers after app initialization
  // Add a delay to ensure the app is fully initialized
  setTimeout(() => {
    startAutoStartServers();
  }, 3000);
});