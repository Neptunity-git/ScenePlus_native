import { BrowserWindow, screen, app } from 'electron';
import * as path from 'path';
import { AppState } from '../shared/types';

export class WindowManager {
    public mainWindow: BrowserWindow | null = null;
    private state: AppState;

    constructor(initialState: AppState) {
        this.state = initialState;
    }

    public getTargetDisplay(displayId?: number): Electron.Display {
        const displays = screen.getAllDisplays();
        if (displayId !== undefined) {
            const found = displays.find(d => d.id === displayId);
            if (found) return found;
        }
        return screen.getPrimaryDisplay();
    }

    public setDisplay(displayId: number): void {
        this.state.displayId = displayId;
        this.reassertBounds();
    }

    public reassertBounds(): void {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            const targetDisplay = this.getTargetDisplay(this.state.displayId);
            this.mainWindow.setBounds(targetDisplay.bounds);
            this.mainWindow.setAlwaysOnTop(true, 'pop-up-menu');
            this.mainWindow.webContents.send('display-metrics-updated');
        }
    }

    public createWindow(): void {
        const targetDisplay = this.getTargetDisplay(this.state.displayId);
        const { width, height, x, y } = targetDisplay.bounds;

        this.mainWindow = new BrowserWindow({
            x,
            y,
            width,
            height,
            transparent: true,
            frame: false,
            alwaysOnTop: true,
            skipTaskbar: true,
            resizable: false,
            hasShadow: false,
            icon: path.join(app.getAppPath(), 'assets/system/logo_ScenePlus+.ico'),
            webPreferences: {
                preload: path.join(app.getAppPath(), 'out/preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
            }
        });

        this.mainWindow.setAlwaysOnTop(true, 'pop-up-menu');
        this.mainWindow.setSkipTaskbar(true);
        this.mainWindow.setResizable(false);
        // Point to the source HTML (note: at runtime, this might need adjustment if paths change)
        this.mainWindow.loadFile(path.join(app.getAppPath(), 'out/index.html'));
        this.mainWindow.setIgnoreMouseEvents(true, { forward: true });

        this.mainWindow.webContents.on('did-finish-load', () => {
            this.updateRendererState();
        });
    }

    public updateRendererState(): void {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('state-changed', this.state);
            this.mainWindow.setSkipTaskbar(true);

            if (this.state.settingsOpen) {
                this.mainWindow.setIgnoreMouseEvents(false);
            } else {
                this.mainWindow.setIgnoreMouseEvents(true, { forward: true });
            }
        }
    }

    public getWindow(): BrowserWindow | null {
        return this.mainWindow;
    }

    public isAlive(): boolean {
        return this.mainWindow !== null && !this.mainWindow.isDestroyed();
    }

    public setState(newState: Partial<AppState>): void {
        this.state = { ...this.state, ...newState };
        this.updateRendererState();
    }

    public getState(): AppState {
        return this.state;
    }
}
