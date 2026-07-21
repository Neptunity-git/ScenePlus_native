import { ipcMain, dialog, desktopCapturer, screen, BrowserWindow, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { WindowManager } from './WindowManager';
import { NetworkService } from './services/NetworkService';
import { EffectService } from './services/EffectService';
import { InputManager } from './InputManager';
import { ConfirmDialogOptions, AlertDialogOptions, SettingsConfig, AppState } from '../shared/types';

export class IpcHandler {
    constructor(
        private windowManager: WindowManager,
        private networkService: NetworkService,
        private effectService: EffectService,
        private inputManager: InputManager
    ) {}

    private getSettingsPath(): string {
        return path.join(app.getPath('userData'), 'settings.json');
    }

    public registerAll(): void {
        const mainWindow = this.windowManager.getWindow();

        // --- Effect Service IPCs ---
        ipcMain.handle('import-effect-background', async (event, sourcePath, customDestOrIsGuest) => {
            return this.effectService.importEffectBackground(sourcePath, customDestOrIsGuest);
        });

        ipcMain.handle('unpack-effect', async (event, buffer, effectId) => {
            return this.effectService.unpackEffectSync(buffer, effectId);
        });

        ipcMain.handle('delete-effect', async (event, effectId) => {
            return this.effectService.deleteEffect(effectId);
        });

        ipcMain.handle('scan-effects', async () => {
            return this.effectService.scanEffects();
        });

        ipcMain.handle('download-asset', async (event, url, hash) => {
            return this.effectService.downloadAsset(url, hash);
        });

        ipcMain.handle('cleanup-guest-folders', async () => {
            return this.effectService.cleanupGuestFolders();
        });

        // --- Network Service IPCs ---
        ipcMain.handle('get-local-ip', () => this.networkService.getLocalIp());
        ipcMain.handle('get-all-local-ips', () => this.networkService.getAllLocalIps());
        
        ipcMain.handle('start-osc-server', () => this.networkService.startOscServer());
        ipcMain.handle('stop-osc-server', () => this.networkService.stopOscServer());
        ipcMain.handle('send-osc', (event, targetIp, address, args) => this.networkService.sendOsc(targetIp, address, args));
        ipcMain.handle('scan-subnet', async () => this.networkService.scanSubnet());

        ipcMain.handle('start-http-server', async () => this.networkService.startHttpServer());
        ipcMain.handle('stop-http-server', () => this.networkService.stopHttpServer());

        // --- Input Manager IPCs ---
        ipcMain.handle('set-system-keys', async (event, engineKey, settingsKey) => {
            this.inputManager.setSystemKeys(engineKey, settingsKey);
            return { success: true };
        });

        // --- Screen Capture ---
        ipcMain.handle('capture-screen', async (event, resolution) => {
            try {
                let width = 854, height = 480;
                if (resolution === 'mid') { width = 1280; height = 720; }
                else if (resolution === 'high') { width = 1920; height = 1080; }
                else if (resolution === 'full') {
                    const primaryDisplay = screen.getPrimaryDisplay();
                    const scaleFactor = primaryDisplay.scaleFactor;
                    width = Math.round(primaryDisplay.bounds.width * scaleFactor);
                    height = Math.round(primaryDisplay.bounds.height * scaleFactor);
                }
                
                const sources = await desktopCapturer.getSources({ 
                    types: ['screen'], 
                    thumbnailSize: { width, height } 
                });

                if (sources.length > 0) {
                    return { success: true, dataUrl: sources[0].thumbnail.toDataURL() };
                }
                return { success: false, error: 'No screen sources found' };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });

        // --- Dialogs ---
        ipcMain.handle('open-file-dialog', async () => {
            if (!mainWindow) return { canceled: true, files: [] };
            const result = await dialog.showOpenDialog(mainWindow, {
                title: 'Import ScenePlus Effect',
                filters: [{ name: 'ScenePlus Effect', extensions: ['scenefx', 'zip'] }],
                properties: ['openFile', 'multiSelections'],
            });
            if (result.canceled) return { canceled: true, files: [] };
            return { canceled: false, files: result.filePaths };
        });

        ipcMain.handle('confirm-dialog', async (event, options: ConfirmDialogOptions) => {
            if (!mainWindow) return false;
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

        ipcMain.handle('alert-dialog', async (event, options: AlertDialogOptions) => {
            if (!mainWindow) return;
            await dialog.showMessageBox(mainWindow, {
                type: 'warning',
                buttons: ['OK'],
                title: 'ScenePlus+ System Alert',
                message: options.message || 'System Message',
                detail: options.detail || ''
            });
        });

        // --- Documents Viewer ---
        ipcMain.handle('read-doc', async (event, docName) => {
            const docPath = path.join(app.getAppPath(), 'assets/docs', docName);
            if (!fs.existsSync(docPath)) {
                return { success: false, error: 'Document not found' };
            }
            try {
                const content = fs.readFileSync(docPath, 'utf8');
                return { success: true, content };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });

        ipcMain.handle('export-doc', async (event, docName, content) => {
            if (!mainWindow) return { success: false, error: 'No main window' };
            const result = await dialog.showSaveDialog(mainWindow, {
                title: 'Export Document',
                defaultPath: docName,
                filters: [{ name: 'Markdown Document', extensions: ['md'] }]
            });
            if (result.canceled || !result.filePath) return { success: false, error: 'Canceled' };
            try {
                fs.writeFileSync(result.filePath, content, 'utf8');
                return { success: true };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });

        // --- Settings (Legacy directly in IpcHandler for now) ---
        ipcMain.handle('save-settings', async (event, settingsJson: SettingsConfig) => {
            try {
                fs.writeFileSync(this.getSettingsPath(), JSON.stringify(settingsJson, null, 2), 'utf8');
                return { success: true };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });

        ipcMain.handle('load-settings', async () => {
            try {
                const p = this.getSettingsPath();
                if (!fs.existsSync(p)) return { success: true, settings: null };
                const raw = fs.readFileSync(p, 'utf8');
                return { success: true, settings: JSON.parse(raw) };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });

        // --- Effect Composer ---
        ipcMain.handle('open-effect-composer', async () => {
            const composerWindow = new BrowserWindow({
                width: 900,
                height: 700,
                autoHideMenuBar: true,
                title: "Effect Composer",
                backgroundColor: '#000000',
                icon: path.join(app.getAppPath(), 'assets/system/logo_ScenePlus+.ico'),
                webPreferences: {
                    preload: path.join(app.getAppPath(), 'out/preload.js'),
                    contextIsolation: true,
                    nodeIntegration: false,
                }
            });
            composerWindow.setAlwaysOnTop(true, 'pop-up-menu');
            composerWindow.loadFile(path.join(app.getAppPath(), 'out/composer.html'));
            return { success: true };
        });

        ipcMain.handle('save-composed-effect', async (event, metaText: string, assetData: any) => {
            try {
                const meta = JSON.parse(metaText);
                const crypto = require('crypto');
                const hash = crypto.createHash('sha256').update(metaText + Date.now().toString()).digest('hex');
                const destDir = path.join(app.getPath('userData'), 'effects', hash);
                fs.mkdirSync(destDir, { recursive: true });
                
                // Write meta.json
                fs.writeFileSync(path.join(destDir, 'meta.json'), metaText, 'utf8');

                // Process Asset
                let mainFile = 'index.js';
                if (meta.path) {
                    mainFile = meta.path.replace(/^\//, ''); // Remove leading slash if any
                }
                
                if (assetData.type === 'text') {
                    fs.writeFileSync(path.join(destDir, mainFile), assetData.content, 'utf8');
                } else if (assetData.type === 'file') {
                    const srcPath = assetData.path;
                    if (fs.existsSync(srcPath)) {
                        // Keep original filename or use path if it's specified exactly
                        const targetName = meta.path ? meta.path.replace(/^\//, '') : path.basename(srcPath);
                        fs.copyFileSync(srcPath, path.join(destDir, targetName));
                    } else {
                        throw new Error(`Asset file not found: ${srcPath}`);
                    }
                }
                
                if (mainWindow) {
                    mainWindow.webContents.send('effect-composed', {
                        hash,
                        meta,
                        basePath: `scene://${hash}/`
                    });
                }

                return { success: true, hash };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });

        ipcMain.handle('select-asset-file', async (event, filters) => {
            if (!mainWindow) return { canceled: true, file: null };
            const result = await dialog.showOpenDialog(mainWindow, {
                title: 'Select Asset File',
                filters: filters || [],
                properties: ['openFile'],
            });
            if (result.canceled || result.filePaths.length === 0) return { canceled: true, file: null };
            return { canceled: false, file: result.filePaths[0] };
        });

        // --- App State ---
        ipcMain.handle('set-app-state', async (event, newState: Partial<AppState>) => {
            this.windowManager.setState(newState);
            return { success: true };
        });
    }
}
