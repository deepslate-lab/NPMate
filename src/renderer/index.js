//renderer/index.js

const { app, BrowserWindow } = require('electron');
const path = require('path');
const { getRunningProcesses } = require('../controller/serverController');
const { readRegistry, updateServer } = require('../registry/serverRegistry');

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile(path.join(__dirname, '../renderer/index.html'));
}

// 🧹 Clean up all running servers before quitting
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