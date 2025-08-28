//controller/serverController.js

const { spawn } = require('child_process');
const { updateServer } = require('../registry/serverRegistry');

const processes = {};
const serverLogs = {}; // Store logs for each server

function startServer(server) {
  if (processes[server.id]) {
    console.warn(`Server "${server.name}" is already running.`);
    return;
  }

  // Initialize logs array for this server
  serverLogs[server.id] = [];

  const proc = spawn('node', ['server.js'], {
    cwd: server.path,
    shell: true,
    detached: false // Important: keep attached so we can kill properly
  });

  processes[server.id] = proc;
  updateServer(server.id, { status: 'running', pid: proc.pid });

  proc.stdout.on('data', data => {
    const output = data.toString().trim();
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${output}`;
    
    console.log(`[${server.name}] ${output}`);
    
    // Store log entry
    if (!serverLogs[server.id]) serverLogs[server.id] = [];
    serverLogs[server.id].push(logEntry);
    
    // Keep only last 100 log entries per server
    if (serverLogs[server.id].length > 100) {
      serverLogs[server.id] = serverLogs[server.id].slice(-100);
    }

    // Detect port startup message
    const match = output.match(/Server running on (http:\/\/localhost:\d+)/i);
    if (match) {
      const url = match[1];
      try {
        // Show popup in browser context
        if (typeof window !== 'undefined') {
          alert(`✅ ${server.name} started at ${url}`);
        }
      } catch (err) {
        console.log(`Popup failed: ${err.message}`);
      }
    }
  });

  proc.stderr.on('data', data => {
    const error = data.toString().trim();
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ERROR: ${error}`;
    
    console.error(`[${server.name} ERROR] ${error}`);
    
    // Store error log entry
    if (!serverLogs[server.id]) serverLogs[server.id] = [];
    serverLogs[server.id].push(logEntry);
    
    if (serverLogs[server.id].length > 100) {
      serverLogs[server.id] = serverLogs[server.id].slice(-100);
    }
  });

  proc.on('exit', (code, signal) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] Server exited with code ${code} (${signal})`;
    
    console.log(`Server "${server.name}" exited with code ${code} (${signal})`);
    
    if (serverLogs[server.id]) {
      serverLogs[server.id].push(logEntry);
    }
    
    updateServer(server.id, { status: 'stopped', pid: null });
    delete processes[server.id];
  });

  proc.on('error', err => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] Failed to start: ${err.message}`;
    
    console.error(`Failed to start server "${server.name}":`, err.message);
    
    if (serverLogs[server.id]) {
      serverLogs[server.id].push(logEntry);
    }
    
    updateServer(server.id, { status: 'stopped', pid: null });
    delete processes[server.id];
  });
}

function stopServer(server) {
  const proc = processes[server.id];
  if (!proc) {
    console.warn(`No active process found for "${server.name}"`);
    return false;
  }

  try {
    // For Windows, we need to kill the process tree to ensure all child processes are terminated
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
      // Use taskkill to terminate the process tree on Windows
      const { spawn } = require('child_process');
      const killer = spawn('taskkill', ['/f', '/t', '/pid', proc.pid]);
      
      killer.on('close', (code) => {
        console.log(`Taskkill completed with code ${code} for server "${server.name}"`);
      });
      
      killer.on('error', (err) => {
        console.error(`Taskkill failed for server "${server.name}":`, err.message);
        // Fallback to regular kill
        try {
          proc.kill('SIGINT');
        } catch (killErr) {
          console.error(`Fallback kill failed:`, killErr.message);
        }
      });
    } else {
      // Unix-like systems
      proc.kill('SIGINT');
    }
    
    // Force kill after 10 seconds if still running (increased timeout for Windows)
    setTimeout(() => {
      if (processes[server.id] && !proc.killed) {
        console.log(`Force killing server "${server.name}"`);
        try {
          if (isWindows) {
            const forceKiller = spawn('taskkill', ['/f', '/t', '/pid', proc.pid]);
            forceKiller.on('error', () => {
              proc.kill('SIGKILL');
            });
          } else {
            proc.kill('SIGKILL');
          }
        } catch (err) {
          console.error(`Force kill failed for "${server.name}":`, err.message);
        }
      }
    }, 10000);
    
    updateServer(server.id, { status: 'stopped', pid: null });
    delete processes[server.id];
    
    const timestamp = new Date().toLocaleTimeString();
    if (serverLogs[server.id]) {
      serverLogs[server.id].push(`[${timestamp}] Stop signal sent`);
    }
    
    console.log(`Sent stop signal to server "${server.name}"`);
    return true;
  } catch (err) {
    console.error(`Failed to stop server "${server.name}":`, err.message);
    return false;
  }
}

function isProcessRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0); // throws if not running
    return true;
  } catch {
    return false;
  }
}

function getRunningProcesses() {
  return Object.values(processes);
}

function getServerLogs(serverId) {
  return serverLogs[serverId] || [];
}

function clearServerLogs(serverId) {
  if (serverLogs[serverId]) {
    serverLogs[serverId] = [];
  }
}

module.exports = {
  startServer,
  stopServer,
  isProcessRunning,
  getRunningProcesses,
  getServerLogs,
  clearServerLogs
};