import { app, protocol, powerMonitor, screen } from 'electron';
import { WindowManager } from './WindowManager';
import { InputManager } from './InputManager';
import { NetworkService } from './services/NetworkService';
import { EffectService } from './services/EffectService';
import { IpcHandler } from './IpcHandler';
import { AppState } from '../shared/types';

// Disable disk cache to prevent OneDrive lock errors
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
// Disable autoplay policy so audio/video can play without clicks
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
    console.log('[SYSTEM] Another instance is already running. Quitting...');
    app.quit();
    process.exit(0);
}

// Register scene:// as privileged so it can be used for dynamic import()
protocol.registerSchemesAsPrivileged([
    { scheme: 'scene', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    require('fs').writeFileSync('crash.log', 'Uncaught Exception: ' + error.stack);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    require('fs').writeFileSync('crash.log', 'Unhandled Rejection: ' + reason);
});

const initialState: AppState = {
    engineOn: false,
    settingsOpen: false,
};

const windowManager = new WindowManager(initialState);
const inputManager = new InputManager(windowManager);
const networkService = new NetworkService(windowManager);
const effectService = new EffectService(windowManager);
const ipcHandler = new IpcHandler(windowManager, networkService, effectService, inputManager);

app.on('second-instance', () => {
    const mainWindow = windowManager.getWindow();
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

app.whenReady().then(() => {
    effectService.initializeWelcomePack();
    effectService.registerFileProtocol();
    
    windowManager.createWindow();
    inputManager.startHooks();
    ipcHandler.registerAll();

    // Debounced display metrics re-assertion for resolution changes and sleep/wake recovery
    let displayDebounceTimer: NodeJS.Timeout | null = null;
    const handleDisplayOrPowerChange = () => {
        if (displayDebounceTimer) clearTimeout(displayDebounceTimer);
        displayDebounceTimer = setTimeout(() => {
            windowManager.reassertBounds();
        }, 500);
    };

    screen.on('display-metrics-changed', handleDisplayOrPowerChange);
    screen.on('display-added', handleDisplayOrPowerChange);
    screen.on('display-removed', handleDisplayOrPowerChange);

    powerMonitor.on('resume', handleDisplayOrPowerChange);
    powerMonitor.on('unlock-screen', handleDisplayOrPowerChange);

    app.on('activate', () => {
        if (!windowManager.isAlive()) {
            windowManager.createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
    inputManager.stopHooks();
});
