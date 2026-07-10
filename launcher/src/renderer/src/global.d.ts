import type { LauncherAPI } from '../electron/preload';

declare global {
  interface Window {
    launcherAPI: LauncherAPI;
  }
}

export {};