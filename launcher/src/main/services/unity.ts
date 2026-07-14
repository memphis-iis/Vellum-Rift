import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

export function getUnityPath(): string | null {
  const envPath = process.env.VELLUM_UNITY_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  const platform = os.platform();
  const homeDir = os.homedir();
  
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
    searchPaths.push(
      path.join(homeDir, 'VellumRift', 'VellumRift'),
      path.join(homeDir, 'Games', 'VellumRift', 'VellumRift'),
      '/opt/VellumRift/VellumRift',
      '/usr/local/bin/VellumRift'
    );
  }

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

  child.unref();

  return child;
}

export function killUnity(process: ChildProcess): void {
  if (!process.killed) {
    process.kill('SIGTERM');
    
    setTimeout(() => {
      if (!process.killed) {
        process.kill('SIGKILL');
      }
    }, 5000);
  }
}