//registry/serverRegistry.js

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Use app.getPath('userData') for packaged apps, fallback for development
function getDataPath() {
  try {
    return app.getPath('userData');
  } catch {
    // Fallback for development when app is not available
    return path.join(__dirname, '../../data');
  }
}

const registryPath = path.join(getDataPath(), 'servers.json');

function ensureDataDirectory() {
  const dataDir = path.dirname(registryPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function readRegistry() {
  try {
    ensureDataDirectory();
    if (!fs.existsSync(registryPath)) {
      // Create empty registry if it doesn't exist
      writeRegistry([]);
      return [];
    }
    const data = fs.readFileSync(registryPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading registry:', error);
    return [];
  }
}

function writeRegistry(data) {
  try {
    ensureDataDirectory();
    fs.writeFileSync(registryPath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing registry:', error);
    return false;
  }
}

function updateServer(id, updates) {
  try {
    const registry = readRegistry().map(s =>
      s.id === id ? { ...s, ...updates } : s
    );
    return writeRegistry(registry);
  } catch (error) {
    console.error('Error updating server:', error);
    return false;
  }
}

module.exports = { readRegistry, writeRegistry, updateServer };