const { app, BrowserWindow, ipcMain, screen, protocol, dialog, utilityProcess, desktopCapturer } = require('electron');
const { Client, Server } = require('node-osc');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const AdmZip = require('adm-zip');
const { uIOhook, UiohookKey } = require('uiohook-napi');
const crypto = require('crypto');

// Disable disk cache to prevent OneDrive lock errors
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
// Disable autoplay policy so audio/video can play without clicks
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// --- Phase 4.2: Single-Instance Lock (Anti-Multi-Launch) ---
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  console.log('[SYSTEM] Another instance is already running. Quitting...');
  app.quit();
  // Use process.exit just in case app.quit doesn't fire immediately
  process.exit(0); 
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

let mainWindow;

// Engine state
let state = {
  engineOn: false,
  settingsOpen: false,
};

// Dynamic Keybinds (Default: F8=Engine, F9=Settings)
let toggleEngineKey = UiohookKey.F8;
let toggleSettingsKey = UiohookKey.F9;

let oscServer = null;

// Paths rooted in persistent userData
function getEffectsDir() {
  return path.join(app.getPath('userData'), 'effects');
}
function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height, x, y } = primaryDisplay.bounds;

  mainWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    icon: path.join(__dirname, '../assets/logo_ScenePlus+.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  mainWindow.setAlwaysOnTop(true, 'pop-up-menu');
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  // mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.webContents.on('did-finish-load', () => {
    updateRendererState();
  });
}

function updateRendererState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('state-changed', state);

    if (state.settingsOpen) {
      mainWindow.setIgnoreMouseEvents(false);
    } else {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
    }
  }
}

// uIOHook Key listener
const pressedKeys = new Set();

function setupInputHooks() {
  uIOhook.on('keydown', (e) => {
    if (pressedKeys.has(e.keycode)) return;
    pressedKeys.add(e.keycode);

    // Forward key to engine if active AND it's not one of our system toggle keys
    if (state.engineOn && e.keycode !== toggleEngineKey && e.keycode !== toggleSettingsKey) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('keydown', e.keycode);
      }
    }

    // Toggle Engine (only if Settings are closed)
    if (e.keycode === toggleEngineKey) {
      if (!state.settingsOpen) {
        state.engineOn = !state.engineOn;
        if (!state.engineOn) {
          panicAllEffects();
        }
        updateRendererState();
      }
    }

    // Toggle Settings (and force engine off when opened)
    if (e.keycode === toggleSettingsKey) {
      state.settingsOpen = !state.settingsOpen;
      if (state.settingsOpen) {
        state.engineOn = false;
        panicAllEffects();
        if (mainWindow) mainWindow.focus();
      } else {
        if (mainWindow) mainWindow.blur();
      }
      updateRendererState();
    }
  });

  uIOhook.on('keyup', (e) => {
    pressedKeys.delete(e.keycode);

    if (state.engineOn && e.keycode !== toggleEngineKey && e.keycode !== toggleSettingsKey) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('keyup', e.keycode);
      }
    }
  });

  uIOhook.on('mousemove', (e) => {
    if (state.engineOn && mainWindow && !mainWindow.isDestroyed()) {
      // Stream logical mouse coordinates to the renderer (handles DPI scaling/multi-monitor transparently)
      const pos = screen.getCursorScreenPoint();
      mainWindow.webContents.send('mousemove', pos);
    }
  });

  uIOhook.start();
}

function panicAllEffects() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('panic');
  }
}

