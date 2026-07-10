import path from 'node:path';
import { ChildProcess, spawn } from 'node:child_process';
import { checkBackendHealth, startDockerStack, stopDockerStack } from './services/docker';
import { getUnityPath, launchUnity, killUnity } from './services/unity';

// Access Electron modules through Electron's internal binding system
// This bypasses the npm package and uses Electron's built-in modules directly
const processAny = process as any;
const app = processAny._linkedBinding('electron_browser_app');
const BrowserWindow = processAny._linkedBinding('electron_browser_window');
const ipcMain = processAny._linkedBinding('electron_browser_ipc_main');

// Backend log storage
let backendLogs: string[] = [];
const MAX_LOGS = 100;

function addLog(message: string) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}`;
  backendLogs.push(logEntry);
  if (backendLogs.length > MAX_LOGS) {
    backendLogs.shift();
  }
  // Broadcast to all windows
  BrowserWindow.getAllWindows().forEach((win: any) => {
    win.webContents.send('backend:log', logEntry);
  });
}

let mainWindow: InstanceType<typeof BrowserWindow> | null = null;
let unityProcess: ChildProcess | null = null;
const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Vellum Rift Launcher',
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (unityProcess) {
    killUnity(unityProcess);
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('app:get-mode', () => {
  return isDev ? 'development' : 'production';
});

ipcMain.handle('backend:health-check', async (_event: any, backendUrl: string) => {
  return checkBackendHealth(backendUrl);
});

ipcMain.handle('backend:start', async () => {
  if (!isDev) {
    return { success: false, error: 'Cannot start backend in production mode' };
  }
  return startDockerStack();
});

ipcMain.handle('backend:stop', async () => {
  if (!isDev) {
    return { success: false, error: 'Cannot stop backend in production mode' };
  }
  return stopDockerStack();
});

ipcMain.handle('unity:get-path', () => {
  return getUnityPath();
});

ipcMain.handle('unity:launch', async (_event: any, args: { sessionId: string; backendUrl: string }) => {
  const unityPath = getUnityPath();
  if (!unityPath) {
    return { success: false, error: 'Unity build not found' };
  }

  unityProcess = launchUnity(unityPath, args.sessionId, args.backendUrl);

  unityProcess.on('exit', (code) => {
    unityProcess = null;
    mainWindow?.webContents.send('unity:exited', code);
  });

  return { success: true };
});

ipcMain.handle('unity:kill', () => {
  if (unityProcess) {
    killUnity(unityProcess);
    unityProcess = null;
    return { success: true };
  }
  return { success: false, error: 'Unity is not running' };
});

ipcMain.handle('unity:status', () => {
  return unityProcess && !unityProcess.killed ? 'running' : 'stopped';
});

// Backend logs
ipcMain.handle('backend:get-logs', () => {
  return backendLogs;
});

ipcMain.handle('backend:clear-logs', () => {
  backendLogs = [];
  return { success: true };
});

// Game state
ipcMain.handle('gamestate:get', async (_event: any, backendUrl: string) => {
  try {
    const response = await fetch(`${backendUrl}/api/game-state`);
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

// Start backend with logging
ipcMain.handle('backend:start-with-logs', async () => {
  if (!isDev) {
    return { success: false, error: 'Cannot start backend in production mode' };
  }
  
  addLog('Starting backend...');
  
  // Start the backend process
  const backendProcess = spawn('pnpm', ['--filter', '@vellum-rift/backend', 'dev'], {
    cwd: path.join(__dirname, '../../..'),
    shell: true,
  });
  
  backendProcess.stdout?.on('data', (data) => {
    const lines = data.toString().split('\n').filter((line: string) => line.trim());
    lines.forEach((line: string) => addLog(line));
  });
  
  backendProcess.stderr?.on('data', (data) => {
    const lines = data.toString().split('\n').filter((line: string) => line.trim());
    lines.forEach((line: string) => addLog(`ERROR: ${line}`));
  });
  
  backendProcess.on('close', (code) => {
    addLog(`Backend process exited with code ${code}`);
  });
  
  return { success: true };
});
