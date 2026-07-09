import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

/**
 * Get the default Unity build path based on the current platform.
 * Users can override this via environment variable VELLUM_UNITY_PATH.
 */
export function getUnityPath(): string | null {
  // Check environment variable first
  const envPath = process.env.VELLUM_UNITY_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  const platform = os.platform();
  const homeDir = os.homedir();
  
  // Common paths to check for Unity builds
  const searchPaths: string[] = [];

  if (platform === 'win32') {
    searchPaths.push(
      path.join(homeDir, 'VellumRift', 'VellumRift.exe'),
      path.join(homeDir, 'Games', 'VellumRift', 'VellumRift.exe'),
      'C:\\Program Files\\VellumRift\\VellumRift.exe',
      'C:\\Games\\VellumRift\\VellumRift.exe'
    );
  } else if (platform === 'darwin') {
    searchPaths.push(
      path.join(homeDir, 'Applications', 'VellumRift.app'),
      '/Applications/VellumRift.app',
      path.join(homeDir, 'VellumRift', 'VellumRift.app')
    );
  } else {
    // Linux
    searchPaths.push(
      path.join(homeDir, 'VellumRift', 'VellumRift'),
      path.join(homeDir, 'Games', 'VellumRift', 'VellumRift'),
      '/opt/VellumRift/VellumRift',
      '/usr/local/bin/VellumRift'
    );
  }

  // Also check relative to the launcher (for bundled distributions)
  const appDataPath = process.env.APPDATA || 
    (platform === 'darwin' 
      ? path.join(homeDir, 'Library', 'Application Support')
      : path.join(homeDir, '.config'));
  
  searchPaths.push(
    path.join(appDataPath, 'vellum-rift-launcher', 'unity', platform === 'win32' ? 'VellumRift.exe' : platform === 'darwin' ? 'VellumRift.app' : 'VellumRift')
  );

  for (const p of searchPaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

/**
 * Launch the Unity build with session arguments.
 */
export function launchUnity(
  unityPath: string,
  sessionId: string,
  backendUrl: string
): ChildProcess {
  const args = [
    '--session-id', sessionId,
    '--backend-url', backendUrl,
  ];

  const child = spawn(unityPath, args, {
    detached: true,
    stdio: 'ignore',
  });

  // Allow the parent process to exit even if Unity is still running
  child.unref();

  return child;
}

/**
 * Kill the Unity process.
 */
export function killUnity(process: ChildProcess): void {
  if (!process.killed) {
    process.kill('SIGTERM');
    
    // Force kill after 5 seconds if still running
    setTimeout(() => {
      if (!process.killed) {
        process.kill('SIGKILL');
      }
    }, 5000);
  }
}