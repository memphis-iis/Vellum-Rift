import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { ChildProcess } from 'node:child_process';
import { checkBackendHealth, startDockerStack, stopDockerStack } from './services/docker.js';
import { getUnityPath, launchUnity, killUnity } from './services/unity.js';

let mainWindow: BrowserWindow | null = null;
let unityProcess: ChildProcess | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

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
    mainWindow.loadURL('http://localhost:5174');
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

ipcMain.handle('backend:health-check', async (_event, backendUrl: string) => {
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

ipcMain.handle('unity:launch', async (_event, args: { sessionId: string; backendUrl: string }) => {
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