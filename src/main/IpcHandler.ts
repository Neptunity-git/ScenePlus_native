import { ipcMain, dialog, desktopCapturer, screen, BrowserWindow, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { WindowManager } from './WindowManager';
import { NetworkService } from './services/NetworkService';
import { EffectService } from './services/EffectService';
import { InputManager } from './InputManager';
import { ConfirmDialogOptions, AlertDialogOptions, SettingsConfig } from '../shared/types';

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
        ipcMain.handle('open-document', async (event, docName) => {
            const docPath = path.join(app.getAppPath(), 'assets', docName);
            if (!fs.existsSync(docPath)) {
                console.error(`[DOCS] Document not found: ${docPath}`);
                return;
            }

            const docWindow = new BrowserWindow({
                width: 1000,
                height: 800,
                title: `ScenePlus+ | ${docName.replace(/_/g, ' ').replace('.html', '')}`,
                icon: path.join(app.getAppPath(), 'assets/logo_ScenePlus+.ico'),
                autoHideMenuBar: true,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            });

            docWindow.setMenuBarVisibility(false);
            docWindow.loadFile(docPath);
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
    }
}