app.whenReady().then(() => {
  // Ensure effects dir exists
  const effectsDir = getEffectsDir();
  if (!fs.existsSync(effectsDir)) {
    fs.mkdirSync(effectsDir, { recursive: true });
  }

  // Register custom protocol for ScenePlus+
  // Resolves scene://<effectId>/relative/path -> userData/effects/<effectId>/relative/path
  protocol.registerFileProtocol('scene', (request, callback) => {
    const urlPath = request.url.substring(8); // strip "scene://"

    // Phase 2.9: Route internal SDK requests to assets folder
    if (urlPath.startsWith('_core/')) {
      const corePath = path.join(__dirname, '../assets', urlPath.substring(6));
      return callback({ path: path.normalize(corePath) });
    }

    const decodedPath = decodeURIComponent(urlPath);
    const filePath = path.join(effectsDir, decodedPath);
    callback({ path: path.normalize(filePath) });
  });

  // --- IPC: Background Import (Offloaded to UtilityProcess) ---
  ipcMain.handle('import-effect-background', async (event, sourcePath, customDestOrIsGuest) => {
    return new Promise((resolve) => {
      try {
        let finalDest = effectsDir;
        if (typeof customDestOrIsGuest === 'string') {
          finalDest = customDestOrIsGuest;
        } else if (customDestOrIsGuest === true) {
          // Phase 4.2 Fix: Generate a unique temp folder for Guest Mode
          const timestamp = Date.now();
          const folderName = `sceneplus-guest-${timestamp}`;
          finalDest = path.join(os.tmpdir(), folderName);
          if (!fs.existsSync(finalDest)) {
            fs.mkdirSync(finalDest, { recursive: true });
          }
        }

        const workerPath = path.join(__dirname, 'worker.js');
        const worker = utilityProcess.fork(workerPath);

        worker.postMessage({
          action: 'process-import',
          filePath: sourcePath,
          destDir: finalDest
        });

        worker.on('message', (msg) => {
          if (msg.type === 'progress') {
            mainWindow.webContents.send('import-progress', msg.percent);
          } else if (msg.type === 'status') {
            mainWindow.webContents.send('import-status', msg.message);
          } else if (msg.type === 'success') {
            resolve({ 
              success: true, 
              hash: msg.hash, 
              meta: msg.meta, 
              basePath: msg.basePath 
            });
          } else if (msg.type === 'error') {
            resolve({ 
              success: false, 
              error: msg.error, 
              diagnostic: msg.diagnostic || false, 
              template: msg.template || '' 
            });
          }
        });

        worker.on('exit', (code) => {
          if (code !== 0) {
            resolve({ success: false, error: `Worker exited with code ${code}` });
          }
        });

      } catch (err) {
        resolve({ success: false, error: err.message });
      }
    });
  });

  // --- IPC: Screen Capture (Phase 2.9 Level 2 API) ---
  ipcMain.handle('capture-screen', async (event, resolution) => {
    try {
      let width = 854, height = 480; // 'low'
      if (resolution === 'mid') { width = 1280; height = 720; }
      else if (resolution === 'high') { width = 1920; height = 1080; }
      else if (resolution === 'full') {
        const primaryDisplay = screen.getPrimaryDisplay();
        width = primaryDisplay.bounds.width;
        height = primaryDisplay.bounds.height;
      }
      
      const sources = await desktopCapturer.getSources({ 
        types: ['screen'], 
        thumbnailSize: { width, height } 
      });

      if (sources.length > 0) {
        // sources[0] is usually the primary display
        return { success: true, dataUrl: sources[0].thumbnail.toDataURL() };
      }
      return { success: false, error: 'No screen sources found' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // --- IPC: Document Viewer (Fires in secondary window) ---
  ipcMain.handle('open-document', async (event, docName) => {
    const docPath = path.join(__dirname, '../assets', docName);
    if (!fs.existsSync(docPath)) {
      console.error(`[DOCS] Document not found: ${docPath}`);
      return;
    }

    const docWindow = new BrowserWindow({
      width: 1000,
      height: 800,
      title: `ScenePlus+ | ${docName.replace(/_/g, ' ').replace('.html', '')}`,
      icon: path.join(__dirname, '../assets/logo_ScenePlus+.ico'),
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    docWindow.setMenuBarVisibility(false);
    docWindow.loadFile(docPath);
  });

  // --- IPC: Legacy Unpack (Synchronous/Blocking) ---
  ipcMain.handle('unpack-effect', async (event, buffer, effectId) => {
    try {
      console.log(`[IPC] unpack-effect: buffer=${buffer?.byteLength}, id=${effectId}`);

      if (!buffer) return { success: false, error: 'Source ZIP buffer is empty' };

      const destDir = path.join(effectsDir, effectId);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const zip = new AdmZip(Buffer.from(buffer));
      zip.extractAllTo(destDir, true);
      console.log(`[IPC] Extracted to ${destDir}`);

      const metaPath = path.join(destDir, 'meta.json');
      if (fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        return { success: true, meta, effectId, basePath: `scene://${effectId}/` };
      } else {
        return { success: false, error: `meta.json not found after extraction` };
      }
    } catch (err) {
      console.log(`[IPC Exception] ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  // --- IPC: Delete Effect ---
  ipcMain.handle('delete-effect', async (event, effectId) => {
    try {
      const destDir = path.join(effectsDir, effectId);
      if (fs.existsSync(destDir)) {
        fs.rmSync(destDir, { recursive: true, force: true });
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // --- IPC: Open File Dialog ---
  ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import ScenePlus Effect',
      filters: [{ name: 'ScenePlus Effect', extensions: ['scenefx', 'zip'] }],
      properties: ['openFile', 'multiSelections'],
    });
    if (result.canceled) return { canceled: true, files: [] };
    return { canceled: false, files: result.filePaths };
  });

  // --- IPC: Async Confirmation Dialog ---
  ipcMain.handle('confirm-dialog', async (event, options) => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['CANCEL', 'OK'],
      defaultId: 1,
      cancelId: 0,
      title: 'ScenePlus+ Confirmation',
      message: options.message || 'Are you sure?',
      detail: options.detail || ''
    });
    return result.response === 1;
  });

  // --- IPC: Async Alert Dialog ---
  ipcMain.handle('alert-dialog', async (event, options) => {
    await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['OK'],
      title: 'ScenePlus+ System Alert',
      message: options.message || 'System Message',
      detail: options.detail || ''
    });
  });

  // --- IPC: Save Settings ---
  ipcMain.handle('save-settings', async (event, settingsJson) => {
    try {
      fs.writeFileSync(getSettingsPath(), JSON.stringify(settingsJson, null, 2), 'utf8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // --- IPC: Load Settings ---
  ipcMain.handle('load-settings', async () => {
    try {
      const p = getSettingsPath();
      if (!fs.existsSync(p)) return { success: true, settings: null };
      const raw = fs.readFileSync(p, 'utf8');
      return { success: true, settings: JSON.parse(raw) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // --- IPC: Scan Existing Effects on Disk ---
  ipcMain.handle('scan-effects', async () => {
    try {
      const dir = getEffectsDir();
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const effects = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const metaPath = path.join(dir, entry.name, 'meta.json');
          if (fs.existsSync(metaPath)) {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            effects.push({
              effectId: entry.name,
              meta,
              basePath: `scene://${entry.name}/`,
            });
          }
        }
      }
      return { success: true, effects };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // --- IPC: Set System Keys Dynamically ---
  ipcMain.handle('set-system-keys', async (event, engineKey, settingsKey) => {
    if (engineKey !== undefined) toggleEngineKey = engineKey;
    if (settingsKey !== undefined) toggleSettingsKey = settingsKey;
    return { success: true };
  });

  // --- IPC: OSC Network Sync & Local IP (Phase 4.1) ---
  ipcMain.handle('get-local-ip', () => {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '127.0.0.1';
  });

  ipcMain.handle('get-all-local-ips', () => {
    const result = [];
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          result.push({ ip: iface.address, name: name });
        }
      }
    }
    return result;
  });

  ipcMain.handle('start-osc-server', () => {
    if (oscServer) return { success: true };
    try {
      oscServer = new Server(8000, '0.0.0.0', () => {
        console.log('[OSC] Server listening on port 8000');
      });
      oscServer.on('message', (msg, rinfo) => {
        const address = msg[0];
        const args = msg.slice(1);
        // Normalize IPv6-mapped IPv4 (e.g. ::ffff:192.168.1.10 -> 192.168.1.10)
        let senderIp = rinfo?.address || 'unknown';
        if (senderIp.startsWith('::ffff:')) {
          senderIp = senderIp.replace('::ffff:', '');
        }
        const normalizedRinfo = { ...rinfo, address: senderIp };
        console.log(`[OSC-RX] ${address} from ${senderIp}:${rinfo?.port} args=${JSON.stringify(args)}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('osc-message', { address, args, rinfo: normalizedRinfo });
        }
      });
      oscServer.on('error', (err) => {
        console.error('[OSC Server Error]', err.message);
      });
      return { success: true };
    } catch (err) {
      console.error('[OSC Server Start Error]', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('stop-osc-server', () => {
    if (oscServer) {
      oscServer.close();
      oscServer = null;
      console.log('[OSC] Server stopped');
    }
    return { success: true };
  });

  let persistentOscClient = null;
  let currentTargetIp = null;

  ipcMain.handle('send-osc', (event, targetIp, address, args) => {
    try {
      if (!persistentOscClient || currentTargetIp !== targetIp) {
        if (persistentOscClient) {
          try { persistentOscClient.close(); } catch(e){}
        }
        persistentOscClient = new Client(targetIp, 8000);
        currentTargetIp = targetIp;
        console.log(`[OSC] Client created for ${targetIp}:8000`);
      }
      console.log(`[OSC-TX] ${address} to ${targetIp}:8000 args=${JSON.stringify(args)}`);
      persistentOscClient.send(address, ...args);
      return { success: true };
    } catch (err) {
      console.error('[OSC Send Error]', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('scan-subnet', async (event) => {
    try {
      // Get all local IPs and scan each subnet
      const interfaces = os.networkInterfaces();
      const subnets = [];
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            const parts = iface.address.split('.');
            const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
            if (!subnets.includes(subnet)) subnets.push(subnet);
          }
        }
      }
      
      // Send discover to every IP in each /24 subnet
      for (const subnet of subnets) {
        for (let i = 1; i <= 254; i++) {
          const ip = `${subnet}.${i}`;
          try {
            const c = new Client(ip, 8000);
            c.send('/sceneplus/sys/discover', () => {
              c.close();
            });
          } catch (e) { /* ignore individual send errors */ }
        }
      }
      console.log(`[OSC-SCAN] Scanned ${subnets.length} subnet(s): ${subnets.join(', ')}`);
      return { success: true, subnets };
    } catch (err) {
      console.error('[OSC Scan Error]', err);
      return { success: false, error: err.message };
    }
  });

  // --- Phase 4.2: Asset HTTP Server ---
  let httpServer = null;
  let httpPort = 0;

  ipcMain.handle('start-http-server', async () => {
    if (httpServer) return { success: true, port: httpPort };
    
    return new Promise((resolve) => {
      try {
        httpServer = http.createServer((req, res) => {
          // Enable CORS for streaming integration
          res.setHeader('Access-Control-Allow-Origin', '*');
          
          const url = new URL(req.url, `http://${req.headers.host}`);
          const pathname = url.pathname;
          const effectsDir = path.join(app.getPath('userData'), 'effects');
          
          // 1. Return Effect List (Hash & Meta)
          if (pathname === '/api/effects') {
            try {
              if (!fs.existsSync(effectsDir)) return res.end('[]');
              const effectRoots = fs.readdirSync(effectsDir);
              const results = [];
              for (const hash of effectRoots) {
                const metaPath = path.join(effectsDir, hash, 'meta.json');
                if (fs.existsSync(metaPath)) {
                  try {
                    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                    results.push({ effectId: hash, meta });
                  } catch(e) {}
                }
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(results));
            } catch (err) {
              res.writeHead(500);
              res.end('Server error');
            }
          // 2. Download original .scenefx
          } else if (pathname.startsWith('/api/download/')) {
            const hash = pathname.split('/')[3];
            if (!hash) return res.writeHead(400) && res.end('Bad Request');
            
            const scenefxPath = path.join(effectsDir, hash, `${hash}.scenefx`);
            if (fs.existsSync(scenefxPath)) {
              const stat = fs.statSync(scenefxPath);
              res.writeHead(200, {
                'Content-Type': 'application/zip',
                'Content-Length': stat.size,
                'Content-Disposition': `attachment; filename="${hash}.scenefx"`
              });
              fs.createReadStream(scenefxPath).pipe(res);
            } else {
              res.writeHead(404);
              res.end('.scenefx not found (May be an old effect imported before Phase 4.2)');
            }
          // 3. Stream raw assets directly with Range support
          } else if (pathname.startsWith('/stream/')) {
            const parts = pathname.split('/');
            const hash = parts[2];
            if (!hash || parts.length < 4) return res.writeHead(400) && res.end();
            
            const relPath = decodeURIComponent(parts.slice(3).join('/'));
            const targetFile = path.join(effectsDir, hash, relPath);
            
            // Security: Prevent directory traversal outside the hash folder
            const normalizedTarget = path.normalize(targetFile);
            if (!normalizedTarget.startsWith(path.join(effectsDir, hash))) {
              res.writeHead(403);
              return res.end('Forbidden');
            }
            
            if (fs.existsSync(normalizedTarget)) {
              const ext = path.extname(normalizedTarget).toLowerCase();
              let mime = 'application/octet-stream';
              if (ext === '.html') mime = 'text/html';
              else if (ext === '.css') mime = 'text/css';
              else if (ext === '.js') mime = 'application/javascript';
              else if (ext === '.mp4') mime = 'video/mp4';
              else if (ext === '.webm') mime = 'video/webm';
              else if (ext === '.mp3') mime = 'audio/mpeg';
              else if (ext === '.png') mime = 'image/png';
              else if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
              else if (ext === '.gif') mime = 'image/gif';
              else if (ext === '.svg') mime = 'image/svg+xml';
              
              const stat = fs.statSync(normalizedTarget);
              const range = req.headers.range;
              
              // Handle HTTP 206 Partial Content (critical for seeking in videos)
              if (range && (mime.startsWith('video/') || mime.startsWith('audio/'))) {
                const rangeParts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(rangeParts[0], 10);
                const end = rangeParts[1] ? parseInt(rangeParts[1], 10) : stat.size - 1;
                const chunksize = (end - start) + 1;
                
                res.writeHead(206, {
                  'Content-Range': `bytes ${start}-${end}/${stat.size}`,
                  'Accept-Ranges': 'bytes',
                  'Content-Length': chunksize,
                  'Content-Type': mime
                });
                fs.createReadStream(normalizedTarget, { start, end }).pipe(res);
              } else {
                res.writeHead(200, {
                  'Content-Type': mime,
                  'Content-Length': stat.size
                });
                fs.createReadStream(normalizedTarget).pipe(res);
              }
            } else {
              res.writeHead(404);
              res.end('Not found');
            }
          } else {
            res.writeHead(404);
            res.end();
          }
        });
        
        // Listen on dynamically assigned ephemeral port (0)
        httpServer.listen(0, '0.0.0.0', () => {
          httpPort = httpServer.address().port;
          console.log(`[HTTP] Server listening on port ${httpPort}`);
          resolve({ success: true, port: httpPort });
        });
        
        httpServer.on('error', (err) => {
          resolve({ success: false, error: err.message });
        });
      } catch (err) {
        resolve({ success: false, error: err.message });
      }
    });
  });

  ipcMain.handle('stop-http-server', () => {
    if (httpServer) {
      httpServer.close();
      httpServer = null;
      httpPort = 0;
      console.log('[HTTP] Server stopped');
    }
    return { success: true };
  });

  // --- Phase 4.2: Asset Downloader & Cleanup ---
  ipcMain.handle('download-asset', async (event, url, hash) => {
    return new Promise((resolve) => {
      const tempPath = path.join(os.tmpdir(), `${hash}_dl.scenefx`);
      const file = fs.createWriteStream(tempPath);
      http.get(url, (response) => {
        if (response.statusCode === 200) {
          response.pipe(file);
          file.on('finish', () => {
            file.close(() => resolve(tempPath));
          });
        } else {
          file.close();
          fs.unlink(tempPath, () => {});
          resolve(null);
        }
      }).on('error', (err) => {
        fs.unlink(tempPath, () => {});
        resolve(null);
      });
    });
  });

  ipcMain.handle('cleanup-guest-folders', async () => {
    try {
      const tmpDir = os.tmpdir();
      const files = fs.readdirSync(tmpDir);
      let count = 0;
      for (const file of files) {
        if (file.startsWith('sceneplus-guest-')) {
          const fullPath = path.join(tmpDir, file);
          fs.rmSync(fullPath, { recursive: true, force: true });
          count++;
        }
      }
      if (count > 0) console.log(`[CLEANUP] Removed ${count} orphaned guest folder(s)`);
      return { success: true };
    } catch(e) {
      console.error('[CLEANUP] Failed:', e);
      return { success: false };
    }
  });

  initializeWelcomePack();
  createWindow();
  setupInputHooks();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  uIOhook.stop();
});

// --- Helper: First-Run Welcome Pack (Hash Integrity version) ---
function initializeWelcomePack() {
  const effectsDir = getEffectsDir();
  if (!fs.existsSync(effectsDir)) {
    fs.mkdirSync(effectsDir, { recursive: true });
  }

  // Check if directory is effectively empty (only meta files or empty)
  const existing = fs.readdirSync(effectsDir).filter(f => {
    return fs.statSync(path.join(effectsDir, f)).isDirectory();
  });

  if (existing.length > 0) {
    console.log('[WELCOME] Library already contains effects. Skipping auto-import.');
    return;
  }

  console.log('[WELCOME] First run detected. Installing official samples...');
  const assetsDir = path.join(__dirname, '../assets');
  const samples = ['mouse_particle.scenefx', 'cyber_invert.scenefx', 'gravity_distortion.scenefx'];

  samples.forEach(s => {
    const src = path.join(assetsDir, s);
    if (fs.existsSync(src)) {
      try {
        const buffer = fs.readFileSync(src);
        const hash = crypto.createHash('sha256').update(buffer).digest('hex');
        
        const dest = path.join(effectsDir, hash);
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(dest, { recursive: true });
          const zip = new AdmZip(src);
          zip.extractAllTo(dest, true);
          console.log(`[WELCOME] Successfully installed: ${s} (ID: ${hash.substring(0,8)})`);
        }
      } catch (err) {
        console.error(`[WELCOME] Failed to import ${s}:`, err);
      }
    } else {
      console.warn(`[WELCOME] Sample file missing: ${src}`);
    }
  });
}
