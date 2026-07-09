import { contextBridge, ipcRenderer } from 'electron';

export interface LauncherAPI {
  // App
  getMode: () => Promise<'development' | 'production'>;
  
  // Backend
  checkBackendHealth: (backendUrl: string) => Promise<{ status: 'ok' | 'degraded' | 'offline'; details?: string }>;
  startBackend: () => Promise<{ success: boolean; error?: string }>;
  stopBackend: () => Promise<{ success: boolean; error?: string }>;
  
  // Unity
  getUnityPath: () => Promise<string | null>;
  launchUnity: (args: { sessionId: string; backendUrl: string }) => Promise<{ success: boolean; error?: string }>;
  killUnity: () => Promise<{ success: boolean; error?: string }>;
  getUnityStatus: () => Promise<'running' | 'stopped'>;
  onUnityExited: (callback: (code: number | null) => void) => void;
}

const api: LauncherAPI = {
  getMode: () => ipcRenderer.invoke('app:get-mode'),
  
  checkBackendHealth: (backendUrl: string) => ipcRenderer.invoke('backend:health-check', backendUrl),
  startBackend: () => ipcRenderer.invoke('backend:start'),
  stopBackend: () => ipcRenderer.invoke('backend:stop'),
  
  getUnityPath: () => ipcRenderer.invoke('unity:get-path'),
  launchUnity: (args: { sessionId: string; backendUrl: string }) => ipcRenderer.invoke('unity:launch', args),
  killUnity: () => ipcRenderer.invoke('unity:kill'),
  getUnityStatus: () => ipcRenderer.invoke('unity:status'),
  onUnityExited: (callback: (code: number | null) => void) => {
    ipcRenderer.on('unity:exited', (_event, code) => callback(code));
  },
};

contextBridge.exposeInMainWorld('launcherAPI', api);