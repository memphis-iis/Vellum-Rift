import { contextBridge, ipcRenderer } from 'electron';

export interface LauncherAPI {
  getMode: () => Promise<'development' | 'production'>;
  checkBackendHealth: (backendUrl: string) => Promise<{ status: 'ok' | 'degraded' | 'offline'; details?: string }>;
  startBackend: () => Promise<{ success: boolean; error?: string }>;
  stopBackend: () => Promise<{ success: boolean; error?: string }>;
  startBackendWithLogs: () => Promise<{ success: boolean; error?: string }>;
  getBackendLogs: () => Promise<string[]>;
  clearBackendLogs: () => Promise<{ success: boolean }>;
  onBackendLog: (callback: (log: string) => void) => void;
  getUnityPath: () => Promise<string | null>;
  launchUnity: (args: { sessionId: string; backendUrl: string }) => Promise<{ success: boolean; error?: string }>;
  killUnity: () => Promise<{ success: boolean; error?: string }>;
  getUnityStatus: () => Promise<'running' | 'stopped'>;
  onUnityExited: (callback: (code: number | null) => void) => void;
  getGameState: (backendUrl: string) => Promise<{ success: boolean; data?: any; error?: string }>;
}

const api: LauncherAPI = {
  getMode: () => ipcRenderer.invoke('app:get-mode'),
  checkBackendHealth: (backendUrl: string) => ipcRenderer.invoke('backend:health-check', backendUrl),
  startBackend: () => ipcRenderer.invoke('backend:start'),
  stopBackend: () => ipcRenderer.invoke('backend:stop'),
  startBackendWithLogs: () => ipcRenderer.invoke('backend:start-with-logs'),
  getBackendLogs: () => ipcRenderer.invoke('backend:get-logs'),
  clearBackendLogs: () => ipcRenderer.invoke('backend:clear-logs'),
  onBackendLog: (callback: (log: string) => void) => {
    ipcRenderer.on('backend:log', (_event, log) => callback(log));
  },
  getUnityPath: () => ipcRenderer.invoke('unity:get-path'),
  launchUnity: (args: { sessionId: string; backendUrl: string }) => ipcRenderer.invoke('unity:launch', args),
  killUnity: () => ipcRenderer.invoke('unity:kill'),
  getUnityStatus: () => ipcRenderer.invoke('unity:status'),
  onUnityExited: (callback: (code: number | null) => void) => {
    ipcRenderer.on('unity:exited', (_event, code) => callback(code));
  },
  getGameState: (backendUrl: string) => ipcRenderer.invoke('gamestate:get', backendUrl),
};

contextBridge.exposeInMainWorld('launcherAPI', api);