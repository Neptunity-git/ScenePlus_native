const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // State & key events from main process
    onStateChanged: (callback) => ipcRenderer.on('state-changed', (_event, value) => callback(value)),
    onPanic: (callback) => ipcRenderer.on('panic', () => callback()),
    onKeyDown: (callback) => ipcRenderer.on('keydown', (_event, keycode) => callback(keycode)),
    onKeyUp: (callback) => ipcRenderer.on('keyup', (_event, keycode) => callback(keycode)),
    onMouseMove: (callback) => ipcRenderer.on('mousemove', (_event, pos) => callback(pos)),

    // Effect management
    unpackEffect: (buffer, effectId) => ipcRenderer.invoke('unpack-effect', buffer, effectId),
    importEffectBackground: (sourcePath, customDestOrIsGuest) => ipcRenderer.invoke('import-effect-background', sourcePath, customDestOrIsGuest),
    openDocument: (docName) => ipcRenderer.invoke('open-document', docName),
    deleteEffect: (effectId) => ipcRenderer.invoke('delete-effect', effectId),
    scanEffects: () => ipcRenderer.invoke('scan-effects'),
    captureScreen: (resolution) => ipcRenderer.invoke('capture-screen', resolution),

    // Listeners for progress
    onImportProgress: (callback) => ipcRenderer.on('import-progress', (event, value) => callback(value)),
    onImportStatus: (callback) => ipcRenderer.on('import-status', (event, message) => callback(message)),

    // File picker
    openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),

    // Persistence & Settings
    setSystemKeys: (engineCode, settingsCode) => ipcRenderer.invoke('set-system-keys', engineCode, settingsCode),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    loadSettings: () => ipcRenderer.invoke('load-settings'),

    // Async Dialogs (Phase 2.6 fix)
    confirmDialog: (options) => ipcRenderer.invoke('confirm-dialog', options),
    alertDialog: (options) => ipcRenderer.invoke('alert-dialog', options),

    // OSC Networking (Phase 4.1)
    getLocalIp: () => ipcRenderer.invoke('get-local-ip'),
    getAllLocalIps: () => ipcRenderer.invoke('get-all-local-ips'),
    startOscServer: () => ipcRenderer.invoke('start-osc-server'),
    stopOscServer: () => ipcRenderer.invoke('stop-osc-server'),
    sendOsc: (targetIp, address, args) => ipcRenderer.invoke('send-osc', targetIp, address, args),
    scanSubnet: () => ipcRenderer.invoke('scan-subnet'),
    onOscMessage: (callback) => ipcRenderer.on('osc-message', (_event, msg) => callback(msg)),

    // HTTP Sync & Streaming (Phase 4.2)
    startHttpServer: () => ipcRenderer.invoke('start-http-server'),
    stopHttpServer: () => ipcRenderer.invoke('stop-http-server'),
    downloadAsset: (url, hash) => ipcRenderer.invoke('download-asset', url, hash),

    // WebUtils for path resolution (Electron 28+)
    getPathForFile: (file) => {
        const { webUtils } = require('electron');
        return webUtils.getPathForFile(file);
    }
});
