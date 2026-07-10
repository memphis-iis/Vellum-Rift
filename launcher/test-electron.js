// In Electron, we need to use the built-in module, not the npm package
// The npm 'electron' package is just a wrapper for the binary
// We need to access Electron's internal module system

// Method 1: Use process._linkedBinding (internal Electron API)
try {
  const app = process._linkedBinding('electron_browser_app');
  console.log('Method 1 - _linkedBinding works:', typeof app);
  app.quit();
} catch (e) {
  console.log('Method 1 failed:', e.message);
  
  // Method 2: Use Electron's global
  if (global.electron) {
    console.log('Method 2 - global.electron exists');
  }
  
  // Method 3: Check if we're in Electron
  console.log('process.versions.electron:', process.versions.electron);
  console.log('process.type:', process.type);
  
  process.exit(0);
}
