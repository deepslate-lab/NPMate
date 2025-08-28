//registry/serverRegistry.js

const fs = require('fs');
const path = require('path');
const registryPath = path.join(__dirname, '../../data/servers.json');

function readRegistry() {
  if (!fs.existsSync(registryPath)) return [];
  return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
}

function writeRegistry(data) {
  fs.writeFileSync(registryPath, JSON.stringify(data, null, 2));
}

function updateServer(id, updates) {
  const registry = readRegistry().map(s =>
    s.id === id ? { ...s, ...updates } : s
  );
  writeRegistry(registry);
}

module.exports = { readRegistry, writeRegistry, updateServer };