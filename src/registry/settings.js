//registry/settings.js

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Use app.getPath('userData') for packaged apps
function getDataPath() {
  try {
    return app.getPath('userData');
  } catch {
    // Fallback for development
    return path.join(__dirname, '../../data');
  }
}

const settingsPath = path.join(getDataPath(), 'settings.json');

// Default settings
const defaultSettings = {
  runOnStartup: false,
  theme: 'dark',
  autoRefreshInterval: 2000,
  maxLogsPerServer: 100
};

function ensureDataDirectory() {
  const dataDir = path.dirname(settingsPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function readSettings() {
  try {
    ensureDataDirectory();
    
    if (!fs.existsSync(settingsPath)) {
      // Create settings file with defaults if it doesn't exist
      writeSettings(defaultSettings);
      return defaultSettings;
    }
    
    const data = fs.readFileSync(settingsPath, 'utf8');
    const settings = JSON.parse(data);
    
    // Merge with defaults to ensure all settings exist
    return { ...defaultSettings, ...settings };
  } catch (error) {
    console.error('Error reading settings:', error);
    return defaultSettings;
  }
}

function writeSettings(settings) {
  try {
    ensureDataDirectory();
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing settings:', error);
    return false;
  }
}

function updateSetting(key, value) {
  try {
    const settings = readSettings();
    settings[key] = value;
    return writeSettings(settings);
  } catch (error) {
    console.error('Error updating setting:', error);
    return false;
  }
}

function getSetting(key) {
  try {
    const settings = readSettings();
    return settings[key];
  } catch (error) {
    console.error('Error getting setting:', error);
    return defaultSettings[key];
  }
}

// Windows startup functionality
async function setWindowsStartup(enable) {
  try {
    if (process.platform !== 'win32') {
      console.log('Startup setting is only supported on Windows');
      return false;
    }

    const appPath = app.getPath('exe');
    const startupPath = path.join(
      app.getPath('appData'),
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
      'Startup',
      'NPMate.lnk'
    );

    if (enable) {
      // Create startup shortcut
      const { spawn } = require('child_process');
      const powershellScript = `
        $WshShell = New-Object -comObject WScript.Shell
        $Shortcut = $WshShell.CreateShortcut("${startupPath}")
        $Shortcut.TargetPath = "${appPath.replace(/\\/g, '\\\\')}"
        $Shortcut.Arguments = "--startup"
        $Shortcut.Description = "NPMate - Node.js Project Manager"
        $Shortcut.Save()
      `;

      return new Promise((resolve) => {
        const ps = spawn('powershell.exe', ['-Command', powershellScript], {
          windowsHide: true
        });

        ps.on('close', (code) => {
          if (code === 0) {
            console.log('Startup shortcut created successfully');
            resolve(true);
          } else {
            console.error('Failed to create startup shortcut, exit code:', code);
            resolve(false);
          }
        });

        ps.on('error', (error) => {
          console.error('PowerShell error:', error);
          resolve(false);
        });
      });
    } else {
      // Remove startup shortcut
      try {
        if (fs.existsSync(startupPath)) {
          fs.unlinkSync(startupPath);
          console.log('Startup shortcut removed');
        }
        return true;
      } catch (error) {
        console.error('Error removing startup shortcut:', error);
        return false;
      }
    }
  } catch (error) {
    console.error('Error managing Windows startup:', error);
    return false;
  }
}

module.exports = {
  readSettings,
  writeSettings,
  updateSetting,
  getSetting,
  setWindowsStartup,
  defaultSettings
};