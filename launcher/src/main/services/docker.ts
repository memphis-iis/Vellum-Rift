import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

function getProjectRoot(): string | null {
  const envPath = process.env.VELLUM_PROJECT_ROOT;
  if (envPath && fs.existsSync(path.join(envPath, 'docker-compose.yml'))) {
    return envPath;
  }

  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'docker-compose.yml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

export async function checkBackendHealth(backendUrl: string): Promise<{ status: 'ok' | 'degraded' | 'offline'; details?: string }> {
  try {
    const response = await fetch(`${backendUrl}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    
    if (!response.ok) {
      return { status: 'degraded', details: `HTTP ${response.status}` };
    }
    
    const data = await response.json() as { status?: string };
    return { 
      status: data.status === 'ok' ? 'ok' : 'degraded',
      details: data.status 
    };
  } catch (error) {
    return { 
      status: 'offline', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function startDockerStack(): Promise<{ success: boolean; error?: string }> {
  const projectRoot = getProjectRoot();
  if (!projectRoot) {
    return { success: false, error: 'Could not find project root with docker-compose.yml' };
  }

  return new Promise((resolve) => {
    const child = spawn('docker', ['compose', 'up', '-d'], {
      cwd: projectRoot,
      stdio: 'pipe',
      shell: true,
    });

    let stderr = '';
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: stderr || `Exit code: ${code}` });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

export async function stopDockerStack(): Promise<{ success: boolean; error?: string }> {
  const projectRoot = getProjectRoot();
  if (!projectRoot) {
    return { success: false, error: 'Could not find project root with docker-compose.yml' };
  }

  return new Promise((resolve) => {
    const child = spawn('docker', ['compose', 'down'], {
      cwd: projectRoot,
      stdio: 'pipe',
      shell: true,
    });

    let stderr = '';
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: stderr || `Exit code: ${code}` });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}