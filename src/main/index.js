//main/index.js

const { app, BrowserWindow } = require('electron');
const path = require('path');
const { getRunningProcesses } = require('../controller/serverController');

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile(path.join(__dirname, '../renderer/index.html'));
}

// 🧹 Clean up all running servers before quitting
app.on('before-quit', () => {
  const running = getRunningProcesses();
  if (running.length > 0) {
    console.log(`NPMate is shutting down. Stopping ${running.length} running server(s)...`);
    running.forEach(proc => {
      try {
        proc.kill('SIGINT');
        console.log(`Sent SIGINT to process PID ${proc.pid}`);
      } catch (err) {
        console.error(`Failed to kill process ${proc.pid}:`, err.message);
      }
    });
  }
});

app.whenReady().then(createWindow);